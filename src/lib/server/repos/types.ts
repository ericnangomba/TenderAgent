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
  /** True only after a required second factor was presented for this session. */
  mfaVerified?: boolean;
  /** Pending second factor: the holder authenticated by password but may not
   *  act until /auth/mfa/verify upgrades the session. */
  pendingMfa?: boolean;
}

/** Admin MFA (TOTP) state. secretEnc is AES-256-GCM ciphertext under
 *  PROFILE_FIELD_KEY when configured (enc:v1:...), never a plaintext secret
 *  in responses. Recovery codes are stored as SHA-256 hashes only; the
 *  plaintext codes are shown once at enrollment and never persisted. */
export interface MfaRecord {
  userId: string;
  tenantId: string;
  secretEnc: string;
  /** Second factor active only after the enrollment code was confirmed AND
   *  recovery codes were generated - never before. */
  enabled: boolean;
  recoveryHashes: string[];
  /** Highest TOTP counter already accepted; equal/lower counters are replays. */
  lastTotpCounter: number;
  enrolledAt: Date | null;
  updatedAt: Date;
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

export interface DeletionLedgerEntry {
  tenantId: string;
  erasedAt: Date;
}

export interface FoundationRepos {
  pilot?: import('../betaPilot').PilotStore;
  /** Fail-closed where the driver cannot guarantee atomic whole-account erasure. */
  accountDeletion?: { erase(tenantId: string): Promise<void> };
  /** Completed-erasure record for restore reconciliation. Present only on
   *  deletion-capable drivers. Minimal metadata: tenant IDs and times, never
   *  customer content. A database restore to a pre-deletion point loses these
   *  rows too, so the operator ALSO keeps an external copy (see
   *  docs/DATA_LIFECYCLE.md); this table is the in-database cross-check. */
  deletionLedger?: { list(): Promise<DeletionLedgerEntry[]> };

  /** Atomic first grant only. Existing/revoked/paid entitlements are never replaced. */
  beta?: { redeem(e: Entitlement): Promise<void> };
  tenants: {
    create(t: Tenant): Promise<void>;
    getById(id: string): Promise<Tenant | null>;
  };
  users: {
    create(u: User): Promise<void>;
    getByEmail(email: string): Promise<User | null>;
    getById(id: string): Promise<User | null>;
  };
  mfa: {
    get(userId: string): Promise<MfaRecord | null>;
    put(m: MfaRecord): Promise<void>;
    delete(userId: string): Promise<void>;
    /** Atomic single use: removes the hash and returns true only for the one
     *  caller that held it; concurrent uses of the same code cannot both win. */
    consumeRecoveryCode(userId: string, hash: string): Promise<boolean>;
    /** Atomic replay guard: sets lastTotpCounter to `counter` only when it is
     *  strictly newer than the stored one; returns whether the caller won. */
    stampTotpCounter(userId: string, counter: number): Promise<boolean>;
  };
  sessions: {
    create(s: Session): Promise<void>;
    getByTokenHash(tokenHash: string): Promise<Session | null>;
    /** Persist flag changes after MFA verification upgrades the session. */
    update?(s: Session): Promise<void>;
    delete(id: string): Promise<void>;
    /** Housekeeping only: removes rows whose expiry has already passed.
     *  Expired sessions are already rejected, so this changes no access and
     *  no customer-content retention. Returns the number of removed rows. */
    pruneExpired?(now: Date): Promise<number>;
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
    delete(tenantId: string): Promise<void>;
  };
  applications: {
    create(a: BidApplication): Promise<void>;
    getById(tenantId: string, id: string): Promise<BidApplication | null>;
    listByTenant(tenantId: string): Promise<BidApplication[]>;
    put(a: BidApplication): Promise<void>;
    delete(tenantId: string, id: string): Promise<void>;
  };
  /**
   * Aggregate-only operator statistics for the admin overview. Counts and
   * totals, never per-tenant rows: the admin surface must not become a PII
   * listing channel.
   */
  stats: {
    overview(periodKey: string): Promise<AdminOverview>;
  };
}

export interface AdminOverview {
  tenants: number;
  users: number;
  /** Entitlement counts keyed by status ('none' = no entitlement row). */
  entitlementsByStatus: Record<string, number>;
  /** Consumed units across all tenants for the given period. */
  usage: { analyses: number; serpapiLookups: number };
}
