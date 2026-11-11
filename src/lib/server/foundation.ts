/**
 * Foundation assembly: wires config, repositories, auth, entitlement guards
 * and billing webhooks into middleware/routers the main server mounts.
 * With AUTH_REQUIRED unset the guards no-op and the app behaves as before.
 */
import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { loadConfig, getPlan, assertSafeConfig, type FoundationConfig } from './config';
import type { FoundationRepos } from './repos/types';
import type { GatedAction } from './entitlement';
import { createMemoryRepos } from './repos/memory';
import { createAuthRouter, createSessionMiddleware } from './auth';
import { authorizeAndConsume, effectiveStatus, currentPeriodKey, type AccessDecision } from './entitlement';
import { createWebhookRouter, MockBillingProvider, type BillingProvider } from './billing';
import { evaluateReadiness, seedRequirementsForTender, type BidApplication, type Requirement } from './readiness';
import { randomBytes } from 'node:crypto';
import { AccountDeletionError, TenantWorkCoordinator } from './accountLifecycle';
import { verifyPassword } from './passwords';

export interface Foundation {
  config: FoundationConfig;
  tenantWorkMiddleware: (req: Request, res: Response, next: NextFunction) => void;
  repos: FoundationRepos;
  /** Rejects cross-origin state-changing requests. Mount before routes. */
  originCheckMiddleware: (req: Request, res: Response, next: NextFunction) => void;
  /** Attaches req.auth from the session cookie. Mount before routes. */
  sessionMiddleware: (req: Request, res: Response, next: NextFunction) => void;
  /** Auth + entitlement guards for spend-bearing routes. Mount after sessionMiddleware. */
  guardMiddleware: (req: Request, res: Response, next: NextFunction) => void;
  /**
   * Sets Cache-Control: no-store on API responses. Authenticated and
   * tenant-scoped payloads (auth/me, profile, tenant feeds) must never sit in
   * the browser HTTP cache or a shared intermediary: the service worker is a
   * second boundary, not the only one.
   */
  apiCacheHeaders: (req: Request, res: Response, next: NextFunction) => void;
  /**
   * May this request consume a paid SerpApi lookup? True only for a signed-in
   * tenant with an active subscription and allowance remaining - in EVERY mode,
   * so the public demo can never burn paid credits. In guarded mode the guard
   * already consumed the allowance for this request, so no double count.
   */
  serpApiAccess: (req: Request) => Promise<boolean>;
  /** /api/auth/* and /api/account. */
  router: Router;
  /** /api/billing/webhook/:provider - mount BEFORE express.json(). */
  webhookRouter: Router;
  /**
   * May this request spend paid cloud AI (Gemini) credits? True only for a
   * signed-in tenant with an active subscription and analysis allowance
   * remaining - in EVERY mode, like SerpApi. Claims the analysis allowance
   * exactly once per request (reusing the guard's claim when present) and
   * fails closed when metering cannot be confirmed.
   */
  cloudLlmAccess: (req: Request) => Promise<boolean>;
  /**
   * Give back a unit this request consumed when the paid resource turned out
   * not to be used (missing provider key, failed upstream lookup, pipeline
   * error). Safe to call when nothing was consumed.
   */
  releaseConsumption: (req: Request, action: GatedAction) => Promise<void>;
  /** Require a signed-in account in EVERY mode (not only AUTH_REQUIRED). */
  requireAuth: (req: Request, res: Response, next: NextFunction) => void;
  /**
   * Require an operator account (user ID in ADMIN_USER_IDS). 401 signed-out,
   * 403 non-admin. Gates technical/platform surfaces server-side.
   */
  requireAdmin: (req: Request, res: Response, next: NextFunction) => void;
  /** True when this request's account is an operator. */
  isAdmin: (req: Request) => boolean;
  /** /api/admin/* read-only operator endpoints (requireAdmin applied inside). */
  adminRouter: Router;
}

/** Marker for units the guard/access helpers consumed on behalf of a request. */
const CONSUMED = Symbol.for('tenderagent.consumed');
function markConsumed(req: Request, action: GatedAction): void {
  (req as any)[CONSUMED] = { ...(req as any)[CONSUMED], [action]: true };
}

/** Spend-bearing routes and the usage action they consume. */
const GUARDED_ROUTES: Array<{ method: string; path: string; action: GatedAction | null }> = [
  { method: 'POST', path: '/api/analyze', action: 'analysis' },
  { method: 'GET', path: '/api/scrape', action: 'serpapi' },
  { method: 'POST', path: '/api/etenders/sync', action: 'serpapi' },
  { method: 'POST', path: '/api/parse-document', action: null }, // account boundary only, no external cost
];

/**
 * Webhook providers from config. No shared public default secret: a known
 * secret lets anyone forge subscription activations. In development with no
 * MOCK_BILLING_SECRET set, a random per-boot secret is generated and logged
 * for local testing. In production with no secret, the mock webhook is
 * disabled entirely (fail closed).
 */
function defaultBillingProviders(config: FoundationConfig): BillingProvider[] {
  if (config.mockBillingSecret) return [new MockBillingProvider(config.mockBillingSecret)];
  if (process.env.NODE_ENV === 'production') {
    console.warn('[foundation] No billing webhook secret configured - mock billing provider DISABLED in production.');
    return [];
  }
  const bootSecret = randomBytes(24).toString('base64url');
  console.warn('[foundation] MOCK_BILLING_SECRET not set - generated a random per-boot secret for local testing (see server log, not committed).');
  return [new MockBillingProvider(bootSecret)];
}

export interface FoundationOptions {
  config?: FoundationConfig;
  repos?: FoundationRepos;
  providers?: BillingProvider[];
  /** Test injection only; production uses the fixed two-minute lease bound. */
  requestLeaseMs?: number;
  eraseEphemeral?: (tenantId: string) => void;
}

export function createFoundation(options: FoundationOptions = {}): Foundation {
  const config = options.config || loadConfig();
  assertSafeConfig(config);
  if (process.env.NODE_ENV === 'production' && !config.authRequired) {
    console.warn('[foundation] Production boot with AUTH_REQUIRED unset: account guards no-op (demo posture). ' +
      'Paid API calls remain restricted per call to active subscribers with allowance remaining.');
  }
  const repos = options.repos || createMemoryRepos();
  const providers = options.providers || defaultBillingProviders(config);

  const sessionMiddleware = createSessionMiddleware(repos);
  const coordinator = new TenantWorkCoordinator(30_000, 64, options.requestLeaseMs);
  const tenantWorkMiddleware = (req: Request, res: Response, next: NextFunction): void => {
    if (!req.auth || !config.accountDeletionEnabled) { next(); return; }
    const tenantId = req.auth.tenantId;
    void coordinator.run(tenantId, req.method === 'DELETE' && req.path === '/api/account', async () => {
      if (!await repos.tenants.getById(tenantId)) {
        res.status(401).json({ success: false, error: 'authentication_required' }); return;
      }
      await new Promise<void>((resolve) => {
        if (res.destroyed) { resolve(); return; } // handler has not started
        // end is handler completion intent even if the client has left and
        // the socket can no longer emit finish. Never release on close alone.
        const originalEnd = res.end;
        res.end = function (this: Response, ...args: any[]) {
          try { return (originalEnd as any).apply(this, args); }
          finally { resolve(); }
        } as typeof res.end;
        res.once('finish', resolve); next();
      });
    }).catch((e) => {
      const err = e instanceof AccountDeletionError ? e : new AccountDeletionError('account_unavailable', 503);
      if (!res.headersSent && !res.destroyed) res.status(err.status).json({ success: false, error: err.code });
    });
  };
  const authRouter = createAuthRouter(repos, config);
  const webhookRouter = createWebhookRouter(providers, repos);

  const originCheckMiddleware = (req: Request, res: Response, next: NextFunction) => {
    // State-changing API calls must come from our own origin when an Origin
    // header is supplied (browsers always send it cross-site). SameSite=Lax
    // cookies are the first line; this is the explicit second line.
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
    if (req.path.startsWith('/api/billing/webhook')) return next(); // HMAC-verified, server-to-server
    const origin = req.headers.origin;
    if (origin) {
      try {
        // Exact configured public origin (front-door proxy) or same-host only.
        if (new URL(origin).host !== req.headers.host && origin !== config.publicOrigin) {
          res.status(403).json({ success: false, error: 'origin_forbidden' });
          return;
        }
      } catch {
        res.status(403).json({ success: false, error: 'origin_forbidden' });
        return;
      }
    }
    next();
  };

  const serpApiAccess = async (req: Request): Promise<boolean> => {
    if (!req.auth) return false;
    try {
      // Exactly once, in every mode: reuse this request's existing claim when
      // the route guard already made one (AUTH_REQUIRED mode); otherwise claim
      // the allowance here. A call on an unguarded route can never run
      // unmetered, and a guarded route never double-counts.
      if ((req as any)[CONSUMED]?.serpapi) return true;
      const decision: AccessDecision = await authorizeAndConsume(repos, config, req.auth.tenantId, 'serpapi');
      if (decision.allowed) markConsumed(req, 'serpapi');
      return decision.allowed;
    } catch (err) {
      // Fail closed: when usage metering cannot be confirmed, no paid credits burn.
      console.error('[foundation] SerpApi metering failed - paid lookup denied:', err);
      return false;
    }
  };

  const cloudLlmAccess = async (req: Request): Promise<boolean> => {
    if (!req.auth) return false;
    try {
      // Exactly once, in every mode - same shape as serpApiAccess. Previously
      // this only CHECKED status while the analysis allowance was consumed by
      // the guarded-mode middleware alone, so with AUTH_REQUIRED unset an
      // active subscriber's Gemini usage was unmetered. Now the allowance is
      // claimed atomically here whenever the guard did not already claim it.
      if ((req as any)[CONSUMED]?.analysis) return true;
      const decision: AccessDecision = await authorizeAndConsume(repos, config, req.auth.tenantId, 'analysis');
      if (decision.allowed) markConsumed(req, 'analysis');
      return decision.allowed;
    } catch (err) {
      // Fail closed: when usage metering cannot be confirmed, no paid credits burn.
      console.error('[foundation] cloud LLM metering failed - paid call denied:', err);
      return false;
    }
  };

  const releaseConsumption = async (req: Request, action: GatedAction): Promise<void> => {
    const consumed = (req as any)[CONSUMED];
    if (!req.auth || !consumed?.[action]) return;
    consumed[action] = false;
    await repos.usage.release(req.auth.tenantId, currentPeriodKey(new Date()), action === 'analysis' ? 'analyses' : 'serpapiLookups');
  };

  const requireAuth = (req: Request, res: Response, next: NextFunction): void => {
    if (!req.auth) {
      res.status(401).json({ success: false, error: 'authentication_required' });
      return;
    }
    next();
  };

  /**
   * Operator gate for technical/platform surfaces. Membership comes from
   * server-generated user IDs in ADMIN_USER_IDS (operator-set in the
   * deployment environment), never from self-asserted emails. Default empty:
   * no account has admin access until the operator explicitly grants it.
   */
  const requireAdmin = (req: Request, res: Response, next: NextFunction): void => {
    if (!req.auth) {
      res.status(401).json({ success: false, error: 'authentication_required' });
      return;
    }
    if (!config.adminUserIds.includes(req.auth.userId)) {
      res.status(403).json({ success: false, error: 'admin_required' });
      return;
    }
    next();
  };

  const isAdmin = (req: Request): boolean =>
    Boolean(req.auth) && config.adminUserIds.includes(req.auth!.userId);

  // Read-only, aggregate-only operator overview. No per-tenant rows, no
  // emails, no secrets: counts and usage totals are sufficient for the
  // settings/performance surface Eric asked for.
  const adminRouter = Router();
  adminRouter.get('/overview', requireAdmin, async (req: Request, res: Response) => {
    try {
      const overview = await repos.stats.overview(currentPeriodKey(new Date()));
      res.json({ success: true, overview });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Operator-granted complimentary tester access. No billing provider is
  // involved: a grant writes a test_cohort entitlement directly, attributed
  // to the granting operator, time-bounded and revocable. Server-side
  // requireAdmin on every route; grants are inert until an operator (Eric)
  // makes one - this mechanism alone activates nothing.
  adminRouter.post('/test-access/grant', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { email, days } = req.body || {};
      if (typeof email !== 'string' || !email.includes('@')) {
        res.status(400).json({ success: false, error: 'valid email required' });
        return;
      }
      const dayCount = Number(days);
      if (!Number.isInteger(dayCount) || dayCount < 1 || dayCount > 90) {
        res.status(400).json({ success: false, error: 'days must be an integer between 1 and 90' });
        return;
      }
      const user = await repos.users.getByEmail(email.toLowerCase());
      if (!user) {
        res.status(404).json({ success: false, error: 'no account with that email' });
        return;
      }
      const now = new Date();
      const existing = await repos.entitlements.get(user.tenantId);
      if (
        existing &&
        existing.planId !== 'test_cohort' &&
        existing.status !== null &&
        effectiveStatus(existing, now, config.pastDueGraceDays) === 'active'
      ) {
        // Never overwrite a live paid subscription with a comp grant.
        res.status(409).json({ success: false, error: 'account_has_active_paid_subscription', entitlementUnchanged: true });
        return;
      }
      const periodEnd = new Date(now.getTime() + dayCount * 24 * 60 * 60 * 1000);
      await repos.entitlements.put({
        tenantId: user.tenantId,
        planId: 'test_cohort',
        status: 'active',
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: false,
        providerName: 'operator_comp',
        providerSubscriptionRef: `comp-grant by ${req.auth!.userId} at ${now.toISOString()}`,
        refundedAt: null,
        lastEventAt: now,
        lastEventId: `comp-${now.getTime()}`,
        updatedAt: now,
      });
      console.log(`[admin] test-access GRANT tenant=${user.tenantId} email=${email.toLowerCase()} days=${dayCount} by=${req.auth!.userId} at=${now.toISOString()}`);
      res.json({ success: true, tenantId: user.tenantId, planId: 'test_cohort', currentPeriodEnd: periodEnd });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  adminRouter.post('/test-access/revoke', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { email } = req.body || {};
      if (typeof email !== 'string' || !email.includes('@')) {
        res.status(400).json({ success: false, error: 'valid email required' });
        return;
      }
      const user = await repos.users.getByEmail(email.toLowerCase());
      if (!user) {
        res.status(404).json({ success: false, error: 'no account with that email' });
        return;
      }
      const ent = await repos.entitlements.get(user.tenantId);
      if (!ent || ent.planId !== 'test_cohort' || ent.status !== 'active') {
        res.status(404).json({ success: false, error: 'no active tester grant for that account' });
        return;
      }
      const now = new Date();
      await repos.entitlements.put({ ...ent, status: 'cancelled', updatedAt: now });
      console.log(`[admin] test-access REVOKE tenant=${user.tenantId} email=${email.toLowerCase()} by=${req.auth!.userId} at=${now.toISOString()}`);
      res.json({ success: true, tenantId: user.tenantId, status: 'cancelled' });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  adminRouter.get('/test-access/status', requireAdmin, async (req: Request, res: Response) => {
    try {
      const email = typeof req.query.email === 'string' ? req.query.email : '';
      if (!email.includes('@')) {
        res.status(400).json({ success: false, error: 'valid email query required' });
        return;
      }
      const user = await repos.users.getByEmail(email.toLowerCase());
      if (!user) {
        res.status(404).json({ success: false, error: 'no account with that email' });
        return;
      }
      const ent = await repos.entitlements.get(user.tenantId);
      res.json({
        success: true,
        tenantId: user.tenantId,
        entitlement: ent
          ? { planId: ent.planId, status: ent.status, currentPeriodEnd: ent.currentPeriodEnd, effectiveStatus: effectiveStatus(ent, new Date(), config.pastDueGraceDays) }
          : { effectiveStatus: 'none' },
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  const accountRouter = Router();
  const deletionAttempts = new Map<string, { count: number; until: number }>();
  accountRouter.delete('/account', async (req: Request, res: Response) => {
    if (!req.auth) { res.status(401).json({ success: false, error: 'authentication_required' }); return; }
    if (!config.accountDeletionEnabled) { res.status(409).json({ success: false, error: 'account_deletion_not_enabled' }); return; }
    if (!repos.accountDeletion) { res.status(409).json({ success: false, error: 'account_deletion_unavailable_for_store' }); return; }
    const now = Date.now();
    for (const [key, value] of deletionAttempts) if (value.until <= now) deletionAttempts.delete(key);
    const attempt = deletionAttempts.get(req.auth.userId) || { count: 0, until: now + 10 * 60_000 };
    if (attempt.count >= 5) { res.status(429).json({ success: false, error: 'too_many_attempts' }); return; }
    attempt.count++; deletionAttempts.set(req.auth.userId, attempt);
    const { password, confirmation } = req.body || {};
    if (confirmation !== 'DELETE MY ACCOUNT' || typeof password !== 'string') {
      res.status(400).json({ success: false, error: 'explicit_confirmation_and_password_required' }); return;
    }
    try {
      const user = await repos.users.getById(req.auth.userId);
      if (!user || !await verifyPassword(password, user.passwordHash)) {
        res.status(403).json({ success: false, error: 'reauthentication_failed' }); return;
      }
      await repos.accountDeletion.erase(req.auth.tenantId);
      options.eraseEphemeral?.(req.auth.tenantId);
      res.setHeader('Set-Cookie', 'ta_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
      res.json({ success: true, message: 'Account and active workspace data deleted. Provider recovery copies follow their separate retention rules.' });
    } catch (e) {
      const err = e instanceof AccountDeletionError ? e : new AccountDeletionError('account_deletion_failed', 503);
      res.status(err.status).json({ success: false, error: err.code });
    }
  });

  accountRouter.get('/account', async (req: Request, res: Response) => {
    if (!req.auth) {
      res.status(401).json({ success: false, error: 'not_authenticated' });
      return;
    }
    const now = new Date();
    const ent = await repos.entitlements.get(req.auth.tenantId);
    const usage = await repos.usage.get(req.auth.tenantId, currentPeriodKey(now));
    const plan = getPlan(ent?.planId, config.plans);
    res.json({
      success: true,
      account: {
        accountDeletionAvailable: config.accountDeletionEnabled && Boolean(repos.accountDeletion),
        tenantId: req.auth.tenantId,
        email: req.auth.email,
        entitlement: ent
          ? { ...ent, effectiveStatus: effectiveStatus(ent, now, config.pastDueGraceDays) }
          : { effectiveStatus: 'none' },
        usage,
        // Own plan's usage allowances only. No plan catalog or pricing here:
        // the R250/60/30 figures are provisional config, not a public offer.
        allowances: plan
          ? { includedAnalyses: plan.includedAnalyses, includedSerpapiLookups: plan.includedSerpapiLookups }
          : null,
      },
    });
  });

  // Bid applications: per-tenant drafts with readiness evaluation. Always
  // require a signed-in account - this is private business data in every mode.

/** A 'ready' application must never stay ready once its checklist no longer
 *  evaluates ready (e.g. a new open requirement was added). Recompute after
 *  every requirement mutation. */
function applyReadyInvariant(app: BidApplication): void {
  if (app.state === 'ready' && !evaluateReadiness(app).ready) {
    app.state = 'draft';
  }
}

  const applicationsRouter = Router();
  applicationsRouter.use((req: Request, res: Response, next: NextFunction) => {
    if (!req.auth) {
      res.status(401).json({ success: false, error: 'authentication_required' });
      return;
    }
    next();
  });

  applicationsRouter.post('/', async (req: Request, res: Response) => {
    const { tenderRef, title, rawText } = req.body || {};
    if (typeof tenderRef !== 'string' || !tenderRef.trim() || typeof title !== 'string' || !title.trim()) {
      res.status(400).json({ success: false, error: 'tenderRef and title required' });
      return;
    }
    const now = new Date();
    const app: BidApplication = {
      id: randomBytes(12).toString('hex'),
      tenantId: req.auth!.tenantId,
      tenderRef: tenderRef.trim(),
      title: title.trim(),
      state: 'draft',
      // Compulsory-requirement starters: only officially verified rules, each
      // with its source; uncertain applicability stays needs_review.
      requirements: seedRequirementsForTender({ tenderRef: tenderRef.trim(), rawText: typeof rawText === 'string' ? rawText.slice(0, 200_000) : undefined }),
      createdAt: now,
      updatedAt: now,
    };
    await repos.applications.create(app);
    res.json({ success: true, application: app, readiness: evaluateReadiness(app) });
  });

  applicationsRouter.get('/', async (req: Request, res: Response) => {
    const apps = await repos.applications.listByTenant(req.auth!.tenantId);
    res.json({ success: true, applications: apps });
  });

  applicationsRouter.get('/:id', async (req: Request, res: Response) => {
    const app = await repos.applications.getById(req.auth!.tenantId, req.params.id);
    if (!app) {
      res.status(404).json({ success: false, error: 'not_found' });
      return;
    }
    res.json({ success: true, application: app, readiness: evaluateReadiness(app) });
  });

  // Self-serve erasure of one bid draft. Tenant-scoped: another account's
  // draft id is indistinguishable from a missing one.
  applicationsRouter.delete('/:id', async (req: Request, res: Response) => {
    const app = await repos.applications.getById(req.auth!.tenantId, req.params.id);
    if (!app) {
      res.status(404).json({ success: false, error: 'not_found' });
      return;
    }
    await repos.applications.delete(req.auth!.tenantId, req.params.id);
    res.json({ success: true, message: 'Bid draft deleted.' });
  });

  applicationsRouter.post('/:id/requirements', async (req: Request, res: Response) => {
    const app = await repos.applications.getById(req.auth!.tenantId, req.params.id);
    if (!app) {
      res.status(404).json({ success: false, error: 'not_found' });
      return;
    }
    const { label, sourceType, sourceReference } = req.body || {};
    if (typeof label !== 'string' || !label.trim() || typeof sourceReference !== 'string' || !sourceReference.trim()) {
      res.status(400).json({ success: false, error: 'label and sourceReference required - every requirement names its tender clause or official rule' });
      return;
    }
    const requirement: Requirement = {
      id: `req-${randomBytes(6).toString('hex')}`,
      label: label.trim(),
      source: {
        type: sourceType === 'tender_clause' ? 'tender_clause' : 'official_rule',
        reference: sourceReference.trim(),
      },
      status: 'missing',
    };
    app.requirements.push(requirement);
    applyReadyInvariant(app);
    app.updatedAt = new Date();
    await repos.applications.put(app);
    res.json({ success: true, application: app, readiness: evaluateReadiness(app) });
  });

  // A human marks a requirement satisfied and says with what evidence.
  applicationsRouter.post('/:id/requirements/:reqId/satisfy', async (req: Request, res: Response) => {
    const app = await repos.applications.getById(req.auth!.tenantId, req.params.id);
    if (!app) {
      res.status(404).json({ success: false, error: 'not_found' });
      return;
    }
    const requirement = app.requirements.find((r) => r.id === req.params.reqId);
    if (!requirement) {
      res.status(404).json({ success: false, error: 'requirement_not_found' });
      return;
    }
    const { evidenceNote } = req.body || {};
    requirement.status = 'satisfied';
    requirement.evidenceNote = typeof evidenceNote === 'string' ? evidenceNote.slice(0, 500) : undefined;
    delete requirement.notApplicableReason;
    applyReadyInvariant(app);
    app.updatedAt = new Date();
    await repos.applications.put(app);
    res.json({ success: true, application: app, readiness: evaluateReadiness(app) });
  });

  // A human records that a requirement does not apply to this tender, with
  // the reason. This is an explicit applicability decision - it resolves the
  // blocker but is reported as not_applicable, never as satisfied evidence.
  applicationsRouter.post('/:id/requirements/:reqId/not-applicable', async (req: Request, res: Response) => {
    const app = await repos.applications.getById(req.auth!.tenantId, req.params.id);
    if (!app) {
      res.status(404).json({ success: false, error: 'not_found' });
      return;
    }
    const requirement = app.requirements.find((r) => r.id === req.params.reqId);
    if (!requirement) {
      res.status(404).json({ success: false, error: 'requirement_not_found' });
      return;
    }
    const { reason } = req.body || {};
    if (typeof reason !== 'string' || !reason.trim()) {
      res.status(400).json({ success: false, error: 'reason required - record why this requirement does not apply to this tender' });
      return;
    }
    requirement.status = 'not_applicable';
    requirement.notApplicableReason = reason.trim().slice(0, 500);
    delete requirement.evidenceNote;
    applyReadyInvariant(app);
    app.updatedAt = new Date();
    await repos.applications.put(app);
    res.json({ success: true, application: app, readiness: evaluateReadiness(app) });
  });

  // The only path to 'ready': every requirement resolved - satisfied with evidence or recorded not applicable with a reason. Drafts save freely.
  applicationsRouter.post('/:id/mark-ready', async (req: Request, res: Response) => {
    const app = await repos.applications.getById(req.auth!.tenantId, req.params.id);
    if (!app) {
      res.status(404).json({ success: false, error: 'not_found' });
      return;
    }
    const readiness = evaluateReadiness(app);
    if (!readiness.ready) {
      res.status(409).json({ success: false, error: 'application_incomplete', readiness });
      return;
    }
    app.state = 'ready';
    app.updatedAt = new Date();
    await repos.applications.put(app);
    res.json({ success: true, application: app, readiness });
  });

  const router = Router();
  router.use(authRouter);
  router.use(accountRouter);
  router.use('/applications', applicationsRouter);

  const apiCacheHeaders = (req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  };

  const guardMiddleware = async (req: Request, res: Response, next: NextFunction) => {
    if (!config.authRequired) {
      next();
      return;
    }
    const rule = GUARDED_ROUTES.find((r) => r.method === req.method && r.path === req.path);
    if (!rule) {
      next();
      return;
    }
    if (!req.auth) {
      res.status(401).json({ success: false, error: 'authentication_required' });
      return;
    }
    if (!rule.action) {
      next();
      return;
    }
    try {
      const decision = await authorizeAndConsume(repos, config, req.auth.tenantId, rule.action);
      if (decision.allowed) markConsumed(req, rule.action);
      if (!decision.allowed) {
        const status = decision.reason === 'plan_limit_reached' ? 429 : 402;
        res.status(status).json({ success: false, error: decision.reason, entitlementStatus: decision.status });
        return;
      }
      next();
    } catch (err) {
      console.error('[foundation] entitlement check failed:', err);
      res.status(500).json({ success: false, error: 'entitlement_check_failed' });
    }
  };

  return { config, repos, originCheckMiddleware, sessionMiddleware, tenantWorkMiddleware, apiCacheHeaders, guardMiddleware, serpApiAccess, cloudLlmAccess, releaseConsumption, requireAuth, requireAdmin, isAdmin, adminRouter, router, webhookRouter };
}
