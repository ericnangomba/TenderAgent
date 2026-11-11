import { test } from 'node:test';
import assert from 'node:assert/strict';
import { executeRfpPipeline, resolveServerLlmConfig } from '../src/lib/agents/mastraEngine';

test('explicit offline preview makes no fetch calls even with cloud permission/key; result/checklist/skeleton truthful', async () => {
  const originalFetch = globalThis.fetch, oldKey = process.env.GEMINI_API_KEY;
  let calls = 0;
  globalThis.fetch = (async () => { calls++; throw new Error('Unexpected outbound call'); }) as typeof fetch;
  process.env.GEMINI_API_KEY = 'synthetic-not-a-real-key';
  try {
    const r = await executeRfpPipeline({ rawText: 'TENDER NOTICE\nProvision of cleaning services. BID NUMBER: SYN-2026-001. Closing date: 15 December 2026. Bidders must provide CSD registration and SARS Tax Compliance Status PIN. Submit SBD 4.', referenceId: 'SYN-2026-001', llmConfig: resolveServerLlmConfig('gemma2-local'), allowCloudLlm: true });
    assert.equal(calls, 0);
    assert.match(r.usedModel, /Rule-based.*no language model/);
    assert.equal(r.record.extractedComplianceChecklist.csdRequired, true);
    assert.equal(r.record.extractedComplianceChecklist.sarsPinRequired, true);
    assert.ok(r.skeleton);
    assert.ok(r.traceLogs.some(x => x.includes('included in this response')));
  } finally { globalThis.fetch = originalFetch; if (oldKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = oldKey; }
});
