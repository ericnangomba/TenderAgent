/**
 * Admin (operator) access: ADMIN_USER_IDS gates the technical surface.
 * No first-user or email-based privilege: membership is by server-generated
 * user ID, default empty means nobody is admin.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, stopTestApp, signup } from './helpers';

test('admin overview: signed-out 401, non-admin 403, operator gets aggregates', async () => {
  const app = await startTestApp();
  try {
    const plain = await signup(app.baseUrl, 'plain@example.com');
    const operator = await signup(app.baseUrl, 'operator@example.com');
    // Operator grant happens in the deployment environment; the config object
    // is read per-request, so adding the ID here mirrors an env change.
    app.foundation.config.adminUserIds.push(operator.userId);

    const anon = await fetch(`${app.baseUrl}/api/admin/overview`);
    assert.equal(anon.status, 401);

    const forbidden = await fetch(`${app.baseUrl}/api/admin/overview`, {
      headers: { cookie: plain.cookie },
    });
    assert.equal(forbidden.status, 403);
    assert.equal((await forbidden.json()).error, 'admin_required');

    const ok = await fetch(`${app.baseUrl}/api/admin/overview`, {
      headers: { cookie: operator.cookie },
    });
    assert.equal(ok.status, 200);
    const body = await ok.json();
    assert.equal(body.success, true);
    assert.equal(body.overview.tenants, 2);
    assert.equal(body.overview.users, 2);
    assert.deepEqual(body.overview.entitlementsByStatus, {});
    assert.deepEqual(body.overview.usage, { analyses: 0, serpapiLookups: 0 });
    // Aggregate-only contract: no per-tenant identifiers or emails leak.
    const raw = JSON.stringify(body);
    assert.equal(raw.includes('plain@example.com'), false);
    assert.equal(raw.includes(plain.tenantId), false);
  } finally {
    await stopTestApp(app);
  }
});

test('/auth/me reports isAdmin from server-side membership, not client claims', async () => {
  const app = await startTestApp();
  try {
    const admin = await signup(app.baseUrl, 'boss@example.com');
    const plain = await signup(app.baseUrl, 'staff@example.com');
    app.foundation.config.adminUserIds.push(admin.userId);

    const meAdmin = await (await fetch(`${app.baseUrl}/api/auth/me`, { headers: { cookie: admin.cookie } })).json();
    assert.equal(meAdmin.isAdmin, true);
    assert.equal(typeof meAdmin.userId, 'string');

    const mePlain = await (await fetch(`${app.baseUrl}/api/auth/me`, { headers: { cookie: plain.cookie } })).json();
    assert.equal(mePlain.isAdmin, false);
  } finally {
    await stopTestApp(app);
  }
});

test('default config (no ADMIN_USER_IDS) means no account is admin', async () => {
  const app = await startTestApp();
  try {
    const first = await signup(app.baseUrl, 'first@example.com');
    const me = await (await fetch(`${app.baseUrl}/api/auth/me`, { headers: { cookie: first.cookie } })).json();
    assert.equal(me.isAdmin, false);
    const res = await fetch(`${app.baseUrl}/api/admin/overview`, { headers: { cookie: first.cookie } });
    assert.equal(res.status, 403);
  } finally {
    await stopTestApp(app);
  }
});
