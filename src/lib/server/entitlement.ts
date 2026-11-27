/**
 * Entitlement state machine - our own database is the gating source of truth.
 * Payment providers only move it through verified, idempotent billing events.
 */
import type { Entitlement, FoundationRepos, NormalizedBillingEvent } from './repos/types';
import { getPlan, type FoundationConfig, type Plan } from './config';

export type EffectiveStatus = 'none' | 'active' | 'past_due' | 'cancelled';

const DAY_MS = 24 * 60 * 60 * 1000;

export function emptyEntitlement(tenantId: string): Entitlement {
  return {
    tenantId,
    planId: null,
    status: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    providerName: null,
    providerSubscriptionRef: null,
    refundedAt: null,
    lastEventAt: null,
    lastEventId: null,
    updatedAt: new Date(),
  };
}

/** Status as of `now`, applying period expiry lazily so no cron job is required. */
export function effectiveStatus(ent: Entitlement | null, now: Date, graceDays: number): EffectiveStatus {
  if (!ent || !ent.status) return 'none';
  if (ent.planId === 'test_cohort' && (!ent.currentPeriodEnd || now.getTime() >= ent.currentPeriodEnd.getTime())) return 'cancelled';
  if (ent.status === 'cancelled') return 'cancelled';
  if (ent.currentPeriodEnd && now.getTime() > ent.currentPeriodEnd.getTime()) {
    if (ent.cancelAtPeriodEnd) return 'cancelled';
    const graceEnd = ent.currentPeriodEnd.getTime() + graceDays * DAY_MS;
    return now.getTime() > graceEnd ? 'cancelled' : 'past_due';
  }
  return ent.status;
}

/** Campaign closure is authoritative even for an already redeemed entitlement. */
export function entitlementStatus(ent: Entitlement | null, config: FoundationConfig, now: Date = new Date()): EffectiveStatus {
  if (ent?.planId === 'test_cohort' && (!config.betaCampaign
    || ent.providerSubscriptionRef !== `beta:${config.betaCampaign.id}`
    || now < new Date(config.betaCampaign.startsAt) || now >= new Date(config.betaCampaign.endsAt))) return 'cancelled';
  return effectiveStatus(ent, now, config.pastDueGraceDays);
}

/**
 * Freemium baseline (Eric, 2026-11-27: "Any sign in is automatically
 * freemium 3 analysis a month"): EVERY signed-in account without an ACTIVE
 * paid entitlement gets 3 free analyses per calendar month. That includes
 * former beta testers whose cohort window ended and lapsed paid accounts.
 * The paid entitlement row and its status are preserved untouched: the
 * baseline never restores paid features (analysis only, no paid search),
 * never writes to the entitlement, and never clears or reduces a past_due
 * obligation - a successful payment webhook reactivates the paid plan on
 * its own period key. Free usage is calendar-keyed, so neither the old
 * beta_pilot_v1 window nor a paid period bucket is consumed or reset.
 */
export function freemiumBaselineApplies(ent: Entitlement | null, config: FoundationConfig, now: Date = new Date()): boolean {
  const status = entitlementStatus(ent, config, now);
  return status === 'none' || status === 'cancelled' || status === 'past_due';
}

export const FREEMIUM_INCLUDED_ANALYSES = 3;

export interface ApplyResult {
  applied: boolean;
  reason?: 'duplicate' | 'stale' | 'tenant_missing';
  entitlement: Entitlement;
}

/**
 * Applies one normalized billing event. Idempotent on eventId; events older
 * than the newest already-applied event are recorded but must not move state.
 */
export async function applyBillingEvent(
  repos: FoundationRepos,
  evt: NormalizedBillingEvent,
  now: Date = new Date(),
): Promise<ApplyResult> {
  if (!await repos.tenants.getById(evt.tenantId)) return { applied: false, reason: 'tenant_missing', entitlement: emptyEntitlement(evt.tenantId) };
  if (await repos.billingEvents.has(evt.eventId)) {
    const current = (await repos.entitlements.get(evt.tenantId)) || emptyEntitlement(evt.tenantId);
    return { applied: false, reason: 'duplicate', entitlement: current };
  }

  const current = (await repos.entitlements.get(evt.tenantId)) || emptyEntitlement(evt.tenantId);
  // Older events never move state back. Equal timestamps are ordered by eventId
  // so the result is deterministic regardless of webhook arrival order.
  const isStale = current.lastEventAt
    && (evt.occurredAt.getTime() < current.lastEventAt.getTime()
      || (evt.occurredAt.getTime() === current.lastEventAt.getTime()
        && current.lastEventId !== null
        && evt.eventId <= current.lastEventId));
  if (isStale) {
    await repos.billingEvents.record({
      eventId: evt.eventId, provider: evt.provider, type: evt.type,
      tenantId: evt.tenantId, occurredAt: evt.occurredAt, receivedAt: now,
    });
    return { applied: false, reason: 'stale', entitlement: current };
  }

  const next: Entitlement = { ...current, lastEventAt: evt.occurredAt, lastEventId: evt.eventId, updatedAt: now };

  // A paid-up subscription must always have a period end - 'active' with no
  // currentPeriodEnd would never expire. When the provider omits it, default
  // to one monthly interval from the event so access still lapses on its own.
  const defaultPeriodEnd = new Date(evt.occurredAt.getTime() + 31 * DAY_MS);

  switch (evt.type) {
    case 'subscription.activated':
      next.status = 'active';
      next.planId = evt.planId || next.planId;
      next.providerName = evt.provider;
      next.providerSubscriptionRef = evt.subscriptionRef || next.providerSubscriptionRef;
      next.currentPeriodEnd = evt.periodEnd || next.currentPeriodEnd || defaultPeriodEnd;
      next.cancelAtPeriodEnd = false;
      next.refundedAt = null;
      break;
    case 'subscription.renewed':
      next.status = 'active';
      next.currentPeriodEnd = evt.periodEnd || next.currentPeriodEnd || defaultPeriodEnd;
      next.cancelAtPeriodEnd = false;
      break;
    case 'subscription.payment_failed':
      next.status = 'past_due';
      break;
    case 'subscription.cancellation_scheduled':
      // Access continues until the paid-up period ends; expiry is applied lazily.
      next.cancelAtPeriodEnd = true;
      break;
    case 'subscription.cancelled':
      next.status = 'cancelled';
      next.cancelAtPeriodEnd = false;
      break;
    case 'subscription.refunded':
      next.status = 'cancelled';
      next.cancelAtPeriodEnd = false;
      next.refundedAt = evt.occurredAt;
      break;
  }

  // State first, event record second: a crash between them means the retry
  // re-applies the same absolute transition (idempotent) before recording.
  await repos.entitlements.put(next);
  await repos.billingEvents.record({
    eventId: evt.eventId, provider: evt.provider, type: evt.type,
    tenantId: evt.tenantId, occurredAt: evt.occurredAt, receivedAt: now,
  });
  return { applied: true, entitlement: next };
}

/**
 * Status check + ATOMIC allowance claim in one operation. This is what the
 * spend guards must use: check-then-act without a shared claim races under
 * concurrent requests and can overspend the plan allowance.
 */
export async function authorizeAndConsume(
  repos: FoundationRepos,
  config: FoundationConfig,
  tenantId: string,
  action: GatedAction,
  now: Date = new Date(),
): Promise<AccessDecision> {
  const ent = await repos.entitlements.get(tenantId);
  const status = entitlementStatus(ent, config, now);

  if (freemiumBaselineApplies(ent, config, now)) {
    // Freemium baseline: 3 free analyses per calendar month for every
    // signed-in account, including former beta testers. Calendar-keyed, so
    // an expired beta window's beta_pilot_v1 usage can never reset it.
    if (action !== 'analysis') return { allowed: false, reason: 'no_subscription', status };
    const usage = await repos.usage.get(tenantId, currentPeriodKey(now));
    if (usage.analyses >= FREEMIUM_INCLUDED_ANALYSES) return { allowed: false, reason: 'freemium_limit_reached', status };
    const claim = await repos.usage.tryConsume(tenantId, currentPeriodKey(now), 'analyses', FREEMIUM_INCLUDED_ANALYSES);
    if (!claim.allowed) return { allowed: false, reason: 'no_subscription', status };
    return { allowed: true, status, periodKey: currentPeriodKey(now) };
  }
  if (status === 'cancelled' || status === 'past_due') {
    return { allowed: false, reason: 'subscription_inactive', status };
  }

  const plan = getPlan(ent?.planId, config.plans);
  if (!plan) return { allowed: false, reason: 'unknown_plan', status };

  const limit = ent?.planId === 'test_cohort' ? (action === 'analysis' ? 20 : 0) : (action === 'analysis' ? plan.includedAnalyses : plan.includedSerpapiLookups);
  const field = action === 'analysis' ? 'analyses' : 'serpapiLookups';
  const claim = await repos.usage.tryConsume(tenantId, usagePeriodKey(ent, now), field, limit);
  if (!claim.allowed) return { allowed: false, reason: 'plan_limit_reached', status };

  return { allowed: true, status, periodKey: usagePeriodKey(ent, now) };
}

export type GatedAction = 'analysis' | 'serpapi';

export type AccessDecision = {
  allowed: boolean;
  reason?: 'no_subscription' | 'subscription_inactive' | 'plan_limit_reached' | 'unknown_plan' | 'freemium_limit_reached';
  status?: EffectiveStatus;
  periodKey?: string;
};

export function usagePeriodKey(ent: Entitlement | null, now: Date = new Date()): string {
  return ent?.planId === 'test_cohort' ? 'beta_pilot_v1' : currentPeriodKey(now);
}

export function currentPeriodKey(now: Date = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

export async function checkAccess(
  repos: FoundationRepos,
  config: FoundationConfig,
  tenantId: string,
  action: GatedAction,
  now: Date = new Date(),
): Promise<AccessDecision> {
  const ent = await repos.entitlements.get(tenantId);
  const status = entitlementStatus(ent, config, now);

  if (freemiumBaselineApplies(ent, config, now)) {
    // Freemium baseline: see authorizeAndConsume.
    if (action !== 'analysis') return { allowed: false, reason: 'no_subscription', status };
    const usage = await repos.usage.get(tenantId, currentPeriodKey(now));
    if (usage.analyses >= FREEMIUM_INCLUDED_ANALYSES) return { allowed: false, reason: 'freemium_limit_reached', status };
    return { allowed: true, status, periodKey: currentPeriodKey(now) };
  }
  if (status === 'cancelled' || status === 'past_due') {
    return { allowed: false, reason: 'subscription_inactive', status };
  }

  const plan = getPlan(ent?.planId, config.plans);
  if (!plan) return { allowed: false, reason: 'unknown_plan', status };

  const usage = await repos.usage.get(tenantId, usagePeriodKey(ent, now));
  const used = action === 'analysis' ? usage.analyses : usage.serpapiLookups;
  const limit = ent?.planId === 'test_cohort' ? (action === 'analysis' ? 20 : 0) : (action === 'analysis' ? plan.includedAnalyses : plan.includedSerpapiLookups);
  if (used >= limit) return { allowed: false, reason: 'plan_limit_reached', status };

  return { allowed: true, status, periodKey: usagePeriodKey(ent, now) };
}

export async function recordUsage(
  repos: FoundationRepos,
  tenantId: string,
  action: GatedAction,
  now: Date = new Date(),
): Promise<void> {
  await repos.usage.increment(
    tenantId,
    currentPeriodKey(now),
    action === 'analysis' ? 'analyses' : 'serpapiLookups',
  );
}
