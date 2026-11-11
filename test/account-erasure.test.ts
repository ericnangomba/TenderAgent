import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';
import { startTestApp, stopTestApp, signup } from './helpers';
import { createMemoryRepos } from '../src/lib/server/repos/memory';
import { emptyEntitlement, applyBillingEvent } from '../src/lib/server/entitlement';
import { ensurePostgresSchema, ensureTenantForeignKeys, createPostgresRepos, erasePostgresTenant } from '../src/lib/server/repos/postgres';

const password = 'synthetic-test-password-9';
const confirmation = 'DELETE MY ACCOUNT';

test('whole-account API requires password/confirmation/origin and isolates tenants, invalidates all sessions', async () => {
  const app = await startTestApp();
  try {
    const a = await signup(app.baseUrl, 'erase-a@example.invalid', password);
    const b = await signup(app.baseUrl, 'erase-b@example.invalid', password);
    for (const user of [a,b]) await app.foundation.repos.profiles.put({ tenantId: user.tenantId, profile: { companyName: user.tenantId }, updatedAt: new Date() });
    const login = await fetch(`${app.baseUrl}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'erase-a@example.invalid', password }) });
    const secondCookie = login.headers.get('set-cookie')!.split(';')[0];
    const del = (body: object, cookie?: string, origin?: string) => fetch(`${app.baseUrl}/api/account`, { method: 'DELETE', headers: { 'content-type': 'application/json', ...(cookie ? {cookie} : {}), ...(origin ? {origin} : {}) }, body: JSON.stringify(body) });
    assert.equal((await del({password,confirmation})).status, 401);
    assert.equal((await del({password,confirmation}, a.cookie, 'https://other.invalid')).status, 403);
    assert.equal((await del({password}, a.cookie)).status, 400);
    assert.equal((await del({password:'wrong',confirmation}, a.cookie)).status, 403);
    assert.ok(await app.foundation.repos.users.getById(a.userId));
    const result = await del({ password, confirmation, tenantId: b.tenantId }, a.cookie);
    assert.equal(result.status, 200);
    assert.equal(await app.foundation.repos.tenants.getById(a.tenantId), null);
    assert.equal(await app.foundation.repos.users.getByEmail('erase-a@example.invalid'), null);
    assert.equal(await app.foundation.repos.profiles.get(a.tenantId), null);
    assert.ok(await app.foundation.repos.profiles.get(b.tenantId));
    for (const cookie of [a.cookie,secondCookie]) assert.equal((await fetch(`${app.baseUrl}/api/profile`, {headers:{cookie}})).status,401);
    await assert.rejects(app.foundation.repos.profiles.put({tenantId:a.tenantId,profile:{secret:'late'},updatedAt:new Date()}), /tenant_not_found/);
    assert.equal((await applyBillingEvent(app.foundation.repos, {eventId:'late',provider:'mock',type:'subscription.activated',tenantId:a.tenantId,occurredAt:new Date()})).reason,'tenant_missing');
    assert.equal(await app.foundation.repos.entitlements.get(a.tenantId), null);
    assert.ok(await app.foundation.repos.tenants.getById(b.tenantId));
  } finally { await stopTestApp(app); }
});

test('external billing blocks erasure and unsupported store capability fails closed', async () => {
  const app = await startTestApp();
  try {
    const a = await signup(app.baseUrl, 'billing-erase@example.invalid',password);
    await app.foundation.repos.entitlements.put({...emptyEntitlement(a.tenantId),providerName:'future-real-provider',providerSubscriptionRef:'synthetic-ref'});
    const erase = () => fetch(`${app.baseUrl}/api/account`,{method:'DELETE',headers:{'content-type':'application/json',cookie:a.cookie},body:JSON.stringify({password,confirmation})});
    let response = await erase(); assert.equal(response.status,409); assert.equal((await response.json()).error,'billing_resolution_required');
    assert.ok(await app.foundation.repos.users.getById(a.userId));
    app.foundation.repos.accountDeletion=undefined;
    response=await erase(); assert.equal(response.status,409); assert.equal((await response.json()).error,'account_deletion_unavailable_for_store');
  } finally {await stopTestApp(app);}
});

test('memory erasure removes content, usage, mock events and every session without touching B', async () => {
  const r=createMemoryRepos(),at=new Date();
  for(const id of ['a','b']) {
    await r.tenants.create({id,companyName:id,createdAt:at});
    await r.users.create({id,tenantId:id,email:`${id}@example.invalid`,passwordHash:'hash',createdAt:at});
    await r.sessions.create({id,tenantId:id,userId:id,tokenHash:id,createdAt:at,expiresAt:new Date('2030-01-01')});
    await r.billingEvents.record({eventId:id,tenantId:id,provider:'mock',type:'subscription.activated',occurredAt:at,receivedAt:at});
    await r.usage.increment(id,'2026-11','analyses');
    await r.applications.create({id,tenantId:id,tenderRef:id,title:id,state:'draft',requirements:[],createdAt:at,updatedAt:at});
  }
  await r.accountDeletion!.erase('a'); await r.accountDeletion!.erase('a');
  assert.equal(await r.billingEvents.has('a'),false); assert.equal(await r.billingEvents.has('b'),true);
  assert.deepEqual(await r.applications.listByTenant('a'),[]); assert.equal((await r.applications.listByTenant('b')).length,1);
  assert.equal((await r.usage.get('a','2026-11')).analyses,0); assert.equal((await r.usage.get('b','2026-11')).analyses,1);
  assert.equal(await r.sessions.getByTokenHash('a'),null); assert.ok(await r.sessions.getByTokenHash('b'));
  await assert.rejects(r.usage.increment('a','2026-11','analyses'),/tenant_not_found/);
});

const uri=process.env.ISOLATED_PG_LIFECYCLE_TEST_URL;
test('isolated real Postgres erasure: FK barrier, rollback, idempotence, late writer and commit reconciliation', {skip:!uri,timeout:30000}, async()=>{
  const url=new URL(uri!); assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'35432');assert.equal(url.pathname,'/tenderagent_lifecycle_test');
  const pool=new Pool({connectionString:uri,max:8});
  try {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
    await ensurePostgresSchema(pool);
    await pool.query("INSERT INTO foundation_profiles VALUES('orphan','{}',now())");
    await assert.rejects(ensureTenantForeignKeys(pool), /foreign key/);
    assert.equal(Number((await pool.query("SELECT count(*) FROM foundation_profiles WHERE tenant_id='orphan'")).rows[0].count),1,'migration never deletes orphan content');
    await pool.query("DELETE FROM foundation_profiles WHERE tenant_id='orphan'");
    await ensureTenantForeignKeys(pool); await ensureTenantForeignKeys(pool);
    const r=createPostgresRepos(pool,true),at=new Date();
    const seed=async(id:string)=>{await r.tenants.create({id,companyName:id,createdAt:at}); await r.profiles.put({tenantId:id,profile:{secret:`private-${id}`},updatedAt:at});};
    await seed('a');await seed('b');
    for(const id of ['a','b']) {
      await r.users.create({id,tenantId:id,email:`pg-${id}@example.invalid`,passwordHash:'hash',createdAt:at});
      await r.sessions.create({id,userId:id,tenantId:id,tokenHash:id,createdAt:at,expiresAt:new Date('2030-01-01')});
      await r.usage.increment(id,'2026-11','analyses');
      await r.billingEvents.record({eventId:id,tenantId:id,provider:'mock',type:'subscription.activated',occurredAt:at,receivedAt:at});
      await r.applications.create({id,tenantId:id,tenderRef:id,title:id,state:'draft',requirements:[],createdAt:at,updatedAt:at});
      await r.entitlements.put(emptyEntitlement(id));
    }
    await pool.query(`CREATE FUNCTION fail_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic failure'; END $$; CREATE TRIGGER fail_delete BEFORE DELETE ON foundation_profiles FOR EACH ROW EXECUTE FUNCTION fail_delete()`);
    await assert.rejects(r.accountDeletion!.erase('a'),/account_deletion_failed/);
    assert.ok(await r.tenants.getById('a'));assert.ok(await r.profiles.get('a'));
    await pool.query('DROP TRIGGER fail_delete ON foundation_profiles; DROP FUNCTION fail_delete()');
    let release!:()=>void,locked!:()=>void;
    const gate=new Promise<void>(r=>release=r),hit=new Promise<void>(r=>locked=r);
    const paused={query:pool.query.bind(pool),async connect(){const c=await pool.connect();return {async query(sql:string,params?:unknown[]){const out=await c.query(sql,params);if(sql.startsWith('DELETE FROM foundation_tenants')){locked();await gate;}return out;},release:(error?:boolean)=>c.release(error)};}};
    const deleting=erasePostgresTenant(paused,'a'); await hit;
    let settled=false;const late=r.profiles.put({tenantId:'a',profile:{secret:'resurrect'},updatedAt:at}).then(()=>{settled=true;return 'unexpected';},()=>{settled=true;return 'rejected';});
    await new Promise(r=>setTimeout(r,100));assert.equal(settled,false,'late insert waits for parent deletion');release();await deleting;assert.equal(await late,'rejected');
    assert.equal(await r.tenants.getById('a'),null);assert.equal(await r.profiles.get('a'),null);assert.ok(await r.profiles.get('b'));
    for(const table of ['users','sessions','usage_counters','billing_events','profiles','applications','entitlements']) {
      assert.equal(Number((await pool.query(`SELECT count(*) FROM foundation_${table} WHERE tenant_id='a'`)).rows[0].count),0,table);
      assert.equal(Number((await pool.query(`SELECT count(*) FROM foundation_${table} WHERE tenant_id='b'`)).rows[0].count),1,table);
    }
    await r.accountDeletion!.erase('a');
    await seed('c');
    const lostCommit={query:pool.query.bind(pool),async connect(){const c=await pool.connect();return {async query(sql:string,params?:unknown[]){const out=await c.query(sql,params);if(sql==='COMMIT')throw new Error('synthetic lost acknowledgement');return out;},release:(error?:boolean)=>c.release(error)};}};
    await erasePostgresTenant(lostCommit,'c'); assert.equal(await r.tenants.getById('c'),null);
    await assert.rejects(r.entitlements.put({...emptyEntitlement('a'),status:'active'}));
    await assert.rejects(r.sessions.create({id:'late-session',tenantId:'a',userId:'a',tokenHash:'late',createdAt:at,expiresAt:at}));
  } finally {await pool.end();}
});

test('ephemeral erasure includes derivative datasets/jobs/timers and preserves other tenants/public fixtures', async()=>{
 const {eraseTenantEphemeral}=await import('../src/lib/server/ephemeralErasure');
 let fired=false;const timer=setInterval(()=>{fired=true;},20);
 const state={tenders:new Map([['a',{tenantId:'a'}],['b',{tenantId:'b'}],['public',{}]]),datasets:[{tenantId:'a'},{tenantId:'b'},{}] as any,jobs:[{id:'a',tenantId:'a'},{id:'b',tenantId:'b'}, {id:'public'}] as any,timers:new Map([['a',timer]])};
 eraseTenantEphemeral('a',state);await new Promise(r=>setTimeout(r,40));
 assert.equal(fired,false);assert.equal(state.timers.size,0);assert.deepEqual([...state.tenders.keys()],['b','public']);
 assert.equal(state.datasets.length,2);assert.equal(state.jobs.length,2);assert.equal(state.jobs[0].id,'b');
});

test('account deletion waits for in-flight tenant work, then clears it before a late session can write',async()=>{
 const content=new Map<string,string>();
 const app=await startTestApp({},id=>{content.delete(id);});
 try {
  const a=await signup(app.baseUrl,'race@example.invalid',password);
  let release!:()=>void,entered!:()=>void;const gate=new Promise<void>(r=>release=r),hit=new Promise<void>(r=>entered=r);
  app.app.post('/api/synthetic-delayed-work',app.foundation.requireAuth,async(req,res)=>{entered();await gate;content.set(req.auth!.tenantId,'synthetic');res.json({success:true});});
  const working=fetch(`${app.baseUrl}/api/synthetic-delayed-work`,{method:'POST',headers:{cookie:a.cookie}});await hit;
  let done=false;const deleting=fetch(`${app.baseUrl}/api/account`,{method:'DELETE',headers:{'content-type':'application/json',cookie:a.cookie},body:JSON.stringify({password,confirmation})}).then(r=>{done=true;return r;});
  await new Promise(r=>setTimeout(r,50));assert.equal(done,false);release();assert.equal((await working).status,200);assert.equal((await deleting).status,200);assert.equal(content.size,0);
  assert.equal((await fetch(`${app.baseUrl}/api/synthetic-delayed-work`,{method:'POST',headers:{cookie:a.cookie}})).status,401);
 } finally {await stopTestApp(app);}
});

test('ordinary same-tenant requests remain concurrent while erasure alone waits', async()=>{
 const app=await startTestApp(); let release!:()=>void;
 try {
  const a=await signup(app.baseUrl,'concurrent@example.invalid',password);
  let entered!:()=>void;const gate=new Promise<void>(r=>release=r),hit=new Promise<void>(r=>entered=r);
  app.app.post('/api/synthetic-slow',async(_req,res)=>{entered();await gate;res.json({success:true});});
  const slow=fetch(`${app.baseUrl}/api/synthetic-slow`,{method:'POST',headers:{cookie:a.cookie}});await hit;
  const fast=await fetch(`${app.baseUrl}/api/account`,{headers:{cookie:a.cookie},signal:AbortSignal.timeout(1500)});
  assert.equal(fast.status,200);release();assert.equal((await slow).status,200);
 } finally {release?.();await stopTestApp(app);}
});

test('exclusive erasure has bounded drain and no queue; hung work never grants unsafe erase',async()=>{
 const {TenantWorkCoordinator}=await import('../src/lib/server/accountLifecycle');
 const c=new TenantWorkCoordinator(25,2);let release!:()=>void;
 const gate=new Promise<void>(r=>release=r);const hung=c.run('a',false,()=>gate);
 assert.equal(await c.run('a',false,async()=>42),42,'normal work is concurrent');
 let erased=false;const deleting=c.run('a',true,async()=>{erased=true;});
 await assert.rejects(c.run('a',false,async()=>{}),/account_deletion_in_progress/);
 await assert.rejects(c.run('a',true,async()=>{}),/account_deletion_in_progress/);
 await assert.rejects(deleting,/account_busy_retry_later/);assert.equal(erased,false);
 assert.equal(await c.run('a',false,async()=>43),43,'timeout restores ordinary access');
 const held=c.run('a',false,()=>gate);await assert.rejects(c.run('a',false,async()=>{}),/account_busy/);
 release();await Promise.all([hung,held]);await c.run('a',true,async()=>{erased=true;});assert.equal(erased,true);
});

test('aborted responses release on handler end, including 65 sequential completions',{timeout:15000},async()=>{
 const app=await startTestApp({authRateLimit:{maxAttempts:1000,windowMs:60000}});
 try {
  const a=await signup(app.baseUrl,'abort-end@example.invalid',password);
  let entered!:()=>void,completed!:()=>void;
  app.app.post('/api/synthetic-abort',async(_req,res)=>{entered();await new Promise(r=>setTimeout(r,15));res.json({success:true});completed();});
  for(let i=0;i<65;i++) {
   const hit=new Promise<void>(r=>entered=r),done=new Promise<void>(r=>completed=r);
   const controller=new AbortController();
   const request=fetch(`${app.baseUrl}/api/synthetic-abort`,{method:'POST',headers:{cookie:a.cookie},signal:controller.signal}).catch(()=>null);
   await Promise.race([hit,new Promise<never>((_r,j)=>setTimeout(()=>j(new Error(`no hit ${i}`)),1000))]);controller.abort();await request;await Promise.race([done,new Promise<never>((_r,j)=>setTimeout(()=>j(new Error(`no done ${i}`)),1000))]);
  }
  assert.equal((await fetch(`${app.baseUrl}/api/account`,{headers:{cookie:a.cookie}})).status,200);
  const deleted=await fetch(`${app.baseUrl}/api/account`,{method:'DELETE',headers:{'content-type':'application/json',cookie:a.cookie},body:JSON.stringify({password,confirmation}),signal:AbortSignal.timeout(2000)});
  assert.equal(deleted.status,200);
 } finally {await stopTestApp(app);}
});

test('never-ending handler loses ordinary capacity at deadline but permanently blocks unsafe erasure',async()=>{
 const {TenantWorkCoordinator}=await import('../src/lib/server/accountLifecycle');
 const c=new TenantWorkCoordinator(100,1,20);
 const stuck=c.run('a',false,()=>new Promise(()=>{}));
 let erased=false;const deleting=c.run('a',true,async()=>{erased=true;});
 await assert.rejects(stuck,/request_outcome_unconfirmed/);
 await assert.rejects(deleting,/account_work_outcome_unconfirmed/);assert.equal(erased,false);
 for(let i=0;i<65;i++) assert.equal(await c.run('a',false,async()=>i),i,'ordinary capacity is not leaked');
 await assert.rejects(c.run('a',true,async()=>{erased=true;}),/account_work_outcome_unconfirmed/);
 assert.equal(erased,false);
});

test('request deadline responds boundedly; deletion gate is off by default and cannot enable in production',async()=>{
 const {loadConfig,assertSafeConfig}=await import('../src/lib/server/config');
 assert.equal(loadConfig({}).accountDeletionEnabled,false);
 assert.throws(()=>assertSafeConfig({...loadConfig({}),accountDeletionEnabled:true},{NODE_ENV:'production'}),/restore reconciliation/);
 const app=await startTestApp({},undefined,25);
 try {
  const a=await signup(app.baseUrl,'never-end@example.invalid',password);
  app.app.get('/api/synthetic-never',()=>{});
  const response=await fetch(`${app.baseUrl}/api/synthetic-never`,{headers:{cookie:a.cookie},signal:AbortSignal.timeout(2000)});
  assert.equal(response.status,503);assert.equal((await response.json()).error,'request_outcome_unconfirmed');
  assert.equal((await fetch(`${app.baseUrl}/api/account`,{headers:{cookie:a.cookie}})).status,200);
 } finally {await stopTestApp(app);}
 const disabled=await startTestApp({accountDeletionEnabled:false});
 try {
  const a=await signup(disabled.baseUrl,'disabled@example.invalid',password);
  assert.equal((await (await fetch(`${disabled.baseUrl}/api/account`,{headers:{cookie:a.cookie}})).json()).account.accountDeletionAvailable,false);
  const response=await fetch(`${disabled.baseUrl}/api/account`,{method:'DELETE',headers:{'content-type':'application/json',cookie:a.cookie},body:JSON.stringify({password,confirmation})});
  assert.equal(response.status,409);assert.equal((await response.json()).error,'account_deletion_not_enabled');assert.ok(await disabled.foundation.repos.tenants.getById(a.tenantId));
 } finally {await stopTestApp(disabled);}
});
