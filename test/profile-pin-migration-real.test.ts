/** Explicit opt-in, loopback-only isolated Postgres verification. No live database. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';
import { migrateProfilePins } from '../src/lib/server/repos/profilePinMigration';
import { ensurePostgresSchema } from '../src/lib/server/repos/postgres';
import { decryptField, encryptField } from '../src/lib/server/fieldCrypto';
import { spawn } from 'node:child_process';
const uri = process.env.ISOLATED_PG_MIGRATION_TEST_URL;
const KEY = 'synthetic-isolated-key';
const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

test('real Postgres migration concurrency, rollback, recovery, lock timeout and pre-listen startup failure', { skip: !uri, timeout: 55000 }, async () => {
  const url = new URL(uri!);
  assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname), 'isolated tests refuse remote databases');
  assert.equal(url.port, '35432');
  assert.equal(url.pathname, '/tenderagent_migration_test');
  const pool = new Pool({ connectionString: uri, max: 8 });
  const at = new Date('2026-11-10T10:00:00Z');
  const rows = async () => (await pool.query('SELECT * FROM foundation_profiles ORDER BY tenant_id')).rows;
  const seed = async () => {
    await pool.query('TRUNCATE foundation_profiles');
    for (const id of ['a','b']) await pool.query('INSERT INTO foundation_profiles VALUES($1,$2,$3)', [id, JSON.stringify({ companyName: `Synthetic ${id}`, taxComplianceStatusPin: `pin-${id}`, nested: { keep: true } }), at]);
  };
  try {
    await ensurePostgresSchema(pool);
    await seed();
    const original = await rows();
    // Real lock holder: pause our first migrator immediately after its table
    // lock succeeds, with the actual PG transaction/connection still alive.
    let unlock!: () => void, acquired!: () => void;
    const gate = new Promise<void>(r => { unlock = r; });
    const locked = new Promise<void>(r => { acquired = r; });
    const pausedPool = { async connect() {
      const client = await pool.connect();
      return { async query(sql: string, params?: unknown[]) {
        const result = await client.query(sql, params);
        if (sql.startsWith('LOCK TABLE')) { acquired(); await gate; }
        return result;
      }, release(error?: boolean) { client.release(error); } };
    } };
    const first = migrateProfilePins(pausedPool, KEY);
    await locked;
    let writerDone = false, secondDone = false;
    const writer = pool.query("UPDATE foundation_profiles SET profile = profile || '{\"contactEmail\":\"synthetic@example.invalid\"}'::jsonb WHERE tenant_id='a'").then(() => { writerDone = true; });
    const second = migrateProfilePins(pool, KEY).then(result => { secondDone = true; return result; });
    await delay(200);
    assert.equal(writerDone, false, 'writer blocks behind migration lock');
    assert.equal(secondDone, false, 'second migrator blocks behind migration lock');
    const reader = await pool.query('SELECT count(*) AS n FROM foundation_profiles');
    assert.equal(Number(reader.rows[0].n), 2, 'ordinary readers remain possible');
    unlock();
    assert.deepEqual(await first, { encrypted: 2, alreadyEncrypted: 0, empty: 0 });
    await writer;
    assert.deepEqual(await second, { encrypted: 0, alreadyEncrypted: 2, empty: 0 });
    const protectedRows = await rows();
    protectedRows.forEach((r: any, i: number) => {
      assert.equal(decryptField(KEY, r.profile.taxComplianceStatusPin), `pin-${r.tenant_id}`);
      assert.equal(r.updated_at.toISOString(), original[i].updated_at.toISOString());
      assert.deepEqual(r.profile.nested, { keep: true });
    });
    assert.equal(protectedRows[0].profile.contactEmail, 'synthetic@example.invalid');
    assert.deepEqual(await migrateProfilePins(pool, KEY), { encrypted: 0, alreadyEncrypted: 2, empty: 0 });
    assert.deepEqual(await rows(), protectedRows, 'restart rerun byte-for-byte preservation');
    console.log('REAL PG: writer/second migrator blocked; reader succeeds; preservation/restart passed');

    await assert.rejects(migrateProfilePins(pool, 'wrong-key'), /cannot read existing protected data/);
    assert.deepEqual(await rows(), protectedRows);
    console.log('REAL PG: wrong-key refusal leaves all rows unchanged');

    await seed();
    const beforeFailure = await rows();
    await pool.query(`CREATE SEQUENCE migration_test_updates START 1;
      CREATE FUNCTION migration_test_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF nextval('migration_test_updates')=2 THEN RAISE EXCEPTION 'synthetic second-update failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER migration_test_failure BEFORE UPDATE ON foundation_profiles FOR EACH ROW EXECUTE FUNCTION migration_test_fail();`);
    try {
      await assert.rejects(migrateProfilePins(pool, KEY), /failed before commit/);
      assert.equal(Number((await pool.query('SELECT last_value FROM migration_test_updates')).rows[0].last_value), 2);
      assert.deepEqual(await rows(), beforeFailure, 'real rollback undoes first UPDATE after second fails');
    } finally {
      await pool.query('DROP TRIGGER migration_test_failure ON foundation_profiles; DROP FUNCTION migration_test_fail(); DROP SEQUENCE migration_test_updates');
    }
    console.log('REAL PG: forced second-update rollback leaves all rows/timestamps unchanged');

    const blocker = await pool.connect();
    await blocker.query('BEGIN');
    await blocker.query('LOCK TABLE foundation_profiles IN SHARE ROW EXCLUSIVE MODE');
    const started = Date.now();
    try { await assert.rejects(migrateProfilePins(pool, KEY), /failed before commit/); }
    finally { await blocker.query('ROLLBACK'); blocker.release(); }
    const elapsed = Date.now() - started;
    assert.ok(elapsed >= 14500 && elapsed < 20000, `expected 15s lock wait, got ${elapsed}ms`);
    assert.deepEqual(await rows(), beforeFailure);
    console.log(`REAL PG: lock wait fails after ${elapsed}ms, rows unchanged`);

    // Lose the acknowledgement AFTER the real engine commits. The diagnostic
    // must not promise rollback, and a same-key retry must preserve the result.
    const lostAckPool = { async connect() {
      const client = await pool.connect();
      return { async query(sql: string, params?: unknown[]) {
        const result = await client.query(sql, params);
        if (sql === 'COMMIT') throw new Error('synthetic lost acknowledgement');
        return result;
      }, release(error?: boolean) { client.release(error); } };
    } };
    await assert.rejects(migrateProfilePins(lostAckPool, KEY), /commit outcome is unconfirmed/);
    const committedRows = await rows();
    assert.equal(decryptField(KEY, committedRows[0].profile.taxComplianceStatusPin), 'pin-a');
    assert.notEqual(committedRows[0].profile.taxComplianceStatusPin, 'pin-a');
    await migrateProfilePins(pool, KEY);
    assert.deepEqual(await rows(), committedRows);
    console.log('REAL PG: lost COMMIT acknowledgement is reported ambiguous; same-key retry preserves committed rows');
    const beforeBoot = await rows();
    const env = { ...process.env, NODE_ENV: 'production', PORT: '35679', STORE: 'postgres', DATABASE_URL: uri!, PGSSL: 'disable', AUTH_REQUIRED: 'true', SESSION_SECRET: 'synthetic-isolated-session-secret-long-enough', PROFILE_FIELD_KEY: 'wrong-key', PUBLIC_ORIGIN: 'http://127.0.0.1:35679' };
    const child = spawn(process.execPath, ['--import', 'tsx', 'server.ts'], { env, stdio: ['ignore','pipe','pipe'] });
    let output = '';
    child.stdout.on('data', b => { output += b; }); child.stderr.on('data', b => { output += b; });
    const timer = setTimeout(() => child.kill('SIGKILL'), 10000);
    const exit = await new Promise<number|null>(resolve => child.once('exit', resolve));
    clearTimeout(timer);
    assert.notEqual(exit, 0);
    assert.match(output, /cannot read existing protected data/);
    assert.ok(!output.includes('Listening on'), 'bootstrap fails before listen');
    assert.ok(!output.includes(uri!) && !output.includes('pin-a') && !output.includes('wrong-key'));
    assert.deepEqual(await rows(), beforeBoot);
    console.log('REAL PG: actual server startup wrong-key fails pre-listen; DB unchanged; no private values logged');
  } finally { await pool.end(); }
});
