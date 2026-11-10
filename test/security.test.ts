/**
 * Runtime security regressions against the REAL server (server.ts booted as a
 * child process). Covers the findings from independent review:
 *   1. /api/models/active must never disclose the server API key, and requires auth
 *   2. /api/analyze ignores caller-supplied llmConfig (SSRF + key-leak vector)
 *   3. /api/models/detect only probes loopback endpoints
 *   4. anonymous /api/tenders never includes tenant-tagged records
 *   5. profile mutators require an account, finetune/model endpoints are operator-only, in EVERY mode
 *   6. paid cloud AI (Gemini) is never called for non-subscribers, even with a key set
 *   7. usage units are released when the paid resource was not actually consumed
 *   8. /api/health carries no compliance/runtime claims
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

const TEST_SECRET = 'test-webhook-secret';
const FAKE_GEMINI_KEY = 'FAKE_GEMINI_KEY_123';

interface RunningServer { child: ChildProcess; baseUrl: string; }

async function waitForHealth(baseUrl: string, timeoutMs = 30000): Promise<void> {
  const start = Date.now();
  for (;;) {
    try {
      const res = await fetch(`${baseUrl}/api/health`);
      if (res.ok) return;
    } catch { /* not up yet */ }
    if (Date.now() - start > timeoutMs) throw new Error('server did not boot in time');
    await new Promise(r => setTimeout(r, 300));
  }
}

async function bootRealServer(port: number, extraEnv: NodeJS.ProcessEnv = {}): Promise<RunningServer> {
  // Spawn node directly (not via npx) so kill() reaches the real server
  // process and the test runner can exit cleanly afterwards.
  const child = spawn(process.execPath, ['--import', 'tsx', 'server.ts'], {
    env: {
      ...process.env,
      NODE_ENV: 'production',
      ALLOW_MEMORY_STORE_IN_PRODUCTION: 'true',
      PORT: String(port),
      STORE: 'memory',
      MOCK_BILLING_SECRET: TEST_SECRET,
      GEMINI_API_KEY: FAKE_GEMINI_KEY,
      SERPAPI_API_KEY: '',
      ...extraEnv,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stderr.on('data', () => {});
  const baseUrl = `http://127.0.0.1:${port}`;
  await waitForHealth(baseUrl);
  return { child, baseUrl };
}

async function signup(baseUrl: string, email: string): Promise<{ cookie: string; tenantId: string }> {
  const res = await fetch(`${baseUrl}/api/auth/signup`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'correct horse 9', companyName: 'Sec Test Co' }),
  });
  assert.ok(res.ok, `signup failed: ${res.status}`);
  const cookie = (res.headers.get('set-cookie') || '').split(';')[0];
  return { cookie, tenantId: (await res.json()).tenantId };
}

async function activateSubscription(baseUrl: string, tenantId: string, eventId: string): Promise<void> {
  const { createHmac } = await import('node:crypto');
  const body = JSON.stringify({
    eventId, type: 'subscription.activated', tenantId, planId: 'standard_monthly',
    subscriptionRef: `sub_${eventId}`, periodEnd: '2027-12-31T00:00:00Z', occurredAt: '2026-11-10T10:00:00Z',
  });
  const signature = 'sha256=' + createHmac('sha256', TEST_SECRET).update(body).digest('hex');
  const res = await fetch(`${baseUrl}/api/billing/webhook/mock`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-billing-signature': signature }, body,
  });
  assert.ok(res.ok, `webhook failed: ${res.status}`);
}

// ---------- Demo mode (AUTH_REQUIRED=false): the public deployment posture ----------
let demo: RunningServer;
before(async () => { demo = await bootRealServer(3411, { AUTH_REQUIRED: 'false' }); });
after(() => { demo.child.kill('SIGTERM'); });

test('health carries no compliance claims or hardcoded availability', async () => {
  const body = JSON.stringify(await (await fetch(`${demo.baseUrl}/api/health`)).json());
  assert.ok(!body.includes('Sandboxed'), body);
  assert.ok(!body.includes('popiaCompliance'), body);
  assert.ok(!body.includes('"openLlmAvailable":true'), body);
});

test('models/active: operator-only - anonymous 401, signed-in non-admin 403, denial echoes nothing', async () => {
  const anon = await fetch(`${demo.baseUrl}/api/models/active`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ modelId: 'gemma2-local' }),
  });
  assert.equal(anon.status, 401);

  // Model switching is a platform tweak, so it sits behind requireAdmin now.
  // A plain signed-in customer must be refused - and the refusal must not
  // echo the server key or any caller-supplied fields either.
  const { cookie } = await signup(demo.baseUrl, 'models@example.com');
  const res = await fetch(`${demo.baseUrl}/api/models/active`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ modelId: 'gemma2-local', baseUrl: 'http://attacker.invalid/v1', apiKey: 'injected' }),
  });
  assert.equal(res.status, 403, 'model switching is an operator action');
  const text = await res.text();
  assert.ok(!text.includes(FAKE_GEMINI_KEY), 'server key leaked in response');
  assert.ok(!text.includes('attacker.invalid'), 'caller baseUrl accepted');
  assert.ok(!text.includes('injected'), 'caller apiKey accepted');
});

test('analyze: caller-supplied llmConfig.baseUrl receives NO request and NO key (SSRF)', async () => {
  let hits = 0; let authHeader: string | undefined;
  const attacker: Server = createServer((req, res) => {
    hits += 1; authHeader = req.headers.authorization;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content: '{"title":"pwned"}' } }] }));
  });
  await new Promise<void>(r => attacker.listen(0, '127.0.0.1', r));
  const attackerPort = (attacker.address() as AddressInfo).port;
  try {
    const res = await fetch(`${demo.baseUrl}/api/analyze`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rawText: 'TENDER REF: SEC/2026/01. Supply of office furniture. CSD required.',
        referenceId: 'SEC-SSRF-1',
        llmConfig: { baseUrl: `http://127.0.0.1:${attackerPort}/v1`, modelId: 'evil', apiKey: 'x' },
      }),
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(hits, 0, 'caller baseUrl was contacted');
    assert.equal(authHeader, undefined);
    assert.ok(String(data.usedModel || '').indexOf('evil') === -1, 'caller model id used');
  } finally {
    attacker.close();
  }
});

test('analyze: paid cloud AI is skipped for non-subscribers even with a server key set', async () => {
  const res = await fetch(`${demo.baseUrl}/api/analyze`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rawText: 'TENDER REF: SEC/2026/02. Cleaning services. SARS TCS PIN required.', referenceId: 'SEC-CLOUD-1' }),
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.ok(!String(data.usedModel).includes('Gemini'), `cloud model used: ${data.usedModel}`);
  assert.ok((data.traceLogs || []).some((l: string) => l.includes('paid AI credits')), 'policy log missing');
});

test('models/detect: operator-only in every mode (SSRF probe surface closed to customers)', async () => {
  const anon = await fetch(`${demo.baseUrl}/api/models/detect`);
  assert.equal(anon.status, 401, 'anonymous callers must not probe host model runners');

  const { cookie } = await signup(demo.baseUrl, 'detect@example.com');
  const denied = await fetch(`${demo.baseUrl}/api/models/detect?endpoint=http://169.254.169.254/latest/meta-data`, { headers: { cookie } });
  assert.equal(denied.status, 403, 'host model probing is an operator action');
});

test('demo mode: subscriber Gemini allowance metered exactly once per analysis', async () => {
  const { cookie, tenantId } = await signup(demo.baseUrl, 'metered@example.com');
  await activateSubscription(demo.baseUrl, tenantId, 'evt-meter-1');
  for (let i = 0; i < 2; i++) {
    const res = await fetch(`${demo.baseUrl}/api/analyze`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify({ rawText: 'TENDER REF: SEC/2026/09. Metering check tender text.', referenceId: `SEC-M-${i}` }),
    });
    assert.equal(res.status, 200);
  }
  const body = await (await fetch(`${demo.baseUrl}/api/account`, { headers: { cookie } })).json();
  assert.equal(body.account.usage.analyses, 2, `expected exactly 2 metered analyses, got ${JSON.stringify(body.account.usage)}`);
});

test('profile: saving requires an account in every mode', async () => {
  const anon = await fetch(`${demo.baseUrl}/api/profile`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyName: 'Anon Co' }),
  });
  assert.equal(anon.status, 401);
});

test('tenders: anonymous and other tenants never see tenant-tagged records', async () => {
  const a = await signup(demo.baseUrl, 'tenanta@example.com');
  const b = await signup(demo.baseUrl, 'tenantb@example.com');
  const analyze = await fetch(`${demo.baseUrl}/api/analyze`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', cookie: a.cookie },
    body: JSON.stringify({ rawText: 'TENDER REF: PRIV/2026/99. Private tenant record marker ZXQMARK.', referenceId: 'PRIV-2026-99' }),
  });
  assert.equal(analyze.status, 200);

  const anonList = JSON.stringify(await (await fetch(`${demo.baseUrl}/api/tenders`)).json());
  assert.ok(!anonList.includes('ZXQMARK'), 'anonymous list leaked tenant record');
  const bList = JSON.stringify(await (await fetch(`${demo.baseUrl}/api/tenders`, { headers: { cookie: b.cookie } })).json());
  assert.ok(!bList.includes('ZXQMARK'), 'other tenant list leaked record');
  const aList = JSON.stringify(await (await fetch(`${demo.baseUrl}/api/tenders`, { headers: { cookie: a.cookie } })).json());
  assert.ok(aList.includes('ZXQMARK'), 'own record missing');
});

test('finetune endpoints are operator-only in every mode', async () => {
  const { cookie } = await signup(demo.baseUrl, 'ft-boundary@example.com');
  for (const [path, body] of [
    ['/api/finetune/datasets', { name: 'x' }],
    ['/api/finetune/datasets/generate-from-tenders', {}],
    ['/api/finetune/start', { baseModel: 'llama' }],
    ['/api/finetune/deploy', { jobId: 'ft-job-001' }],
    ['/api/finetune/compare', { prompt: 'x' }],
  ] as const) {
    const res = await fetch(`${demo.baseUrl}${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    assert.equal(res.status, 401, `${path} should reject anonymous callers`);
    const denied = await fetch(`${demo.baseUrl}${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify(body),
    });
    assert.equal(denied.status, 403, `${path} should reject non-operator accounts`);
  }
  const ds = await fetch(`${demo.baseUrl}/api/finetune/datasets`);
  assert.equal(ds.status, 401, 'anonymous dataset list is closed entirely');
});

// ---------- Guarded mode (AUTH_REQUIRED=true) ----------
let guarded: RunningServer;

test('guarded mode: webhook activation then analyze works, serpapi unit released when lookup not consumed', async () => {
  guarded = await bootRealServer(3412, { AUTH_REQUIRED: 'true' });
  try {
    const { cookie, tenantId } = await signup(guarded.baseUrl, 'guarded@example.com');
    const denied = await fetch(`${guarded.baseUrl}/api/analyze`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify({ rawText: 'x' }),
    });
    assert.equal(denied.status, 402);

    await activateSubscription(guarded.baseUrl, tenantId, 'evt-sec-1');
    const okRes = await fetch(`${guarded.baseUrl}/api/analyze`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify({ rawText: 'TENDER REF: SEC/2026/03. Security services tender text.', referenceId: 'SEC-G-1' }),
    });
    assert.equal(okRes.status, 200);

    // Scrape with no SERPAPI key configured: fixture feed, unit must be released.
    const scrape = await fetch(`${guarded.baseUrl}/api/scrape`, { headers: { cookie } });
    assert.equal(scrape.status, 200);
    const feed = await scrape.json();
    assert.equal(feed.serpApiConsumed, false);

    const body = await (await fetch(`${guarded.baseUrl}/api/account`, { headers: { cookie } })).json();
    assert.equal(body.account.usage.serpapiLookups, 0, `lookup unit not released: ${JSON.stringify(body.account.usage)}`);
    assert.equal(body.account.usage.analyses, 1);
  } finally {
    guarded.child.kill('SIGTERM');
  }
});

// ---------- Per-account login throttling (credential stuffing across IPs) ----------
test('login: per-account throttle holds across rotating source IPs', async () => {
  const srv = await bootRealServer(3413, {
    TRUST_PROXY: 'loopback',
    AUTH_RATE_LIMIT_MAX: '4',
    AUTH_RATE_LIMIT_WINDOW_MS: '60000',
  });
  try {
    await signup(srv.baseUrl, 'victim@example.com');
    await signup(srv.baseUrl, 'bystander@example.com');
    const attempt = (email: string, password: string, ip: string) => fetch(`${srv.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip },
      body: JSON.stringify({ email, password }),
    });
    // Four failed logins, each from a different source IP: the IP limiter never trips.
    for (let i = 1; i <= 4; i++) {
      const res = await attempt('victim@example.com', 'wrong password', `10.0.0.${i}`);
      assert.equal(res.status, 401, `attempt ${i}`);
    }
    // The fifth attempt - correct password, fresh IP - is stopped by the per-account window.
    const locked = await attempt('victim@example.com', 'correct horse 9', '10.0.0.5');
    assert.equal(locked.status, 429, 'per-account limit did not hold across IPs');
    // A different account from yet another IP is unaffected.
    const other = await attempt('bystander@example.com', 'correct horse 9', '10.0.0.6');
    assert.equal(other.status, 200, 'per-account limit leaked onto another account');
  } finally {
    srv.child.kill('SIGTERM');
  }
});
