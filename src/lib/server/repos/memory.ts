/** In-memory repositories: default driver for development and the whole test suite. */
import type {
  FoundationRepos, Tenant, User, Session, Entitlement, BillingEventRecord, UsageCounter, TenantProfile,
} from './types';
import { AccountDeletionError, hasExternalBilling } from '../accountLifecycle';
import type { BidApplication } from '../readiness';

export function createMemoryRepos(): FoundationRepos {
  const tenants = new Map<string, Tenant>();
  const usersById = new Map<string, User>();
  const usersByEmail = new Map<string, User>();
  const sessionsById = new Map<string, Session>();
  const sessionsByToken = new Map<string, Session>();
  const entitlements = new Map<string, Entitlement>();
  const billingEventIds = new Map<string, BillingEventRecord>();
  const usage = new Map<string, UsageCounter>();
  const profiles = new Map<string, TenantProfile>();
  const applications = new Map<string, BidApplication>();

  const clone = <T>(v: T): T => structuredClone(v);

  const repos: FoundationRepos = {
    accountDeletion: {
      async erase(tenantId) {
        if (!tenants.has(tenantId)) return;
        if (hasExternalBilling(entitlements.get(tenantId)?.providerName, entitlements.get(tenantId)?.providerSubscriptionRef)
          || [...billingEventIds.values()].some(e => e.tenantId === tenantId && hasExternalBilling(e.provider))) {
          throw new AccountDeletionError('billing_resolution_required');
        }
        // Synchronous block: no partially erased state can interleave.
        for (const [id, u] of usersById) if (u.tenantId === tenantId) { usersById.delete(id); usersByEmail.delete(u.email.toLowerCase()); }
        for (const [id, v] of sessionsById) if (v.tenantId === tenantId) { sessionsById.delete(id); sessionsByToken.delete(v.tokenHash); }
        for (const [id, v] of applications) if (v.tenantId === tenantId) applications.delete(id);
        for (const [id, v] of usage) if (v.tenantId === tenantId) usage.delete(id);
        for (const [id, v] of billingEventIds) if (v.tenantId === tenantId) billingEventIds.delete(id);
        profiles.delete(tenantId); entitlements.delete(tenantId); tenants.delete(tenantId);
      },
    },
    beta: {
      async redeem(e) {
        if (!tenants.has(e.tenantId)) throw new Error('tenant_missing');
        if (!entitlements.has(e.tenantId)) entitlements.set(e.tenantId, clone(e));
      },
    },
    tenants: {
      async create(t) { tenants.set(t.id, clone(t)); },
      async getById(id) { const t = tenants.get(id); return t ? clone(t) : null; },
    },
    users: {
      async create(u) {
        const key = u.email.toLowerCase();
        if (usersByEmail.has(key)) throw new Error('email_already_registered');
        usersById.set(u.id, clone(u));
        usersByEmail.set(key, clone(u));
      },
      async getByEmail(email) { const u = usersByEmail.get(email.toLowerCase()); return u ? clone(u) : null; },
      async getById(id) { const u = usersById.get(id); return u ? clone(u) : null; },
    },
    sessions: {
      async create(s) { sessionsById.set(s.id, clone(s)); sessionsByToken.set(s.tokenHash, clone(s)); },
      async getByTokenHash(h) { const s = sessionsByToken.get(h); return s ? clone(s) : null; },
      async delete(id) {
        const s = sessionsById.get(id);
        if (s) { sessionsById.delete(id); sessionsByToken.delete(s.tokenHash); }
      },
    },
    entitlements: {
      async get(tenantId) { const e = entitlements.get(tenantId); return e ? clone(e) : null; },
      async put(e) { entitlements.set(e.tenantId, clone(e)); },
    },
    billingEvents: {
      async has(eventId) { return billingEventIds.has(eventId); },
      async record(e) { billingEventIds.set(e.eventId, clone(e)); },
    },
    usage: {
      async get(tenantId, periodKey) {
        const key = `${tenantId}:${periodKey}`;
        const existing = usage.get(key);
        if (existing) return clone(existing);
        return { tenantId, periodKey, analyses: 0, serpapiLookups: 0 };
      },
      async increment(tenantId, periodKey, field) {
        const key = `${tenantId}:${periodKey}`;
        const counter = usage.get(key) || { tenantId, periodKey, analyses: 0, serpapiLookups: 0 };
        counter[field] += 1;
        usage.set(key, counter);
        return clone(counter);
      },
      async tryConsume(tenantId, periodKey, field, limit) {
        // Single-threaded event loop: check + increment in one synchronous
        // block is atomic within this process.
        const key = `${tenantId}:${periodKey}`;
        const counter = usage.get(key) || { tenantId, periodKey, analyses: 0, serpapiLookups: 0 };
        if (counter[field] >= limit) return { allowed: false, counter: clone(counter) };
        counter[field] += 1;
        usage.set(key, counter);
        return { allowed: true, counter: clone(counter) };
      },
      async release(tenantId, periodKey, field) {
        const key = `${tenantId}:${periodKey}`;
        const counter = usage.get(key) || { tenantId, periodKey, analyses: 0, serpapiLookups: 0 };
        counter[field] = Math.max(0, counter[field] - 1);
        usage.set(key, counter);
        return clone(counter);
      },
    },
    profiles: {
      async get(tenantId) { const p = profiles.get(tenantId); return p ? clone(p) : null; },
      async put(p) { profiles.set(p.tenantId, clone(p)); },
      async delete(tenantId) { profiles.delete(tenantId); },
    },
    applications: {
      async create(a) { applications.set(`${a.tenantId}:${a.id}`, clone(a)); },
      async getById(tenantId, id) { const a = applications.get(`${tenantId}:${id}`); return a ? clone(a) : null; },
      async listByTenant(tenantId) {
        return [...applications.values()].filter((a) => a.tenantId === tenantId).map(clone);
      },
      async put(a) { applications.set(`${a.tenantId}:${a.id}`, clone(a)); },
      async delete(tenantId, id) { applications.delete(`${tenantId}:${id}`); },
    },
    stats: {
      async overview(periodKey) {
        const entitlementsByStatus: Record<string, number> = {};
        for (const e of entitlements.values()) {
          const key = e.status || 'none';
          entitlementsByStatus[key] = (entitlementsByStatus[key] || 0) + 1;
        }
        let analyses = 0;
        let serpapiLookups = 0;
        for (const c of usage.values()) {
          if (c.periodKey !== periodKey) continue;
          analyses += c.analyses;
          serpapiLookups += c.serpapiLookups;
        }
        return { tenants: tenants.size, users: usersById.size, entitlementsByStatus, usage: { analyses, serpapiLookups } };
      },
    },
  };
  const guard = (group: any, name: string, tenant: (...a: any[]) => string) => {
    const original = group[name];
    group[name] = async (...args: any[]) => {
      if (!tenants.has(tenant(...args))) throw new AccountDeletionError('tenant_not_found', 404);
      return original.apply(group, args);
    };
  };
  for (const [group, name] of [['users','create'], ['sessions','create'], ['entitlements','put'], ['billingEvents','record'], ['profiles','put'], ['applications','create'], ['applications','put']]) {
    guard((repos as any)[group], name, a => a.tenantId);
  }
  for (const name of ['increment','tryConsume','release']) guard(repos.usage, name, a => a);
  return repos;
}
