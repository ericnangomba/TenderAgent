/** Disposable loopback PostgreSQL only. Never accepts a production URI. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Pool } from 'pg';
import { createPostgresRepos, ensurePostgresSchema } from '../src/lib/server/repos/postgres';
import { authorizeAndConsume } from '../src/lib/server/entitlement';
import { testConfig } from './helpers';
const uri=process.env.ISOLATED_MANAGED_PG_URL;
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
test('real Postgres managed beta concurrency, rollback, paid race, cutoff after lock, restart persistence', {skip:!uri}, async()=>{
  const url=new URL(uri!);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'35432');assert.equal(url.pathname,'/tenderagent_managed_test');
  const pool=new Pool({connectionString:uri,max:35,application_name:'managed-beta-test'});
  try{
    await ensurePostgresSchema(pool);
    const reset=async()=>{
      await pool.query('TRUNCATE foundation_beta_changes,foundation_beta_invites,foundation_beta_campaign,foundation_entitlements,foundation_usage_counters,foundation_users,foundation_tenants');
      const now=new Date();await pool.query("INSERT INTO foundation_tenants VALUES ('t','Synthetic',$1)",[now]);
      await pool.query("INSERT INTO foundation_users VALUES ('u','t','synthetic@example.invalid','unused',$1)",[now]);
      return {now,repos:createPostgresRepos(pool)};
    };
    let {now,repos}=await reset();let end=new Date(+now+7*86400000);
    const starts=await Promise.all(Array.from({length:20},(_,i)=>repos.pilot!.start({id:`pilot${i}`,startsAt:now.toISOString(),endsAt:end.toISOString(),createdBy:'operator'})));
    const campaign=starts[0];assert.ok(starts.every(c=>c.id===campaign.id));assert.equal(Number((await pool.query("SELECT count(*) FROM foundation_beta_changes WHERE action='started'")).rows[0].count),1);
    const issue=async(code:string)=>repos.pilot!.issue({userId:'u',tenantId:'t',campaignId:campaign.id,codeHash:hash(code),issuedBy:'operator',issuedAt:new Date().toISOString(),redeemedAt:null});
    await issue('synthetic');
    const redemptions=await Promise.all(Array.from({length:25},()=>repos.pilot!.redeem('u',hash('synthetic'),new Date())));
    assert.ok(redemptions.every(e=>e.currentPeriodEnd?.toISOString()===end.toISOString()));
    assert.equal(Number((await pool.query('SELECT count(*) FROM foundation_entitlements')).rows[0].count),1);
    assert.equal(Number((await pool.query("SELECT count(*) FROM foundation_beta_changes WHERE action='redeemed'")).rows[0].count),1);
    const fresh=createPostgresRepos(pool);assert.equal((await fresh.pilot!.campaign())?.id,campaign.id);
    const config=testConfig({betaCampaign:{...campaign,managed:true,invites:[]}});
    const claims=await Promise.all(Array.from({length:30},()=>authorizeAndConsume(fresh,config,'t','analysis')));assert.equal(claims.filter(c=>c.allowed).length,20);
    await fresh.pilot!.revoke('u','t','operator',new Date());await assert.rejects(fresh.pilot!.redeem('u',hash('synthetic'),new Date()));assert.equal((await fresh.entitlements.get('t'))?.status,'cancelled');

    // Any failure after the entitlement insert must roll back that insert and
    // the redemption marker, not merely report an error to the browser.
    ({now,repos}=await reset());end=new Date(+now+7*86400000);
    const c=await repos.pilot!.start({id:'rollback',startsAt:now.toISOString(),endsAt:end.toISOString(),createdBy:'operator'});
    await repos.pilot!.issue({userId:'u',tenantId:'t',campaignId:c.id,codeHash:hash('rollback'),issuedBy:'operator',issuedAt:now.toISOString(),redeemedAt:null});
    await pool.query("CREATE OR REPLACE FUNCTION reject_beta_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='redeemed' THEN RAISE EXCEPTION 'synthetic audit failure'; END IF; RETURN NEW; END $$");
    await pool.query('CREATE TRIGGER synthetic_audit_failure BEFORE INSERT ON foundation_beta_changes FOR EACH ROW EXECUTE FUNCTION reject_beta_audit()');
    try { await assert.rejects(repos.pilot!.redeem('u',hash('rollback'),new Date()),/synthetic audit failure/);assert.equal(await repos.entitlements.get('t'),null);assert.equal((await pool.query("SELECT redeemed_at FROM foundation_beta_invites WHERE user_id='u'")).rows[0].redeemed_at,null); }
    finally { await pool.query('DROP TRIGGER synthetic_audit_failure ON foundation_beta_changes');await pool.query('DROP FUNCTION reject_beta_audit()'); }
    await repos.pilot!.redeem('u',hash('rollback'),new Date());

    // A racing paid insert owns the entitlement PK. Beta must roll back and
    // leave that paid row and the unredeemed invitation unchanged.
    ({now,repos}=await reset());end=new Date(+now+7*86400000);
    const paidCampaign=await repos.pilot!.start({id:'paidrace',startsAt:now.toISOString(),endsAt:end.toISOString(),createdBy:'operator'});
    await repos.pilot!.issue({userId:'u',tenantId:'t',campaignId:paidCampaign.id,codeHash:hash('paidrace'),issuedBy:'operator',issuedAt:now.toISOString(),redeemedAt:null});
    const writer=await pool.connect();await writer.query('BEGIN');
    await writer.query("INSERT INTO foundation_entitlements (tenant_id,plan_id,status,provider_name,updated_at) VALUES ('t','standard_monthly','active','paid',$1)",[now]);
    const raced=repos.pilot!.redeem('u',hash('paidrace'),new Date()).then(()=>false,()=>true);
    try{
      let waiting=false;
      for(let n=0;n<100;n++) { waiting=Number((await pool.query("SELECT count(*) FROM pg_stat_activity WHERE application_name='managed-beta-test' AND wait_event_type='Lock' AND query LIKE 'INSERT INTO foundation_entitlements%'")).rows[0].count)>0;if(waiting)break;await new Promise(r=>setTimeout(r,10)); }
      assert.equal(waiting,true);await writer.query('COMMIT');assert.equal(await raced,true);
    }finally{await writer.query('ROLLBACK');writer.release();}
    assert.equal((await repos.entitlements.get('t'))?.providerName,'paid');assert.equal((await pool.query("SELECT redeemed_at FROM foundation_beta_invites WHERE user_id='u'")).rows[0].redeemed_at,null);

    // The request started while open but obtains its campaign lock after end.
    ({now,repos}=await reset());end=new Date(+now+1500);const start=new Date(+end-7*86400000);
    const cutoff=await repos.pilot!.start({id:'cutoff',startsAt:start.toISOString(),endsAt:end.toISOString(),createdBy:'operator'});
    await repos.pilot!.issue({userId:'u',tenantId:'t',campaignId:cutoff.id,codeHash:hash('cutoff'),issuedBy:'operator',issuedAt:now.toISOString(),redeemedAt:null});
    const lock=await pool.connect();await lock.query('BEGIN');await lock.query('SELECT * FROM foundation_beta_campaign WHERE singleton=1 FOR UPDATE');
    const late=repos.pilot!.redeem('u',hash('cutoff'),new Date()).then(()=>false,()=>true);
    await new Promise(r=>setTimeout(r,Math.max(0,+end-Date.now()+50)));await lock.query('COMMIT');lock.release();assert.equal(await late,true);assert.equal(await repos.entitlements.get('t'),null);
  }finally{await pool.end();}
});
