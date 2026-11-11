import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { IFineTuningDataset } from '../src/lib/types/tender';
import { registerGeneratedDatasetRoute } from '../src/lib/server/generatedDatasets';
import { previewAnalysisExpiry } from '../src/lib/server/dataLifecycle';
import { startTestApp, stopTestApp, signup } from './helpers';

test('analysis expiry preview defaults off, preserves input and excludes fixtures/invalid timestamps', () => {
  const store = new Map([
    ['public', { createdAt: '2026-01-01' }],
    ['old', { tenantId: 'a', createdAt: '2026-01-01' }],
    ['new', { tenantId: 'b', createdAt: '2026-11-11' }],
    ['invalid', { tenantId: 'a', createdAt: 'bad-date' }],
  ]);
  const before = structuredClone(store);
  assert.deepEqual(previewAnalysisExpiry(store), []);
  assert.deepEqual(previewAnalysisExpiry(store, { maxAgeMs: 86400000 }, Date.parse('2026-11-11')), [{ key: 'old', tenantId: 'a' }]);
  assert.deepEqual(store, before);
  for (const maxAgeMs of [0, -1, NaN, Infinity, 1.5]) {
    assert.throws(() => previewAnalysisExpiry(store, { maxAgeMs }));
  }
});

test('generated examples remain tenant-owned and never mutate shared curated samples', async () => {
  const app = await startTestApp();
  const datasets: IFineTuningDataset[] = [{
    id: 'dataset-sa-procure-v1', name: 'Public fixture', description: 'fixture', category: 'sample',
    version: '1', format: 'alpaca', examples: [], exampleCount: 0, tokenCountEst: 0, createdAt: '2026-01-01',
  }];
  registerGeneratedDatasetRoute(app.app, { foundation: app.foundation, store: app.tenderStore, datasets });
  try {
    const a = await signup(app.baseUrl, 'admin-a@example.invalid');
    const b = await signup(app.baseUrl, 'admin-b@example.invalid');
    const plain = await signup(app.baseUrl, 'plain@example.invalid');
    app.foundation.config.adminUserIds.push(a.userId, b.userId);
    app.tenderStore.set('A-PRIVATE', { tenantId: a.tenantId, title: 'Secret A', referenceNumber: 'A-PRIVATE' });
    app.tenderStore.set('B-PRIVATE', { tenantId: b.tenantId, title: 'Secret B', referenceNumber: 'B-PRIVATE' });
    const generate = (cookie?: string) => fetch(`${app.baseUrl}/api/finetune/datasets/generate-from-tenders`, {
      method: 'POST', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: '{}',
    });
    assert.equal((await generate()).status, 401);
    assert.equal((await generate(plain.cookie)).status, 403);
    const aa = await generate(a.cookie);
    assert.equal(aa.status, 200);
    const aBody = await aa.json();
    assert.equal(aBody.dataset.tenantId, a.tenantId);
    assert.ok(JSON.stringify(aBody).includes('A-PRIVATE'));
    assert.ok(!JSON.stringify(aBody).includes('B-PRIVATE'));
    const bb = await generate(b.cookie);
    assert.equal(bb.status, 200);
    const bBody = await bb.json();
    assert.equal(bBody.dataset.tenantId, b.tenantId);
    assert.ok(!JSON.stringify(bBody).includes('A-PRIVATE'));
    assert.ok(JSON.stringify(bBody).includes('B-PRIVATE'));
    assert.deepEqual(datasets.find(d => d.id === 'dataset-sa-procure-v1')!.examples, []);
    assert.equal(datasets.filter(d => d.tenantId === a.tenantId).length, 1);
    await generate(a.cookie);
    assert.equal(datasets.filter(d => d.tenantId === a.tenantId).length, 1);
    assert.equal(datasets.filter(d => !d.tenantId || d.tenantId === b.tenantId).some(d => JSON.stringify(d).includes('A-PRIVATE')), false);
  } finally { await stopTestApp(app); }
});

test('real simulated-start handler refuses absent, unknown and foreign datasets without fallback or timers', async () => {
  const { registerSimulatedTrainingRoute } = await import('../src/lib/server/simulatedTraining');
  const app = await startTestApp();
  const datasets: IFineTuningDataset[] = [];
  const jobs: import('../src/lib/types/tender').IFineTuningJob[] = [];
  let timers = 0;
  const timerRegistry = new Map<string, ReturnType<typeof setInterval>>();
  registerSimulatedTrainingRoute(app.app, {
    foundation: app.foundation, datasets, jobs, timers: timerRegistry,
    schedule: (() => { timers++; return 0; }) as unknown as typeof setInterval,
  });
  try {
    const a = await signup(app.baseUrl, 'start-a@example.invalid');
    const b = await signup(app.baseUrl, 'start-b@example.invalid');
    const plain = await signup(app.baseUrl, 'start-plain@example.invalid');
    app.foundation.config.adminUserIds.push(a.userId, b.userId);
    const fixture = { name: 'Public', description: '', category: 'sample', version: '1', format: 'alpaca' as const, examples: [], exampleCount: 0, tokenCountEst: 0, createdAt: '2026-01-01' };
    datasets.push({ ...fixture, id: 'A-PRIVATE', name: 'Private A name', tenantId: a.tenantId }, { ...fixture, id: 'public' });
    const start = (body: object, cookie?: string) => fetch(`${app.baseUrl}/api/finetune/start`, {
      method: 'POST', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body),
    });
    assert.equal((await start({ datasetId: 'public' })).status, 401);
    assert.equal((await start({ datasetId: 'public' }, plain.cookie)).status, 403);
    for (const body of [{}, { datasetId: '' }, { datasetId: null }]) {
      assert.equal((await start(body, b.cookie)).status, 400);
    }
    for (const datasetId of ['unknown', 'A-PRIVATE']) {
      const res = await start({ datasetId }, b.cookie);
      assert.equal(res.status, 404);
      assert.deepEqual(await res.json(), { success: false, error: 'dataset_not_found' });
    }
    assert.equal(jobs.length, 0);
    assert.equal(timers, 0);
    const originalNow = Date.now;
    Date.now = () => 1234567890000;
    try {
    const publicRes = await start({ datasetId: 'public' }, b.cookie);
    assert.equal(publicRes.status, 200);
    assert.equal((await publicRes.json()).job.datasetName, 'Public');
    const ownRes = await start({ datasetId: 'A-PRIVATE' }, a.cookie);
    assert.equal(ownRes.status, 200);
    assert.equal((await ownRes.json()).job.datasetName, 'Private A name');
    assert.equal(jobs.length, 2);
    assert.equal(timers, 2);
    assert.notEqual(jobs[0].id, jobs[1].id, 'same-clock jobs have distinct timer keys');
    assert.equal(timerRegistry.size, 2);
    const { eraseTenantEphemeral } = await import('../src/lib/server/ephemeralErasure');
    eraseTenantEphemeral(a.tenantId, { tenders: new Map(), datasets, jobs, timers: timerRegistry });
    assert.equal(jobs.length, 1); assert.equal(jobs[0].tenantId, b.tenantId);
    assert.equal(timerRegistry.size, 1); assert.ok(timerRegistry.has(jobs[0].id));
    } finally { Date.now = originalNow; }
  } finally { await stopTestApp(app); }
});
