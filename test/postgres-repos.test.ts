/**
 * Integration test for the PostgreSQL repositories against pg-mem, a
 * disposable in-memory Postgres. No external server, no cost, no credentials.
 * A live Neon smoke check against the same code path is a deployment step
 * (see DEPLOYMENT.md), not part of the test suite.
 */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { newDb } from 'pg-mem';
import { createPostgresRepos, ensurePostgresSchema, type PoolLike } from '../src/lib/server/repos/postgres';
import { applyBillingEvent, checkAccess } from '../src/lib/server/entitlement';
import { testConfig } from './helpers';
import type { FoundationRepos } from '../src/lib/server/repos/types';

let repos: FoundationRepos;

before(async () => {
  const db = newDb();
  const pool: PoolLike = db.adapters.createPg().Pool ? new (db.adapters.createPg().Pool)() : (db.adapters.createPg() as any);
  await ensurePostgresSchema(pool);
  repos = createPostgresRepos(pool);
});

const NOW = new Date('2026-11-10T10:00:00Z');

test('tenant + user CRUD and unique email enforcement', async () => {
  await repos.tenants.create({ id: 'pt-1', companyName: 'Postgres Test Co', createdAt: NOW });
  assert.equal((await repos.tenants.getById('pt-1'))?.companyName, 'Postgres Test Co');

  await repos.users.create({ id: 'pu-1', tenantId: 'pt-1', email: 'pg@example.com', passwordHash: 'hash', createdAt: NOW });
  assert.equal((await repos.users.getByEmail('PG@example.com'))?.id, 'pu-1');
  assert.equal((await repos.users.getById('pu-1'))?.email, 'pg@example.com');
  await assert.rejects(
    repos.users.create({ id: 'pu-2', tenantId: 'pt-1', email: 'pg@example.com', passwordHash: 'hash', createdAt: NOW }),
    /email_already_registered/,
  );
});

test('sessions round-trip and delete', async () => {
  await repos.sessions.create({ id: 'ps-1', userId: 'pu-1', tenantId: 'pt-1', tokenHash: 'pth-1', expiresAt: new Date('2030-01-01'), createdAt: NOW });
  assert.equal((await repos.sessions.getByTokenHash('pth-1'))?.id, 'ps-1');
  await repos.sessions.delete('ps-1');
  assert.equal(await repos.sessions.getByTokenHash('pth-1'), null);
});

test('billing event idempotency uses the database unique key', async () => {
  const e = {
    eventId: 'pevt-1', provider: 'mock', type: 'subscription.activated' as const,
    tenantId: 'pt-1', planId: 'standard_monthly', subscriptionRef: 'sub_p',
    periodEnd: new Date('2027-01-01'), occurredAt: NOW,
  };
  const first = await applyBillingEvent(repos, e, NOW);
  const second = await applyBillingEvent(repos, e, NOW);
  assert.equal(first.applied, true);
  assert.equal(second.applied, false);
  assert.equal(second.reason, 'duplicate');
  const decision = await checkAccess(repos, testConfig(), 'pt-1', 'analysis', NOW);
  assert.equal(decision.allowed, true);
});

test('out-of-order billing events never move entitlement state backwards', async () => {
  const newer = {
    eventId: 'pevt-3', provider: 'mock', type: 'subscription.cancelled' as const,
    tenantId: 'pt-1', occurredAt: new Date('2026-11-10T12:00:00Z'),
  };
  const older = {
    eventId: 'pevt-2', provider: 'mock', type: 'subscription.renewed' as const,
    tenantId: 'pt-1', planId: 'standard_monthly', periodEnd: new Date('2027-02-01'),
    occurredAt: new Date('2026-11-10T11:00:00Z'),
  };
  await applyBillingEvent(repos, newer, NOW);
  const replayed = await applyBillingEvent(repos, older, NOW);
  assert.equal(replayed.applied, false);
  assert.equal(replayed.reason, 'stale');
  const ent = await repos.entitlements.get('pt-1');
  assert.equal(ent?.status, 'cancelled');
});

test('usage tryConsume allows exactly the limit across interleaved callers', async () => {
  const config = testConfig();
  const limit = config.plans[0].includedAnalyses;
  const results = await Promise.all(
    Array.from({ length: limit + 4 }, () => repos.usage.tryConsume('pt-1', '2026-11', 'analyses', limit)),
  );
  assert.equal(results.filter((r) => r.allowed).length, limit);
  const counter = await repos.usage.get('pt-1', '2026-11');
  assert.equal(counter.analyses, limit);

  // release never goes below zero
  await repos.usage.release('pt-1', '2026-11', 'serpapiLookups');
  assert.equal((await repos.usage.get('pt-1', '2026-11')).serpapiLookups, 0);
});

test('profiles isolated per tenant', async () => {
  await repos.profiles.put({ tenantId: 'pt-1', profile: { companyName: 'One' }, updatedAt: NOW });
  await repos.profiles.put({ tenantId: 'pt-2', profile: { companyName: 'Two' }, updatedAt: NOW });
  assert.equal((await repos.profiles.get('pt-1'))?.profile.companyName, 'One');
  assert.equal((await repos.profiles.get('pt-2'))?.profile.companyName, 'Two');
  assert.equal(await repos.profiles.get('pt-3'), null);
});

test('applications round-trip with requirement json intact and per-tenant isolation', async () => {
  const app = {
    id: 'papp-1', tenantId: 'pt-1', tenderRef: 'PG-2026-01', title: 'PG tender', state: 'draft' as const,
    requirements: [{
      id: 'req-csd', label: 'CSD registration',
      source: { type: 'official_rule' as const, reference: 'National Treasury CSD', url: 'https://www.csd.gov.za/' },
      status: 'not_applicable' as const, notApplicableReason: 'JV partner registered',
    }],
    createdAt: NOW, updatedAt: NOW,
  };
  await repos.applications.create(app);
  const got = await repos.applications.getById('pt-1', 'papp-1');
  assert.equal(got?.requirements[0].status, 'not_applicable');
  assert.equal(got?.requirements[0].notApplicableReason, 'JV partner registered');
  assert.equal(got?.requirements[0].source.url, 'https://www.csd.gov.za/');
  assert.equal(await repos.applications.getById('pt-2', 'papp-1'), null);
  assert.equal((await repos.applications.listByTenant('pt-1')).length, 1);

  await repos.applications.put({ ...app, state: 'ready', updatedAt: new Date('2026-11-10T13:00:00Z') });
  assert.equal((await repos.applications.getById('pt-1', 'papp-1'))?.state, 'ready');
});
