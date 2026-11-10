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
app.use(foundation.sessionMiddleware);
app.use(foundation.guardMiddleware);
app.use('/api', foundation.router);
app.use('/api/admin', foundation.adminRouter);
app.post('/api/analyze', (_req, res) => res.json({ success: true, stub: 'analyze' }));
app.get('/api/scrape', (_req, res) => res.json({ success: true, tenders: [], source: 'qa-stub' }));
app.post('/api/parse-document', (_req, res) => res.json({ success: true, stub: 'parse' }));

const distDir = path.resolve(process.cwd(), 'dist');
if (!fs.existsSync(path.join(distDir, 'index.html'))) throw new Error('dist missing - run npm run build first');
app.use(express.static(distDir));
app.get('*', (_req, res) => res.sendFile(path.join(distDir, 'index.html')));

const server: Server = await new Promise((resolve) => {
  const s = app.listen(0, '127.0.0.1', () => resolve(s));
});
const { port } = server.address() as AddressInfo;
const base = `http://127.0.0.1:${port}`;

async function signup(email: string): Promise<{ cookie: string; userId: string }> {
  const r = await fetch(`${base}/api/auth/signup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'correct horse 9', companyName: 'QA Holdings (Pty) Ltd' }),
  });
  const body: any = await r.json();
  if (!body.success) throw new Error(`signup failed: ${JSON.stringify(body)}`);
  const cookie = (r.headers.get('set-cookie') || '').split(';')[0];
  return { cookie, userId: body.userId };
}

const customer = await signup('customer.qa@example.co.za');
const admin = await signup('operator.qa@example.co.za');
config.adminUserIds.push(admin.userId); // live-array grant for QA pixels only

console.log(JSON.stringify({ port, customerCookie: customer.cookie, adminCookie: admin.cookie, adminUserId: admin.userId }));

// Keep alive until killed.
process.on('SIGTERM', () => server.close(() => process.exit(0)));
