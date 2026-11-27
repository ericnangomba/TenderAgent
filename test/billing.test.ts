import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, stopTestApp, signup } from './helpers';
test('checkout init: POST /billing/subscribe fails closed without Paystack config, 401 unauthenticated, 409 when active', async () => {
  // No Paystack config -> 503 before any provider call.
  const noCfg = await startTestApp({ authRateLimit: { maxAttempts: 500, windowMs: 60000 } });
  try {
    const { cookie } = await signup(noCfg.baseUrl, 'sub-nocfg@example.invalid');
    const res = await fetch(`${noCfg.baseUrl}/api/billing/subscribe`, { method: 'POST', headers: { cookie } });
    assert.equal(res.status, 503);
    assert.equal((await res.json()).error, 'payments_not_configured');
    const anon = await fetch(`${noCfg.baseUrl}/api/billing/subscribe`, { method: 'POST' });
    assert.equal(anon.status, 401);
  } finally { await stopTestApp(noCfg); }

  // Configured but already active -> 409, no network call.
  const cfg = await startTestApp({ paystackSecretKey: 'sk_test_synthetic', paystackPlanCode: 'PLN_synthetic', authRateLimit: { maxAttempts: 500, windowMs: 60000 } });
  try {
    const { cookie, tenantId } = await signup(cfg.baseUrl, 'sub-active@example.invalid');
    const now = new Date();
    await cfg.foundation.repos.entitlements.put({ tenantId, planId: 'PLN_synthetic', status: 'active', currentPeriodEnd: new Date(now.getTime() + 30 * 864e5), cancelAtPeriodEnd: false, providerName: 'paystack', providerSubscriptionRef: 'SUB_synthetic', refundedAt: null, lastEventAt: now, lastEventId: 'synthetic:1', updatedAt: now });
    const res = await fetch(`${cfg.baseUrl}/api/billing/subscribe`, { method: 'POST', headers: { cookie } });
    assert.equal(res.status, 409);
    assert.equal((await res.json()).error, 'already_subscribed');
  } finally { await stopTestApp(cfg); }
});
