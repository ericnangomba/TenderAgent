import type { Pool, PoolClient } from 'pg';
import { randomBytes } from 'node:crypto';
import type { PilotChange } from '../betaPilot';
import { matchingPilotEntitlement, pilotEntitlement, pilotOpen, type PilotCampaign, type PilotStore } from '../betaPilot';
import type { Entitlement } from './types';
function campaign(r: any): PilotCampaign | null {
  return r ? { id: r.id, startsAt: new Date(r.starts_at).toISOString(), endsAt: new Date(r.ends_at).toISOString(), createdBy: r.created_by } : null;
}
function entitlement(r: any): Entitlement | null {
  return r ? { tenantId: r.tenant_id, planId: r.plan_id, status: r.status, currentPeriodEnd: r.current_period_end && new Date(r.current_period_end), cancelAtPeriodEnd: r.cancel_at_period_end, providerName: r.provider_name, providerSubscriptionRef: r.provider_subscription_ref, refundedAt: r.refunded_at && new Date(r.refunded_at), lastEventAt: r.last_event_at && new Date(r.last_event_at), lastEventId: r.last_event_id, updatedAt: new Date(r.updated_at) } : null;
}
export function createPostgresPilot(pool: Pool): PilotStore {
  const transaction = async <T>(fn: (db: PoolClient) => Promise<T>): Promise<T> => {
    const db = await pool.connect();
    try { await db.query('BEGIN'); const result = await fn(db); await db.query('COMMIT'); return result; }
    catch (error) { await db.query('ROLLBACK'); throw error; }
    finally { db.release(); }
  };
  const record = async (db: Pick<PoolClient,'query'>, action: PilotChange['action'], actorId: string, userId: string | null, now: Date, eventId = randomBytes(16).toString('hex')) => {
    await db.query('INSERT INTO foundation_beta_changes (id,action,actor_id,user_id,at) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO NOTHING',[eventId,action,actorId,userId,now]);
  };
  return {
    async campaign() { return campaign((await pool.query('SELECT * FROM foundation_beta_campaign WHERE singleton=1')).rows[0]); },
    async failure(actorId,action,now) { await record(pool,action,actorId,null,now); },
    async changes() { return (await pool.query('SELECT action,actor_id,user_id,at FROM foundation_beta_changes ORDER BY at DESC,id DESC LIMIT 100')).rows.map(r => ({action:r.action,actorId:r.actor_id,userId:r.user_id,at:new Date(r.at).toISOString()})); },
    async revoke(userId,tenantId,actorId,now) { await transaction(async db => {
      const r = await db.query("UPDATE foundation_entitlements SET status='cancelled',updated_at=$1 WHERE tenant_id=$2 AND plan_id='test_cohort' AND status='active' AND EXISTS (SELECT 1 FROM foundation_users WHERE id=$3 AND tenant_id=$2)",[now,tenantId,userId]);
      if (r.rowCount!==1) throw new Error('pilot_unavailable');
      await record(db,'revoked',actorId,userId,now);
    }); },
    async start(c) { return transaction(async db => {
      await db.query(`INSERT INTO foundation_beta_campaign (singleton,id,starts_at,ends_at,created_by) VALUES (1,$1,$2,$3,$4) ON CONFLICT (singleton) DO NOTHING`, [c.id,c.startsAt,c.endsAt,c.createdBy]);
      const stored = campaign((await db.query('SELECT * FROM foundation_beta_campaign WHERE singleton=1')).rows[0])!;
      await record(db,'started',stored.createdBy,null,new Date(stored.startsAt),`started:${stored.id}`);
      return stored;
    }); },
    async accounts(query) {
      const rows = (await pool.query(`SELECT u.id,u.tenant_id,u.email,t.company_name,e.status,e.plan_id,e.current_period_end,i.issued_at,i.redeemed_at,COALESCE(usage.analyses,0) AS analyses,COALESCE(usage.serpapi_lookups,0) AS lookups,CASE WHEN p.tenant_id IS NULL THEN false ELSE true END AS has_profile
        FROM foundation_users u JOIN foundation_tenants t ON t.id=u.tenant_id
        LEFT JOIN foundation_entitlements e ON e.tenant_id=u.tenant_id
        LEFT JOIN foundation_beta_invites i ON i.user_id=u.id
        LEFT JOIN foundation_profiles p ON p.tenant_id=u.tenant_id
        LEFT JOIN foundation_usage_counters usage ON usage.tenant_id=u.tenant_id AND usage.period_key='beta_pilot_v1'
        WHERE u.email ILIKE $1 OR t.company_name ILIKE $1 ORDER BY u.created_at DESC,u.id LIMIT 50`, [`%${query}%`])).rows;
      return rows.map(r => ({ userId:r.id,tenantId:r.tenant_id,email:r.email,companyName:r.company_name,status:r.plan_id==='test_cohort' && (!r.current_period_end || new Date(r.current_period_end)<=new Date()) ? 'cancelled' : r.status || 'none',planId:r.plan_id || null,analyses:Number(r.analyses),lookups:Number(r.lookups),hasSavedProfile:r.has_profile,issuedAt:r.issued_at ? new Date(r.issued_at).toISOString():null,redeemedAt:r.redeemed_at ? new Date(r.redeemed_at).toISOString():null }));
    },
    async issue(i) { await transaction(async db => {
      const c = campaign((await db.query('SELECT * FROM foundation_beta_campaign WHERE singleton=1 FOR UPDATE')).rows[0]);
      const u = (await db.query('SELECT u.tenant_id FROM foundation_users u JOIN foundation_tenants t ON t.id=u.tenant_id WHERE u.id=$1', [i.userId])).rows[0];
      const e = (await db.query('SELECT tenant_id FROM foundation_entitlements WHERE tenant_id=$1',[i.tenantId])).rows[0];
      if (!pilotOpen(c,new Date(Math.max(Date.parse(i.issuedAt),Date.now()))) || c.id!==i.campaignId || !u || u.tenant_id!==i.tenantId || e) throw new Error('pilot_unavailable');
      const result = await db.query(`INSERT INTO foundation_beta_invites (user_id,tenant_id,campaign_id,code_hash,issued_by,issued_at,redeemed_at)
        VALUES ($1,$2,$3,$4,$5,$6,NULL) ON CONFLICT (user_id) DO UPDATE SET code_hash=EXCLUDED.code_hash,issued_by=EXCLUDED.issued_by,issued_at=EXCLUDED.issued_at
        WHERE foundation_beta_invites.redeemed_at IS NULL AND foundation_beta_invites.campaign_id=EXCLUDED.campaign_id AND foundation_beta_invites.tenant_id=EXCLUDED.tenant_id`, [i.userId,i.tenantId,i.campaignId,i.codeHash,i.issuedBy,i.issuedAt]);
      if (result.rowCount!==1) throw new Error('pilot_unavailable');
      await record(db,'code_issued',i.issuedBy,i.userId,new Date(i.issuedAt));
    }); },
    async redeem(userId,codeHash,now) { return transaction(async db => {
      // Campaign lock serializes start/issue/redeem; the entitlement PK also
      // arbitrates racing billing writes. No SELECT-then-upsert can overwrite.
      const c=campaign((await db.query('SELECT * FROM foundation_beta_campaign WHERE singleton=1 FOR UPDATE')).rows[0]);
      const i=(await db.query('SELECT * FROM foundation_beta_invites WHERE user_id=$1 FOR UPDATE',[userId])).rows[0];
      const u=(await db.query('SELECT u.tenant_id FROM foundation_users u JOIN foundation_tenants t ON t.id=u.tenant_id WHERE u.id=$1',[userId])).rows[0];
      const checkedAt = new Date(Math.max(+now,Date.now()));
      if (!pilotOpen(c,checkedAt)||!i||i.code_hash!==codeHash||i.campaign_id!==c.id||!u||u.tenant_id!==i.tenant_id) throw new Error('pilot_unavailable');
      const previous=entitlement((await db.query('SELECT * FROM foundation_entitlements WHERE tenant_id=$1 FOR UPDATE',[i.tenant_id])).rows[0]);
      if (previous && (!i.redeemed_at||!matchingPilotEntitlement(previous,c))) throw new Error('pilot_unavailable');
      const e=pilotEntitlement(c,i.tenant_id,checkedAt);
      const result=await db.query(`INSERT INTO foundation_entitlements (tenant_id,plan_id,status,current_period_end,cancel_at_period_end,provider_name,provider_subscription_ref,refunded_at,last_event_at,last_event_id,updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,NULL,$8,$9,$8) ON CONFLICT (tenant_id) DO NOTHING`,[e.tenantId,e.planId,e.status,e.currentPeriodEnd,e.cancelAtPeriodEnd,e.providerName,e.providerSubscriptionRef,checkedAt,e.lastEventId]);
      const confirmed=entitlement((await db.query('SELECT * FROM foundation_entitlements WHERE tenant_id=$1 FOR UPDATE',[i.tenant_id])).rows[0]);
      if (!matchingPilotEntitlement(confirmed,c)||(!previous&&result.rowCount!==1)) throw new Error('pilot_unavailable');
      if (!i.redeemed_at) await record(db,'redeemed',userId,userId,checkedAt);
      await db.query('UPDATE foundation_beta_invites SET redeemed_at=COALESCE(redeemed_at,$1) WHERE user_id=$2',[checkedAt,userId]);
      return confirmed;
    }); },
  };
}
