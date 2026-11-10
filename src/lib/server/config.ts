/**
 * Foundation configuration for the multi-tenant subscription build.
 * Everything defaults OFF so the current single-user demo behaves exactly
 * as before until AUTH_REQUIRED=true is set in the deployment environment.
 */

export interface Plan {
  id: string;
  name: string;
  /** Price in South African cents to avoid floating point money math. */
  priceCentsZAR: number;
  interval: 'monthly';
  /** Provisional usage allowances. Placeholders for Eric to review -
   *  a subscription is NOT unlimited usage of paid APIs. */
  includedAnalyses: number;
  includedSerpapiLookups: number;
}

export const PLANS: Plan[] = [
  {
    id: 'standard_monthly',
    name: 'Standard (provisional R250/month)',
    priceCentsZAR: 25000,
    interval: 'monthly',
    includedAnalyses: 60,
    includedSerpapiLookups: 30,
  },
  {
    // Complimentary tester cohort: granted only by an operator through
    // /api/admin/test-access, never by a billing webhook. Quota figures are
    // PROVISIONAL placeholders pending Eric's decision - no grant is active
    // until he approves cohort access.
    id: 'test_cohort',
    name: 'Tester cohort (complimentary, provisional limits)',
    priceCentsZAR: 0,
    interval: 'monthly',
    includedAnalyses: 20,
    includedSerpapiLookups: 10,
  },
];

export function getPlan(planId: string | null | undefined, plans: Plan[] = PLANS): Plan | undefined {
  return plans.find((p) => p.id === planId);
}

export interface FoundationConfig {
  /** When false (default), guards no-op for accounts, but SerpApi spend is still
   *  restricted to signed-in tenants with an active subscription - Eric's rule
   *  that paid credits are only consumed for paying customers always holds. */
  authRequired: boolean;
  /** Plan catalog, config-only and provisional. Not exposed as a public offer. */
  plans: Plan[];
  /** Brute-force throttle for auth endpoints. */
  authRateLimit: { maxAttempts: number; windowMs: number };
  /** Session lifetime in hours. */
  sessionTtlHours: number;
  /** Grace period after a missed renewal before access closes. */
  pastDueGraceDays: number;
  /** Secret used by the mock/test billing provider for HMAC webhook signatures.
   *  Empty string means NOT configured: the mock webhook then signs with a
   *  random boot secret in development and is disabled entirely in production.
   *  There is deliberately no shared public default - a known secret lets
   *  anyone forge subscription activations. */
  mockBillingSecret: string;
  /** Express 'trust proxy' setting for correct client IPs behind Eric's reverse
   *  proxy. Defaults to false: blindly trusting X-Forwarded-For lets clients
   *  spoof their IP past the auth rate limiter. Set TRUST_PROXY=1 (or a CIDR)
   *  only when a known proxy terminates TLS in front of the app. */
  trustProxy: string | boolean;
  /** Minimum accepted account password length. */
  minPasswordLength: number;
  /** Storage driver for foundation data: 'memory' (default, dev/tests), 'mongo', or 'postgres' (Neon-compatible). */
  store: 'memory' | 'mongo' | 'postgres';
  mongoUri: string;
  /** Postgres connection string (DATABASE_URL); Neon strings carry sslmode=require. */
  postgresUri: string;
  /** Mark the session cookie Secure (set true once the app is served over HTTPS). */
  cookieSecure: boolean;
  /** Exact public site origin allowed for state-changing calls when the app is
   *  reached through a same-site reverse proxy whose upstream Host differs
   *  (e.g. Netlify proxying /api to a private backend). Exact origin match
   *  only - no suffixes or wildcards. Empty (default) disables: only the
   *  request's own Host is accepted, the pre-proxy behavior. */
  publicOrigin: string;
  /**
   * Server-generated user IDs with operator (admin) access, from ADMIN_USER_IDS
   * (comma-separated). IDs are used instead of emails because signup email is
   * self-asserted and unverified: an email allowlist would let a stranger claim
   * an admin's address by registering it first. Empty (default) means NO admin
   * exists - no first user, test account or bootstrap path gets privilege
   * implicitly. The operator copies their own user ID from the Account screen
   * into the deployment environment to grant access.
   */
  adminUserIds: string[];
  /** AES-256-GCM key source for sensitive profile fields at rest (empty = off, reported in /api/health). */
  profileFieldKey: string;
}

/** Hard rules that must hold before the server may accept traffic. */
export function assertSafeConfig(config: FoundationConfig, env: NodeJS.ProcessEnv = process.env): void {
  if (env.NODE_ENV === 'production' && config.store === 'memory' && env.ALLOW_MEMORY_STORE_IN_PRODUCTION !== 'true') {
    throw new Error(
      'Refusing to boot in production with the in-memory store: accounts, entitlements and usage ' +
      'would vanish on restart and tenants would share process state. Set STORE=postgres with DATABASE_URL ' +
      'or STORE=mongo with MONGODB_URI, ' +
      'or ALLOW_MEMORY_STORE_IN_PRODUCTION=true for a deliberate single-process demo.',
    );
  }
  if (config.store === 'mongo' && !config.mongoUri) {
    throw new Error('STORE=mongo requires MONGODB_URI.');
  }
  if (config.store === 'postgres' && !config.postgresUri) {
    throw new Error('STORE=postgres requires DATABASE_URL.');
  }
  if (env.NODE_ENV === 'production' && config.store !== 'memory' && !config.authRequired) {
    throw new Error(
      'Refusing to boot in production on a real store with AUTH_REQUIRED unset: ' +
      'accounts and billing state would persist while every guard no-ops. Set AUTH_REQUIRED=true.',
    );
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): FoundationConfig {
  return {
    authRequired: env.AUTH_REQUIRED === 'true',
    plans: PLANS,
    authRateLimit: { maxAttempts: Number(env.AUTH_RATE_LIMIT_MAX || 10), windowMs: Number(env.AUTH_RATE_LIMIT_WINDOW_MS || 10 * 60 * 1000) },
    sessionTtlHours: Number(env.SESSION_TTL_HOURS || 24 * 7),
    pastDueGraceDays: Number(env.PAST_DUE_GRACE_DAYS || 3),
    mockBillingSecret: env.MOCK_BILLING_SECRET || '',
    minPasswordLength: Number(env.MIN_PASSWORD_LENGTH || 10),
    store: env.STORE === 'mongo' ? 'mongo' : env.STORE === 'postgres' ? 'postgres' : 'memory',
    mongoUri: env.MONGODB_URI || '',
    postgresUri: env.DATABASE_URL || '',
    cookieSecure: env.COOKIE_SECURE === 'true',
    publicOrigin: env.PUBLIC_ORIGIN || '',
    trustProxy: env.TRUST_PROXY === undefined ? false : (env.TRUST_PROXY === 'false' ? false : env.TRUST_PROXY || true),
    adminUserIds: (env.ADMIN_USER_IDS || '').split(',').map((s) => s.trim()).filter(Boolean),
    profileFieldKey: env.PROFILE_FIELD_KEY || '',
  };
}
