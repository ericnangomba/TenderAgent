/** Foundation entity types and repository contracts. */

export type EntitlementStatus = 'active' | 'past_due' | 'cancelled';

export type NormalizedEventType =
  | 'subscription.activated'
  | 'subscription.renewed'
  | 'subscription.payment_failed'
  | 'subscription.cancellation_scheduled'
  | 'subscription.cancelled'
  | 'subscription.refunded';

export interface NormalizedBillingEvent {
  eventId: string;
  provider: string;
  type: NormalizedEventType;
  tenantId: string;
  planId?: string;
  subscriptionRef?: string;
  /** End of the paid-up period, when the event carries one. */
  periodEnd?: Date;
  occurredAt: Date;
}

export interface Tenant {
  id: string;
  companyName: string;
  createdAt: Date;
}

export interface User {
  id: string;
  tenantId: string;
  email: string;
  passwordHash: string;
  createdAt: Date;
}

export interface Session {
  id: string;
  userId: string;
  tenantId: string;
  tokenHash: string;
  expiresAt: Date;
  createdAt: Date;
}

export interface Entitlement {
  tenantId: string;
  planId: string | null;
  status: EntitlementStatus | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  providerName: string | null;
  providerSubscriptionRef: string | null;
  refundedAt: Date | null;
  /** Timestamp of the newest billing event already applied - older events must not move state back. */
  lastEventAt: Date | null;
  /** Tie-breaker for events sharing lastEventAt: only an eventId that sorts
   *  after this one may move state, so equal-timestamp application order is
   *  deterministic regardless of webhook arrival order. */
  lastEventId: string | null;
  updatedAt: Date;
}

export interface BillingEventRecord {
  eventId: string;
  provider: string;
  type: NormalizedEventType;
  tenantId: string;
  occurredAt: Date;
  receivedAt: Date;
}

export interface UsageCounter {
  tenantId: string;
  /** Monthly bucket, e.g. '2026-11'. */
  periodKey: string;
  analyses: number;
  serpapiLookups: number;
}

export interface TenantProfile {
  tenantId: string;
  profile: Record<string, unknown>;
  updatedAt: Date;
}

import type { BidApplication } from '../readiness';

export interface FoundationRepos {
  tenants: {
    create(t: Tenant): Promise<void>;
    getById(id: string): Promise<Tenant | null>;
  };
  users: {
    create(u: User): Promise<void>;
    getByEmail(email: string): Promise<User | null>;
    getById(id: string): Promise<User | null>;
  };
  sessions: {
    create(s: Session): Promise<void>;
    getByTokenHash(tokenHash: string): Promise<Session | null>;
    delete(id: string): Promise<void>;
  };
  entitlements: {
    get(tenantId: string): Promise<Entitlement | null>;
    put(e: Entitlement): Promise<void>;
  };
  billingEvents: {
    has(eventId: string): Promise<boolean>;
    /** Recorded only AFTER the state transition succeeds, so a crash between
     *  apply and record simply re-applies the idempotent event on retry. */
    record(e: BillingEventRecord): Promise<void>;
  };
  usage: {
    get(tenantId: string, periodKey: string): Promise<UsageCounter>;
    increment(tenantId: string, periodKey: string, field: 'analyses' | 'serpapiLookups'): Promise<UsageCounter>;
    /** Atomic check-and-increment against a plan allowance: exactly one caller
     *  wins the last unit, even under concurrent requests. */
    tryConsume(tenantId: string, periodKey: string, field: 'analyses' | 'serpapiLookups', limit: number): Promise<{ allowed: boolean; counter: UsageCounter }>;
    /** Give back one previously consumed unit when the paid resource turned out
     *  not to be consumed (missing API key, failed lookup, pipeline error).
     *  Never decrements below zero. */
    release(tenantId: string, periodKey: string, field: 'analyses' | 'serpapiLookups'): Promise<UsageCounter>;
  };
  profiles: {
    get(tenantId: string): Promise<TenantProfile | null>;
    put(p: TenantProfile): Promise<void>;
  };
  applications: {
    create(a: BidApplication): Promise<void>;
    getById(tenantId: string, id: string): Promise<BidApplication | null>;
    listByTenant(tenantId: string): Promise<BidApplication[]>;
    put(a: BidApplication): Promise<void>;
  };
}
