import test from 'node:test';
import assert from 'node:assert/strict';
import { PaystackBillingProvider } from '../src/lib/server/billing';

const SECRET = 'synthetic-paystack-secret-for-tests-only';
const PLAN = 'PLN_synthetic_r250_monthly';
const provider = new PaystackBillingProvider(SECRET, PLAN);

function signed(payload: object, secret = SECRET) {
  const body = Buffer.from(JSON.stringify(payload));
  return { body, sig: PaystackBillingProvider.sign(secret, body) };
}

const charge = {
  event: 'charge.success',
  data: {
    id: 4092815516,
    reference: 'TA-REF-001',
    paid_at: '2026-11-27T10:00:00.000Z',
    metadata: { tenantId: 'tenant-synthetic-1' },
    plan: { plan_code: PLAN },
    subscription_code: 'SUB_synth123',
    customer: { customer_code: 'CUS_synth' },
  },
};

test('paystack: valid charge.success for our plan maps to subscription.renewed', () => {
  const { body, sig } = signed(charge);
  const evt = provider.verifyAndNormalize(body, sig);
  assert.ok(evt);
  assert.equal(evt.provider, 'paystack');
  assert.equal(evt.type, 'subscription.renewed');
  assert.equal(evt.tenantId, 'tenant-synthetic-1');
  assert.equal(evt.planId, PLAN);
  assert.equal(evt.subscriptionRef, 'SUB_synth123');
  assert.equal(evt.eventId, 'charge.success:4092815516');
  assert.deepEqual(evt.occurredAt, new Date('2026-11-27T10:00:00.000Z'));
});

test('paystack: rejects a tampered body and a wrong secret', () => {
  const { body, sig } = signed(charge);
  const tampered = Buffer.from(JSON.stringify({ ...charge, data: { ...charge.data, metadata: { tenantId: 'tenant-other' } } }));
  assert.equal(provider.verifyAndNormalize(tampered, sig), null);
  const wrongSecret = PaystackBillingProvider.sign('some-other-secret', body);
  assert.equal(provider.verifyAndNormalize(body, wrongSecret), null);
  assert.equal(provider.verifyAndNormalize(body, undefined), null);
});

test('paystack: lifecycle event mapping (create, failed, not_renewing, disable)', () => {
  const cases: Array<[string, string]> = [
    ['subscription.create', 'subscription.activated'],
    ['invoice.payment_failed', 'subscription.payment_failed'],
    ['subscription.not_renewing', 'subscription.cancellation_scheduled'],
    ['subscription.disable', 'subscription.cancelled'],
  ];
  for (const [event, expected] of cases) {
    const payload = { event, data: { subscription_code: 'SUB_synth123', metadata: { tenantId: 't1' }, next_payment_date: '2026-12-27T00:00:00.000Z' } };
    const { body, sig } = signed(payload);
    const evt = provider.verifyAndNormalize(body, sig);
    assert.ok(evt, event);
    assert.equal(evt.type, expected);
    assert.equal(evt.eventId, `${event}:SUB_synth123`);
    assert.deepEqual(evt.periodEnd, new Date('2026-12-27T00:00:00.000Z'));
  }
});

test('paystack: ignores unrelated events, missing tenant binding, and other plans', () => {
  let { body, sig } = signed({ event: 'transfer.success', data: { id: 1, metadata: { tenantId: 't1' } } });
  assert.equal(provider.verifyAndNormalize(body, sig), null);
  ({ body, sig } = signed({ ...charge, data: { ...charge.data, metadata: {} } }));
  assert.equal(provider.verifyAndNormalize(body, sig), null);
  ({ body, sig } = signed({ ...charge, data: { ...charge.data, plan: { plan_code: 'PLN_other_product' } } }));
  assert.equal(provider.verifyAndNormalize(body, sig), null);
});
