import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryRepos } from '../src/lib/server/repos/memory';

test('tenant profiles are fully isolated at the repository layer', async () => {
  const repos = createMemoryRepos();
  await repos.tenants.create({ id: 'tenant-a', companyName: 'Synthetic fixture', createdAt: new Date() });
  await repos.tenants.create({ id: 'tenant-b', companyName: 'Synthetic fixture', createdAt: new Date() });

  await repos.profiles.put({ tenantId: 'tenant-a', profile: { companyName: 'A Pty Ltd', csdNumber: 'MAAA0001' }, updatedAt: new Date() });
  await repos.profiles.put({ tenantId: 'tenant-b', profile: { companyName: 'B Pty Ltd', csdNumber: 'MAAA0002' }, updatedAt: new Date() });

  const a = await repos.profiles.get('tenant-a');
  const b = await repos.profiles.get('tenant-b');
  assert.equal(a?.profile.companyName, 'A Pty Ltd');
  assert.equal(b?.profile.companyName, 'B Pty Ltd');

  // Updating one tenant must not touch the other.
  await repos.profiles.put({ tenantId: 'tenant-a', profile: { ...a!.profile, province: 'Gauteng' }, updatedAt: new Date() });
  assert.equal((await repos.profiles.get('tenant-b'))?.profile.province, undefined);
  assert.equal((await repos.profiles.get('tenant-c')), null);
});

test('usage counters never leak across tenants', async () => {
  const repos = createMemoryRepos();
  await repos.tenants.create({ id: 'tenant-a', companyName: 'Synthetic fixture', createdAt: new Date() });
  await repos.tenants.create({ id: 'tenant-b', companyName: 'Synthetic fixture', createdAt: new Date() });

  await repos.usage.increment('tenant-a', '2026-11', 'analyses');
  await repos.usage.increment('tenant-a', '2026-11', 'analyses');
  await repos.usage.increment('tenant-b', '2026-11', 'analyses');
  assert.equal((await repos.usage.get('tenant-a', '2026-11')).analyses, 2);
  assert.equal((await repos.usage.get('tenant-b', '2026-11')).analyses, 1);
  assert.equal((await repos.usage.get('tenant-a', '2026-12')).analyses, 0);
});

test('entitlements are keyed strictly by tenant', async () => {
  const repos = createMemoryRepos();
  await repos.tenants.create({ id: 'tenant-a', companyName: 'Synthetic fixture', createdAt: new Date() });
  await repos.tenants.create({ id: 'tenant-b', companyName: 'Synthetic fixture', createdAt: new Date() });

  const { emptyEntitlement } = await import('../src/lib/server/entitlement');
  const ent = emptyEntitlement('tenant-a');
  ent.status = 'active';
  await repos.entitlements.put(ent);
  assert.equal((await repos.entitlements.get('tenant-a'))?.status, 'active');
  assert.equal(await repos.entitlements.get('tenant-b'), null);
});
