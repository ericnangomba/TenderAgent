/**
 * PostgreSQL repositories (Neon-compatible). Selected with STORE=postgres +
 * DATABASE_URL. connectPostgres() applies the idempotent schema before the
 * repos are used; the pool is injectable so tests can substitute an in-memory
 * Postgres (pg-mem) without network access.
 *
 * Concurrency: tryConsume is a single conditional UPDATE that takes the row
 * lock, so exactly one concurrent caller wins the last unit of an allowance -
 * the same guarantee the memory driver gets from the single-threaded loop.
 */
import { Pool } from 'pg';
import type {
  FoundationRepos, Tenant, User, Session, Entitlement, BillingEventRecord, UsageCounter, TenantProfile,
} from './types';
import type { BidApplication } from '../readiness';

/** Minimal pool surface so pg-mem adapters work in tests. */
export interface PoolLike {
  query(text: string, params?: unknown[]): Promise<{ rows: any[]; rowCount: number | null }>;
}

export const POSTGRES_SCHEMA = `
CREATE TABLE IF NOT EXISTS foundation_tenants (
  id text PRIMARY KEY,
  company_name text NOT NULL,
  created_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS foundation_users (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  email text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS foundation_sessions (
  id text PRIMARY KEY,
  user_id text NOT NULL,
  tenant_id text NOT NULL,
  token_hash text UNIQUE NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS foundation_entitlements (
  tenant_id text PRIMARY KEY,
  plan_id text,
  status text,
  current_period_end timestamptz,
  cancel_at_period_end boolean,
  provider_name text,
  provider_subscription_ref text,
  refunded_at timestamptz,
  last_event_at timestamptz,
  last_event_id text,
  updated_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS foundation_billing_events (
  event_id text PRIMARY KEY,
  provider text NOT NULL,
  type text NOT NULL,
  tenant_id text NOT NULL,
  occurred_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS foundation_usage_counters (
  tenant_id text NOT NULL,
  period_key text NOT NULL,
  analyses integer NOT NULL DEFAULT 0,
  serpapi_lookups integer NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, period_key)
);
CREATE TABLE IF NOT EXISTS foundation_profiles (
  tenant_id text PRIMARY KEY,
  profile jsonb NOT NULL,
  updated_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS foundation_applications (
  id text NOT NULL,
  tenant_id text NOT NULL,
  tender_ref text NOT NULL,
  title text NOT NULL,
  state text NOT NULL,
  requirements jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, id)
);
`;

export async function ensurePostgresSchema(pool: PoolLike): Promise<void> {
  await pool.query(POSTGRES_SCHEMA);
}

/** Connect a real Postgres and apply the schema before serving.
 *
 *  TLS: sslmode=require encrypts but does NOT verify the server certificate,
 *  which leaves the connection open to MITM on hostile networks. This driver
 *  verifies certificates (verify-full semantics) by default - Neon serves
 *  publicly trusted certs, so the system CA store is enough. PGSSL=disable is
 *  the explicit escape hatch for a local dev database without TLS; never set
 *  it for a networked database. */
export async function connectPostgres(uri: string): Promise<Pool> {
  // Verified live against Neon (pg 8.23.1, PostgreSQL 18.6): the console
  // connection string (sslmode=require&channel_binding=require) connects as-is
  // - pg ignores channel_binding rather than failing. The explicit ssl option
  // still matters: pg 8 treats sslmode=require as verify-full, but pg 9 will
  // adopt weaker libpq semantics, so certificate verification is pinned here
  // instead of inherited from the string. PGSSL=disable is the explicit
  // escape hatch for a local dev database without TLS; never set it for a
  // networked database.
  const ssl = process.env.PGSSL === 'disable' ? false : { rejectUnauthorized: true };
  const pool = new Pool({ connectionString: uri, max: 5, ssl });
  await ensurePostgresSchema(pool);
  return pool;
}

const USAGE_COLUMN: Record<'analyses' | 'serpapiLookups', string> = {
  analyses: 'analyses',
  serpapiLookups: 'serpapi_lookups',
};

const asDate = (v: any): Date => (v instanceof Date ? v : new Date(v));
const asDateOrNull = (v: any): Date | null => (v == null ? null : asDate(v));

function toUsage(row: any): UsageCounter {
  return {
    tenantId: row.tenant_id,
    periodKey: row.period_key,
    analyses: Number(row.analyses),
    serpapiLookups: Number(row.serpapi_lookups),
  };
}

function toApplication(row: any): BidApplication {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    tenderRef: row.tender_ref,
    title: row.title,
    state: row.state,
    requirements: typeof row.requirements === 'string' ? JSON.parse(row.requirements) : row.requirements,
    createdAt: asDate(row.created_at),
    updatedAt: asDate(row.updated_at),
  };
}

export function createPostgresRepos(pool: PoolLike): FoundationRepos {
  return {
    tenants: {
      async create(t: Tenant) {
        await pool.query(
          'INSERT INTO foundation_tenants (id, company_name, created_at) VALUES ($1, $2, $3)',
          [t.id, t.companyName, t.createdAt],
        );
      },
      async getById(id: string) {
        const { rows } = await pool.query('SELECT * FROM foundation_tenants WHERE id = $1', [id]);
        const r = rows[0];
        return r ? { id: r.id, companyName: r.company_name, createdAt: asDate(r.created_at) } : null;
      },
    },
    users: {
      async create(u: User) {
        // Email is stored lowercased so the UNIQUE constraint enforces the
        // same case-insensitive uniqueness the memory driver applies.
        try {
          await pool.query(
            'INSERT INTO foundation_users (id, tenant_id, email, password_hash, created_at) VALUES ($1, $2, $3, $4, $5)',
            [u.id, u.tenantId, u.email.toLowerCase(), u.passwordHash, u.createdAt],
          );
        } catch (err: any) {
          if (err?.code === '23505') throw new Error('email_already_registered');
          throw err;
        }
      },
      async getByEmail(email: string) {
        const { rows } = await pool.query('SELECT * FROM foundation_users WHERE email = $1', [email.toLowerCase()]);
        const r = rows[0];
        return r ? { id: r.id, tenantId: r.tenant_id, email: r.email, passwordHash: r.password_hash, createdAt: asDate(r.created_at) } : null;
      },
      async getById(id: string) {
        const { rows } = await pool.query('SELECT * FROM foundation_users WHERE id = $1', [id]);
        const r = rows[0];
        return r ? { id: r.id, tenantId: r.tenant_id, email: r.email, passwordHash: r.password_hash, createdAt: asDate(r.created_at) } : null;
      },
    },
    sessions: {
      async create(s: Session) {
        await pool.query(
          'INSERT INTO foundation_sessions (id, user_id, tenant_id, token_hash, expires_at, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
          [s.id, s.userId, s.tenantId, s.tokenHash, s.expiresAt, s.createdAt],
        );
      },
      async getByTokenHash(tokenHash: string) {
        const { rows } = await pool.query('SELECT * FROM foundation_sessions WHERE token_hash = $1', [tokenHash]);
        const r = rows[0];
        return r ? {
          id: r.id, userId: r.user_id, tenantId: r.tenant_id, tokenHash: r.token_hash,
          expiresAt: asDate(r.expires_at), createdAt: asDate(r.created_at),
        } : null;
      },
      async delete(id: string) {
        await pool.query('DELETE FROM foundation_sessions WHERE id = $1', [id]);
      },
    },
    entitlements: {
      async get(tenantId: string) {
        const { rows } = await pool.query('SELECT * FROM foundation_entitlements WHERE tenant_id = $1', [tenantId]);
        const r = rows[0];
        if (!r) return null;
        return {
          tenantId: r.tenant_id,
          planId: r.plan_id,
          status: r.status,
          currentPeriodEnd: asDateOrNull(r.current_period_end),
          cancelAtPeriodEnd: Boolean(r.cancel_at_period_end),
          providerName: r.provider_name,
          providerSubscriptionRef: r.provider_subscription_ref,
          refundedAt: asDateOrNull(r.refunded_at),
          lastEventAt: asDateOrNull(r.last_event_at),
          lastEventId: r.last_event_id ?? null,
          updatedAt: asDate(r.updated_at),
        };
      },
      async put(e: Entitlement) {
        await pool.query(
          `INSERT INTO foundation_entitlements
             (tenant_id, plan_id, status, current_period_end, cancel_at_period_end,
              provider_name, provider_subscription_ref, refunded_at, last_event_at, last_event_id, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
           ON CONFLICT (tenant_id) DO UPDATE SET
             plan_id = EXCLUDED.plan_id, status = EXCLUDED.status,
             current_period_end = EXCLUDED.current_period_end,
             cancel_at_period_end = EXCLUDED.cancel_at_period_end,
             provider_name = EXCLUDED.provider_name,
             provider_subscription_ref = EXCLUDED.provider_subscription_ref,
             refunded_at = EXCLUDED.refunded_at,
             last_event_at = EXCLUDED.last_event_at,
             last_event_id = EXCLUDED.last_event_id,
             updated_at = EXCLUDED.updated_at`,
          [e.tenantId, e.planId, e.status, e.currentPeriodEnd, e.cancelAtPeriodEnd,
           e.providerName, e.providerSubscriptionRef, e.refundedAt, e.lastEventAt, e.lastEventId, e.updatedAt],
        );
      },
    },
    billingEvents: {
      async has(eventId: string) {
        const { rows } = await pool.query('SELECT 1 FROM foundation_billing_events WHERE event_id = $1', [eventId]);
        return rows.length > 0;
      },
      async record(e: BillingEventRecord) {
        // Recorded only after the state transition succeeded; a duplicate
        // delivery after a crash is idempotent via ON CONFLICT.
        await pool.query(
          `INSERT INTO foundation_billing_events (event_id, provider, type, tenant_id, occurred_at, received_at)
           VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (event_id) DO NOTHING`,
          [e.eventId, e.provider, e.type, e.tenantId, e.occurredAt, e.receivedAt],
        );
      },
    },
    usage: {
      async get(tenantId: string, periodKey: string) {
        const { rows } = await pool.query(
          'SELECT * FROM foundation_usage_counters WHERE tenant_id = $1 AND period_key = $2',
          [tenantId, periodKey],
        );
        return rows[0] ? toUsage(rows[0]) : { tenantId, periodKey, analyses: 0, serpapiLookups: 0 };
      },
      async increment(tenantId: string, periodKey: string, field: 'analyses' | 'serpapiLookups') {
        const col = USAGE_COLUMN[field];
        const { rows } = await pool.query(
          `INSERT INTO foundation_usage_counters (tenant_id, period_key, ${col}) VALUES ($1, $2, 1)
           ON CONFLICT (tenant_id, period_key) DO UPDATE SET ${col} = foundation_usage_counters.${col} + 1
           RETURNING *`,
          [tenantId, periodKey],
        );
        return toUsage(rows[0]);
      },
      async tryConsume(tenantId: string, periodKey: string, field: 'analyses' | 'serpapiLookups', limit: number) {
        const col = USAGE_COLUMN[field];
        await pool.query(
          'INSERT INTO foundation_usage_counters (tenant_id, period_key) VALUES ($1, $2) ON CONFLICT (tenant_id, period_key) DO NOTHING',
          [tenantId, periodKey],
        );
        // Conditional increment: the row lock serializes concurrent callers,
        // so exactly one wins the last unit under the limit.
        const { rows } = await pool.query(
          `UPDATE foundation_usage_counters SET ${col} = ${col} + 1
           WHERE tenant_id = $1 AND period_key = $2 AND ${col} < $3
           RETURNING *`,
          [tenantId, periodKey, limit],
        );
        if (rows[0]) return { allowed: true, counter: toUsage(rows[0]) };
        return { allowed: false, counter: await this.get(tenantId, periodKey) };
      },
      async release(tenantId: string, periodKey: string, field: 'analyses' | 'serpapiLookups') {
        const col = USAGE_COLUMN[field];
        await pool.query(
          'INSERT INTO foundation_usage_counters (tenant_id, period_key) VALUES ($1, $2) ON CONFLICT (tenant_id, period_key) DO NOTHING',
          [tenantId, periodKey],
        );
        const { rows } = await pool.query(
          `UPDATE foundation_usage_counters SET ${col} = GREATEST(${col} - 1, 0)
           WHERE tenant_id = $1 AND period_key = $2
           RETURNING *`,
          [tenantId, periodKey],
        );
        return toUsage(rows[0]);
      },
    },
    profiles: {
      async get(tenantId: string) {
        const { rows } = await pool.query('SELECT * FROM foundation_profiles WHERE tenant_id = $1', [tenantId]);
        const r = rows[0];
        if (!r) return null;
        return {
          tenantId: r.tenant_id,
          profile: typeof r.profile === 'string' ? JSON.parse(r.profile) : r.profile,
          updatedAt: asDate(r.updated_at),
        };
      },
      async put(p: TenantProfile) {
        await pool.query(
          `INSERT INTO foundation_profiles (tenant_id, profile, updated_at) VALUES ($1, $2, $3)
           ON CONFLICT (tenant_id) DO UPDATE SET profile = EXCLUDED.profile, updated_at = EXCLUDED.updated_at`,
          [p.tenantId, JSON.stringify(p.profile), p.updatedAt],
        );
      },
    },
    applications: {
      async create(a: BidApplication) {
        await pool.query(
          `INSERT INTO foundation_applications (id, tenant_id, tender_ref, title, state, requirements, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [a.id, a.tenantId, a.tenderRef, a.title, a.state, JSON.stringify(a.requirements), a.createdAt, a.updatedAt],
        );
      },
      async getById(tenantId: string, id: string) {
        const { rows } = await pool.query(
          'SELECT * FROM foundation_applications WHERE tenant_id = $1 AND id = $2',
          [tenantId, id],
        );
        return rows[0] ? toApplication(rows[0]) : null;
      },
      async listByTenant(tenantId: string) {
        const { rows } = await pool.query(
          'SELECT * FROM foundation_applications WHERE tenant_id = $1 ORDER BY updated_at DESC',
          [tenantId],
        );
        return rows.map(toApplication);
      },
      async put(a: BidApplication) {
        await pool.query(
          `UPDATE foundation_applications SET tender_ref = $3, title = $4, state = $5, requirements = $6, updated_at = $7
           WHERE tenant_id = $1 AND id = $2`,
          [a.tenantId, a.id, a.tenderRef, a.title, a.state, JSON.stringify(a.requirements), a.updatedAt],
        );
      },
    },
  };
}
