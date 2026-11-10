import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newDb } from 'pg-mem';
import { migrateProfilePins } from '../src/lib/server/repos/profilePinMigration';
import { ensurePostgresSchema } from '../src/lib/server/repos/postgres';
import { decryptField, encryptField } from '../src/lib/server/fieldCrypto';

const KEY = 'synthetic-migration-key';

// pg-mem verifies the actual SELECT/UPDATE and JSONB behavior. It does not
// implement Postgres locks or rollback, so those are tested separately below.
test('migration preserves all other JSONB fields/timestamps and is idempotent', async () => {
  const db = newDb();
  const pool = new (db.adapters.createPg().Pool)();
  await ensurePostgresSchema(pool);
  const profiles = [
    { companyName: 'Synthetic A', taxComplianceStatusPin: 'legacy-pin', evidence: { keep: ['all', 'values'] } },
    { companyName: 'Synthetic B', taxComplianceStatusPin: encryptField(KEY, 'protected-pin') },
    { companyName: 'Synthetic C', taxComplianceStatusPin: '' },
    { companyName: 'Synthetic D' },
  ];
  const at = new Date('2026-11-10T10:00:00Z');
  for (let i = 0; i < profiles.length; i++) await pool.query('INSERT INTO foundation_profiles VALUES ($1,$2,$3)', [String(i), JSON.stringify(profiles[i]), at]);
  const adapter = { async connect() { return { async query(sql: string, params?: unknown[]) {
    if (/^(BEGIN|COMMIT|ROLLBACK|SET LOCAL|LOCK TABLE)/.test(sql)) return { rows: [], rowCount: 0 };
    return pool.query(sql, params);
  }, release() {} }; } };
  try {
    assert.deepEqual(await migrateProfilePins(adapter, KEY), { encrypted: 1, alreadyEncrypted: 1, empty: 2 });
    const after = (await pool.query('SELECT * FROM foundation_profiles ORDER BY tenant_id')).rows;
    assert.equal(decryptField(KEY, after[0].profile.taxComplianceStatusPin), 'legacy-pin');
    assert.ok(!JSON.stringify(after[0].profile).includes('legacy-pin'));
    assert.deepEqual({ ...after[0].profile, taxComplianceStatusPin: 'legacy-pin' }, profiles[0]);
    assert.deepEqual(after.slice(1).map((r: any) => r.profile), profiles.slice(1));
    after.forEach((r: any) => assert.equal(new Date(r.updated_at).toISOString(), at.toISOString()));
    const ciphertext = after[0].profile.taxComplianceStatusPin;
    assert.deepEqual(await migrateProfilePins(adapter, KEY), { encrypted: 0, alreadyEncrypted: 2, empty: 2 });
    assert.equal((await pool.query('SELECT profile FROM foundation_profiles WHERE tenant_id=$1', ['0'])).rows[0].profile.taxComplianceStatusPin, ciphertext);
  } finally { await pool.end(); }
});

// Transaction-contract fake: stages writes and only applies COMMIT. This
// verifies our orchestration, not the real Postgres engine's lock semantics.
function transactionalPool(rows: any[], failOnUpdate = 0) {
  let stored = structuredClone(rows), staged = structuredClone(rows), writes = 0, released = false;
  const calls: string[] = [];
  return {
    calls, rows: () => stored, released: () => released,
    async connect() { return { async query(sql: string, params?: unknown[]) {
      calls.push(sql);
      if (sql === 'BEGIN') staged = structuredClone(stored);
      if (sql.startsWith('SELECT')) return { rows: structuredClone(staged), rowCount: staged.length };
      if (sql.startsWith('UPDATE')) {
        if (++writes === failOnUpdate) throw new Error('unsafe driver diagnostic with private parameters');
        staged.find(r => r.tenant_id === params![0]).profile = JSON.parse(params![1] as string);
      }
      if (sql === 'COMMIT') stored = structuredClone(staged);
      if (sql === 'ROLLBACK') staged = structuredClone(stored);
      return { rows: [], rowCount: 0 };
    }, release() { released = true; } }; },
  };
}

test('failure after a staged update rolls back all changes and returns no private diagnostic', async () => {
  const original = [1, 2].map(i => ({ tenant_id: String(i), profile: { taxComplianceStatusPin: `synthetic-pin-${i}`, keep: i } }));
  const pool = transactionalPool(original, 2);
  await assert.rejects(migrateProfilePins(pool, KEY), { message: 'Profile PIN migration failed before commit. Service startup stopped; verify database state before recovery.' });
  assert.deepEqual(pool.rows(), original);
  assert.equal(pool.calls.at(-1), 'ROLLBACK');
  assert.ok(!pool.calls.includes('COMMIT'));
  assert.equal(pool.released(), true);
  assert.ok(pool.calls.indexOf('LOCK TABLE foundation_profiles IN SHARE ROW EXCLUSIVE MODE') < pool.calls.findIndex(s => s.startsWith('SELECT')));
});

test('wrong key or corruption refuses migration before updates; correct key can recover', async () => {
  const rows = [{ tenant_id: 'a', profile: { taxComplianceStatusPin: 'legacy' } }, { tenant_id: 'b', profile: { taxComplianceStatusPin: encryptField(KEY, 'original') } }];
  const pool = transactionalPool(rows);
  await assert.rejects(migrateProfilePins(pool, 'wrong-key'), /cannot read existing protected data/);
  assert.deepEqual(pool.rows(), rows);
  assert.ok(!pool.calls.some(s => s.startsWith('UPDATE')));
  assert.deepEqual(await migrateProfilePins(pool, KEY), { encrypted: 1, alreadyEncrypted: 1, empty: 0 });
});

test('missing key refuses before connecting, unsupported value rolls back without overwriting', async () => {
  let connected = false;
  await assert.rejects(migrateProfilePins({ async connect() { connected = true; throw new Error('should not connect'); } }, ''), /requires a protection key/);
  assert.equal(connected, false);
  const rows = [{ tenant_id: 'a', profile: { taxComplianceStatusPin: 123, keep: true } }];
  const pool = transactionalPool(rows);
  await assert.rejects(migrateProfilePins(pool, KEY), /unsupported field type/);
  assert.deepEqual(pool.rows(), rows);
});

test('connection acquisition errors are sanitized and lost COMMIT acknowledgement is ambiguous', async () => {
  await assert.rejects(migrateProfilePins({ async connect() { throw new Error('private-uri-and-password'); } }, KEY),
    { message: 'Profile PIN migration could not acquire a database connection. Service startup stopped.' });
  let discarded = false;
  const pool = { async connect() { return { async query(sql: string) {
    if (sql.startsWith('SELECT')) return { rows: [], rowCount: 0 };
    if (sql === 'COMMIT') throw new Error('private-driver-diagnostic');
    return { rows: [], rowCount: 0 };
  }, release(error?: boolean) { discarded = Boolean(error); } }; } };
  await assert.rejects(migrateProfilePins(pool, KEY), /commit outcome is unconfirmed/);
  assert.equal(discarded, true);
});
