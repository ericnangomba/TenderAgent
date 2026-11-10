/** Shared test scaffolding: a minimal express app wired exactly like server.ts. */
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createFoundation, type Foundation } from '../src/lib/server/foundation';
import { loadConfig, type FoundationConfig } from '../src/lib/server/config';
import { createMemoryRepos } from '../src/lib/server/repos/memory';
import { MockBillingProvider } from '../src/lib/server/billing';
import { fetchSouthAfricanTenders } from '../src/lib/services/serpDiscovery';
import { registerTenderFeedRoutes } from '../src/lib/server/tenderFeed';
import { SAMPLE_TENDERS } from '../src/lib/data/sampleTenders';

export const TEST_SECRET = 'test-webhook-secret';

export function testConfig(overrides: Partial<FoundationConfig> = {}): FoundationConfig {
  return { ...loadConfig({}), authRequired: true, mockBillingSecret: TEST_SECRET, ...overrides };
}

export interface TestApp {
  app: express.Express;
  foundation: Foundation;
  server: Server;
  baseUrl: string;
  tenderStore: Map<string, any>;
}

export async function startTestApp(configOverrides: Partial<FoundationConfig> = {}): Promise<TestApp> {
  const config = testConfig(configOverrides);
  const repos = createMemoryRepos();
  const foundation = createFoundation({ config, repos, providers: [new MockBillingProvider(TEST_SECRET)] });

  const app = express();
  app.use('/api/billing/webhook', foundation.webhookRouter);
  app.use(express.json());
  app.use(foundation.originCheckMiddleware);
app.use('/api', foundation.apiCacheHeaders);
  app.use(foundation.sessionMiddleware);
  app.use(foundation.guardMiddleware);
  app.use('/api', foundation.router);
  app.use('/api/admin', foundation.adminRouter);

  // Stub the LLM route (never call paid models in tests); use the REAL scrape
  // handler so the SerpApi fixture/spend rules are exercised end to end.
  app.post('/api/analyze', (_req, res) => res.json({ success: true, stub: 'analyze' }));
  app.get('/api/scrape', async (req, res) => {
    const allowSerpApi = await foundation.serpApiAccess(req);
    const result = await fetchSouthAfricanTenders(undefined, undefined, { allowSerpApi });
    res.json(result);
  });
  app.post('/api/parse-document', (_req, res) => res.json({ success: true, stub: 'parse' }));

  // /api/profile exactly as server.ts serves it: requireAuth + per-tenant read.
  app.get('/api/profile', foundation.requireAuth, async (req, res) => {
    const stored = await foundation.repos.profiles.get((req as any).auth.tenantId);
    res.json({ success: true, profile: stored ? stored.profile : {} });
  });

  // Real tender-feed routes on a per-app store seeded exactly like server.ts.
  const tenderStore = new Map<string, any>();
  SAMPLE_TENDERS.forEach((t: any) => tenderStore.set(t.referenceNumber, t));
  registerTenderFeedRoutes(app, { foundation, store: tenderStore });

  const server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const { port } = server.address() as AddressInfo;
  return { app, foundation, server, baseUrl: `http://127.0.0.1:${port}`, tenderStore };
}

export function stopTestApp(t: TestApp): Promise<void> {
  return new Promise((resolve) => t.server.close(() => resolve()));
}

/** Signs up a fresh tenant and returns its session cookie + tenantId. */
export async function signup(baseUrl: string, email: string, password = 'correct horse 9'): Promise<{ cookie: string; tenantId: string; userId: string }> {
  const res = await fetch(`${baseUrl}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, companyName: 'Test Co' }),
  });
  if (!res.ok) throw new Error(`signup failed: ${res.status} ${await res.text()}`);
  const setCookie = res.headers.get('set-cookie') || '';
  const cookie = setCookie.split(';')[0];
  const body = await res.json();
  return { cookie, tenantId: body.tenantId, userId: body.userId };
}

export function signWebhook(payload: object): { body: string; signature: string } {
  const body = JSON.stringify(payload);
  return { body, signature: MockBillingProvider.sign(TEST_SECRET, body) };
}
