import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, stopTestApp, signup, type TestApp } from './helpers';

let t: TestApp;
before(async () => { t = await startTestApp(); });
after(async () => { await stopTestApp(t); });

async function api(cookie: string, method: string, path: string, body?: object) {
  const res = await fetch(`${t.baseUrl}/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', cookie },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json() };
}

test('applications require sign-in in every mode', async () => {
  const anon = await api('', 'GET', '/applications');
  assert.equal(anon.status, 401);
});

test('draft saves incomplete; mark-ready blocked until every requirement satisfied', async () => {
  const { cookie } = await signup(t.baseUrl, 'builder@example.com');

  const created = await api(cookie, 'POST', '/applications', {
    tenderRef: 'WC-ROADS-2026-014',
    title: 'Road maintenance WC',
    rawText: 'Bidders must hold an active CIDB grading of 4CE or higher. Closing date 12 December 2026.',
  });
  assert.equal(created.status, 200);
  const appId = created.body.application.id;
  assert.equal(created.body.application.state, 'draft'); // incomplete draft saved freely

  // Tender text mentions CIDB -> the verified CIDB rule is seeded as needs_review (human must confirm).
  // CSD/SARS were NOT mentioned in this tender text, so they are seeded needs_review too:
  // general rules are never presented as firmly compulsory without per-tender verification.
  const readiness0 = created.body.readiness;
  assert.equal(readiness0.ready, false);
  assert.ok(readiness0.blockers.some((b: any) => b.requirementId === 'req-cidb' && b.reason === 'needs_review'));
  assert.ok(readiness0.blockers.some((b: any) => b.requirementId === 'req-csd' && b.reason === 'needs_review'));
  assert.ok(readiness0.blockers.some((b: any) => b.requirementId === 'req-sars-tcs' && b.reason === 'needs_review'));
  // Every seeded requirement cites its official source URL.
  for (const r of created.body.application.requirements) {
    assert.ok(r.source.url && r.source.url.startsWith('https://'), `requirement ${r.id} cites an official source URL`);
  }

  const blocked = await api(cookie, 'POST', `/applications/${appId}/mark-ready`);
  assert.equal(blocked.status, 409);
  assert.equal(blocked.body.error, 'application_incomplete');
  assert.ok(blocked.body.readiness.blockers.length > 0);

  // Satisfy everything a human would verify.
  for (const reqId of ['req-csd', 'req-sars-tcs', 'req-cidb']) {
    const sat = await api(cookie, 'POST', `/applications/${appId}/requirements/${reqId}/satisfy`, {
      evidenceNote: 'verified document uploaded',
    });
    assert.equal(sat.status, 200);
  }

  const ready = await api(cookie, 'POST', `/applications/${appId}/mark-ready`);
  assert.equal(ready.status, 200);
  assert.equal(ready.body.application.state, 'ready');
  assert.equal(ready.body.readiness.ready, true);
});

test('custom requirements must name their source clause or rule', async () => {
  const { cookie } = await signup(t.baseUrl, 'src@example.com');
  const created = await api(cookie, 'POST', '/applications', { tenderRef: 'T-1', title: 'Test tender' });
  const appId = created.body.application.id;

  const noSource = await api(cookie, 'POST', `/applications/${appId}/requirements`, { label: 'Some document' });
  assert.equal(noSource.status, 400);

  const withSource = await api(cookie, 'POST', `/applications/${appId}/requirements`, {
    label: 'SBD 4 Declaration of Interest',
    sourceType: 'tender_clause',
    sourceReference: 'Tender data sheet clause 4.2 - returnable schedule B',
  });
  assert.equal(withSource.status, 200);
  assert.ok(withSource.body.application.requirements.some((r: any) => r.source.reference.includes('clause 4.2')));
});

test('applications are isolated per tenant', async () => {
  const a = await signup(t.baseUrl, 'tenant-a@example.com');
  const b = await signup(t.baseUrl, 'tenant-b@example.com');
  const created = await api(a.cookie, 'POST', '/applications', { tenderRef: 'PRIV-1', title: 'A private tender' });
  const appId = created.body.application.id;

  const listB = await api(b.cookie, 'GET', '/applications');
  assert.equal(listB.body.applications.length, 0);
  const readB = await api(b.cookie, 'GET', `/applications/${appId}`);
  assert.equal(readB.status, 404); // no existence leak across tenants
});

test('tender without construction text does not get a CIDB requirement auto-added', async () => {
  const { cookie } = await signup(t.baseUrl, 'clean@example.com');
  const created = await api(cookie, 'POST', '/applications', {
    tenderRef: 'ICT-SUPPLY-2026-09',
    title: 'Laptop supply',
    rawText: 'Supply and delivery of laptops. No construction works.',
  });
  const ids = created.body.application.requirements.map((r: any) => r.id);
  assert.ok(!ids.includes('req-cidb'));
  assert.ok(ids.includes('req-csd'));
  assert.ok(ids.includes('req-sars-tcs'));
});

test('tender text mentioning CSD/SARS seeds those requirements as firm missing', async () => {
  const { cookie } = await signup(t.baseUrl, 'mentions@example.com');
  const created = await api(cookie, 'POST', '/applications', {
    tenderRef: 'MENT-2026-01',
    title: 'Mentioning tender',
    rawText: 'Bidders must be registered on the CSD and provide a SARS Tax Compliance Status PIN (TCS).',
  });
  const byId = Object.fromEntries(created.body.application.requirements.map((r: any) => [r.id, r]));
  assert.equal(byId['req-csd'].status, 'missing');
  assert.equal(byId['req-sars-tcs'].status, 'missing');
});

test('not applicable resolves a blocker only with a recorded reason, and is never reported as satisfied', async () => {
  const { cookie } = await signup(t.baseUrl, 'na@example.com');
  const created = await api(cookie, 'POST', '/applications', {
    tenderRef: 'NA-2026-01',
    title: 'Not applicable flow',
    rawText: 'CSD registration required. SARS TCS PIN compulsory.',
  });
  const appId = created.body.application.id;

  // Reason is mandatory.
  const noReason = await api(cookie, 'POST', `/applications/${appId}/requirements/req-csd/not-applicable`, {});
  assert.equal(noReason.status, 400);

  const na = await api(cookie, 'POST', `/applications/${appId}/requirements/req-csd/not-applicable`, {
    reason: 'Joint venture partner holds the CSD registration for this bid',
  });
  assert.equal(na.status, 200);
  const csdReq = na.body.application.requirements.find((r: any) => r.id === 'req-csd');
  assert.equal(csdReq.status, 'not_applicable');
  assert.equal(csdReq.notApplicableReason, 'Joint venture partner holds the CSD registration for this bid');
  assert.equal(csdReq.evidenceNote, undefined);
  assert.ok(!na.body.readiness.blockers.some((b: any) => b.requirementId === 'req-csd'));

  // Satisfy the rest; the mix of satisfied + not_applicable reaches ready.
  for (const reqId of ['req-sars-tcs']) {
    const sat = await api(cookie, 'POST', `/applications/${appId}/requirements/${reqId}/satisfy`, { evidenceNote: 'TCS PIN verified' });
    assert.equal(sat.status, 200);
  }
  const ready = await api(cookie, 'POST', `/applications/${appId}/mark-ready`);
  assert.equal(ready.status, 200);
  assert.equal(ready.body.application.state, 'ready');

  // A later satisfy clears the not-applicable reason (explicit human override).
  const back = await api(cookie, 'POST', `/applications/${appId}/requirements/req-csd/satisfy`, { evidenceNote: 'own CSD number MAAA123' });
  assert.equal(back.status, 200);
  const csdAfter = back.body.application.requirements.find((r: any) => r.id === 'req-csd');
  assert.equal(csdAfter.status, 'satisfied');
  assert.equal(csdAfter.notApplicableReason, undefined);
});

test('adding an open requirement to a ready application invalidates ready', async () => {
  const { cookie } = await signup(t.baseUrl, 'invalidate@example.com');
  const created = await api(cookie, 'POST', '/applications', {
    tenderRef: 'INV-2026-01',
    title: 'Invalidation flow',
    rawText: 'CSD registration and SARS TCS PIN required.',
  });
  const appId = created.body.application.id;
  for (const reqId of ['req-csd', 'req-sars-tcs']) {
    await api(cookie, 'POST', `/applications/${appId}/requirements/${reqId}/satisfy`, { evidenceNote: 'verified' });
  }
  const ready = await api(cookie, 'POST', `/applications/${appId}/mark-ready`);
  assert.equal(ready.body.application.state, 'ready');

  // A new tender-clause requirement starts open - the application must not
  // remain 'ready' with an unresolved requirement.
  const added = await api(cookie, 'POST', `/applications/${appId}/requirements`, {
    label: 'SBD 6.1 preference points claim',
    sourceType: 'tender_clause',
    sourceReference: 'Returnable schedule C, item 2',
  });
  assert.equal(added.status, 200);
  assert.equal(added.body.application.state, 'draft');
  assert.equal(added.body.readiness.ready, false);

  // And mark-ready is blocked again until the new requirement is resolved.
  const blocked = await api(cookie, 'POST', `/applications/${appId}/mark-ready`);
  assert.equal(blocked.status, 409);
});
