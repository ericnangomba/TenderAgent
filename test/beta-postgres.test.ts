import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';
import { ensurePostgresSchema, createPostgresRepos } from '../src/lib/server/repos/postgres';
import { emptyEntitlement, authorizeAndConsume } from '../src/lib/server/entitlement';
import { testConfig } from './helpers';
const uri = process.env.ISOLATED_BETA_PG_URL;
test('real Postgres beta redemption/cap concurrency, paid and revoked preservation, monthend', { skip: !uri }, async () => {
  const u = new URL(uri!); assert.equal(u.hostname, '127.0.0.1'); assert.equal(u.port, '35432'); assert.equal(u.pathname, '/tenderagent_beta_test');
  const pool = new Pool({ connectionString: uri, max: 12 });
  const now = new Date('2026-11-29T10:00:00Z'), end = new Date('2026-12-06T10:00:00Z');
  try {
    await ensurePostgresSchema(pool);
    await pool.query('TRUNCATE foundation_entitlements, foundation_usage_counters, foundation_tenants');
    const repos = createPostgresRepos(pool);
    await repos.tenants.create({ id: 'beta-pg-a', companyName: 'Synthetic', createdAt: now });
    const ent = { ...emptyEntitlement('beta-pg-a'), planId: 'test_cohort', status: 'active' as const, currentPeriodEnd: end, providerName: 'operator_comp', providerSubscriptionRef: 'beta:pilot' };
    await Promise.all(Array.from({ length: 30 }, () => repos.beta!.redeem(ent)));
    assert.equal(Number((await pool.query('SELECT count(*) FROM foundation_entitlements')).rows[0].count), 1);
    const config = testConfig({ betaCampaign: { id: 'pilot', startsAt: now.toISOString(), endsAt: end.toISOString(), invites: [] } });
    const results = await Promise.all(Array.from({ length: 35 }, () => authorizeAndConsume(repos, config, ent.tenantId, 'analysis', now)));
    assert.equal(results.filter(x => x.allowed).length, 20);
    assert.equal((await authorizeAndConsume(repos, config, ent.tenantId, 'analysis', new Date('2026-12-01'))).allowed, false);
    await repos.entitlements.put({ ...ent, status: 'cancelled' });
    await repos.beta!.redeem(ent);
    assert.equal((await repos.entitlements.get(ent.tenantId))?.status, 'cancelled');
    await repos.entitlements.put({ ...ent, planId: 'standard_monthly', providerName: 'paid' });
    await repos.beta!.redeem(ent);
    assert.equal((await repos.entitlements.get(ent.tenantId))?.providerName, 'paid');
  } finally { await pool.end(); }
});
