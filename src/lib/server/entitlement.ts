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
  if (ent.status === 'cancelled') return 'cancelled';
  if (ent.currentPeriodEnd && now.getTime() > ent.currentPeriodEnd.getTime()) {
    if (ent.cancelAtPeriodEnd) return 'cancelled';
    const graceEnd = ent.currentPeriodEnd.getTime() + graceDays * DAY_MS;
    return now.getTime() > graceEnd ? 'cancelled' : 'past_due';
  }
  return ent.status;
}

export interface ApplyResult {
  applied: boolean;
  reason?: 'duplicate' | 'stale';
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
  const status = effectiveStatus(ent, now, config.pastDueGraceDays);

  if (status === 'none') return { allowed: false, reason: 'no_subscription', status };
  if (status === 'cancelled' || status === 'past_due') {
    return { allowed: false, reason: 'subscription_inactive', status };
  }

  const plan = getPlan(ent?.planId, config.plans);
  if (!plan) return { allowed: false, reason: 'unknown_plan', status };

  const limit = action === 'analysis' ? plan.includedAnalyses : plan.includedSerpapiLookups;
  const field = action === 'analysis' ? 'analyses' : 'serpapiLookups';
  const claim = await repos.usage.tryConsume(tenantId, currentPeriodKey(now), field, limit);
  if (!claim.allowed) return { allowed: false, reason: 'plan_limit_reached', status };

  return { allowed: true, status };
}

export type GatedAction = 'analysis' | 'serpapi';

export interface AccessDecision {
  allowed: boolean;
  reason?: 'no_subscription' | 'subscription_inactive' | 'plan_limit_reached' | 'unknown_plan';
  status?: EffectiveStatus;
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
  const status = effectiveStatus(ent, now, config.pastDueGraceDays);

  if (status === 'none') return { allowed: false, reason: 'no_subscription', status };
  if (status === 'cancelled' || status === 'past_due') {
    return { allowed: false, reason: 'subscription_inactive', status };
  }

  const plan = getPlan(ent?.planId);
  if (!plan) return { allowed: false, reason: 'unknown_plan', status };

  const usage = await repos.usage.get(tenantId, currentPeriodKey(now));
  const used = action === 'analysis' ? usage.analyses : usage.serpapiLookups;
  const limit = action === 'analysis' ? plan.includedAnalyses : plan.includedSerpapiLookups;
  if (used >= limit) return { allowed: false, reason: 'plan_limit_reached', status };

  return { allowed: true, status };
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
