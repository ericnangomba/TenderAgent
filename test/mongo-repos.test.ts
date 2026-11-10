/**
 * Integration test for the MongoDB repositories against a disposable local
 * mongod (mongodb-memory-server). No external server, no cost, no credentials.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { connectMongo, createMongoRepos } from '../src/lib/server/repos/mongo';
import { applyBillingEvent, checkAccess } from '../src/lib/server/entitlement';
import { testConfig } from './helpers';
import type { FoundationRepos } from '../src/lib/server/repos/types';

let mongod: MongoMemoryServer;
let repos: FoundationRepos;

before(async () => {
  mongod = await MongoMemoryServer.create();
  await connectMongo(mongod.getUri());
  repos = createMongoRepos();
});

after(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

const NOW = new Date('2026-11-10T10:00:00Z');

test('tenant + user CRUD and unique email enforcement', async () => {
  await repos.tenants.create({ id: 'mt-1', companyName: 'Mongo Test Co', createdAt: NOW });
  assert.equal((await repos.tenants.getById('mt-1'))?.companyName, 'Mongo Test Co');

  await repos.users.create({ id: 'mu-1', tenantId: 'mt-1', email: 'mongo@example.com', passwordHash: 'hash', createdAt: NOW });
  assert.equal((await repos.users.getByEmail('MONGO@example.com'))?.id, 'mu-1');
  await assert.rejects(
    repos.users.create({ id: 'mu-2', tenantId: 'mt-1', email: 'mongo@example.com', passwordHash: 'hash', createdAt: NOW }),
    /email_already_registered/,
  );
});

test('sessions round-trip and delete', async () => {
  await repos.sessions.create({ id: 'ms-1', userId: 'mu-1', tenantId: 'mt-1', tokenHash: 'th-1', expiresAt: new Date('2030-01-01'), createdAt: NOW });
  assert.equal((await repos.sessions.getByTokenHash('th-1'))?.id, 'ms-1');
  await repos.sessions.delete('ms-1');
  assert.equal(await repos.sessions.getByTokenHash('th-1'), null);
});

test('billing event idempotency uses the database unique key', async () => {
  const e = {
    eventId: 'mevt-1', provider: 'mock', type: 'subscription.activated' as const,
    tenantId: 'mt-1', planId: 'standard_monthly', subscriptionRef: 'sub_m',
    periodEnd: new Date('2027-01-01'), occurredAt: NOW,
  };
  const first = await applyBillingEvent(repos, e, NOW);
  const second = await applyBillingEvent(repos, e, NOW);
  assert.equal(first.applied, true);
  assert.equal(second.applied, false);
  assert.equal(second.reason, 'duplicate');
  const decision = await checkAccess(repos, testConfig(), 'mt-1', 'analysis', NOW);
  assert.equal(decision.allowed, true);
});

test('usage increments atomically via upsert; profiles isolated per tenant', async () => {
  await repos.usage.increment('mt-1', '2026-11', 'analyses');
  const counter = await repos.usage.increment('mt-1', '2026-11', 'analyses');
  assert.equal(counter.analyses, 2);
  assert.equal((await repos.usage.get('mt-2', '2026-11')).analyses, 0);

  await repos.profiles.put({ tenantId: 'mt-1', profile: { companyName: 'One' }, updatedAt: NOW });
  await repos.profiles.put({ tenantId: 'mt-2', profile: { companyName: 'Two' }, updatedAt: NOW });
  assert.equal((await repos.profiles.get('mt-1'))?.profile.companyName, 'One');
  assert.equal((await repos.profiles.get('mt-2'))?.profile.companyName, 'Two');
  assert.equal(await repos.profiles.get('mt-3'), null);
});
