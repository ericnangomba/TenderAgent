/** Regression: tender-feed sync/write boundary (review finding on 03f5bdf). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, stopTestApp, signup, signWebhook, TEST_SECRET } from './helpers';

async function postJson(url: string, cookie?: string): Promise<{ status: number; body: any }> {
  const r = await fetch(url, { method: 'POST', headers: cookie ? { cookie } : {} });
  return { status: r.status, body: await r.json().catch(() => null) };
}

async function listTenders(baseUrl: string, cookie?: string): Promise<any> {
  const r = await fetch(`${baseUrl}/api/tenders`, { headers: cookie ? { cookie } : {} });
  return r.json();
}

test('anonymous POST /api/etenders/sync is denied and writes nothing', async () => {
  const t = await startTestApp();
  try {
    const before = await listTenders(t.baseUrl);
    const res = await postJson(`${t.baseUrl}/api/etenders/sync`);
    assert.equal(res.status, 401);
    assert.equal(res.body?.error, 'authentication_required');
    const after = await listTenders(t.baseUrl);
    assert.equal(after.count, before.count, 'anonymous sync must not change the shared feed');
  } finally {
    await stopTestApp(t);
  }
});

test('tenant sync writes tenant-tagged records invisible to other tenants and anonymous callers', async () => {
  const t = await startTestApp();
  try {
    const a = await signup(t.baseUrl, 'tenant-a@example.co.za');
    const b = await signup(t.baseUrl, 'tenant-b@example.co.za');

    // Activate tenant A's subscription via the mock billing webhook (sync
    // consumes a serpapi unit under AUTH_REQUIRED, like production).
    const { body, signature } = signWebhook({
      eventId: `evt_${Date.now()}`, type: 'subscription.activated', tenantId: a.tenantId,
      planId: 'standard_monthly', subscriptionRef: `sub_${Date.now()}`,
      periodEnd: '2027-12-31T00:00:00Z', occurredAt: '2026-11-10T10:00:00Z',
    });
    const wr = await fetch(`${t.baseUrl}/api/billing/webhook/mock`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-billing-signature': signature }, body,
    });
    assert.equal(wr.status, 200);

    // Remove one seeded fixture so the sync has something to write.
    const removedRef = 'WCG/DOTP-ADV/2026/01';
    assert.ok(t.tenderStore.delete(removedRef), 'fixture must exist before deletion');

    const anonBefore = await listTenders(t.baseUrl);
    const res = await postJson(`${t.baseUrl}/api/etenders/sync`, a.cookie);
    assert.equal(res.status, 200);
    assert.equal(res.body?.success, true);

    const aList = await listTenders(t.baseUrl, a.cookie);
    const bList = await listTenders(t.baseUrl, b.cookie);
    const anonAfter = await listTenders(t.baseUrl);

    // Syncing tenant A sees the synced records...
    assert.ok(aList.count >= anonBefore.count, 'syncing tenant keeps at least the public feed');
    // ...but nothing A wrote leaks to tenant B or to anonymous callers.
    const aTaggedRefs = new Set(
      aList.tenders.filter((x: any) => x.tenantId === a.tenantId).map((x: any) => x.referenceNumber)
    );
    assert.ok(aTaggedRefs.size > 0, 'sync must tag what it writes to the calling tenant');
    assert.ok(aTaggedRefs.has(removedRef), 're-written fixture must carry the syncing tenant tag');
    for (const x of bList.tenders) assert.notEqual(x.tenantId, a.tenantId, 'cross-tenant leak');
    for (const x of anonAfter.tenders) assert.equal(x.tenantId, undefined, 'anonymous sees only untagged');
    assert.equal(anonAfter.count, anonBefore.count, 'tenant sync must not grow the shared public feed');
  } finally {
    await stopTestApp(t);
  }
});

test('GET /api/profile requires a session in every mode', async () => {
  const t = await startTestApp();
  try {
    const r = await fetch(`${t.baseUrl}/api/profile`);
    assert.equal(r.status, 401);
  } finally {
    await stopTestApp(t);
  }
});
