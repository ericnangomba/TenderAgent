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

export interface Foundation {
  config: FoundationConfig;
  repos: FoundationRepos;
  /** Rejects cross-origin state-changing requests. Mount before routes. */
  originCheckMiddleware: (req: Request, res: Response, next: NextFunction) => void;
  /** Attaches req.auth from the session cookie. Mount before routes. */
  sessionMiddleware: (req: Request, res: Response, next: NextFunction) => void;
  /** Auth + entitlement guards for spend-bearing routes. Mount after sessionMiddleware. */
  guardMiddleware: (req: Request, res: Response, next: NextFunction) => void;
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
        if (new URL(origin).host !== req.headers.host) {
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

  const accountRouter = Router();
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

  return { config, repos, originCheckMiddleware, sessionMiddleware, guardMiddleware, serpApiAccess, cloudLlmAccess, releaseConsumption, requireAuth, router, webhookRouter };
}
