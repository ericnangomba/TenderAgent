/**
 * Field-level encryption for sensitive profile values at rest (AES-256-GCM).
 *
 * The key comes from the PROFILE_FIELD_KEY deployment variable and is
 * derived with SHA-256. Encrypted values are stored as
 * `enc:v1:<iv>:<tag>:<ciphertext>` (base64 parts). Values without the prefix
 * are read as legacy plaintext so existing rows keep working and are
 * encrypted on their next write. An encrypted value that cannot be decrypted
 * under the configured key (key missing, wrong key, corruption) reads as
 * empty - ciphertext is never exposed as if it were the value - and the
 * profile write route preserves the stored ciphertext across unrelated edits
 * so a lost key does not silently destroy the data (see server.ts). When no
 * key is configured, plaintext values pass through unchanged and /api/health
 * reports the feature as off - the honest signal that sensitive fields are
 * stored unencrypted.
 */
import { createHash, randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';

const PREFIX = 'enc:v1:';
const SENSITIVE_FIELDS = ['taxComplianceStatusPin'] as const;

function deriveKey(raw: string): Buffer {
  return createHash('sha256').update(raw, 'utf8').digest();
}

export function fieldEncryptionEnabled(key: string | undefined): boolean {
  return Boolean(key && key.trim().length > 0);
}

export function encryptField(key: string, value: unknown): unknown {
  if (typeof value !== 'string' || value === '' || value.startsWith(PREFIX) || !fieldEncryptionEnabled(key)) {
    return value;
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', deriveKey(key), iv);
  const ct = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + [iv.toString('base64'), tag.toString('base64'), ct.toString('base64')].join(':');
}

export function isEncryptedValue(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(PREFIX);
}

export function decryptField(key: string, value: unknown): unknown {
  if (!isEncryptedValue(value)) {
    return value;
  }
  if (!fieldEncryptionEnabled(key)) {
    // Encrypted value but no key configured: never serve ciphertext as data.
    return '';
  }
  try {
    const [ivB64, tagB64, ctB64] = value.slice(PREFIX.length).split(':');
    const decipher = createDecipheriv('aes-256-gcm', deriveKey(key), Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    // Undecryptable value (wrong key, corruption): read as absent rather than
    // returning ciphertext that a client could treat (and re-save) as the PIN.
    return '';
  }
}

/** Encrypt the sensitive fields of a profile object in place-safe fashion. */
export function encryptProfileFields<T extends Record<string, any>>(key: string, profile: T): T {
  if (!fieldEncryptionEnabled(key) || !profile) return profile;
  const out: Record<string, any> = { ...profile };
  for (const f of SENSITIVE_FIELDS) out[f] = encryptField(key, out[f]);
  return out as T;
}

/** Decrypt the sensitive fields of a profile object (legacy plaintext passes through). */
export function decryptProfileFields<T extends Record<string, any>>(key: string, profile: T): T {
  if (!profile) return profile;
  const out: Record<string, any> = { ...profile };
  for (const f of SENSITIVE_FIELDS) out[f] = decryptField(key, out[f]);
  return out as T;
}

/** API view: no ciphertext, plus an explicit status for unreadable protected data. */
export function profileForClient(key: string, stored: Record<string, any>): Record<string, any> {
  const view = decryptProfileFields(key, stored);
  view.taxComplianceStatusPinUnavailable = isEncryptedValue(stored.taxComplianceStatusPin) && view.taxComplianceStatusPin === '';
  return view;
}

/** Separate the storage shape from the API view, preserving unreadable data. */
export function prepareProfileSave(key: string, stored: Record<string, any>, input: Record<string, any>): Record<string, any> {
  const decoded = decryptProfileFields(key, stored);
  const unreadable = isEncryptedValue(stored.taxComplianceStatusPin) && decoded.taxComplianceStatusPin === '';
  const merged = { ...decoded, ...input };
  delete merged.taxComplianceStatusPinUnavailable;
  const incoming = input.taxComplianceStatusPin;
  // Ciphertext is storage-only, never valid user input.
  if (isEncryptedValue(incoming)) throw new Error('Enter a new PIN, not an encrypted value.');
  if (unreadable) {
    if (typeof incoming !== 'string' || incoming.trim() === '') {
      merged.taxComplianceStatusPin = stored.taxComplianceStatusPin;
    } else if (!fieldEncryptionEnabled(key)) {
      throw new Error('PIN protection key is unavailable. Your saved PIN was not changed. Contact the operator before replacing it.');
    }
  }
  return encryptProfileFields(key, merged);
}
