import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { startTestApp, stopTestApp, signup, testConfig } from './helpers';
import { createMemoryRepos } from '../src/lib/server/repos/memory';
import { authorizeAndConsume, emptyEntitlement } from '../src/lib/server/entitlement';
const hash = (code: string) => createHash('sha256').update(code).digest('hex');
async function setup() {
  const app = await startTestApp();
  const admin = await signup(app.baseUrl,'operator@example.invalid');
  const a = await signup(app.baseUrl,'approved@example.invalid');
  const b = await signup(app.baseUrl,'unapproved@example.invalid');
  app.foundation.config.adminUserIds.push(admin.userId);
  const get = async (path='/api/admin/beta',cookie=admin.cookie) => fetch(app.baseUrl+path,{headers:{cookie}});
  const post = async (path:string,body:unknown,cookie=admin.cookie,origin?:string) => fetch(app.baseUrl+path,{method:'POST',headers:{cookie,'content-type':'application/json',...(origin?{origin}:{})},body:JSON.stringify(body)});
  const start = () => post('/api/admin/beta/start',{confirmation:'START SHARED SEVEN DAY BETA'});
  const issue = () => post('/api/admin/beta/issue',{userId:a.userId,tenantId:a.tenantId,confirmation:'ISSUE ACCOUNT BOUND CODE'});
  const redeem = (code:string,cookie=a.cookie) => post('/api/beta/redeem',{code},cookie);
  return {app,admin,a,b,get,post,start,issue,redeem};
}
test('operator controls require verified adminID, origin and confirmation; ordinary signup no grant',async()=>{
  const f=await setup();try{
    assert.equal((await f.get('/api/admin/beta','')).status,401);
    assert.equal((await f.get('/api/admin/beta',f.a.cookie)).status,403);
    assert.equal((await f.post('/api/admin/beta/start',{confirmation:'START SHARED SEVEN DAY BETA'},f.a.cookie)).status,403);
    assert.equal((await f.post('/api/admin/beta/start',{confirmation:'START SHARED SEVEN DAY BETA'},f.admin.cookie,'https://outside.invalid')).status,403);
    assert.equal((await f.post('/api/admin/beta/start',{})).status,400);
    assert.equal((await f.issue()).status,409);
    assert.equal(await f.app.foundation.repos.entitlements.get(f.a.tenantId),null);
    const listed=await(await f.get()).json();assert.equal(listed.campaign,null);
    assert.equal(listed.accounts.length,3);assert.ok(!JSON.stringify(listed).includes('passwordHash'));
  }finally{await stopTestApp(f.app);}
});
test('one shared start persists; retries cannot reset; account selection issues private once-display hash-only code',async()=>{
  const f=await setup();try{
    const responses=await Promise.all([f.start(),f.start(),f.start()]);
    const campaigns=await Promise.all(responses.map(r=>r.json()));
    assert.ok(campaigns.every(r=>r.campaign.id===campaigns[0].campaign.id));
    assert.equal(Date.parse(campaigns[0].campaign.endsAt)-Date.parse(campaigns[0].campaign.startsAt),7*86400000);
    const wrong=await f.post('/api/admin/beta/issue',{userId:f.a.userId,tenantId:f.b.tenantId,confirmation:'ISSUE ACCOUNT BOUND CODE'});assert.equal(wrong.status,409);
    const issued=await(await f.issue()).json();assert.match(issued.code,/^[\w-]{32}$/);
    const status=await(await f.get()).json();assert.ok(!JSON.stringify(status).includes(issued.code));assert.ok(!JSON.stringify(status).includes(hash(issued.code)));
    const row=status.accounts.find((a:any)=>a.userId===f.a.userId);assert.ok(row.issuedAt);assert.equal(row.redeemedAt,null);
    assert.equal(await f.app.foundation.repos.entitlements.get(f.a.tenantId),null);
    const next=await(await f.issue()).json();assert.notEqual(next.code,issued.code);
    assert.equal((await f.redeem(issued.code)).status,400);
    assert.equal((await f.redeem(next.code,f.b.cookie)).status,400);
    assert.equal((await f.redeem(next.code,'')).status,401);
    const redeemed=await Promise.all([f.redeem(next.code),f.redeem(next.code)]);assert.ok(redeemed.every(r=>r.status===200));
    const account=await(await f.get('/api/account',f.a.cookie)).json();assert.equal(account.account.entitlement.effectiveStatus,'active');assert.deepEqual(account.account.allowances,{includedAnalyses:20,includedSerpapiLookups:0});
    const done=await(await f.get()).json();assert.ok(done.accounts.find((a:any)=>a.userId===f.a.userId).redeemedAt);
    assert.equal((await f.issue()).status,409);
  }finally{await stopTestApp(f.app);}
});
test('shared expiry, month boundary20total, no paid helpers; revocation and paid access cannot be replaced',async()=>{
  const f=await setup();try{
    await f.start();const issued=await(await f.issue()).json();await f.redeem(issued.code);
    const ent=(await f.app.foundation.repos.entitlements.get(f.a.tenantId))!;
    const decisions=await Promise.all(Array.from({length:25},()=>authorizeAndConsume(f.app.foundation.repos,f.app.foundation.config,f.a.tenantId,'analysis')));assert.equal(decisions.filter(x=>x.allowed).length,20);
    const request={auth:{tenantId:f.a.tenantId}} as any;assert.equal(await f.app.foundation.cloudLlmAccess(request),false);assert.equal(await f.app.foundation.serpApiAccess(request),false);
    await f.app.foundation.repos.entitlements.put({...ent,status:'cancelled'});assert.equal((await f.redeem(issued.code)).status,400);
    const paid={...emptyEntitlement(f.b.tenantId),planId:'standard_monthly',status:'active' as const,providerName:'paid'};
    await f.app.foundation.repos.entitlements.put(paid);
    assert.equal((await f.post('/api/admin/beta/issue',{userId:f.b.userId,tenantId:f.b.tenantId,confirmation:'ISSUE ACCOUNT BOUND CODE'})).status,409);
    assert.deepEqual(await f.app.foundation.repos.entitlements.get(f.b.tenantId),paid);
    await assert.rejects(f.app.foundation.repos.pilot!.redeem(f.a.userId,hash(issued.code),new Date(ent.currentPeriodEnd!)),/pilot_unavailable/);
  }finally{await stopTestApp(f.app);}
});
test('legacy environment campaign and managed campaign cannot silently overlap',async()=>{
  const f=await setup();try{
    const start=new Date(),end=new Date(+start+7*86400000);
    f.app.foundation.config.betaCampaign={id:'legacy',startsAt:start.toISOString(),endsAt:end.toISOString(),invites:[]};
    assert.equal((await f.start()).status,409);
    assert.equal(await f.app.foundation.repos.pilot!.campaign(),null);
  }finally{await stopTestApp(f.app);}
});
test('repo-level immutable start and exact cutoff preserve pilot across fresh foundation config',async()=>{
  const repos=createMemoryRepos(),now=new Date('2026-11-29T10:00:00Z'),end=new Date('2026-12-06T10:00:00Z');
  await repos.tenants.create({id:'t',companyName:'Synthetic',createdAt:now});await repos.users.create({id:'u',tenantId:'t',email:'synthetic@example.invalid',passwordHash:'unused',createdAt:now});
  const c=await repos.pilot!.start({id:'pilot',startsAt:now.toISOString(),endsAt:end.toISOString(),createdBy:'operator'});
  assert.equal((await repos.pilot!.start({...c,id:'replacement'})).id,'pilot');
  await repos.pilot!.issue({userId:'u',tenantId:'t',campaignId:c.id,codeHash:hash('synthetic'),issuedBy:'operator',issuedAt:now.toISOString(),redeemedAt:null});
  await assert.rejects(repos.pilot!.redeem('u',hash('synthetic'),new Date(+now-1)));
  const ent=await repos.pilot!.redeem('u',hash('synthetic'),now);
  const cfg=testConfig({betaCampaign:{...c,managed:true,invites:[]}});
  for(let i=0;i<20;i++)assert.equal((await authorizeAndConsume(repos,cfg,'t','analysis',now)).allowed,true);
  assert.equal((await authorizeAndConsume(repos,cfg,'t','analysis',new Date('2026-12-01'))).allowed,false);
  await assert.rejects(repos.pilot!.redeem('u',hash('synthetic'),end));assert.equal((await repos.entitlements.get('t'))?.currentPeriodEnd?.toISOString(),ent.currentPeriodEnd?.toISOString());
});
test('Postgres pilot adapter start/issue/redeem/revoke/audit roundtrip (pg-mem, not real concurrency)',async()=>{
  const {newDb}=await import('pg-mem');
  const {ensurePostgresSchema,createPostgresRepos}=await import('../src/lib/server/repos/postgres');
  const pool=new(newDb().adapters.createPg().Pool)();await ensurePostgresSchema(pool);
  const repos=createPostgresRepos(pool);assert.ok(repos.pilot);
  const now=new Date(),end=new Date(+now+7*86400000);
  await repos.tenants.create({id:'t',companyName:'Synthetic',createdAt:now});await repos.users.create({id:'u',tenantId:'t',email:'sql@example.invalid',passwordHash:'unused',createdAt:now});
  const c=await repos.pilot!.start({id:'sqlpilot',startsAt:now.toISOString(),endsAt:end.toISOString(),createdBy:'admin'});
  assert.equal((await repos.pilot!.start({...c,id:'ignored'})).id,c.id);
  await repos.pilot!.issue({userId:'u',tenantId:'t',campaignId:c.id,codeHash:hash('sql-fixture'),issuedBy:'admin',issuedAt:now.toISOString(),redeemedAt:null});
  const accounts=await repos.pilot!.accounts('sql');assert.equal(accounts.length,1);assert.equal(accounts[0].hasSavedProfile,false);
  await repos.pilot!.redeem('u',hash('sql-fixture'),now);await repos.pilot!.redeem('u',hash('sql-fixture'),now);
  await repos.pilot!.revoke('u','t','admin',now);
  assert.equal((await repos.entitlements.get('t'))?.status,'cancelled');
  await assert.rejects(repos.pilot!.redeem('u',hash('sql-fixture'),now));
  const changes=await repos.pilot!.changes();assert.equal(changes.length,4);assert.deepEqual(new Set(changes.map(c=>c.action)),new Set(['started','code_issued','redeemed','revoked']));
  await pool.end();
});
test('fresh process loads stored campaign before guards; store failure returns sanitized503 without next',async()=>{
  const f=await setup();try{
    await f.start();const stored=await f.app.foundation.repos.pilot!.campaign();
    const {createFoundation}=await import('../src/lib/server/foundation');
    const fresh=createFoundation({config:testConfig(),repos:f.app.foundation.repos,providers:[]});
    let next=false;let status=0;let body:any;
    const res={status(n:number){status=n;return this;},json(b:unknown){body=b;return this;}} as any;
    await fresh.sessionMiddleware({path:'/api/account',headers:{cookie:f.a.cookie}} as any,res,()=>{next=true;});
    assert.equal(next,true);assert.equal(fresh.config.betaCampaign?.id,stored?.id);assert.equal(fresh.config.betaCampaign?.managed,true);
    f.app.foundation.repos.pilot!.campaign=async()=>{throw new Error('sensitive-database-diagnostic');};
    next=false;await fresh.sessionMiddleware({path:'/api/account',headers:{cookie:f.a.cookie}} as any,res,()=>{next=true;});
    assert.equal(next,false);assert.equal(status,503);assert.deepEqual(body,{success:false,error:'account_service_unavailable'});
  }finally{await stopTestApp(f.app);}
});
test('monitoring payload excludes profile secrets, tender content and raw failed-action parameters',async()=>{
  const f=await setup();try{
    await f.app.foundation.repos.profiles.put({tenantId:f.a.tenantId,profile:{taxComplianceStatusPin:'PRIVATE-TAX-PIN',companyName:'PRIVATE-PROFILE',uploadedDocument:'PRIVATE-TENDER-TEXT'},updatedAt:new Date()});
    await f.start();
    const denied=await f.post('/api/admin/beta/issue',{userId:'PRIVATE-RAW-INPUT',tenantId:f.a.tenantId,confirmation:'ISSUE ACCOUNT BOUND CODE',code:'PRIVATE-NOT-USED'});
    assert.equal(denied.status,409);
    const data=await(await f.get()).json();const text=JSON.stringify(data);
    for(const marker of ['PRIVATE-TAX-PIN','PRIVATE-PROFILE','PRIVATE-TENDER-TEXT','PRIVATE-RAW-INPUT','PRIVATE-NOT-USED','passwordHash','codeHash'])assert.equal(text.includes(marker),false);
    assert.equal(data.accounts.find((a:any)=>a.userId===f.a.userId).hasSavedProfile,true);
    assert.ok(data.changes.some((c:any)=>c.action==='issue_failed'&&c.userId===null));
  }finally{await stopTestApp(f.app);}
});
