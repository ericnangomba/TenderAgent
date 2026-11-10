/** Store selection: build the repository set the configured driver needs. */
import type { FoundationConfig } from '../config';
import type { FoundationRepos } from './types';
import { createMemoryRepos } from './memory';
import { createMongoRepos, connectMongo } from './mongo';
import { createPostgresRepos, connectPostgres } from './postgres';

export async function createStoreRepos(config: FoundationConfig): Promise<FoundationRepos> {
  if (config.store === 'postgres') {
    const pool = await connectPostgres(config.postgresUri);
    return createPostgresRepos(pool);
  }
  if (config.store === 'mongo') {
    await connectMongo(config.mongoUri);
    return createMongoRepos();
  }
  return createMemoryRepos();
}
