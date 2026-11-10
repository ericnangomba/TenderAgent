/** Postgres-only, pre-serve migration. Never logs profile values or identifiers. */
import { decryptField, encryptField, fieldEncryptionEnabled, isEncryptedValue } from '../fieldCrypto';
import type { PoolLike } from './postgres';

interface MigrationClient extends PoolLike { release(error?: boolean): void; }
interface MigrationPool { connect(): Promise<MigrationClient>; }
class PinMigrationError extends Error {}
export interface PinMigrationCounts { encrypted: number; alreadyEncrypted: number; empty: number; }

export async function migrateProfilePins(pool: MigrationPool, key: string): Promise<PinMigrationCounts> {
  if (!fieldEncryptionEnabled(key)) throw new PinMigrationError('Profile PIN migration requires a protection key.');
  let client: MigrationClient;
  try { client = await pool.connect(); }
  catch { throw new PinMigrationError('Profile PIN migration could not acquire a database connection. Service startup stopped.'); }
  let commitAttempted = false;
  let discardConnection = false;
  try {
    await client.query('BEGIN');
    // Conflicts with writes and other migrations, but allows reads. A dedicated
    // connection holds the lock until commit/rollback; no pool.query transaction.
    await client.query("SET LOCAL lock_timeout = '15s'");
    await client.query("SET LOCAL statement_timeout = '60s'");
    await client.query("SET LOCAL idle_in_transaction_session_timeout = '60s'");
    await client.query('LOCK TABLE foundation_profiles IN SHARE ROW EXCLUSIVE MODE');
    const { rows } = await client.query('SELECT tenant_id, profile FROM foundation_profiles');
    const counts: PinMigrationCounts = { encrypted: 0, alreadyEncrypted: 0, empty: 0 };
    const updates: { tenantId: string; profile: Record<string, unknown> }[] = [];
    for (const row of rows) {
      const pin = row.profile.taxComplianceStatusPin;
      if (pin == null || pin === '') { counts.empty++; continue; }
      if (typeof pin !== 'string') throw new PinMigrationError('Profile PIN migration found an unsupported field type. No rows changed.');
      if (isEncryptedValue(pin)) {
        // Prevent a changed/lost key from encrypting legacy rows under a new
        // key while existing rows silently become unreadable. Restore the key
        // (or investigate corruption) before starting this deployment.
        if (decryptField(key, pin) === '') throw new PinMigrationError('Profile PIN migration cannot read existing protected data. Restore the protection key or investigate corruption. No rows changed.');
        counts.alreadyEncrypted++;
        continue;
      }
      updates.push({ tenantId: row.tenant_id, profile: { ...row.profile, taxComplianceStatusPin: encryptField(key, pin) } });
    }
    for (const update of updates) {
      // Preserve every other field and updated_at. No profile delete/recreate.
      await client.query('UPDATE foundation_profiles SET profile=$2 WHERE tenant_id=$1', [update.tenantId, JSON.stringify(update.profile)]);
      counts.encrypted++;
    }
    commitAttempted = true;
    await client.query('COMMIT');
    return counts;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { discardConnection = true; }
    // A lost COMMIT acknowledgement is ambiguous even if a later ROLLBACK
    // succeeds: the server may already have committed. Never promise rollback.
    if (commitAttempted) {
      discardConnection = true;
      throw new PinMigrationError('Profile PIN migration commit outcome is unconfirmed. Service startup stopped. Keep old releases stopped; verify with the same key before retrying.');
    }
    if (error instanceof PinMigrationError) throw error;
    throw new PinMigrationError('Profile PIN migration failed before commit. Service startup stopped; verify database state before recovery.');
  } finally { client.release(discardConnection); }
}
