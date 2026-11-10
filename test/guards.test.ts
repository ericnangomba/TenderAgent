import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, stopTestApp, signup, signWebhook, type TestApp } from './helpers';

let t: TestApp;
before(async () => { t = await startTestApp(); });
after(async () => { await stopTestApp(t); });

async function activate(tenantId: string, eventId: string) {
  const { body, signature } = signWebhook({
    eventId, type: 'subscription.activated', tenantId,
    planId: 'standard_monthly', subscriptionRef: `sub_${eventId}`,
    periodEnd: '2027-12-31T00:00:00Z', occurredAt: '2026-11-10T10:00:00Z',
  });
  return fetch(`${t.baseUrl}/api/billing/webhook/mock`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-billing-signature': signature }, body,
  });
}

test('unguarded demo mode off: unauthenticated spend route gets 401', async () => {
  const res = await fetch(`${t.baseUrl}/api/analyze`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rawText: 'x' }),
  });
  assert.equal(res.status, 401);
  assert.equal((await res.json()).error, 'authentication_required');
});

test('authenticated tenant without subscription gets 402 on spend routes', async () => {
  const { cookie } = await signup(t.baseUrl, 'nosub@example.com');
  const res = await fetch(`${t.baseUrl}/api/analyze`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify({ rawText: 'x' }),
  });
  assert.equal(res.status, 402);
  assert.equal((await res.json()).error, 'no_subscription');
  const scrape = await fetch(`${t.baseUrl}/api/scrape`, { headers: { cookie } });
  assert.equal(scrape.status, 402);
});

test('webhook: bad signature rejected, unknown provider 404, valid activation opens access', async () => {
  const { cookie, tenantId } = await signup(t.baseUrl, 'sub@example.com');

  const bad = await fetch(`${t.baseUrl}/api/billing/webhook/mock`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-billing-signature': 'sha256=deadbeef' },
    body: JSON.stringify({ eventId: 'x', type: 'subscription.activated', tenantId }),
  });
  assert.equal(bad.status, 401);

  const unknown = await fetch(`${t.baseUrl}/api/billing/webhook/paystack`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
  });
  assert.equal(unknown.status, 404);

  const ok = await activate(tenantId, 'evt-live-1');
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { success: true, applied: true });

  const analyze = await fetch(`${t.baseUrl}/api/analyze`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify({ rawText: 'x' }),
  });
  assert.equal(analyze.status, 200);

  // Same event delivered again (provider retry) must be idempotent.
  const replay = await activate(tenantId, 'evt-live-1');
  assert.deepEqual(await replay.json(), { success: true, applied: false, reason: 'duplicate' });
});

test('usage increments per request and per tenant; account endpoint reports it', async () => {
  const { cookie, tenantId } = await signup(t.baseUrl, 'usage@example.com');
  await activate(tenantId, 'evt-usage-1');
  for (let i = 0; i < 3; i++) {
    await fetch(`${t.baseUrl}/api/analyze`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify({ rawText: 'x' }),
    });
  }
  const account = await fetch(`${t.baseUrl}/api/account`, { headers: { cookie } });
  const body = await account.json();
  assert.equal(body.account.entitlement.effectiveStatus, 'active');
  assert.equal(body.account.usage.analyses, 3);
  assert.equal(body.account.usage.serpapiLookups, 0);
  // No public plan catalog or pricing on the API - provisional config only.
  assert.equal('plans' in body.account, false);
  assert.deepEqual(body.account.allowances, { includedAnalyses: 60, includedSerpapiLookups: 30 });
});

test('parse-document needs an account but no subscription (no external cost)', async () => {
  const anon = await fetch(`${t.baseUrl}/api/parse-document`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rawText: 'x' }),
  });
  assert.equal(anon.status, 401);
  const { cookie } = await signup(t.baseUrl, 'parse@example.com');
  const authed = await fetch(`${t.baseUrl}/api/parse-document`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify({ rawText: 'x' }),
  });
  assert.equal(authed.status, 200);
});

test('authRequired=false keeps the demo fully open (current behavior preserved)', async () => {
  const open = await startTestApp({ authRequired: false });
  try {
    const res = await fetch(`${open.baseUrl}/api/analyze`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rawText: 'x' }),
    });
    assert.equal(res.status, 200);
  } finally {
    await stopTestApp(open);
  }
});
