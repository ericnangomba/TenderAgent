import { migrateProfilePins } from './profilePinMigration';
import { fieldEncryptionEnabled } from '../fieldCrypto';
/** Store selection: build the repository set the configured driver needs. */
import type { FoundationConfig } from '../config';
import type { FoundationRepos } from './types';
import { createMemoryRepos } from './memory';
import { createMongoRepos, connectMongo } from './mongo';
import { createPostgresRepos, connectPostgres } from './postgres';

export async function createStoreRepos(config: FoundationConfig): Promise<FoundationRepos> {
  if (config.store === 'postgres') {
    const pool = await connectPostgres(config.postgresUri);
    try {
      if (fieldEncryptionEnabled(config.profileFieldKey)) {
        const counts = await migrateProfilePins(pool, config.profileFieldKey);
        console.log('[Profile PIN migration]', counts);
      }
      return createPostgresRepos(pool);
    } catch (error) {
      try { await pool.end(); } catch { /* preserve sanitized bootstrap failure */ }
      throw error; // bootstrap rejects before any HTTP listener is opened
    }
  }
  if (config.store === 'mongo') {
    await connectMongo(config.mongoUri);
    return createMongoRepos();
  }
  return createMemoryRepos();
}
