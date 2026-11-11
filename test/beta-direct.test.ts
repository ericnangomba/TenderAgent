/** Synthetic accounts only. Never connects to production or a paid provider. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activateApprovedBetaAccounts } from '../src/lib/server/betaActivation';
import { assertSafeConfig } from '../src/lib/server/config';
import { createMemoryRepos } from '../src/lib/server/repos/memory';
import { authorizeAndConsume, checkAccess, emptyEntitlement } from '../src/lib/server/entitlement';
import { startTestApp, stopTestApp, signup, testConfig } from './helpers';
const start = new Date('2026-11-29T10:00:00Z'), end = new Date('2026-12-06T10:00:00Z');
const approved = { userId: 'synthetic-user', tenantId: 'synthetic-tenant', email: 'synthetic@example.invalid' };
async function fixture() {
  const repos = createMemoryRepos();
  await repos.tenants.create({ id: approved.tenantId, companyName: 'Synthetic', createdAt: start });
  await repos.users.create({ id: approved.userId, tenantId: approved.tenantId, email: approved.email, passwordHash: 'unused', createdAt: start });
  const config = testConfig({ betaCampaign: { id: 'direct-fixture', startsAt: start.toISOString(), endsAt: end.toISOString(), invites: [], directAccounts: [{ ...approved }] } });
  return { repos, config };
}
test('direct activation off by default and outside fixed window; unsupported store fails closed', async () => {
  const { repos, config } = await fixture();
  assert.equal(await activateApprovedBetaAccounts(repos, testConfig(), start), 0);
  await assert.rejects(activateApprovedBetaAccounts(repos, config, new Date(+start - 1)), /open approved window/);
  assert.equal(await activateApprovedBetaAccounts(repos, config, end), 0);
  assert.equal(await activateApprovedBetaAccounts(repos, config, new Date(+end + 86400000)), 0);
  await assert.rejects(activateApprovedBetaAccounts({ ...repos, beta: undefined }, config, start), /supported store/);
  assert.equal(await repos.entitlements.get(approved.tenantId), null);
});
test('exact stored user, tenant and email required; validate all accounts before any writes', async () => {
  for (const field of ['userId', 'tenantId', 'email'] as const) {
    const { repos, config } = await fixture();
    config.betaCampaign!.directAccounts![0][field] = field === 'email' ? 'other@example.invalid' : 'other';
    await assert.rejects(activateApprovedBetaAccounts(repos, config, start), /binding mismatch/);
    assert.equal(await repos.entitlements.get(approved.tenantId), null);
  }
  const { repos, config } = await fixture();
  config.betaCampaign!.directAccounts!.push({ userId: 'missing', tenantId: 'missing', email: 'missing@example.invalid' });
  await assert.rejects(activateApprovedBetaAccounts(repos, config, start), /binding mismatch/);
  assert.equal(await repos.entitlements.get(approved.tenantId), null);
});
test('malformed, duplicate and overlapping account configuration rejected', async () => {
  for (const accounts of [null, {}, [{ ...approved, email: 'UPPER@example.invalid' }], [{ ...approved, tenantId: '' }], [approved, approved]]) {
    const { config } = await fixture();
    config.betaCampaign!.directAccounts = accounts as any;
    assert.throws(() => assertSafeConfig(config), /Invalid beta/);
  }
  const { config } = await fixture();
  config.betaCampaign!.invites.push({ userId: approved.userId, codeHash: 'a'.repeat(64) });
  assert.throws(() => assertSafeConfig(config), /Invalid beta/);
});
test('idempotent and concurrent grant, fixed expiry, total20 across month, no paid search', async () => {
  const { repos, config } = await fixture();
  await Promise.all(Array.from({ length: 20 }, () => activateApprovedBetaAccounts(repos, config, start)));
  const before = await repos.entitlements.get(approved.tenantId);
  assert.equal(before?.currentPeriodEnd?.toISOString(), end.toISOString());
  const claims = await Promise.all(Array.from({ length: 30 }, () => authorizeAndConsume(repos, config, approved.tenantId, 'analysis', start)));
  assert.equal(claims.filter(x => x.allowed).length, 20);
  assert.equal((await authorizeAndConsume(repos, config, approved.tenantId, 'analysis', new Date('2026-12-01'))).allowed, false);
  assert.equal((await checkAccess(repos, config, approved.tenantId, 'serpapi', start)).allowed, false);
  assert.equal((await checkAccess(repos, config, approved.tenantId, 'analysis', end)).allowed, false);
  await activateApprovedBetaAccounts(repos, config, new Date(+start + 1000));
  assert.deepEqual(await repos.entitlements.get(approved.tenantId), before);
  assert.equal((await repos.usage.get(approved.tenantId, 'beta_pilot_v1')).analyses, 20);
});
test('paid, revoked, prior campaign and altered expiry never replaced', async () => {
  for (const patch of [{ planId: 'standard_monthly', providerName: 'paid' }, { status: 'cancelled' as const }, { providerSubscriptionRef: 'beta:previous' }, { currentPeriodEnd: new Date(+end + 1) }]) {
    const { repos, config } = await fixture();
    await activateApprovedBetaAccounts(repos, config, start);
    const blocked = { ...(await repos.entitlements.get(approved.tenantId))!, ...patch };
    await repos.entitlements.put(blocked);
    assert.equal(await activateApprovedBetaAccounts(repos, config, start), 0);
    assert.deepEqual(await repos.entitlements.get(approved.tenantId), blocked);
  }
});
test('concurrent paid write wins atomic insert and activation reports failure', async () => {
  const { repos, config } = await fixture();
  const paid = { ...emptyEntitlement(approved.tenantId), planId: 'standard_monthly', status: 'active' as const, providerName: 'paid' };
  const atomic = repos.beta!.redeem;
  repos.beta!.redeem = async ent => { await repos.entitlements.put(paid); await atomic(ent); };
  assert.equal(await activateApprovedBetaAccounts(repos, config, start), 0);
  assert.deepEqual(await repos.entitlements.get(approved.tenantId), paid);
});
test('direct-only Account shows no code prompt, unrelated account unaffected, paid helpers denied', async () => {
  const app = await startTestApp();
  try {
    const a = await signup(app.baseUrl, 'direct@example.invalid');
    const b = await signup(app.baseUrl, 'unapproved@example.invalid');
    const now = new Date(Date.now() - 1000);
    app.foundation.config.betaCampaign = { id: 'http-fixture', startsAt: now.toISOString(), endsAt: new Date(+now + 7 * 86400000).toISOString(), invites: [], directAccounts: [{ userId: a.userId, tenantId: a.tenantId, email: 'direct@example.invalid' }] };
    await activateApprovedBetaAccounts(app.foundation.repos, app.foundation.config);
    for (const authRequired of [true, false]) {
      app.foundation.config.authRequired = authRequired;
      const req = { auth: { tenantId: a.tenantId } } as any;
      assert.equal(await app.foundation.cloudLlmAccess(req), false);
      assert.equal(await app.foundation.serpApiAccess(req), false);
    }
    const read = async (cookie: string) => (await (await fetch(app.baseUrl + '/api/account', { headers: { cookie } })).json()).account;
    const own = await read(a.cookie), other = await read(b.cookie);
    assert.equal(own.entitlement.effectiveStatus, 'active');
    assert.equal(own.beta.redeemAvailable, false);
    assert.deepEqual(own.allowances, { includedAnalyses: 20, includedSerpapiLookups: 0 });
    assert.equal(other.entitlement.effectiveStatus, 'none');
    assert.equal(other.beta.redeemAvailable, false);
    assert.equal((await fetch(app.baseUrl + '/api/beta/redeem', { method: 'POST', headers: { cookie: b.cookie, 'content-type': 'application/json' }, body: JSON.stringify({ code: 'anything-unapproved-12345678' }) })).status, 400);
  } finally { await stopTestApp(app); }
});

test('direct activation through Postgres repository adapter preserves stored binding and revocation', async () => {
  // pg-mem exercises the SQL adapter, not a real-server concurrency claim.
  const { newDb } = await import('pg-mem');
  const { createPostgresRepos, ensurePostgresSchema } = await import('../src/lib/server/repos/postgres');
  const pool = new (newDb().adapters.createPg().Pool)();
  await ensurePostgresSchema(pool);
  const repos = createPostgresRepos(pool);
  const { config } = await fixture();
  await repos.tenants.create({ id: approved.tenantId, companyName: 'Synthetic PG', createdAt: start });
  await repos.users.create({ id: approved.userId, tenantId: approved.tenantId, email: approved.email, passwordHash: 'unused', createdAt: start });
  assert.equal(await activateApprovedBetaAccounts(repos, config, start), 1);
  assert.equal(await activateApprovedBetaAccounts(repos, config, start), 1);
  const ent = (await repos.entitlements.get(approved.tenantId))!;
  assert.equal(ent.currentPeriodEnd?.toISOString(), end.toISOString());
  await repos.entitlements.put({ ...ent, status: 'cancelled' });
  assert.equal(await activateApprovedBetaAccounts(repos, config, start), 0);
  assert.equal((await repos.entitlements.get(approved.tenantId))?.status, 'cancelled');
  await pool.end();
});
