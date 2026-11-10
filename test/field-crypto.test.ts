/** Field-level encryption for sensitive profile values at rest. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encryptField, decryptField, encryptProfileFields, decryptProfileFields, fieldEncryptionEnabled } from '../src/lib/server/fieldCrypto';

const KEY = 'test-key-material-for-field-crypto';

test('round-trip encrypts and decrypts a sensitive value', () => {
  const enc = encryptField(KEY, 'TCS-PIN-12345') as string;
  assert.ok(enc.startsWith('enc:v1:'));
  assert.ok(!enc.includes('TCS-PIN-12345'));
  assert.equal(decryptField(KEY, enc), 'TCS-PIN-12345');
});

test('encryption is randomized (different ciphertext per call)', () => {
  const a = encryptField(KEY, 'same-value');
  const b = encryptField(KEY, 'same-value');
  assert.notEqual(a, b);
});

test('legacy plaintext passes through decrypt unchanged', () => {
  assert.equal(decryptField(KEY, 'plain-legacy-pin'), 'plain-legacy-pin');
});

test('no key configured: plaintext passes through, ciphertext reads as empty', () => {
  assert.equal(fieldEncryptionEnabled(''), false);
  assert.equal(encryptField('', 'pin'), 'pin');
  // An encrypted value with no key to read it must never be served as data.
  assert.equal(decryptField('', 'enc:v1:whatever'), '');
});

test('wrong key reads as absent, never returns ciphertext as the value', () => {
  const enc = encryptField(KEY, 'pin-1') as string;
  const read = decryptField('a-different-key', enc);
  assert.equal(read, '');
  assert.ok(!String(read).startsWith('enc:v1:'));
  // The stored ciphertext itself is untouched - only the read is masked.
  assert.ok(enc.startsWith('enc:v1:'));
});

test('corrupt ciphertext reads as absent without throwing', () => {
  assert.equal(decryptField(KEY, 'enc:v1:not-base64!!!'), '');
});

test('profile helpers touch only the sensitive fields', () => {
  const profile = { companyName: 'Acme (Pty) Ltd', taxComplianceStatusPin: 'pin-999', csdNumber: 'MAAA123' };
  const enc = encryptProfileFields(KEY, profile);
  assert.equal(enc.companyName, 'Acme (Pty) Ltd');
  assert.equal(enc.csdNumber, 'MAAA123');
  assert.ok(String(enc.taxComplianceStatusPin).startsWith('enc:v1:'));
  const dec = decryptProfileFields(KEY, enc);
  assert.deepEqual(dec, profile);
});
