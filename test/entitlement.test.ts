import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryRepos } from '../src/lib/server/repos/memory';
import { applyBillingEvent, checkAccess, recordUsage, effectiveStatus, emptyEntitlement } from '../src/lib/server/entitlement';
import { testConfig } from './helpers';
import type { NormalizedBillingEvent } from '../src/lib/server/repos/types';

const T = 'tenant-1';
const NOW = new Date('2026-11-10T10:00:00Z');
const IN_30_DAYS = new Date('2026-12-10T10:00:00Z');

function evt(partial: Partial<NormalizedBillingEvent>): NormalizedBillingEvent {
  return {
    eventId: `evt-${Math.random().toString(36).slice(2)}`,
    provider: 'mock',
    type: 'subscription.activated',
    tenantId: T,
    planId: 'standard_monthly',
    subscriptionRef: 'sub_123',
    periodEnd: IN_30_DAYS,
    occurredAt: NOW,
    ...partial,
  };
}

test('activation grants access within plan limits', async () => {
  const repos = createMemoryRepos();
  const config = testConfig();
  await applyBillingEvent(repos, evt({}), NOW);
  const decision = await checkAccess(repos, config, T, 'analysis', NOW);
  assert.equal(decision.allowed, true);
  assert.equal(decision.status, 'active');
});

test('no subscription blocks access with no_subscription', async () => {
  const repos = createMemoryRepos();
  const decision = await checkAccess(repos, testConfig(), T, 'analysis', NOW);
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, 'no_subscription');
});

test('duplicate event is idempotent', async () => {
  const repos = createMemoryRepos();
  const e = evt({ eventId: 'evt-dup-1' });
  const first = await applyBillingEvent(repos, e, NOW);
  const second = await applyBillingEvent(repos, e, NOW);
  assert.equal(first.applied, true);
  assert.equal(second.applied, false);
  assert.equal(second.reason, 'duplicate');
});

test('out-of-order older event is recorded but does not move state back', async () => {
  const repos = createMemoryRepos();
  await applyBillingEvent(repos, evt({ eventId: 'evt-new', type: 'subscription.activated', occurredAt: new Date('2026-11-10T12:00:00Z') }), NOW);
  const stale = await applyBillingEvent(repos, evt({ eventId: 'evt-old', type: 'subscription.payment_failed', occurredAt: new Date('2026-11-10T08:00:00Z') }), NOW);
  assert.equal(stale.applied, false);
  assert.equal(stale.reason, 'stale');
  const ent = await repos.entitlements.get(T);
  assert.equal(ent?.status, 'active');
});

test('payment_failed then renewal restores access', async () => {
  const repos = createMemoryRepos();
  const config = testConfig();
  await applyBillingEvent(repos, evt({ eventId: 'e1' }), NOW);
  await applyBillingEvent(repos, evt({ eventId: 'e2', type: 'subscription.payment_failed', occurredAt: new Date('2026-11-11T10:00:00Z') }), NOW);
  let decision = await checkAccess(repos, config, T, 'analysis', new Date('2026-11-11T11:00:00Z'));
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, 'subscription_inactive');
  await applyBillingEvent(repos, evt({ eventId: 'e3', type: 'subscription.renewed', occurredAt: new Date('2026-11-12T10:00:00Z'), periodEnd: new Date('2027-01-10T10:00:00Z') }), NOW);
  decision = await checkAccess(repos, config, T, 'analysis', new Date('2026-11-12T11:00:00Z'));
  assert.equal(decision.allowed, true);
});

test('cancellation at period end: access continues until paid-up period ends', async () => {
  const repos = createMemoryRepos();
  await applyBillingEvent(repos, evt({ eventId: 'c1' }), NOW);
  await applyBillingEvent(repos, evt({ eventId: 'c2', type: 'subscription.cancellation_scheduled', occurredAt: new Date('2026-11-15T10:00:00Z') }), NOW);
  // Still inside paid period
  assert.equal(effectiveStatus(await repos.entitlements.get(T), new Date('2026-12-01T10:00:00Z'), 3), 'active');
  // Past period end with cancellation scheduled
  assert.equal(effectiveStatus(await repos.entitlements.get(T), new Date('2026-12-11T10:00:00Z'), 3), 'cancelled');
});

test('missed renewal: past_due during grace, cancelled after', async () => {
  const repos = createMemoryRepos();
  await applyBillingEvent(repos, evt({ eventId: 'g1' }), NOW);
  const ent = await repos.entitlements.get(T);
  assert.equal(effectiveStatus(ent, new Date('2026-12-12T10:00:00Z'), 3), 'past_due');
  assert.equal(effectiveStatus(ent, new Date('2026-12-14T10:00:01Z'), 3), 'cancelled');
});

test('refund cancels immediately and records refund time', async () => {
  const repos = createMemoryRepos();
  await applyBillingEvent(repos, evt({ eventId: 'r1' }), NOW);
  const refunded = await applyBillingEvent(repos, evt({ eventId: 'r2', type: 'subscription.refunded', occurredAt: new Date('2026-11-20T10:00:00Z') }), NOW);
  assert.equal(refunded.applied, true);
  const decision = await checkAccess(repos, testConfig(), T, 'analysis', new Date('2026-11-20T11:00:00Z'));
  assert.equal(decision.allowed, false);
  assert.equal((await repos.entitlements.get(T))?.refundedAt?.toISOString(), '2026-11-20T10:00:00.000Z');
});

test('usage limits: allowed up to the plan allowance, then blocked', async () => {
  const repos = createMemoryRepos();
  const config = testConfig();
  await applyBillingEvent(repos, evt({ eventId: 'u1' }), NOW);
  const planLimit = 60; // standard_monthly provisional allowance
  for (let i = 0; i < planLimit; i++) {
    await recordUsage(repos, T, 'analysis', NOW);
  }
  const decision = await checkAccess(repos, config, T, 'analysis', NOW);
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, 'plan_limit_reached');
  // serpapi allowance is tracked separately
  const serpDecision = await checkAccess(repos, config, T, 'serpapi', NOW);
  assert.equal(serpDecision.allowed, true);
});

test('empty entitlement has effective status none', () => {
  assert.equal(effectiveStatus(emptyEntitlement('x'), NOW, 3), 'none');
});
