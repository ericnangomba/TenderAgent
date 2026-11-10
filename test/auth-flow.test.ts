import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, stopTestApp, signup, type TestApp } from './helpers';

let t: TestApp;
before(async () => { t = await startTestApp(); });
after(async () => { await stopTestApp(t); });

test('signup creates account, sets cookie, /auth/me works', async () => {
  const { cookie, tenantId } = await signup(t.baseUrl, 'alice@example.com');
  assert.ok(cookie.startsWith('ta_session='));
  assert.ok(tenantId);
  const me = await fetch(`${t.baseUrl}/api/auth/me`, { headers: { cookie } });
  assert.equal(me.status, 200);
  const body = await me.json();
  assert.equal(body.email, 'alice@example.com');
  assert.equal(body.tenantId, tenantId);
});

test('signup rejects bad email and short password', async () => {
  const bad1 = await fetch(`${t.baseUrl}/api/auth/signup`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'not-an-email', password: 'correct horse 9' }),
  });
  assert.equal(bad1.status, 400);
  const bad2 = await fetch(`${t.baseUrl}/api/auth/signup`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'bob@example.com', password: 'short' }),
  });
  assert.equal(bad2.status, 400);
});

test('duplicate email rejected with 409', async () => {
  await signup(t.baseUrl, 'carol@example.com');
  const dup = await fetch(`${t.baseUrl}/api/auth/signup`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'Carol@Example.com', password: 'correct horse 9' }),
  });
  assert.equal(dup.status, 409);
});

test('login success and failure; failure response identical either way', async () => {
  await signup(t.baseUrl, 'dave@example.com', 'dave password 1');
  const ok = await fetch(`${t.baseUrl}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'dave@example.com', password: 'dave password 1' }),
  });
  assert.equal(ok.status, 200);
  const wrongPass = await fetch(`${t.baseUrl}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'dave@example.com', password: 'dave password 2' }),
  });
  const unknownEmail = await fetch(`${t.baseUrl}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'nobody@example.com', password: 'dave password 1' }),
  });
  assert.equal(wrongPass.status, 401);
  assert.equal(unknownEmail.status, 401);
  assert.deepEqual(await wrongPass.json(), await unknownEmail.json());
});

test('logout invalidates the session; tampered token never authenticates', async () => {
  const { cookie } = await signup(t.baseUrl, 'erin@example.com');
  const out = await fetch(`${t.baseUrl}/api/auth/logout`, { method: 'POST', headers: { cookie } });
  assert.equal(out.status, 200);
  const meAfter = await fetch(`${t.baseUrl}/api/auth/me`, { headers: { cookie } });
  assert.equal(meAfter.status, 401);
  const tampered = await fetch(`${t.baseUrl}/api/auth/me`, { headers: { cookie: 'ta_session=forged-token-value' } });
  assert.equal(tampered.status, 401);
});
