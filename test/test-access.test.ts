/**
 * Operator-granted complimentary tester access: server-side admin auth,
 * bounded duration, revocable, no billing provider involved.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, stopTestApp, signup } from './helpers';

async function setup() {
  const app = await startTestApp();
  const tester = await signup(app.baseUrl, 'tester@example.co.za');
  const operator = await signup(app.baseUrl, 'operator@example.co.za');
  app.foundation.config.adminUserIds.push(operator.userId);
  return { app, tester, operator };
}

test('grant requires operator auth and valid params', async () => {
  const { app, tester, operator } = await setup();
  try {
    const anon = await fetch(`${app.baseUrl}/api/admin/test-access/grant`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'tester@example.co.za', days: 14 }),
    });
    assert.equal(anon.status, 401);

    const nonAdmin = await fetch(`${app.baseUrl}/api/admin/test-access/grant`, {
      method: 'POST', headers: { 'content-type': 'application/json', cookie: tester.cookie },
      body: JSON.stringify({ email: 'tester@example.co.za', days: 14 }),
    });
    assert.equal(nonAdmin.status, 403);

    const noDays = await fetch(`${app.baseUrl}/api/admin/test-access/grant`, {
      method: 'POST', headers: { 'content-type': 'application/json', cookie: operator.cookie },
      body: JSON.stringify({ email: 'tester@example.co.za' }),
    });
    assert.equal(noDays.status, 400);

    const unknownEmail = await fetch(`${app.baseUrl}/api/admin/test-access/grant`, {
      method: 'POST', headers: { 'content-type': 'application/json', cookie: operator.cookie },
      body: JSON.stringify({ email: 'ghost@example.co.za', days: 14 }),
    });
    assert.equal(unknownEmail.status, 404);
  } finally {
    await stopTestApp(app);
  }
});

test('grant unlocks guarded analysis within quota; revoke closes it', async () => {
  const { app, tester, operator } = await setup();
  try {
    // Before grant: entitlement blocks analysis
    const before = await fetch(`${app.baseUrl}/api/analyze`, {
      method: 'POST', headers: { 'content-type': 'application/json', cookie: tester.cookie },
      body: JSON.stringify({ rawText: 'Provision of cleaning services. BID NUMBER: T-1', referenceId: 'X' }),
    });
    assert.equal(before.status, 402);

    const grant = await fetch(`${app.baseUrl}/api/admin/test-access/grant`, {
      method: 'POST', headers: { 'content-type': 'application/json', cookie: operator.cookie },
      body: JSON.stringify({ email: 'tester@example.co.za', days: 14 }),
    });
    assert.equal(grant.status, 200);
    const g = await grant.json();
    assert.equal(g.planId, 'test_cohort');
    assert.ok(new Date(g.currentPeriodEnd) > new Date());

    const after = await fetch(`${app.baseUrl}/api/analyze`, {
      method: 'POST', headers: { 'content-type': 'application/json', cookie: tester.cookie },
      body: JSON.stringify({ rawText: 'Provision of cleaning services. BID NUMBER: T-1', referenceId: 'X' }),
    });
    assert.equal(after.status, 200);

    const status = await fetch(`${app.baseUrl}/api/admin/test-access/status?email=tester@example.co.za`, {
      headers: { cookie: operator.cookie },
    });
    const sBody = await status.json();
    assert.equal(sBody.entitlement.effectiveStatus, 'active');

    const revoke = await fetch(`${app.baseUrl}/api/admin/test-access/revoke`, {
      method: 'POST', headers: { 'content-type': 'application/json', cookie: operator.cookie },
      body: JSON.stringify({ email: 'tester@example.co.za' }),
    });
    assert.equal(revoke.status, 200);

    const blocked = await fetch(`${app.baseUrl}/api/analyze`, {
      method: 'POST', headers: { 'content-type': 'application/json', cookie: tester.cookie },
      body: JSON.stringify({ rawText: 'Provision of cleaning services. BID NUMBER: T-2', referenceId: 'X2' }),
    });
    assert.equal(blocked.status, 402);
  } finally {
    await stopTestApp(app);
  }
});

test('grant never overwrites an active paid subscription', async () => {
  const { app, tester, operator } = await setup();
  try {
    // Simulate a live paid subscription on the tester's tenant
    const { applyBillingEvent } = await import('../src/lib/server/entitlement');
    await applyBillingEvent(app.foundation.repos, {
      eventId: 'paid-1', provider: 'paystack', type: 'subscription.activated',
      tenantId: tester.tenantId, planId: 'standard_monthly', subscriptionRef: 'sub_paid_1',
      periodEnd: new Date(Date.now() + 30 * 24 * 3600 * 1000), occurredAt: new Date(),
    }, new Date());

    const res = await fetch(`${app.baseUrl}/api/admin/test-access/grant`, {
      method: 'POST', headers: { 'content-type': 'application/json', cookie: operator.cookie },
      body: JSON.stringify({ email: 'tester@example.co.za', days: 14 }),
    });
    assert.equal(res.status, 409);
    assert.equal((await res.json()).error, 'account_has_active_paid_subscription');

    const ent = await app.foundation.repos.entitlements.get(tester.tenantId);
    assert.equal(ent?.planId, 'standard_monthly');
    assert.equal(ent?.providerSubscriptionRef, 'sub_paid_1');
    assert.equal(ent?.status, 'active');
  } finally {
    await stopTestApp(app);
  }
});
