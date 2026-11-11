/** In-memory repositories: default driver for development and the whole test suite. */
import type {
  FoundationRepos, Tenant, User, Session, Entitlement, BillingEventRecord, UsageCounter, TenantProfile,
} from './types';
import { AccountDeletionError, hasExternalBilling } from '../accountLifecycle';
import { pilotOpen, pilotEntitlement, matchingPilotEntitlement, type PilotCampaign, type PilotInvite, type PilotChange } from '../betaPilot';
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
  let pilotCampaign: PilotCampaign | null = null;
  const pilotChanges: PilotChange[] = [];
  const pilotInvites = new Map<string, PilotInvite>();
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
        for (const [id, invite] of pilotInvites) if (invite.tenantId === tenantId) pilotInvites.delete(id);
        profiles.delete(tenantId); entitlements.delete(tenantId); tenants.delete(tenantId);
      },
    },
    pilot: {
      async campaign() { return clone(pilotCampaign); },
      async start(c) { if (!pilotCampaign) { pilotCampaign = clone(c); pilotChanges.push({action:'started',actorId:c.createdBy,userId:null,at:c.startsAt}); } return clone(pilotCampaign); },
      async failure(actorId, action, now) { pilotChanges.push({action,actorId,userId:null,at:now.toISOString()}); },
      async changes() { return clone(pilotChanges.slice(-100).reverse()); },
      async revoke(userId, tenantId, actorId, now) {
        const user = usersById.get(userId), ent = entitlements.get(tenantId);
        if (!user || user.tenantId !== tenantId || !ent || ent.planId !== 'test_cohort' || ent.status !== 'active') throw new Error('pilot_unavailable');
        entitlements.set(tenantId, { ...ent, status: 'cancelled', updatedAt: now });
        pilotChanges.push({action:'revoked',actorId,userId,at:now.toISOString()});
      },
      async accounts(query) {
        return [...usersById.values()].filter(u => u.email.includes(query.toLowerCase()) || tenants.get(u.tenantId)?.companyName.toLowerCase().includes(query.toLowerCase())).slice(0, 50).map(u => {
          const i = pilotInvites.get(u.id), e = entitlements.get(u.tenantId);
          return { userId: u.id, tenantId: u.tenantId, email: u.email, companyName: tenants.get(u.tenantId)?.companyName || '', status: e?.planId === 'test_cohort' && (!pilotOpen(pilotCampaign, new Date()) || !e.currentPeriodEnd || e.currentPeriodEnd <= new Date()) ? 'cancelled' : e?.status || 'none', planId: e?.planId || null, analyses: usage.get(`${u.tenantId}:beta_pilot_v1`)?.analyses || 0, lookups: usage.get(`${u.tenantId}:beta_pilot_v1`)?.serpapiLookups || 0, hasSavedProfile: profiles.has(u.tenantId), issuedAt: i?.issuedAt || null, redeemedAt: i?.redeemedAt || null };
        });
      },
      async issue(i) {
        const u = usersById.get(i.userId);
        if (!pilotOpen(pilotCampaign, new Date(i.issuedAt)) || pilotCampaign.id !== i.campaignId || !u || u.tenantId !== i.tenantId || !tenants.has(i.tenantId) || entitlements.has(i.tenantId) || pilotInvites.get(i.userId)?.redeemedAt) throw new Error('pilot_unavailable');
        pilotInvites.set(i.userId, clone(i));
        pilotChanges.push({action:'code_issued',actorId:i.issuedBy,userId:i.userId,at:i.issuedAt});
      },
      async redeem(userId, codeHash, now) {
        const i = pilotInvites.get(userId), u = usersById.get(userId);
        if (!pilotOpen(pilotCampaign, now) || !i || i.campaignId !== pilotCampaign.id || i.codeHash !== codeHash || !u || u.tenantId !== i.tenantId || !tenants.has(i.tenantId)) throw new Error('pilot_unavailable');
        const existing = entitlements.get(i.tenantId);
        if (existing && (!i.redeemedAt || !matchingPilotEntitlement(existing, pilotCampaign))) throw new Error('pilot_unavailable');
        const ent = existing || pilotEntitlement(pilotCampaign, i.tenantId, now);
        entitlements.set(i.tenantId, clone(ent));
        if (!i.redeemedAt) pilotChanges.push({action:'redeemed',actorId:userId,userId,at:now.toISOString()});
        i.redeemedAt ||= now.toISOString();
        return clone(ent);
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
