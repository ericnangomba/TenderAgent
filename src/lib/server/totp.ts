/**
 * TOTP (RFC 6238) for admin MFA - HMAC-SHA1, 6 digits, 30-second step,
 * implemented on node:crypto only (no new dependencies, same rule as
 * passwords.ts). Secrets are random 160-bit values, base32-encoded for
 * authenticator-app entry.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const B32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function base32Encode(buf: Buffer): string {
  let bits = 0, value = 0, out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Buffer {
  const clean = s.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    value = (value << 5) | B32_ALPHABET.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function totpCode(secretB32: string, atMs: number, stepSeconds = 30, digits = 6): string {
  const key = base32Decode(secretB32);
  const counter = Math.floor(atMs / 1000 / stepSeconds);
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac('sha1', key).update(msg).digest();
  const offset = h[h.length - 1] & 0x0f;
  const code = ((h[offset] & 0x7f) << 24) | (h[offset + 1] << 16) | (h[offset + 2] << 8) | h[offset + 3];
  return (code % 10 ** digits).toString().padStart(digits, '0');
}

/** Accept the current step plus/minus `window` steps for clock drift. */
export function verifyTotp(secretB32: string, code: string, atMs: number, window = 1): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  for (let w = -window; w <= window; w++) {
    const expected = totpCode(secretB32, atMs + w * 30_000);
    if (timingSafeEqual(Buffer.from(expected), Buffer.from(code))) return true;
  }
  return false;
}

/** otpauth:// URI for authenticator apps (QR or manual entry). */
export function otpauthUri(secretB32: string, email: string, issuer = 'TenderAgent'): string {
  const label = encodeURIComponent(`${issuer}:${email}`);
  return `otpauth://totp/${label}?secret=${secretB32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}
