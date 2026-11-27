import { createHash, randomBytes } from 'crypto';
import { Router, type Request, type Response } from 'express';
import { verificationEmail, type EmailSender } from './sender';

/**
 * Email-ownership verification flow, provider-agnostic. NOT yet mounted in
 * server.ts and does not change signup: accounts are created exactly as
 * today. Mounting this router and requiring a confirmed address at signup is
 * a separate product decision (and needs a live sender first).
 *
 * Flow: POST /request-verification { email } issues a one-time token, stores
 * its SHA-256 digest with an expiry, and emails the confirm link through the
 * configured EmailSender (the log/mock sender until a live provider exists).
 * POST /confirm { token } consumes it once.
 *
 * Storage rules:
 * - Only the token DIGEST is ever stored. The raw token exists in the emailed
 *   link and in process memory for the duration of the request, nowhere else.
 * - One active token per email: requesting a new link invalidates the old one.
 * - consume() is atomic (single DELETE ... RETURNING on Postgres, single Map
 *   delete in memory) so two concurrent confirms cannot both succeed.
 */

export function digestToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export interface VerificationRecord {
  /** SHA-256 hex digest of the emailed token. Never the raw token. */
  digest: string;
  email: string;
  expiresAt: Date;
}

export interface VerificationStore {
  save(record: VerificationRecord): Promise<void>;
  /** Removes and returns the record only if the digest exists and is unexpired; either way the token is burned (one-time). */
  consume(digest: string, now?: Date): Promise<VerificationRecord | null>;
}

export class InMemoryVerificationStore implements VerificationStore {
  private readonly records = new Map<string, VerificationRecord>();

  async save(record: VerificationRecord): Promise<void> {
    for (const [key, existing] of this.records) {
      if (existing.email === record.email) this.records.delete(key);
    }
    this.records.set(record.digest, record);
  }

  async consume(digest: string, now: Date = new Date()): Promise<VerificationRecord | null> {
    const record = this.records.get(digest);
    if (!record) return null;
    this.records.delete(digest);
    return record.expiresAt > now ? record : null;
  }
}

export function newVerificationToken(): string {
  return randomBytes(32).toString('hex');
}

export function buildVerificationLink(publicOrigin: string, token: string): string {
  const base = publicOrigin.replace(/\/+$/, '');
  return `${base}/verify-email?token=${encodeURIComponent(token)}`;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface RateBucket { count: number; resetAt: number }

/** Fixed-window limiter, in-process. Sufficient until the router is mounted; a mounted production deployment behind replicas should move this to the store. */
function createFixedWindowLimiter(max: number, windowMs: number) {
  const buckets = new Map<string, RateBucket>();
  return {
    allow(key: string, now = Date.now()): boolean {
      const bucket = buckets.get(key);
      if (!bucket || bucket.resetAt <= now) {
        buckets.set(key, { count: 1, resetAt: now + windowMs });
        return true;
      }
      if (bucket.count >= max) return false;
      bucket.count += 1;
      return true;
    },
  };
}

export interface EmailVerificationOptions {
  sender: EmailSender;
  store: VerificationStore;
  /** Public site origin used in the emailed link, e.g. https://tenderagent1.netlify.app */
  publicOrigin: string;
  /** Token lifetime in milliseconds. */
  tokenTtlMs: number;
  /** Minimum milliseconds between verification emails to the same address. Default 60s. */
  resendCooldownMs?: number;
  /** Max verification requests per IP per hour. Default 10. */
  perIpHourlyCap?: number;
}

export function createEmailVerificationRouter(options: EmailVerificationOptions): Router {
  const router = Router();
  const resendCooldownMs = options.resendCooldownMs ?? 60_000;
  const perIpHourlyCap = options.perIpHourlyCap ?? 10;
  const emailCooldown = createFixedWindowLimiter(1, resendCooldownMs);
  const ipLimiter = createFixedWindowLimiter(perIpHourlyCap, 60 * 60 * 1000);

  router.post('/request-verification', async (req: Request, res: Response) => {
    const { email } = req.body || {};
    if (typeof email !== 'string' || !EMAIL_RE.test(email)) {
      res.status(400).json({ success: false, error: 'valid email required' });
      return;
    }
    const normalized = email.toLowerCase();
    if (!emailCooldown.allow(normalized)) {
      // Same response shape either way: a retry hint, never account existence.
      // Checked before the IP cap so a cooldown rejection costs no IP budget.
      res.status(429).json({ success: false, error: 'verification_email_recently_sent' });
      return;
    }
    if (!ipLimiter.allow(`${req.ip}:request-verification`)) {
      res.status(429).json({ success: false, error: 'too_many_attempts' });
      return;
    }
    const now = new Date();
    const token = newVerificationToken();
    const record: VerificationRecord = {
      digest: digestToken(token),
      email: normalized,
      expiresAt: new Date(now.getTime() + options.tokenTtlMs),
    };
    await options.store.save(record);
    const link = buildVerificationLink(options.publicOrigin, token);
    const result = await options.sender.send(verificationEmail(normalized, link));
    if (!result.ok) {
      res.status(502).json({ success: false, error: 'verification_email_failed' });
      return;
    }
    res.json({ success: true });
  });

  router.post('/confirm', async (req: Request, res: Response) => {
    const { token } = req.body || {};
    if (typeof token !== 'string' || !/^[0-9a-f]{64}$/.test(token)) {
      res.status(400).json({ success: false, error: 'invalid_or_expired_token' });
      return;
    }
    const record = await options.store.consume(digestToken(token));
    if (!record) {
      res.status(400).json({ success: false, error: 'invalid_or_expired_token' });
      return;
    }
    res.json({ success: true, email: record.email });
  });

  return router;
}
