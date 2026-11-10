/** Self-serve data deletion: profile erasure and tenant-scoped draft deletion. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, stopTestApp, signup } from './helpers';

test('DELETE /api/profile requires auth and erases only the caller profile', async () => {
  const app = await startTestApp();
  try {
    const anon = await fetch(`${app.baseUrl}/api/profile`, { method: 'DELETE' });
    assert.equal(anon.status, 401);

    const a = await signup(app.baseUrl, 'a@example.co.za');
    const b = await signup(app.baseUrl, 'b@example.co.za');
    for (const u of [a, b]) {
      const res = await fetch(`${app.baseUrl}/api/profile`, {
        method: 'POST', headers: { 'content-type': 'application/json', cookie: u.cookie },
        body: JSON.stringify({ companyName: `Co-${u.tenantId}`, taxComplianceStatusPin: 'pin-1' }),
      });
      assert.equal(res.status, 200);
    }

    const del = await fetch(`${app.baseUrl}/api/profile`, { method: 'DELETE', headers: { cookie: a.cookie } });
    assert.equal(del.status, 200);

    const afterA = await fetch(`${app.baseUrl}/api/profile`, { headers: { cookie: a.cookie } });
    assert.deepEqual((await afterA.json()).profile, {});
    const afterB = await fetch(`${app.baseUrl}/api/profile`, { headers: { cookie: b.cookie } });
    assert.equal((await afterB.json()).profile.companyName, `Co-${b.tenantId}`);
  } finally {
    await stopTestApp(app);
  }
});

test('sensitive profile fields are encrypted at rest when a key is configured', async () => {
  const app = await startTestApp({ profileFieldKey: 'test-profile-key' });
  try {
    const u = await signup(app.baseUrl, 'enc@example.co.za');
    const save = await fetch(`${app.baseUrl}/api/profile`, {
      method: 'POST', headers: { 'content-type': 'application/json', cookie: u.cookie },
      body: JSON.stringify({ taxComplianceStatusPin: 'secret-pin-123', companyName: 'Enc Co' }),
    });
    assert.equal(save.status, 200);

    // At rest (repo layer) the PIN must not be readable...
    const stored = await app.foundation.repos.profiles.get(u.tenantId);
    assert.ok(String((stored!.profile as any).taxComplianceStatusPin).startsWith('enc:v1:'));
    assert.ok(!JSON.stringify(stored!.profile).includes('secret-pin-123'));
    // ...while the API read returns the decrypted value.
    const read = await fetch(`${app.baseUrl}/api/profile`, { headers: { cookie: u.cookie } });
    assert.equal((await read.json()).profile.taxComplianceStatusPin, 'secret-pin-123');
  } finally {
    await stopTestApp(app);
  }
});

test('unreadable stored PIN: masked on read, preserved across unrelated saves, replaced only by a new PIN', async () => {
  const app = await startTestApp({ profileFieldKey: 'key-one' });
  try {
    const u = await signup(app.baseUrl, 'wrongkey@example.co.za');
    await fetch(`${app.baseUrl}/api/profile`, {
      method: 'POST', headers: { 'content-type': 'application/json', cookie: u.cookie },
      body: JSON.stringify({ taxComplianceStatusPin: 'secret-pin-123', companyName: 'Enc Co' }),
    });
    const before = String((await app.foundation.repos.profiles.get(u.tenantId))!.profile.taxComplianceStatusPin);
    assert.ok(before.startsWith('enc:v1:'));

    // Operator restarts with the wrong key (lost-key failure mode).
    (app.foundation.config as any).profileFieldKey = 'key-two';

    // Read masks the value - ciphertext is never presented as the PIN.
    const masked = await fetch(`${app.baseUrl}/api/profile`, { headers: { cookie: u.cookie } });
    assert.equal((await masked.json()).profile.taxComplianceStatusPin, '');

    // An unrelated profile save must not destroy the stored ciphertext.
    const unrelated = await fetch(`${app.baseUrl}/api/profile`, {
      method: 'POST', headers: { 'content-type': 'application/json', cookie: u.cookie },
      body: JSON.stringify({ companyName: 'Enc Co Renamed' }),
    });
    assert.equal(unrelated.status, 200);
    const after = await app.foundation.repos.profiles.get(u.tenantId);
    assert.equal(after!.profile.taxComplianceStatusPin, before);
    assert.equal(after!.profile.companyName, 'Enc Co Renamed');

    // Restoring the correct key recovers the value - data survived.
    (app.foundation.config as any).profileFieldKey = 'key-one';
    const recovered = await fetch(`${app.baseUrl}/api/profile`, { headers: { cookie: u.cookie } });
    assert.equal((await recovered.json()).profile.taxComplianceStatusPin, 'secret-pin-123');

    // While unreadable, a brand-new PIN typed by the user replaces the old ciphertext.
    (app.foundation.config as any).profileFieldKey = 'key-two';
    await fetch(`${app.baseUrl}/api/profile`, {
      method: 'POST', headers: { 'content-type': 'application/json', cookie: u.cookie },
      body: JSON.stringify({ taxComplianceStatusPin: 'fresh-pin-456' }),
    });
    const readNew = await fetch(`${app.baseUrl}/api/profile`, { headers: { cookie: u.cookie } });
    assert.equal((await readNew.json()).profile.taxComplianceStatusPin, 'fresh-pin-456');
    const storedNew = String((await app.foundation.repos.profiles.get(u.tenantId))!.profile.taxComplianceStatusPin);
    assert.ok(storedNew.startsWith('enc:v1:') && !storedNew.includes('fresh-pin-456'));
  } finally {
    await stopTestApp(app);
  }
});

test('DELETE /api/applications/:id is tenant-scoped', async () => {
  const app = await startTestApp();
  try {
    const a = await signup(app.baseUrl, 'draft-a@example.co.za');
    const b = await signup(app.baseUrl, 'draft-b@example.co.za');
    const create = await fetch(`${app.baseUrl}/api/applications`, {
      method: 'POST', headers: { 'content-type': 'application/json', cookie: a.cookie },
      body: JSON.stringify({ tenderRef: 'RT57-2026-ICT', title: 'A draft' }),
    });
    assert.equal(create.status, 200);
    const id = (await create.json()).application.id;

    // Another tenant gets a plain 404 - existence is not revealed.
    const cross = await fetch(`${app.baseUrl}/api/applications/${id}`, { method: 'DELETE', headers: { cookie: b.cookie } });
    assert.equal(cross.status, 404);

    const own = await fetch(`${app.baseUrl}/api/applications/${id}`, { method: 'DELETE', headers: { cookie: a.cookie } });
    assert.equal(own.status, 200);
    const gone = await fetch(`${app.baseUrl}/api/applications/${id}`, { headers: { cookie: a.cookie } });
    assert.equal(gone.status, 404);
  } finally {
    await stopTestApp(app);
  }
});

for (const failingKey of ['', 'wrong-key']) {
  test(`PIN failure (${failingKey || 'missing key'}): GET and POST mask, preserve and signal; no-key replacement refuses downgrade`, async () => {
    const app = await startTestApp({ profileFieldKey: 'original-key' });
    try {
      const u = await signup(app.baseUrl, 'failure@example.co.za');
      const headers = { 'content-type': 'application/json', cookie: u.cookie };
      await fetch(`${app.baseUrl}/api/profile`, { method: 'POST', headers, body: JSON.stringify({ taxComplianceStatusPin: 'private-pin' }) });
      const before = (await app.foundation.repos.profiles.get(u.tenantId))!.profile.taxComplianceStatusPin;
      app.foundation.config.profileFieldKey = failingKey;
      const get = await (await fetch(`${app.baseUrl}/api/profile`, { headers })).json();
      assert.equal(get.profile.taxComplianceStatusPin, '');
      assert.equal(get.profile.taxComplianceStatusPinUnavailable, true);
      for (const pinInput of [undefined, '']) {
        const response = await fetch(`${app.baseUrl}/api/profile`, { method: 'POST', headers,
          body: JSON.stringify({ companyName: 'Renamed', taxComplianceStatusPin: pinInput, taxComplianceStatusPinUnavailable: true }) });
        assert.equal(response.status, 200);
        const body = await response.json();
        assert.equal(body.profile.taxComplianceStatusPin, '');
        assert.equal(body.profile.taxComplianceStatusPinUnavailable, true);
        const stored = (await app.foundation.repos.profiles.get(u.tenantId))!.profile;
        assert.equal(stored.taxComplianceStatusPin, before);
        assert.equal(stored.taxComplianceStatusPinUnavailable, undefined);
      }
      const blobInput = await fetch(`${app.baseUrl}/api/profile`, { method: 'POST', headers,
        body: JSON.stringify({ taxComplianceStatusPin: before }) });
      assert.equal(blobInput.status, 400);
      if (!failingKey) {
        const replace = await fetch(`${app.baseUrl}/api/profile`, { method: 'POST', headers,
          body: JSON.stringify({ taxComplianceStatusPin: 'new-pin' }) });
        assert.equal(replace.status, 400);
        assert.equal((await app.foundation.repos.profiles.get(u.tenantId))!.profile.taxComplianceStatusPin, before);
      }
      app.foundation.config.profileFieldKey = 'original-key';
      const recovered = await (await fetch(`${app.baseUrl}/api/profile`, { headers })).json();
      assert.equal(recovered.profile.taxComplianceStatusPin, 'private-pin');
      assert.equal(recovered.profile.taxComplianceStatusPinUnavailable, false);
    } finally { await stopTestApp(app); }
  });
}
