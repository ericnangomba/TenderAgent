import { test } from 'node:test';
import assert from 'node:assert/strict';
import { executeRfpPipeline, publicLlmConfigView } from '../src/lib/agents/mastraEngine';

// Regression: d4135ab shipped the engine-config resolution inside a line
// comment (literal "\n" sequences), leaving `config` undeclared; every
// analysis would have thrown. It also pins the SSRF guard's intent: a
// caller-supplied baseUrl must never be fetched - the server-resolved
// loopback runner is the only local endpoint.
test('engine config resolves and a client-supplied baseUrl is never fetched', async () => {
  const originalFetch = globalThis.fetch;
  const seenUrls: string[] = [];
  globalThis.fetch = (async (url: any) => {
    seenUrls.push(String(url));
    return new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        title: 'Synthetic Guard Tender',
        referenceNumber: 'SYN-2026-002',
        points: '80/20',
        technicalThreshold: 75,
        csdRequired: true,
        sarsPinRequired: true
      }) } }]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
  try {
    const r = await executeRfpPipeline({
      rawText: 'TENDER NOTICE\nProvision of cleaning services. BID NUMBER: SYN-2026-002. Closing date: 15 December 2026. Bidders must provide CSD registration and SARS Tax Compliance Status PIN. Submit SBD 4.',
      referenceId: 'SYN-2026-002',
      llmConfig: { provider: 'ollama', modelId: 'guard-test-model', baseUrl: 'http://169.254.169.254/latest/meta-data' } as any,
      allowCloudLlm: false
    });
    const expectedBase = publicLlmConfigView().baseUrl;
    assert.ok(expectedBase, 'server-resolved baseUrl must exist for a local provider');
    assert.ok(seenUrls.length > 0, 'local runner fetch should have been attempted');
    for (const u of seenUrls) {
      assert.ok(u.startsWith(expectedBase), `fetch must target the server baseUrl, got ${u}`);
    }
    assert.ok(!seenUrls.some(u => u.includes('169.254.169.254')), 'client-supplied baseUrl must never be called');
    assert.match(r.usedModel, /guard-test-model/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
