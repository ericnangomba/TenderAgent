/** Local pixel-QA harness: real foundation wiring + built SPA, screenshots via headless Chrome.
 *  NOT part of the product - lives outside src/, never shipped. */
import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createFoundation } from '../src/lib/server/foundation';
import { loadConfig } from '../src/lib/server/config';
import { createMemoryRepos } from '../src/lib/server/repos/memory';
import { MockBillingProvider } from '../src/lib/server/billing';

const SECRET = 'qa-webhook-secret';
const config = loadConfig({});
config.authRequired = true;
config.mockBillingSecret = SECRET;

const repos = createMemoryRepos();
const foundation = createFoundation({ config, repos, providers: [new MockBillingProvider(SECRET)] });

const app = express();
app.use('/api/billing/webhook', foundation.webhookRouter);
app.use(express.json());
app.use(foundation.originCheckMiddleware);
app.use('/api', foundation.apiCacheHeaders);
app.use(foundation.sessionMiddleware);
app.use(foundation.guardMiddleware);
app.use('/api', foundation.router);
app.use('/api/admin', foundation.adminRouter);
// QA: run the REAL pipeline on the statutory (offline) engine - no network,
// no paid credits - so analyzer pixels verify actual extraction behavior.
app.post('/api/analyze', async (req, res) => {
  try {
    const { executeRfpPipeline } = await import('../src/lib/agents/mastraEngine');
    const { rawText, referenceId, companyProfile } = req.body || {};
    const r = await executeRfpPipeline({
      rawText: String(rawText || ''),
      referenceId: String(referenceId || 'QA-REF'),
      companyProfile,
      llmConfig: { provider: 'statutory', modelId: 'gemma2-local' },
      allowCloudLlm: false,
    });
    res.json({ success: true, tender: r.record, skeleton: r.skeleton, traceLogs: r.traceLogs, spans: r.spans });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});
app.get('/api/scrape', (_req, res) => res.json({ success: true, tenders: [], source: 'qa-stub' }));
app.post('/api/parse-document', (_req, res) => res.json({ success: true, stub: 'parse' }));

// Route parity with server.ts for honest QA pixels: health + per-tenant profile.
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    engine: 'TenderAgent RFP pipeline',
    configuredModel: 'gemini-2.5-flash',
    configuredProvider: 'google-genai',
    geminiConfigured: false,
    localModelCheck: 'on-demand via /api/models/detect',
    sentryTracing: false,
    authRequired: config.authRequired,
    store: config.store,
    privacyNote: 'PII redaction before AI processing currently covers ID-number and card-like digit sequences only.',
    sampleTendersLoaded: 14
  });
});
app.get('/api/profile', async (req, res) => {
  if ((req as any).auth) {
    const stored = await repos.profiles.get((req as any).auth.tenantId);
    res.json({ success: true, profile: stored ? stored.profile : {} });
    return;
  }
  res.json({ success: true, profile: {} });
});
app.post('/api/profile', foundation.requireAuth, async (req, res) => {
  const existing = await repos.profiles.get((req as any).auth.tenantId);
  const merged = { ...(existing ? existing.profile : {}), ...req.body };
  await repos.profiles.put({ tenantId: (req as any).auth.tenantId, profile: merged, updatedAt: new Date() });
  res.json({ success: true, profile: merged });
});

const distDir = path.resolve(process.cwd(), 'dist');
if (!fs.existsSync(path.join(distDir, 'index.html'))) throw new Error('dist missing - run npm run build first');
app.use(express.static(distDir));
app.get('*', (_req, res) => res.sendFile(path.join(distDir, 'index.html')));

const server: Server = await new Promise((resolve) => {
  const s = app.listen(0, '127.0.0.1', () => resolve(s));
});
const { port } = server.address() as AddressInfo;
const base = `http://127.0.0.1:${port}`;

async function signup(email: string): Promise<{ cookie: string; userId: string; tenantId: string }> {
  const r = await fetch(`${base}/api/auth/signup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'correct horse 9', companyName: 'QA Holdings (Pty) Ltd' }),
  });
  const body: any = await r.json();
  if (!body.success) throw new Error(`signup failed: ${JSON.stringify(body)}`);
  const cookie = (r.headers.get('set-cookie') || '').split(';')[0];
  return { cookie, userId: body.userId, tenantId: body.tenantId };
}

const customer = await signup('customer.qa@example.co.za');

// QA: activate a subscription directly through the entitlement pipeline so the
// guarded /api/analyze route runs for the pixel pass (billing stays mock).
const { applyBillingEvent } = await import('../src/lib/server/entitlement');
await applyBillingEvent(repos, {
  eventId: 'qa-evt-activate', provider: 'mock', type: 'subscription.activated',
  tenantId: customer.tenantId, planId: 'standard_monthly', subscriptionRef: 'qa-sub',
  periodEnd: new Date(Date.now() + 30 * 24 * 3600 * 1000), occurredAt: new Date(),
}, new Date());
const admin = await signup('operator.qa@example.co.za');
config.adminUserIds.push(admin.userId); // live-array grant for QA pixels only

// QA-only: lets the PWA offline check take the network down for real.
app.post('/qa/shutdown', (_req, res) => {
  res.json({ ok: true });
  setTimeout(() => process.exit(0), 250);
});

console.log(JSON.stringify({ port, customerCookie: customer.cookie, adminCookie: admin.cookie, adminUserId: admin.userId }));

// Keep alive until killed.
process.on('SIGTERM', () => server.close(() => process.exit(0)));
