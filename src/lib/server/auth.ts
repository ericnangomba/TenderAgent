/**
 * Account and session service: email+password signup, login, logout,
 * and the session middleware that attaches req.auth.
 */
import { randomBytes, createHash } from 'node:crypto';
import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import type { FoundationRepos, Session, Tenant, User } from './repos/types';
import { hashPassword, verifyPassword } from './passwords';
import type { FoundationConfig } from './config';

export const SESSION_COOKIE = 'ta_session';

export interface AuthContext {
  userId: string;
  tenantId: string;
  email: string;
}

declare module 'express-serve-static-core' {
  interface Request {
    auth?: AuthContext;
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

function setSessionCookie(res: Response, token: string, maxAgeMs: number, secure: boolean): void {
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.floor(maxAgeMs / 1000)}`,
  ];
  if (secure) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

function clearSessionCookie(res: Response): void {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

export async function createSession(
  repos: FoundationRepos,
  config: FoundationConfig,
  user: User,
): Promise<{ token: string; session: Session }> {
  const token = randomBytes(32).toString('base64url');
  const now = new Date();
  const session: Session = {
    id: randomBytes(16).toString('hex'),
    userId: user.id,
    tenantId: user.tenantId,
    tokenHash: hashToken(token),
    expiresAt: new Date(now.getTime() + config.sessionTtlHours * 60 * 60 * 1000),
    createdAt: now,
  };
  await repos.sessions.create(session);
  return { token, session };
}

export async function resolveSession(
  repos: FoundationRepos,
  token: string | undefined,
): Promise<AuthContext | null> {
  if (!token) return null;
  const session = await repos.sessions.getByTokenHash(hashToken(token));
  if (!session) return null;
  if (session.expiresAt.getTime() <= Date.now()) {
    await repos.sessions.delete(session.id);
    return null;
  }
  const user = await repos.users.getById(session.userId);
  if (!user) return null;
  return { userId: user.id, tenantId: user.tenantId, email: user.email };
}

export function createSessionMiddleware(repos: FoundationRepos) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
      const auth = await resolveSession(repos, token);
      if (auth) req.auth = auth;
    } catch (err) {
      console.error('[foundation] session resolution failed:', err);
    }
    next();
  };
}

/** Fixed-window brute-force throttle, keyed per caller-chosen bucket, in-process. */
function createRateLimiter(maxAttempts: number, windowMs: number) {
  const buckets = new Map<string, { count: number; resetAt: number }>();
  const bucketFor = (key: string) => {
    const now = Date.now();
    let bucket = buckets.get(key);
    if (!bucket || now >= bucket.resetAt) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }
    // Lazy cleanup so the map cannot grow unboundedly.
    if (buckets.size > 10000) {
      for (const [k, b] of buckets) if (now >= b.resetAt) buckets.delete(k);
    }
    return bucket;
  };
  return {
    /** Increment and decide - the IP-wide entry check. */
    allow(key: string): boolean {
      const bucket = bucketFor(key);
      bucket.count += 1;
      return bucket.count <= maxAttempts;
    },
    /** Would one more attempt fit this window? Does NOT increment. */
    peek(key: string): boolean {
      return bucketFor(key).count < maxAttempts;
    },
    /** Record one FAILED attempt against a bucket (successes don't count). */
    hit(key: string): void {
      bucketFor(key).count += 1;
    },
  };
}

function isSecureRequest(req: Request, config: FoundationConfig): boolean {
  return config.cookieSecure || req.secure || req.headers['x-forwarded-proto'] === 'https';
}

export function createAuthRouter(repos: FoundationRepos, config: FoundationConfig): Router {
  const router = Router();
  const ipLimiter = createRateLimiter(config.authRateLimit.maxAttempts, config.authRateLimit.windowMs);
  // Per-account credential-stuffing throttle: an attacker rotating IPs (the
  // IP limiter's only key) still hits this one. Counts FAILURES only, so the
  // owner's own successful logins never consume the bucket and the window
  // always clears on its own (bounded by AUTH_RATE_LIMIT_WINDOW_MS). Known
  // tradeoff: sustained failed attempts against one account DO throttle that
  // account's logins - including the owner's - for the window duration.
  const accountLimiter = createRateLimiter(config.authRateLimit.maxAttempts, config.authRateLimit.windowMs);

  router.use((req: Request, res: Response, next) => {
    if (!req.path.startsWith('/auth/')) { next(); return; }
    if (!ipLimiter.allow(`${req.ip}:${req.path}`)) {
      res.status(429).json({ success: false, error: 'too_many_attempts' });
      return;
    }
    next();
  });

  router.post('/auth/signup', async (req: Request, res: Response) => {
    try {
      const { email, password, companyName } = req.body || {};
      if (typeof email !== 'string' || !EMAIL_RE.test(email)) {
        res.status(400).json({ success: false, error: 'valid email required' });
        return;
      }
      if (typeof password !== 'string' || password.length < config.minPasswordLength) {
        res.status(400).json({ success: false, error: `password must be at least ${config.minPasswordLength} characters` });
        return;
      }
      if (await repos.users.getByEmail(email)) {
        res.status(409).json({ success: false, error: 'email_already_registered' });
        return;
      }
      const now = new Date();
      const tenant: Tenant = {
        id: randomBytes(16).toString('hex'),
        companyName: typeof companyName === 'string' && companyName.trim() ? companyName.trim() : email,
        createdAt: now,
      };
      const user: User = {
        id: randomBytes(16).toString('hex'),
        tenantId: tenant.id,
        email: email.toLowerCase(),
        passwordHash: await hashPassword(password),
        createdAt: now,
      };
      await repos.tenants.create(tenant);
      await repos.users.create(user);
      const { token } = await createSession(repos, config, user);
      setSessionCookie(res, token, config.sessionTtlHours * 60 * 60 * 1000, isSecureRequest(req, config));
      res.json({ success: true, tenantId: tenant.id, email: user.email, userId: user.id, isAdmin: config.adminUserIds.includes(user.id) });
    } catch (err: any) {
      res.status(err.message === 'email_already_registered' ? 409 : 500).json({ success: false, error: err.message });
    }
  });

  router.post('/auth/login', async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body || {};
      if (typeof email !== 'string' || typeof password !== 'string') {
        res.status(400).json({ success: false, error: 'email and password required' });
        return;
      }
      const accountKey = `login-account:${email.toLowerCase()}`;
      if (!accountLimiter.peek(accountKey)) {
        res.status(429).json({ success: false, error: 'too_many_attempts' });
        return;
      }
      const user = await repos.users.getByEmail(email);
      if (!user || !(await verifyPassword(password, user.passwordHash))) {
        accountLimiter.hit(accountKey);
        // Same response either way - do not reveal which emails exist.
        res.status(401).json({ success: false, error: 'invalid_credentials' });
        return;
      }
      const { token } = await createSession(repos, config, user);
      setSessionCookie(res, token, config.sessionTtlHours * 60 * 60 * 1000, isSecureRequest(req, config));
      res.json({ success: true, tenantId: user.tenantId, email: user.email, userId: user.id, isAdmin: config.adminUserIds.includes(user.id) });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/auth/logout', async (req: Request, res: Response) => {
    try {
      const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
      if (token) {
        const session = await repos.sessions.getByTokenHash(hashToken(token));
        if (session) await repos.sessions.delete(session.id);
      }
      clearSessionCookie(res);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/auth/me', (req: Request, res: Response) => {
    if (!req.auth) {
      res.status(401).json({ success: false, error: 'not_authenticated' });
      return;
    }
    // userId is the account's own server-generated ID - shown on the Account
    // screen so the operator can grant admin access via ADMIN_USER_IDS. Own
    // ID is not sensitive; admin status is derived server-side from it.
    res.json({ success: true, ...req.auth, isAdmin: config.adminUserIds.includes(req.auth.userId) });
  });

  return router;
}
