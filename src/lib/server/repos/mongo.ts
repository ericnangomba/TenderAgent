/**
 * MongoDB repositories via mongoose (already a project dependency).
 * Selected with STORE=mongo + MONGODB_URI. Defining models never opens a
 * connection; connectMongo() must succeed before these repos are used.
 */
import mongoose, { Schema } from 'mongoose';
import type {
  FoundationRepos, Tenant, User, Session, Entitlement, BillingEventRecord, UsageCounter, TenantProfile,
} from './types';

const TenantSchema = new Schema({ _id: String, companyName: String, createdAt: Date }, { versionKey: false });
const UserSchema = new Schema({
  _id: String, tenantId: { type: String, index: true },
  email: { type: String, unique: true, index: true }, passwordHash: String, createdAt: Date,
}, { versionKey: false });
const SessionSchema = new Schema({
  _id: String, userId: String, tenantId: String,
  tokenHash: { type: String, unique: true, index: true }, expiresAt: Date, createdAt: Date,
}, { versionKey: false });
const EntitlementSchema = new Schema({
  _id: String, planId: String, status: String, currentPeriodEnd: Date,
  cancelAtPeriodEnd: Boolean, providerName: String, providerSubscriptionRef: String,
  refundedAt: Date, lastEventAt: Date, lastEventId: String, updatedAt: Date,
}, { versionKey: false });
const BillingEventSchema = new Schema({
  _id: String, provider: String, type: String, tenantId: String, occurredAt: Date, receivedAt: Date,
}, { versionKey: false });
// UsageSchema below intentionally has no unique secondary index: _id carries tenant+period.
const UsageSchema = new Schema({
  _id: String, tenantId: String, periodKey: String, analyses: Number, serpapiLookups: Number,
}, { versionKey: false });
const ProfileSchema = new Schema({ _id: String, profile: Schema.Types.Mixed, updatedAt: Date }, { versionKey: false });
const ApplicationSchema = new Schema({
  _id: String, tenantId: { type: String, index: true }, tenderRef: String, title: String,
  state: String, requirements: Schema.Types.Mixed, createdAt: Date, updatedAt: Date,
}, { versionKey: false });

const models = () => ({
  Tenant: mongoose.models.FoundationTenant || mongoose.model('FoundationTenant', TenantSchema),
  User: mongoose.models.FoundationUser || mongoose.model('FoundationUser', UserSchema),
  Session: mongoose.models.FoundationSession || mongoose.model('FoundationSession', SessionSchema),
  Entitlement: mongoose.models.FoundationEntitlement || mongoose.model('FoundationEntitlement', EntitlementSchema),
  BillingEvent: mongoose.models.FoundationBillingEvent || mongoose.model('FoundationBillingEvent', BillingEventSchema),
  Usage: mongoose.models.FoundationUsage || mongoose.model('FoundationUsage', UsageSchema),
  Profile: mongoose.models.FoundationProfile || mongoose.model('FoundationProfile', ProfileSchema),
  Application: mongoose.models.FoundationApplication || mongoose.model('FoundationApplication', ApplicationSchema),
});

export async function connectMongo(uri: string): Promise<void> {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  // Wait for unique indexes (e.g. user email) to exist before serving writes;
  // otherwise an early duplicate insert can slip through before index build.
  await Promise.all(Object.values(models()).map((model: any) => model.init()));
}

const strip = <T>(doc: any): T => {
  const { _id, ...rest } = doc.toObject ? doc.toObject() : doc;
  return rest as T;
};

/** lean docs lose the natural key (stored as _id); put it back under the contract field. */
const withKey = <T>(doc: any, key: string, value: string): T => ({ ...strip(doc), [key]: value } as T);

export function createMongoRepos(): FoundationRepos {
  const m = models();
  return {
    tenants: {
      async create(t: Tenant) { await m.Tenant.create({ _id: t.id, companyName: t.companyName, createdAt: t.createdAt }); },
      async getById(id) { const d = await m.Tenant.findById(id).lean(); return d ? withKey<Tenant>(d, 'id', id) : null; },
    },
    users: {
      async create(u: User) {
        try {
          await m.User.create({ _id: u.id, tenantId: u.tenantId, email: u.email.toLowerCase(), passwordHash: u.passwordHash, createdAt: u.createdAt });
        } catch (err: any) {
          if (err?.code === 11000) throw new Error('email_already_registered');
          throw err;
        }
      },
      async getByEmail(email) { const d = await m.User.findOne({ email: email.toLowerCase() }).lean(); return d ? withKey<User>(d, 'id', String((d as any)._id)) : null; },
      async getById(id) { const d = await m.User.findById(id).lean(); return d ? withKey<User>(d, 'id', id) : null; },
    },
    sessions: {
      async create(s: Session) { await m.Session.create({ _id: s.id, ...s }); },
      async getByTokenHash(h) { const d = await m.Session.findOne({ tokenHash: h }).lean(); return d ? withKey<Session>(d, 'id', String((d as any)._id)) : null; },
      async delete(id) { await m.Session.deleteOne({ _id: id }); },
    },
    entitlements: {
      async get(tenantId) { const d = await m.Entitlement.findById(tenantId).lean(); return d ? withKey<Entitlement>(d, 'tenantId', tenantId) : null; },
      async put(e: Entitlement) { await m.Entitlement.updateOne({ _id: e.tenantId }, { $set: { ...e } }, { upsert: true }); },
    },
    billingEvents: {
      async has(eventId) { return (await m.BillingEvent.findById(eventId).lean()) !== null; },
      async record(e: BillingEventRecord) {
        try {
          await m.BillingEvent.create({ _id: e.eventId, ...e });
        } catch (err: any) {
          if (err?.code !== 11000) throw err; // concurrent duplicate record is harmless
        }
      },
    },
    usage: {
      async get(tenantId, periodKey) {
        const d = await m.Usage.findById(`${tenantId}:${periodKey}`).lean();
        return d ? { ...strip<UsageCounter>(d), tenantId, periodKey } : { tenantId, periodKey, analyses: 0, serpapiLookups: 0 };
      },
      async increment(tenantId, periodKey, field) {
        const d = await m.Usage.findByIdAndUpdate(
          `${tenantId}:${periodKey}`,
          { $inc: { [field]: 1 }, $setOnInsert: { tenantId, periodKey } },
          { upsert: true, new: true },
        ).lean();
        return { ...strip<UsageCounter>(d), tenantId, periodKey };
      },
      async tryConsume(tenantId, periodKey, field, limit) {
        const _id = `${tenantId}:${periodKey}`;
        // Atomic conditional claim: only increments while under the limit.
        const claim = await m.Usage.findOneAndUpdate(
          { _id, [field]: { $lt: limit } },
          { $inc: { [field]: 1 } },
          { new: true },
        ).lean();
        if (claim) return { allowed: true, counter: { ...strip<UsageCounter>(claim), tenantId, periodKey } };
        // Document may not exist yet - create it with the first unit claimed.
        try {
          await m.Usage.create({
            _id, tenantId, periodKey,
            analyses: field === 'analyses' ? 1 : 0,
            serpapiLookups: field === 'serpapiLookups' ? 1 : 0,
          });
          return { allowed: true, counter: { tenantId, periodKey, analyses: field === 'analyses' ? 1 : 0, serpapiLookups: field === 'serpapiLookups' ? 1 : 0 } };
        } catch (err: any) {
          if (err?.code === 11000) {
            // Lost a creation race - retry the conditional claim once.
            const retry = await m.Usage.findOneAndUpdate(
              { _id, [field]: { $lt: limit } },
              { $inc: { [field]: 1 } },
              { new: true },
            ).lean();
            if (retry) return { allowed: true, counter: { ...strip<UsageCounter>(retry), tenantId, periodKey } };
          } else {
            throw err;
          }
        }
        const current = await m.Usage.findById(_id).lean();
        return { allowed: false, counter: current ? { ...strip<UsageCounter>(current), tenantId, periodKey } : { tenantId, periodKey, analyses: 0, serpapiLookups: 0 } };
      },
      async release(tenantId, periodKey, field) {
        const _id = `${tenantId}:${periodKey}`;
        // Conditional decrement: never below zero.
        const d = await m.Usage.findOneAndUpdate(
          { _id, [field]: { $gt: 0 } },
          { $inc: { [field]: -1 } },
          { new: true },
        ).lean();
        if (d) return { ...strip<UsageCounter>(d), tenantId, periodKey };
        const current = await m.Usage.findById(_id).lean();
        return current ? { ...strip<UsageCounter>(current), tenantId, periodKey } : { tenantId, periodKey, analyses: 0, serpapiLookups: 0 };
      },
    },
    profiles: {
      async get(tenantId) { const d = await m.Profile.findById(tenantId).lean(); return d ? withKey<TenantProfile>(d, 'tenantId', tenantId) : null; },
      async put(p: TenantProfile) { await m.Profile.updateOne({ _id: p.tenantId }, { $set: { profile: p.profile, updatedAt: p.updatedAt } }, { upsert: true }); },
    },
    applications: {
      async create(a: any) { await m.Application.create({ ...a, _id: `${a.tenantId}:${a.id}` }); },
      async getById(tenantId, id) { const d = await m.Application.findById(`${tenantId}:${id}`).lean(); return d ? strip<any>(d) : null; },
      async listByTenant(tenantId) { const docs = await m.Application.find({ tenantId }).lean(); return docs.map((d: any) => strip(d)); },
      async put(a: any) { await m.Application.updateOne({ _id: `${a.tenantId}:${a.id}` }, { $set: { ...a } }, { upsert: true }); },
    },
    stats: {
      async overview(periodKey: string) {
        const [tenants, users, entAgg, usageAgg] = await Promise.all([
          m.Tenant.countDocuments(),
          m.User.countDocuments(),
          m.Entitlement.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
          m.Usage.aggregate([
            { $match: { periodKey } },
            { $group: { _id: null, analyses: { $sum: '$analyses' }, serpapiLookups: { $sum: '$serpapiLookups' } } },
          ]),
        ]);
        const entitlementsByStatus: Record<string, number> = {};
        for (const row of entAgg as Array<{ _id: string | null; n: number }>) {
          entitlementsByStatus[row._id || 'none'] = row.n;
        }
        const u = (usageAgg as Array<{ analyses?: number; serpapiLookups?: number }>)[0] || {};
        return {
          tenants,
          users,
          entitlementsByStatus,
          usage: { analyses: u.analyses || 0, serpapiLookups: u.serpapiLookups || 0 },
        };
      },
    },
  };
}
