/**
 * Admin MFA (TOTP) service: enrollment, confirmation with recovery codes,
 * and second-factor verification. Enforcement policy ("admins must use MFA")
 * lives in auth.ts / foundation.ts; this module only manages the state.
 *
 * Storage rules: the TOTP secret is encrypted with PROFILE_FIELD_KEY
 * (AES-256-GCM) whenever that key is configured; recovery codes are stored
 * as SHA-256 hashes only and each is consumed on use.
 */
import { createHash, randomBytes } from 'node:crypto';
import type { FoundationRepos, MfaRecord } from './repos/types';
import { encryptField, decryptField, fieldEncryptionEnabled } from './fieldCrypto';
import { generateTotpSecret, totpCode, verifyTotp, otpauthUri } from './totp';

export function hashRecoveryCode(code: string): string {
  return createHash('sha256').update(code.trim().toLowerCase()).digest('hex');
}

export function generateRecoveryCodes(count = 8): string[] {
  // 10 base32 chars (~50 bits) per code, grouped for readability.
  return Array.from({ length: count }, () => {
    const raw = randomBytes(7).toString('base64url').replace(/[-_]/g, 'x').slice(0, 10).toLowerCase();
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });
}

function decryptSecret(configKey: string, secretEnc: string): string {
  const v = decryptField(configKey, secretEnc);
  return typeof v === 'string' ? v : '';
}

/** Step 1: create (or replace) a PENDING secret. Nothing is enabled yet:
 *  the record only activates after a valid code proves the authenticator
 *  received the secret, and recovery codes exist. */
export async function startEnrollment(
  repos: FoundationRepos, configKey: string, userId: string, tenantId: string, email: string,
): Promise<{ otpauthUri: string; manualKey: string; encryption: 'on' | 'off' }> {
  // Fail closed: without a working PROFILE_FIELD_KEY the TOTP secret would be
  // stored in plaintext, which is never acceptable. Refuse before generating
  // or persisting anything. (General profile fields keep their own behavior.)
  if (!fieldEncryptionEnabled(configKey)) {
    throw new Error('mfa_unavailable: field encryption key not configured');
  }
  const secret = generateTotpSecret();
  const secretEnc = String(encryptField(configKey, secret));
  const now = new Date();
  const rec: MfaRecord = {
    userId, tenantId, secretEnc, enabled: false, recoveryHashes: [],
    lastTotpCounter: -1, enrolledAt: null, updatedAt: now,
  };
  await repos.mfa.put(rec);
  return {
    otpauthUri: otpauthUri(secret, email),
    manualKey: secret,
    encryption: fieldEncryptionEnabled(configKey) ? 'on' : 'off',
  };
}

/** Step 2: confirm the authenticator with a valid TOTP code. Only then is
 *  MFA enabled and recovery codes issued (shown once, stored hashed). */
export async function confirmEnrollment(
  repos: FoundationRepos, configKey: string, userId: string, code: string, atMs = Date.now(),
): Promise<{ recoveryCodes: string[] } | null> {
  const rec = await repos.mfa.get(userId);
  if (!rec) return null;
  const secret = decryptSecret(configKey, rec.secretEnc);
  if (!secret || !verifyTotp(secret, code, atMs)) return null;
  const recoveryCodes = generateRecoveryCodes();
  const now = new Date();
  await repos.mfa.put({
    ...rec,
    enabled: true,
    recoveryHashes: recoveryCodes.map(hashRecoveryCode),
    enrolledAt: now,
    updatedAt: now,
  });
  return { recoveryCodes };
}

/** Second factor at login: a current TOTP code, or an unused recovery code
 *  (consumed on success). */
export async function verifySecondFactor(
  repos: FoundationRepos, configKey: string, userId: string, code: string, atMs = Date.now(),
): Promise<{ ok: boolean; via: 'totp' | 'recovery' | null; recoveryCodesLeft?: number }> {
  const rec = await repos.mfa.get(userId);
  if (!rec || !rec.enabled) return { ok: false, via: null };
  const secret = decryptSecret(configKey, rec.secretEnc);
  if (secret) {
    // Replay protection: each 30-second counter may be used once, checked and
    // stamped atomically by the repo so concurrent requests cannot both win.
    for (let w = -1; w <= 1; w++) {
      const counter = Math.floor(atMs / 1000 / 30) + w;
      if (counter <= rec.lastTotpCounter) continue;
      const expected = totpCode(secret, counter * 30_000);
      if (expected === code && await repos.mfa.stampTotpCounter(userId, counter)) {
        return { ok: true, via: 'totp' };
      }
    }
  }
  // Recovery codes: atomic consume - a code works exactly once even under
  // concurrent requests holding the same code.
  const h = hashRecoveryCode(code);
  if (rec.recoveryHashes.includes(h) && await repos.mfa.consumeRecoveryCode(userId, h)) {
    const after = await repos.mfa.get(userId);
    return { ok: true, via: 'recovery', recoveryCodesLeft: after?.recoveryHashes.length ?? 0 };
  }
  return { ok: false, via: null };
}

export async function mfaStatus(
  repos: FoundationRepos, userId: string,
): Promise<{ enrolled: boolean; recoveryCodesLeft: number }> {
  const rec = await repos.mfa.get(userId);
  return { enrolled: Boolean(rec?.enabled), recoveryCodesLeft: rec?.recoveryHashes.length ?? 0 };
}
