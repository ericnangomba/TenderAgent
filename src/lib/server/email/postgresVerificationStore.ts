import type { Pool } from 'pg';
import type { VerificationRecord, VerificationStore } from './verification';

/**
 * Postgres-backed verification token store. Digests only - the raw token
 * never reaches the database. consume() is a single DELETE ... RETURNING so
 * concurrent confirms of the same token cannot both succeed.
 *
 * Not wired anywhere yet: call ensureEmailVerificationSchema(pool) and use
 * the store when the email router is mounted (a settled provider/sender and
 * the existing-user policy come first).
 */

export async function ensureEmailVerificationSchema(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS foundation_email_verifications (
      digest TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at TIMESTAMPTZ NOT NULL
    )
  `);
  await pool.query(
    'CREATE INDEX IF NOT EXISTS foundation_email_verifications_email_idx ON foundation_email_verifications (email)',
  );
}

export class PostgresVerificationStore implements VerificationStore {
  constructor(private readonly pool: Pool) {}

  async save(record: VerificationRecord): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // One active token per email: a fresh request invalidates earlier links.
      await client.query('DELETE FROM foundation_email_verifications WHERE email = $1', [record.email]);
      await client.query(
        'INSERT INTO foundation_email_verifications (digest, email, expires_at) VALUES ($1, $2, $3)',
        [record.digest, record.email, record.expiresAt],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async consume(digest: string, now: Date = new Date()): Promise<VerificationRecord | null> {
    const { rows } = await this.pool.query(
      'DELETE FROM foundation_email_verifications WHERE digest = $1 RETURNING digest, email, expires_at',
      [digest],
    );
    if (rows.length === 0) return null;
    const row = rows[0];
    const record: VerificationRecord = { digest: row.digest, email: row.email, expiresAt: row.expires_at };
    return record.expiresAt > now ? record : null;
  }
}
