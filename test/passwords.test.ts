import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword } from '../src/lib/server/passwords';

test('hash/verify roundtrip', async () => {
  const stored = await hashPassword('my secret password');
  assert.ok(stored.startsWith('scrypt$16384$8$1$'));
  assert.equal(await verifyPassword('my secret password', stored), true);
});

test('wrong password rejected', async () => {
  const stored = await hashPassword('my secret password');
  assert.equal(await verifyPassword('my secret passwore', stored), false);
});

test('same password produces different salts', async () => {
  assert.notEqual(await hashPassword('same password here'), await hashPassword('same password here'));
});

test('malformed stored hashes rejected without throwing', async () => {
  for (const bad of ['', 'plaintext', 'scrypt$abc', 'bcrypt$2b$10$xxxx', 'scrypt$0$0$0$!!$??']) {
    assert.equal(await verifyPassword('anything at all', bad), false);
  }
});
