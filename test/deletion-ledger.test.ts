import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newDb } from 'pg-mem';
import { startTestApp, stopTestApp, signup } from './helpers';
import { createMemoryRepos } from '../src/lib/server/repos/memory';
import { emptyEntitlement } from '../src/lib/server/entitlement';
import { reconcileRestoredDeletions } from '../src/lib/server/deletionLedger';
import { ensurePostgresSchema, ensureDeletionLedgerTable, createPostgresRepos, erasePostgresTenant, type PoolLike } from '../src/lib/server/repos/postgres';

const password = 'synthetic-test-password-9';
const NOW = new Date('2026-11-23T10:00:00Z');

async function seedTenant(repos: ReturnType<typeof createMemoryRepos>, id: string) {
  await repos.tenants.create({ id, companyName: `Co ${id}`, createdAt: NOW });
  await repos.users.create({ id, tenantId: id, email: `${id}@example.invalid`, passwordHash: 'hash', createdAt: NOW });
  await repos.sessions.create({ id, tenantId: id, userId: id, tokenHash: id, expiresAt: new Date('2030-01-01'), createdAt: NOW });
  await repos.profiles.put({ tenantId: id, profile: { companyName: id }, updatedAt: NOW });
}

test('erasure records a minimal ledger entry once, in memory and through the API', async () => {
  const repos = createMemoryRepos();
  await seedTenant(repos, 'ledger-a');
  await repos.accountDeletion!.erase('ledger-a');
  await repos.accountDeletion!.erase('ledger-a'); // idempotent, single entry
  const ledger = await repos.deletionLedger!.list();
  assert.equal(ledger.length, 1);
  assert.equal(ledger[0].tenantId, 'ledger-a');
  assert.ok(ledger[0].erasedAt instanceof Date);

  const app = await startTestApp();
  try {
    const u = await signup(app.baseUrl, 'ledger-api@example.invalid', password);
    const del = await fetch(`${app.baseUrl}/api/account`, { method: 'DELETE', headers: { 'content-type': 'application/json', cookie: u.cookie }, body: JSON.stringify({ password, confirmation: 'DELETE MY ACCOUNT' }) });
    assert.equal(del.status, 200);
    const apiLedger = await app.foundation.repos.deletionLedger!.list();
    assert.deepEqual(apiLedger.map((e) => e.tenantId), [u.tenantId]);
  } finally { await stopTestApp(app); }
});

test('reconciliation re-erases only resurrected recorded tenants, reports absent and blocked, never touches others', async () => {
  const repos = createMemoryRepos();
  for (const id of ['gone', 'back', 'blocked', 'other']) await seedTenant(repos, id);
  await repos.accountDeletion!.erase('gone'); // completed earlier; ledger has it
  // Simulate a restore: 'gone' comes back with all its rows, ledger row lost.
  await seedTenant(repos, 'gone');
  await repos.entitlements.put({ ...emptyEntitlement('blocked'), providerName: 'future-real-provider', providerSubscriptionRef: 'synthetic-ref' });

  const record = ['gone', 'never-existed', 'blocked'];
  const first = await reconcileRestoredDeletions(repos, record);
  assert.deepEqual(first, [
    { tenantId: 'gone', outcome: 're-erased' },
    { tenantId: 'never-existed', outcome: 'already-absent' },
    { tenantId: 'blocked', outcome: 'blocked', error: 'billing_resolution_required' },
  ]);
  assert.equal(await repos.tenants.getById('gone'), null);
  assert.equal(await repos.profiles.get('gone'), null);
  assert.ok(await repos.tenants.getById('blocked'));
  assert.ok(await repos.profiles.get('other'));
  // Ledger records the re-erasure; 'blocked' and 'other' are not in it.
  assert.deepEqual((await repos.deletionLedger!.list()).map((e) => e.tenantId), ['gone']);
  // Re-running is safe and reports the new steady state.
  const second = await reconcileRestoredDeletions(repos, record);
  assert.deepEqual(second.map((o) => o.outcome), ['already-absent', 'already-absent', 'blocked']);
});

test('reconciliation fails closed without erasure capability and validates the record', async () => {
  const repos = createMemoryRepos();
  delete (repos as any).accountDeletion;
  await assert.rejects(reconcileRestoredDeletions(repos, ['x']), /account_deletion_unavailable_for_store/);
  const capable = createMemoryRepos();
  await assert.rejects(reconcileRestoredDeletions(capable, ['']), /invalid_reconciliation_record/);
  await assert.rejects(reconcileRestoredDeletions(capable, new Array(1001).fill('t')), /invalid_reconciliation_record/);
});

test('postgres erasure writes the ledger row transactionally and reconciliation re-erases a resurrected tenant', async () => {
  const db = newDb();
  const pool = new (db.adapters.createPg().Pool)();
  await ensurePostgresSchema(pool as PoolLike);
  // pg-mem cannot execute the plpgsql DO blocks in ensureTenantForeignKeys;
  // apply the same constraints directly (identical names and semantics).
  for (const table of ['users','sessions','entitlements','billing_events','usage_counters','profiles','applications']) {
    await pool.query(`ALTER TABLE foundation_${table} ADD CONSTRAINT foundation_${table}_tenant_live FOREIGN KEY (tenant_id) REFERENCES foundation_tenants(id) ON DELETE CASCADE`);
  }
  await ensureDeletionLedgerTable(pool as PoolLike);
  const repos = createPostgresRepos(pool, true);

  await repos.tenants.create({ id: 'pg-gone', companyName: 'PG Co', createdAt: NOW });
  await repos.users.create({ id: 'pgu-1', tenantId: 'pg-gone', email: 'pg-gone@example.invalid', passwordHash: 'hash', createdAt: NOW });
  await erasePostgresTenant(pool as any, 'pg-gone');
  assert.equal(await repos.tenants.getById('pg-gone'), null);
  const ledger = await repos.deletionLedger!.list();
  assert.deepEqual(ledger.map((e) => e.tenantId), ['pg-gone']);

  // Restore simulation: tenant row returns without the ledger row.
  await pool.query('DELETE FROM foundation_deletion_ledger');
  await repos.tenants.create({ id: 'pg-gone', companyName: 'PG Co', createdAt: NOW });
  await repos.users.create({ id: 'pgu-2', tenantId: 'pg-gone', email: 'pg-gone2@example.invalid', passwordHash: 'hash', createdAt: NOW });

  const outcomes = await reconcileRestoredDeletions(repos, ['pg-gone']);
  assert.deepEqual(outcomes, [{ tenantId: 'pg-gone', outcome: 're-erased' }]);
  assert.equal(await repos.tenants.getById('pg-gone'), null);
  assert.equal(await repos.users.getByEmail('pg-gone2@example.invalid'), null);
  assert.deepEqual((await repos.deletionLedger!.list()).map((e) => e.tenantId), ['pg-gone']);
});

test('expired-session housekeeping removes only expired rows (memory and postgres)', async () => {
  const mem = createMemoryRepos();
  await mem.tenants.create({ id: 't', companyName: 'T', createdAt: NOW });
  await mem.users.create({ id: 'u', tenantId: 't', email: 'u@example.invalid', passwordHash: 'h', createdAt: NOW });
  await mem.sessions.create({ id: 'old', userId: 'u', tenantId: 't', tokenHash: 'old', expiresAt: new Date('2026-01-01'), createdAt: NOW });
  await mem.sessions.create({ id: 'live', userId: 'u', tenantId: 't', tokenHash: 'live', expiresAt: new Date('2030-01-01'), createdAt: NOW });
  assert.equal(await mem.sessions.pruneExpired!(NOW), 1);
  assert.equal(await mem.sessions.getByTokenHash('old'), null);
  assert.ok(await mem.sessions.getByTokenHash('live'));
  assert.equal(await mem.sessions.pruneExpired!(NOW), 0);

  const db = newDb();
  const pool = new (db.adapters.createPg().Pool)();
  await ensurePostgresSchema(pool as PoolLike);
  const pg = createPostgresRepos(pool);
  await pg.tenants.create({ id: 't', companyName: 'T', createdAt: NOW });
  await pg.users.create({ id: 'u', tenantId: 't', email: 'u@example.invalid', passwordHash: 'h', createdAt: NOW });
  await pg.sessions.create({ id: 'old', userId: 'u', tenantId: 't', tokenHash: 'old', expiresAt: new Date('2026-01-01'), createdAt: NOW });
  await pg.sessions.create({ id: 'live', userId: 'u', tenantId: 't', tokenHash: 'live', expiresAt: new Date('2030-01-01'), createdAt: NOW });
  assert.equal(await pg.sessions.pruneExpired!(NOW), 1);
  assert.equal(await pg.sessions.getByTokenHash('old'), null);
  assert.ok(await pg.sessions.getByTokenHash('live'));
});

test('restore reconciliation mode refuses API traffic except health, and clears without the flag', async () => {
  const app = await startTestApp({ restoreReconciliationRequired: true });
  try {
    await assert.rejects(signup(app.baseUrl, 'reconcile-gate@example.invalid', password), /signup failed: 503/);
    const health = await fetch(`${app.baseUrl}/api/health`);
    assert.equal(health.status, 200);
    assert.equal((await health.json()).restoreReconciliation, 'required');
    const login = await fetch(`${app.baseUrl}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'a@b.c', password }) });
    assert.equal(login.status, 503);
    assert.equal((await login.json()).error, 'restore_reconciliation_pending');
  } finally { await stopTestApp(app); }

  const normal = await startTestApp();
  try {
    const okHealth = await fetch(`${normal.baseUrl}/api/health`);
    assert.equal((await okHealth.json()).restoreReconciliation, 'off');
    const u = await signup(normal.baseUrl, 'reconcile-normal@example.invalid', password);
    assert.ok(u.cookie);
  } finally { await stopTestApp(normal); }
});
