/** Fixed-window, no-charge beta. All identities/codes are synthetic fixtures. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { startTestApp, stopTestApp, signup, testConfig } from './helpers';
import { createMemoryRepos } from '../src/lib/server/repos/memory';
import { authorizeAndConsume, effectiveStatus, emptyEntitlement, checkAccess } from '../src/lib/server/entitlement';
import { assertSafeConfig } from '../src/lib/server/config';
const code = 'synthetic-fixture-beta-code-000000';
const hash = createHash('sha256').update(code).digest('hex');
async function setup() {
  const app = await startTestApp();
  const a = await signup(app.baseUrl, 'a@example.invalid'), b = await signup(app.baseUrl, 'b@example.invalid');
  const start = new Date(Date.now() - 1000), end = new Date(+start + 7 * 86400000);
  app.foundation.config.betaCampaign = { id: 'pilot', startsAt: start.toISOString(), endsAt: end.toISOString(), invites: [{ userId: a.userId, codeHash: hash }] };
  const redeem = (cookie = a.cookie, value = code, origin?: string) => fetch(app.baseUrl + '/api/beta/redeem', { method: 'POST', headers: { cookie, 'content-type': 'application/json', ...(origin ? { origin } : {}) }, body: JSON.stringify({ code: value }) });
  return { app, a, b, redeem, end };
}

test('beta inactive by default; malformed/rolling windows rejected; legacy admin grant disabled', async () => {
  const { app, a, redeem } = await setup();
  try {
    delete app.foundation.config.betaCampaign;
    assert.equal((await redeem()).status, 400);
    const account = await (await fetch(app.baseUrl + '/api/account', { headers: { cookie: a.cookie } })).json();
    assert.equal(account.account.beta.redeemAvailable, false);
    app.foundation.config.adminUserIds.push(a.userId);
    assert.equal((await fetch(app.baseUrl + '/api/admin/test-access/grant', { method: 'POST', headers: { cookie: a.cookie, 'content-type': 'application/json' }, body: JSON.stringify({ email: 'a@example.invalid', days: 90 }) })).status, 409);
    assert.throws(() => assertSafeConfig(testConfig({ betaCampaign: { id: 'bad', startsAt: '2026-11-01T00:00:00Z', endsAt: '2026-12-01T00:00:00Z', invites: [] } }), {}), /Invalid beta/);
  } finally { await stopTestApp(app); }
});

test('signed-in account-bound codes, CSRF, generic errors and bounded attempts', async () => {
  const { app, a, b, redeem } = await setup();
  try {
    assert.equal((await redeem('')).status, 401);
    assert.equal((await redeem(a.cookie, code, 'https://outside.invalid')).status, 403);
    assert.equal((await redeem(b.cookie)).status, 400);
    for (let i = 0; i < 5; i++) assert.equal((await redeem(a.cookie, 'wrong')).status, 400);
    assert.equal((await redeem()).status, 429);
    assert.equal(await app.foundation.repos.entitlements.get(a.tenantId), null);
  } finally { await stopTestApp(app); }
});

test('atomic retry, fixed end, paid access preservation, revocation does not reactivate', async () => {
  const { app, a, b, redeem, end } = await setup();
  try {
    const responses = await Promise.all([redeem(), redeem(), redeem()]);
    assert.ok(responses.every(r => r.status === 200));
    const ent = await app.foundation.repos.entitlements.get(a.tenantId);
    assert.equal(ent?.currentPeriodEnd?.toISOString(), end.toISOString());
    app.foundation.config.betaCampaign!.invites.push({ userId: b.userId, codeHash: hash });
    const paid = { ...emptyEntitlement(b.tenantId), planId: 'standard_monthly', status: 'active' as const, currentPeriodEnd: end, providerName: 'paid' };
    await app.foundation.repos.entitlements.put(paid);
    assert.equal((await redeem(b.cookie)).status, 409);
    assert.deepEqual(await app.foundation.repos.entitlements.get(b.tenantId), paid);
    await app.foundation.repos.entitlements.put({ ...ent!, status: 'cancelled' });
    assert.equal((await redeem()).status, 409);
  } finally { await stopTestApp(app); }
});

test('20 pilot analyses including concurrent final claim, zero paid helpers in either guard mode, correct display', async () => {
  for (const authRequired of [true, false]) {
    const { app, a, redeem } = await setup();
    try {
      app.foundation.config.authRequired = authRequired;
      assert.equal((await redeem()).status, 200);
      const fake = { auth: { tenantId: a.tenantId } } as any;
      assert.equal(await app.foundation.cloudLlmAccess(fake), false);
      assert.equal(await app.foundation.serpApiAccess(fake), false);
      const responses = await Promise.all(Array.from({ length: 25 }, () => fetch(app.baseUrl + '/api/analyze', { method: 'POST', headers: { cookie: a.cookie } })));
      assert.equal(responses.filter(r => r.status === 200).length, 20);
      assert.equal(responses.filter(r => r.status === 429).length, 5);
      assert.equal((await fetch(app.baseUrl + '/api/scrape', { headers: { cookie: a.cookie } })).status, 429);
      const account = await (await fetch(app.baseUrl + '/api/account', { headers: { cookie: a.cookie } })).json();
      assert.equal(account.account.usage.periodKey, 'beta_pilot_v1');
      assert.deepEqual(account.account.allowances, { includedAnalyses: 20, includedSerpapiLookups: 0 });
    } finally { await stopTestApp(app); }
  }
});

test('month boundary cannot reset pilot; expiry exact, no grace; failure refunds original bucket', async () => {
  const repos = createMemoryRepos(), now = new Date('2026-11-29T10:00:00Z'), end = new Date('2026-12-06T10:00:00Z');
  const cfg = testConfig({ betaCampaign: { id: 'pilot', startsAt: now.toISOString(), endsAt: end.toISOString(), invites: [] } });
  await repos.tenants.create({ id: 'a', companyName: 'Synthetic', createdAt: now });
  const ent = { ...emptyEntitlement('a'), planId: 'test_cohort', status: 'active' as const, currentPeriodEnd: end, providerSubscriptionRef: 'beta:pilot' };
  await repos.beta!.redeem(ent);
  for (let i = 0; i < 20; i++) assert.equal((await authorizeAndConsume(repos, cfg, 'a', 'analysis', now)).allowed, true);
  assert.equal((await authorizeAndConsume(repos, cfg, 'a', 'analysis', new Date('2026-12-01T10:00:00Z'))).allowed, false);
  assert.equal((await checkAccess(repos, cfg, 'a', 'analysis', end)).allowed, false);
  assert.equal(effectiveStatus(ent, end, 999), 'cancelled');
  await repos.beta!.redeem({ ...ent, currentPeriodEnd: new Date('2027-01-01') });
  assert.equal((await repos.entitlements.get('a'))?.currentPeriodEnd?.toISOString(), end.toISOString());
  const { app, a, redeem } = await setup();
  try {
    await redeem();
    let req: any;
    app.app.post('/claim-for-refund', async (r, res) => {
      req = r; const d = await authorizeAndConsume(app.foundation.repos, app.foundation.config, a.tenantId, 'analysis');
      (r as any).auth = { tenantId: a.tenantId };
      (r as any)[Symbol.for('tenderagent.consumed')] = { analysis: d.periodKey };
      res.json(d);
    });
    await fetch(app.baseUrl + '/claim-for-refund', { method: 'POST' });
    await app.foundation.releaseConsumption(req, 'analysis');
    await app.foundation.releaseConsumption(req, 'analysis');
    assert.equal((await app.foundation.repos.usage.get(a.tenantId, 'beta_pilot_v1')).analyses, 0);
  } finally { await stopTestApp(app); }
});
