import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryRepos } from '../src/lib/server/repos/memory';
import { applyBillingEvent, authorizeAndConsume, checkAccess, recordUsage, effectiveStatus, emptyEntitlement } from '../src/lib/server/entitlement';
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
  await repos.tenants.create({ id: 'tenant-1', companyName: 'Synthetic fixture', createdAt: new Date() });

  const config = testConfig();
  await applyBillingEvent(repos, evt({}), NOW);
  const decision = await checkAccess(repos, config, T, 'analysis', NOW);
  assert.equal(decision.allowed, true);
  assert.equal(decision.status, 'active');
});

test('no subscription: freemium allows 3 analyses per month then blocks, paid search stays denied', async () => {
  const repos = createMemoryRepos();
  await repos.tenants.create({ id: 'tenant-1', companyName: 'Synthetic fixture', createdAt: new Date() });

  const config = testConfig();
  // Analysis is allowed within the free monthly allowance.
  const first = await checkAccess(repos, config, T, 'analysis', NOW);
  assert.equal(first.allowed, true);
  assert.equal(first.status, 'none');
  // Paid search is never part of the free allowance.
  const search = await checkAccess(repos, config, T, 'serpapi', NOW);
  assert.equal(search.allowed, false);
  assert.equal(search.reason, 'no_subscription');
  // The free allowance caps at 3 analyses per period.
  for (let i = 0; i < 3; i++) {
    const claim = await authorizeAndConsume(repos, config, T, 'analysis', NOW);
    assert.equal(claim.allowed, true, `free claim ${i + 1}`);
  }
  const exhausted = await checkAccess(repos, config, T, 'analysis', NOW);
  assert.equal(exhausted.allowed, false);
  assert.equal(exhausted.reason, 'freemium_limit_reached');
});

test('duplicate event is idempotent', async () => {
  const repos = createMemoryRepos();
  await repos.tenants.create({ id: 'tenant-1', companyName: 'Synthetic fixture', createdAt: new Date() });

  const e = evt({ eventId: 'evt-dup-1' });
  const first = await applyBillingEvent(repos, e, NOW);
  const second = await applyBillingEvent(repos, e, NOW);
  assert.equal(first.applied, true);
  assert.equal(second.applied, false);
  assert.equal(second.reason, 'duplicate');
});

test('out-of-order older event is recorded but does not move state back', async () => {
  const repos = createMemoryRepos();
  await repos.tenants.create({ id: 'tenant-1', companyName: 'Synthetic fixture', createdAt: new Date() });

  await applyBillingEvent(repos, evt({ eventId: 'evt-new', type: 'subscription.activated', occurredAt: new Date('2026-11-10T12:00:00Z') }), NOW);
  const stale = await applyBillingEvent(repos, evt({ eventId: 'evt-old', type: 'subscription.payment_failed', occurredAt: new Date('2026-11-10T08:00:00Z') }), NOW);
  assert.equal(stale.applied, false);
  assert.equal(stale.reason, 'stale');
  const ent = await repos.entitlements.get(T);
  assert.equal(ent?.status, 'active');
});

test('payment_failed then renewal restores access', async () => {
  const repos = createMemoryRepos();
  await repos.tenants.create({ id: 'tenant-1', companyName: 'Synthetic fixture', createdAt: new Date() });

  const config = testConfig();
  await applyBillingEvent(repos, evt({ eventId: 'e1' }), NOW);
  await applyBillingEvent(repos, evt({ eventId: 'e2', type: 'subscription.payment_failed', occurredAt: new Date('2026-11-11T10:00:00Z') }), NOW);
  // past_due keeps the obligation and paid features off, but every sign-in
  // still gets the free baseline (Eric 27 Nov).
  let decision = await checkAccess(repos, config, T, 'analysis', new Date('2026-11-11T11:00:00Z'));
  assert.equal(decision.allowed, true);
  assert.equal(decision.status, 'past_due');
  assert.equal((await checkAccess(repos, config, T, 'serpapi', new Date('2026-11-11T11:00:00Z'))).allowed, false);
  await applyBillingEvent(repos, evt({ eventId: 'e3', type: 'subscription.renewed', occurredAt: new Date('2026-11-12T10:00:00Z'), periodEnd: new Date('2027-01-10T10:00:00Z') }), NOW);
  decision = await checkAccess(repos, config, T, 'analysis', new Date('2026-11-12T11:00:00Z'));
  assert.equal(decision.allowed, true);
});

test('cancellation at period end: access continues until paid-up period ends', async () => {
  const repos = createMemoryRepos();
  await repos.tenants.create({ id: 'tenant-1', companyName: 'Synthetic fixture', createdAt: new Date() });

  await applyBillingEvent(repos, evt({ eventId: 'c1' }), NOW);
  await applyBillingEvent(repos, evt({ eventId: 'c2', type: 'subscription.cancellation_scheduled', occurredAt: new Date('2026-11-15T10:00:00Z') }), NOW);
  // Still inside paid period
  assert.equal(effectiveStatus(await repos.entitlements.get(T), new Date('2026-12-01T10:00:00Z'), 3), 'active');
  // Past period end with cancellation scheduled
  assert.equal(effectiveStatus(await repos.entitlements.get(T), new Date('2026-12-11T10:00:00Z'), 3), 'cancelled');
});

test('missed renewal: past_due during grace, cancelled after', async () => {
  const repos = createMemoryRepos();
  await repos.tenants.create({ id: 'tenant-1', companyName: 'Synthetic fixture', createdAt: new Date() });

  await applyBillingEvent(repos, evt({ eventId: 'g1' }), NOW);
  const ent = await repos.entitlements.get(T);
  assert.equal(effectiveStatus(ent, new Date('2026-12-12T10:00:00Z'), 3), 'past_due');
  assert.equal(effectiveStatus(ent, new Date('2026-12-14T10:00:01Z'), 3), 'cancelled');
});

test('refund cancels immediately and records refund time', async () => {
  const repos = createMemoryRepos();
  await repos.tenants.create({ id: 'tenant-1', companyName: 'Synthetic fixture', createdAt: new Date() });

  await applyBillingEvent(repos, evt({ eventId: 'r1' }), NOW);
  const refunded = await applyBillingEvent(repos, evt({ eventId: 'r2', type: 'subscription.refunded', occurredAt: new Date('2026-11-20T10:00:00Z') }), NOW);
  assert.equal(refunded.applied, true);
  // Refund cancels the paid plan immediately; the free baseline still
  // applies (calendar-keyed), with paid search denied.
  const decision = await checkAccess(repos, testConfig(), T, 'analysis', new Date('2026-11-20T11:00:00Z'));
  assert.equal(decision.allowed, true);
  assert.equal(decision.status, 'cancelled');
  assert.equal((await checkAccess(repos, testConfig(), T, 'serpapi', new Date('2026-11-20T11:00:00Z'))).allowed, false);
  assert.equal((await repos.entitlements.get(T))?.refundedAt?.toISOString(), '2026-11-20T10:00:00.000Z');
});

test('usage limits: allowed up to the plan allowance, then blocked', async () => {
  const repos = createMemoryRepos();
  await repos.tenants.create({ id: 'tenant-1', companyName: 'Synthetic fixture', createdAt: new Date() });

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


test('former beta tester falls back to the freemium baseline (calendar-keyed, no quota reset)', async () => {
  const repos = createMemoryRepos();
  await repos.tenants.create({ id: 'tenant-1', companyName: 'Synthetic fixture', createdAt: new Date() });

  const campaign = { id: 'pilot', startsAt: '2026-10-01T00:00:00Z', endsAt: '2026-11-18T00:00:00Z', managed: true, invites: [] };
  const config = testConfig({ betaCampaign: campaign });
  // Expired cohort row: window ended 18 Nov, now is 27 Nov.
  await repos.entitlements.put({ ...emptyEntitlement(T), planId: 'test_cohort', status: 'active', providerSubscriptionRef: 'beta:pilot', currentPeriodEnd: new Date('2026-11-18T00:00:00Z') });
  // Pre-seed the old beta window usage at its cap: it must NOT consume the freemium allowance.
  for (let i = 0; i < 20; i++) await repos.usage.tryConsume(T, 'beta_pilot_v1', 'analyses', 20);

  const later = new Date('2026-11-27T10:00:00Z');
  for (let i = 0; i < 3; i++) {
    const claim = await authorizeAndConsume(repos, config, T, 'analysis', later);
    assert.equal(claim.allowed, true, `freemium claim ${i + 1}`);
    assert.equal(claim.periodKey, '2026-11');
  }
  const exhausted = await checkAccess(repos, config, T, 'analysis', later);
  assert.equal(exhausted.allowed, false);
  assert.equal(exhausted.reason, 'freemium_limit_reached');
  // Paid search is never part of the free allowance for former testers either.
  const search = await checkAccess(repos, config, T, 'serpapi', later);
  assert.equal(search.allowed, false);
});

test('lapsed paid (cancelled) gets the free baseline: paid state preserved, paid features not restored', async () => {
  const repos = createMemoryRepos();
  await repos.tenants.create({ id: 'tenant-1', companyName: 'Synthetic fixture', createdAt: new Date() });

  const config = testConfig();
  await applyBillingEvent(repos, evt({ eventId: 'evt-act' }), NOW);
  await applyBillingEvent(repos, evt({ eventId: 'evt-cancel', type: 'subscription.cancelled', occurredAt: new Date('2026-11-11T10:00:00Z') }), new Date('2026-11-11T10:00:00Z'));
  const later = new Date('2026-11-27T10:00:00Z');
  // Every sign-in gets the free baseline (Eric 27 Nov): 3 analyses, calendar-keyed.
  for (let i = 0; i < 3; i++) {
    const claim = await authorizeAndConsume(repos, config, T, 'analysis', later);
    assert.equal(claim.allowed, true, `free claim ${i + 1}`);
    assert.equal(claim.periodKey, '2026-11');
  }
  const exhausted = await checkAccess(repos, config, T, 'analysis', later);
  assert.equal(exhausted.allowed, false);
  assert.equal(exhausted.reason, 'freemium_limit_reached');
  // The paid cancellation is preserved, not erased.
  assert.equal(exhausted.status, 'cancelled');
  const ent = await repos.entitlements.get(T);
  assert.equal(ent?.status, 'cancelled');
  // Paid features are not restored: paid search stays denied.
  const search = await checkAccess(repos, config, T, 'serpapi', later);
  assert.equal(search.allowed, false);
  assert.equal(search.reason, 'no_subscription');
});

test('past_due beyond grace: free baseline applies, obligation and status preserved', async () => {
  const repos = createMemoryRepos();
  await repos.tenants.create({ id: 'tenant-1', companyName: 'Synthetic fixture', createdAt: new Date() });

  const config = testConfig();
  await applyBillingEvent(repos, evt({ eventId: 'evt-act2' }), NOW);
  await applyBillingEvent(repos, evt({ eventId: 'evt-fail', type: 'subscription.payment_failed', occurredAt: new Date('2026-11-11T10:00:00Z') }), new Date('2026-11-11T10:00:00Z'));
  const later = new Date('2026-11-27T10:00:00Z');
  const decision = await checkAccess(repos, config, T, 'analysis', later);
  assert.equal(decision.allowed, true);
  // Status stays past_due: the obligation is neither cleared nor hidden.
  assert.equal(decision.status, 'past_due');
  const ent = await repos.entitlements.get(T);
  assert.equal(ent?.status, 'past_due');
  // A successful renewal returns the account to paid access on its own key.
  await applyBillingEvent(repos, evt({ eventId: 'evt-renew', type: 'subscription.activated', occurredAt: new Date('2026-11-28T10:00:00Z'), periodEnd: new Date('2026-12-28T10:00:00Z') }), new Date('2026-11-28T10:00:00Z'));
  const renewed = await checkAccess(repos, config, T, 'serpapi', new Date('2026-11-28T10:00:00Z'));
  assert.equal(renewed.allowed, true);
  assert.equal(renewed.status, 'active');
});
