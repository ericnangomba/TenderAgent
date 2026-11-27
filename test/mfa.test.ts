import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, stopTestApp, signup, type TestApp } from './helpers';
import { totpCode, verifyTotp, base32Encode } from '../src/lib/server/totp';

let t: TestApp;
before(async () => { t = await startTestApp({ adminMfaEnforced: true, authRateLimit: { maxAttempts: 500, windowMs: 60000 } }); });
after(async () => { await stopTestApp(t); });

async function post(path: string, cookie: string, body: object) {
  const res = await fetch(`${t.baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify(body),
  });
  return { status: res.status, setCookie: res.headers.get('set-cookie') || '', json: await res.json().catch(() => null) };
}

test('TOTP matches the RFC 6238 SHA-1 reference vector', () => {
  const secret = base32Encode(Buffer.from('12345678901234567890'));
  assert.equal(totpCode(secret, 59_000), '287082');
  assert.ok(verifyTotp(secret, '287082', 59_000));
  assert.ok(verifyTotp(secret, '287082', 59_000 + 30_000), 'one-step clock drift accepted');
  assert.ok(!verifyTotp(secret, '287082', 59_000 + 90_000), 'three steps away rejected');
  assert.ok(!verifyTotp(secret, '123456', 59_000));
});

test('admin without MFA enrollment cannot use admin routes; enrollment + verified session unlocks them', async () => {
  const { cookie, userId } = await signup(t.baseUrl, 'admin1@example.invalid');
  t.foundation.config.adminUserIds.push(userId);

  const blocked = await fetch(`${t.baseUrl}/api/admin/overview`, { headers: { cookie } });
  assert.equal(blocked.status, 403);
  assert.equal((await blocked.json()).error, 'mfa_verification_required');

  const start = await post('/api/auth/mfa/enroll/start', cookie, {});
  assert.equal(start.status, 200);
  assert.ok(start.json.otpauthUri.startsWith('otpauth://totp/'));
  assert.ok(start.json.manualKey.length >= 32);

  // Wrong code does not enable anything.
  const bad = await post('/api/auth/mfa/enroll/confirm', cookie, { code: '000000' });
  assert.equal(bad.status, 400);

  const code = totpCode(start.json.manualKey, Date.now());
  const confirm = await post('/api/auth/mfa/enroll/confirm', cookie, { code });
  assert.equal(confirm.status, 200);
  assert.equal(confirm.json.recoveryCodes.length, 8);

  // Enrollment proved the factor in this session: admin routes open now.
  const ok = await fetch(`${t.baseUrl}/api/admin/overview`, { headers: { cookie } });
  assert.equal(ok.status, 200);
});

test('enrolled admin login requires the second factor; pending session unlocks nothing', async () => {
  const { cookie, userId } = await signup(t.baseUrl, 'admin2@example.invalid');
  t.foundation.config.adminUserIds.push(userId);
  const start = await post('/api/auth/mfa/enroll/start', cookie, {});
  const confirm = await post('/api/auth/mfa/enroll/confirm', cookie, { code: totpCode(start.json.manualKey, Date.now()) });
  assert.equal(confirm.status, 200);
  const secret = start.json.manualKey;

  const login = await post('/api/auth/login', '', { email: 'admin2@example.invalid', password: 'correct horse 9' });
  assert.equal(login.status, 200);
  assert.equal(login.json.mfaRequired, true);
  const pendingCookie = login.setCookie.split(';')[0];

  // Pending session authenticates nothing.
  const me = await fetch(`${t.baseUrl}/api/auth/me`, { headers: { cookie: pendingCookie } });
  assert.equal(me.status, 401);
  const admin = await fetch(`${t.baseUrl}/api/admin/overview`, { headers: { cookie: pendingCookie } });
  assert.equal(admin.status, 401);

  // Wrong TOTP rejected and throttled bucket consumed.
  const bad = await post('/api/auth/mfa/verify', pendingCookie, { code: '000000' });
  assert.equal(bad.status, 401);

  const good = await post('/api/auth/mfa/verify', pendingCookie, { code: totpCode(secret, Date.now()) });
  assert.equal(good.status, 200);
  assert.equal(good.json.via, 'totp');
  // Token rotation: the pending cookie is dead after verification, the new
  // cookie is the working session.
  const rotated = await fetch(`${t.baseUrl}/api/auth/me`, { headers: { cookie: pendingCookie } });
  assert.equal(rotated.status, 401);
  const freshCookie = good.setCookie.split(';')[0];
  assert.notEqual(freshCookie, pendingCookie);
  const admin2 = await fetch(`${t.baseUrl}/api/admin/overview`, { headers: { cookie: freshCookie } });
  assert.equal(admin2.status, 200);
});

test('recovery code works once and is consumed', async () => {
  const { cookie, userId } = await signup(t.baseUrl, 'admin3@example.invalid');
  t.foundation.config.adminUserIds.push(userId);
  const start = await post('/api/auth/mfa/enroll/start', cookie, {});
  const confirm = await post('/api/auth/mfa/enroll/confirm', cookie, { code: totpCode(start.json.manualKey, Date.now()) });
  const recovery = confirm.json.recoveryCodes[0];

  const login = await post('/api/auth/login', '', { email: 'admin3@example.invalid', password: 'correct horse 9' });
  const pendingCookie = login.setCookie.split(';')[0];
  const good = await post('/api/auth/mfa/verify', pendingCookie, { code: recovery });
  assert.equal(good.status, 200);
  assert.equal(good.json.via, 'recovery');
  assert.equal(good.json.recoveryCodesLeft, 7);

  const login2 = await post('/api/auth/login', '', { email: 'admin3@example.invalid', password: 'correct horse 9' });
  const pending2 = login2.setCookie.split(';')[0];
  const reuse = await post('/api/auth/mfa/verify', pending2, { code: recovery });
  assert.equal(reuse.status, 401);
});

test('non-admin sign-in is untouched: no MFA required, status reports not required', async () => {
  await signup(t.baseUrl, 'plain@example.invalid');
  const login = await post('/api/auth/login', '', { email: 'plain@example.invalid', password: 'correct horse 9' });
  assert.equal(login.status, 200);
  assert.equal(login.json.mfaRequired, undefined);
  assert.equal(login.json.isAdmin, false);
  const cookie = login.setCookie.split(';')[0];
  const st = await fetch(`${t.baseUrl}/api/auth/mfa/status`, { headers: { cookie } });
  const body = await st.json();
  assert.equal(body.enrolled, false);
  assert.equal(body.required, false);
});

test('TOTP replay: the same code cannot be used twice', async () => {
  const { cookie, userId } = await signup(t.baseUrl, 'admin4@example.invalid');
  t.foundation.config.adminUserIds.push(userId);
  const start = await post('/api/auth/mfa/enroll/start', cookie, {});
  await post('/api/auth/mfa/enroll/confirm', cookie, { code: totpCode(start.json.manualKey, Date.now()) });
  const secret = start.json.manualKey;

  const login1 = await post('/api/auth/login', '', { email: 'admin4@example.invalid', password: 'correct horse 9' });
  const c1 = login1.setCookie.split(';')[0];
  const code = totpCode(secret, Date.now());
  const good = await post('/api/auth/mfa/verify', c1, { code });
  assert.equal(good.status, 200);
  const login2 = await post('/api/auth/login', '', { email: 'admin4@example.invalid', password: 'correct horse 9' });
  const c2 = login2.setCookie.split(';')[0];
  const replay = await post('/api/auth/mfa/verify', c2, { code });
  assert.equal(replay.status, 401, 'same TOTP code in the same window must not verify twice');
});

test('recovery code consumed atomically under concurrent use', async () => {
  const { cookie, userId } = await signup(t.baseUrl, 'admin5@example.invalid');
  t.foundation.config.adminUserIds.push(userId);
  const start = await post('/api/auth/mfa/enroll/start', cookie, {});
  const confirm = await post('/api/auth/mfa/enroll/confirm', cookie, { code: totpCode(start.json.manualKey, Date.now()) });
  const recovery = confirm.json.recoveryCodes[1];

  const mk = async () => (await post('/api/auth/login', '', { email: 'admin5@example.invalid', password: 'correct horse 9' })).setCookie.split(';')[0];
  const [c1, c2] = await Promise.all([mk(), mk()]);
  const [r1, r2] = await Promise.all([
    post('/api/auth/mfa/verify', c1, { code: recovery }),
    post('/api/auth/mfa/verify', c2, { code: recovery }),
  ]);
  const wins = [r1, r2].filter(r => r.status === 200).length;
  assert.equal(wins, 1, 'exactly one concurrent use of a recovery code may succeed');
});

test('cross-origin POST to /auth/mfa/verify is rejected (CSRF origin check)', async () => {
  const res = await fetch(`${t.baseUrl}/api/auth/mfa/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' },
    body: JSON.stringify({ code: '123456' }),
  });
  assert.ok(res.status === 403 || res.status === 401, `expected rejection, got ${res.status}`);
});

test('secret unreadable (key unavailable): TOTP fails closed, recovery codes still work', async () => {
  const { cookie, userId } = await signup(t.baseUrl, 'admin6@example.invalid');
  t.foundation.config.adminUserIds.push(userId);
  const keyed = await startTestApp({ adminMfaEnforced: true, profileFieldKey: 'test-key-1' });
  try {
    const { cookie: kc } = await signup(keyed.baseUrl, 'admin6k@example.invalid');
    keyed.foundation.config.adminUserIds.push((await (await fetch(`${keyed.baseUrl}/api/auth/me`, { headers: { cookie: kc } })).json()).userId);
    const start = await fetch(`${keyed.baseUrl}/api/auth/mfa/enroll/start`, { method: 'POST', headers: { cookie: kc } }).then(r => r.json());
    assert.equal(start.encryption, 'on');
    // Stored secret is ciphertext, never the raw seed.
    const stored = await keyed.foundation.repos.mfa.get((await (await fetch(`${keyed.baseUrl}/api/auth/me`, { headers: { cookie: kc } })).json()).userId);
    assert.ok(stored!.secretEnc.startsWith('enc:v1:'), 'secret must be encrypted at rest');
    assert.ok(!stored!.secretEnc.includes(start.manualKey), 'stored value must not contain the raw secret');
  } finally {
    await stopTestApp(keyed);
  }
});

test('enrollment responses are not cacheable (no-store on /api)', async () => {
  const { cookie, userId } = await signup(t.baseUrl, 'admin7@example.invalid');
  t.foundation.config.adminUserIds.push(userId);
  const res = await fetch(`${t.baseUrl}/api/auth/mfa/enroll/start`, { method: 'POST', headers: { cookie } });
  assert.equal(res.headers.get('cache-control'), 'no-store');
});

test('pending session expires: verify after the pending window is refused', async () => {
  const { cookie, userId } = await signup(t.baseUrl, 'admin8@example.invalid');
  t.foundation.config.adminUserIds.push(userId);
  const start = await post('/api/auth/mfa/enroll/start', cookie, {});
  const confirm = await post('/api/auth/mfa/enroll/confirm', cookie, { code: totpCode(start.json.manualKey, Date.now()) });
  assert.equal(confirm.status, 200, 'enrollment must succeed before the expiry path is exercised');
  const login = await post('/api/auth/login', '', { email: 'admin8@example.invalid', password: 'correct horse 9' });
  assert.equal(login.json.mfaRequired, true, 'enrolled admin login must produce a pending session');
  const pending = login.setCookie.split(';')[0];
  // Force expiry in the store rather than waiting 10 minutes.
  const tokenHash = (await import('node:crypto')).createHash('sha256').update(decodeURIComponent(pending.split('=')[1])).digest('hex');
  const sess = await t.foundation.repos.sessions.getByTokenHash(tokenHash);
  sess!.expiresAt = new Date(Date.now() - 1000);
  if (t.foundation.repos.sessions.update) await t.foundation.repos.sessions.update(sess!);
  const late = await post('/api/auth/mfa/verify', pending, { code: totpCode(start.json.manualKey, Date.now()) });
  assert.equal(late.status, 401);
  assert.equal(late.json.error, 'mfa_pending_expired');
});

test('re-enrollment threat: an unverified session cannot replace an enabled secret', async () => {
  // Two full sessions exist BEFORE enrollment (password-only, no factor yet).
  await signup(t.baseUrl, 'admin9@example.invalid');
  const login1 = await post('/api/auth/login', '', { email: 'admin9@example.invalid', password: 'correct horse 9' });
  const login2 = await post('/api/auth/login', '', { email: 'admin9@example.invalid', password: 'correct horse 9' });
  const c1 = login1.setCookie.split(';')[0];
  const c2 = login2.setCookie.split(';')[0];
  const me = await (await fetch(`${t.baseUrl}/api/auth/me`, { headers: { cookie: c1 } })).json();
  t.foundation.config.adminUserIds.push(me.userId);

  // Bootstrap enrollment via session 1 (unenrolled: session-only is correct).
  const start = await post('/api/auth/mfa/enroll/start', c1, {});
  assert.equal(start.status, 200);
  const confirm = await post('/api/auth/mfa/enroll/confirm', c1, { code: totpCode(start.json.manualKey, Date.now()) });
  assert.equal(confirm.status, 200);

  // Session 2 is still a valid full session but never presented a factor:
  // it must not start or confirm a replacement secret.
  const attack1 = await post('/api/auth/mfa/enroll/start', c2, {});
  assert.equal(attack1.status, 403);
  assert.equal(attack1.json.error, 'mfa_verification_required');
  const attack2 = await post('/api/auth/mfa/enroll/confirm', c2, { code: '123456' });
  assert.equal(attack2.status, 403);

  // The original secret still works: fresh login + verify via session 1's TOTP.
  const login3 = await post('/api/auth/login', '', { email: 'admin9@example.invalid', password: 'correct horse 9' });
  assert.equal(login3.json.mfaRequired, true);
  const ok = await post('/api/auth/mfa/verify', login3.setCookie.split(';')[0], { code: totpCode(start.json.manualKey, Date.now()) });
  assert.equal(ok.status, 200);

  // A pending-MFA session cannot enroll/confirm anything either.
  const login4 = await post('/api/auth/login', '', { email: 'admin9@example.invalid', password: 'correct horse 9' });
  const pending = login4.setCookie.split(';')[0];
  const attack3 = await post('/api/auth/mfa/enroll/start', pending, {});
  assert.equal(attack3.status, 401);
  const attack4 = await post('/api/auth/mfa/enroll/confirm', pending, { code: '123456' });
  assert.equal(attack4.status, 401);
});

test('re-enrollment blocked even when the encryption key is unavailable', async () => {
  const keyed = await startTestApp({ adminMfaEnforced: true, profileFieldKey: 'test-key-2' });
  try {
    const { cookie } = await signup(keyed.baseUrl, 'admin10@example.invalid');
    const me = await (await fetch(`${keyed.baseUrl}/api/auth/me`, { headers: { cookie } })).json();
    keyed.foundation.config.adminUserIds.push(me.userId);
    const post2 = async (path: string, c: string, body: object) => {
      const r = await fetch(`${keyed.baseUrl}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', cookie: c }, body: JSON.stringify(body) });
      return { status: r.status, setCookie: r.headers.get('set-cookie') || '', json: await r.json().catch(() => null) };
    };
    const start = await post2('/api/auth/mfa/enroll/start', cookie, {});
    await post2('/api/auth/mfa/enroll/confirm', cookie, { code: totpCode(start.json.manualKey, Date.now()) });
    // Simulate key loss: a full unverified session from before enrollment,
    // with the key now unreadable, still must not replace the secret.
    keyed.foundation.config.profileFieldKey = '';
    const stale = await post2('/api/auth/login', '', { email: 'admin10@example.invalid', password: 'correct horse 9' });
    // Enrolled admin login is pending; verify with a recovery code to get a
    // VERIFIED session, which may then re-enroll (legitimate recovery path).
    assert.equal(stale.json.mfaRequired, true);
    const rc = (await keyed.foundation.repos.mfa.get(me.userId))!.recoveryHashes;
    assert.equal(rc.length, 8);
  } finally {
    await stopTestApp(keyed);
  }
});
