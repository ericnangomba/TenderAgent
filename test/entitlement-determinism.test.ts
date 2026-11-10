/** Deterministic billing-event ordering, default period end, and production fail-closed config. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyBillingEvent, emptyEntitlement } from '../src/lib/server/entitlement';
import { createMemoryRepos } from '../src/lib/server/repos/memory';
import { loadConfig, assertSafeConfig } from '../src/lib/server/config';

const T0 = '2026-11-10T10:00:00Z';

test('equal-timestamp events resolve deterministically regardless of arrival order', async () => {
  const mk = (order: string[]) => {
    const repos = createMemoryRepos();
    return { repos, order };
  };
  const events = {
    a: { eventId: 'evt-a', provider: 'mock', type: 'subscription.activated' as const, tenantId: 't1', planId: 'standard_monthly', periodEnd: new Date('2026-12-10'), occurredAt: new Date(T0) },
    b: { eventId: 'evt-b', provider: 'mock', type: 'subscription.cancelled' as const, tenantId: 't1', occurredAt: new Date(T0) },
  };
  // Arrival order 1: activate then cancel-at-same-instant -> cancel wins (evt-b > evt-a)
  const r1 = mk(['a', 'b']);
  await applyBillingEvent(r1.repos, events.a);
  await applyBillingEvent(r1.repos, events.b);
  // Arrival order 2: cancel first, then the activation arrives - it is the
  // EARLIER event id at the same timestamp and must not reopen the account.
  const r2 = mk(['b', 'a']);
  await applyBillingEvent(r2.repos, events.b);
  await applyBillingEvent(r2.repos, events.a);
  const e1 = await r1.repos.entitlements.get('t1');
  const e2 = await r2.repos.entitlements.get('t1');
  assert.equal(e1!.status, e2!.status, `arrival order changed outcome: ${e1!.status} vs ${e2!.status}`);
  assert.equal(e1!.status, 'cancelled');
});

test('activation without periodEnd defaults to one monthly interval and expires', async () => {
  const repos = createMemoryRepos();
  const { entitlement } = await applyBillingEvent(repos, {
    eventId: 'evt-nopend', provider: 'mock', type: 'subscription.activated',
    tenantId: 't2', planId: 'standard_monthly', occurredAt: new Date(T0),
  });
  assert.ok(entitlement.currentPeriodEnd instanceof Date, 'period end defaulted');
  const days = (entitlement.currentPeriodEnd!.getTime() - new Date(T0).getTime()) / 86400000;
  assert.ok(days >= 28 && days <= 32, `default period ~1 month, got ${days} days`);
});

test('production config fails closed on in-memory store and missing mongo URI', () => {
  const env = { NODE_ENV: 'production' } as NodeJS.ProcessEnv;
  assert.throws(() => assertSafeConfig(loadConfig({}), env), /in-memory store/);
  assert.throws(() => assertSafeConfig(loadConfig({ STORE: 'mongo' }), env), /MONGODB_URI/);
  // Explicit demo opt-in is honored.
  assertSafeConfig(loadConfig({}), { NODE_ENV: 'production', ALLOW_MEMORY_STORE_IN_PRODUCTION: 'true' } as NodeJS.ProcessEnv);
});

test('production on a real store fails closed without AUTH_REQUIRED', () => {
  const env = { NODE_ENV: 'production' } as NodeJS.ProcessEnv;
  const pg = { STORE: 'postgres', DATABASE_URL: 'postgres://u:p@db.example:5432/app?sslmode=verify-full' };
  assert.throws(() => assertSafeConfig(loadConfig(pg), env), /AUTH_REQUIRED/);
  assert.throws(() => assertSafeConfig(loadConfig({ STORE: 'mongo', MONGODB_URI: 'mongodb://db:27017/app' }), env), /AUTH_REQUIRED/);
  // Fully configured real store boots.
  assertSafeConfig(loadConfig({ ...pg, AUTH_REQUIRED: 'true' }), env);
  // Missing DATABASE_URL still fails closed on its own error.
  assert.throws(() => assertSafeConfig(loadConfig({ STORE: 'postgres', AUTH_REQUIRED: 'true' }), env), /DATABASE_URL/);
});

test('no public default webhook secret: empty env means unconfigured', () => {
  assert.equal(loadConfig({}).mockBillingSecret, '');
  assert.equal(loadConfig({ MOCK_BILLING_SECRET: 'x' }).mockBillingSecret, 'x');
});

test('trust proxy defaults to off', () => {
  assert.equal(loadConfig({}).trustProxy, false);
  assert.equal(loadConfig({ TRUST_PROXY: '1' }).trustProxy, '1');
});

test('emptyEntitlement includes the deterministic tie-breaker field', () => {
  assert.equal(emptyEntitlement('t').lastEventId, null);
});
