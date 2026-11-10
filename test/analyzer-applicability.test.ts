import { test } from 'node:test';
import assert from 'node:assert/strict';
import { executeRfpPipeline } from '../src/lib/agents/mastraEngine';
import { generateBidResponseSkeleton } from '../src/lib/utils/skeletonGenerator';

// The analyzer must never assert a statutory requirement the tender text
// does not state: unknown means "confirm against the tender's returnables",
// never "mandatory" and never "you are non-compliant".

const STATUTORY = { provider: 'statutory', modelId: 'gemma2-local' } as const;

const SILENT_TEXT = `TENDER NOTICE
Provision of Office Cleaning Services for a period of twenty four months.
BID NUMBER: CLN-2026-014
Closing date: 15 December 2026. Enquiries: Supply Chain Management office.`;

const LISTING_TEXT = `TENDER NOTICE
Appointment of a service provider for road maintenance. BID NUMBER: RDM-2026-088.
Bidders must be registered on the Central Supplier Database (CSD) and provide
a valid SARS Tax Compliance Status PIN. A valid COIDA Letter of Good Standing
is required. Submit SBD 4 and SBD 6.1 with your bid. CIDB grading 5CE required.`;

test('text silent on CSD/SARS/B-BBEE: pipeline does not mark them required', async () => {
  const r = await executeRfpPipeline({ rawText: SILENT_TEXT, referenceId: 'T1', llmConfig: STATUTORY });
  const c = r.record.extractedComplianceChecklist;
  assert.equal(c.csdRequired, false);
  assert.equal(c.sarsPinRequired, false);
  assert.equal(c.bbbeeRequired, false);
  assert.equal(c.coidaRequired, false);
});

test('text listing requirements: pipeline marks exactly those listed', async () => {
  const r = await executeRfpPipeline({ rawText: LISTING_TEXT, referenceId: 'T2', llmConfig: STATUTORY });
  const c = r.record.extractedComplianceChecklist;
  assert.equal(c.csdRequired, true);
  assert.equal(c.sarsPinRequired, true);
  assert.equal(c.coidaRequired, true);
  assert.equal(r.record.cidbGradingRequired, '5CE');
  assert.equal(c.bbbeeRequired, false); // not stated in this text: must not be inferred
});

test('no documents asserted as returnables unless the tender text calls for them', async () => {
  const r = await executeRfpPipeline({ rawText: SILENT_TEXT, referenceId: 'T3', llmConfig: STATUTORY });
  assert.deepEqual(r.record.extractedComplianceChecklist.additionalDocuments, []);
  const r2 = await executeRfpPipeline({ rawText: LISTING_TEXT, referenceId: 'T4', llmConfig: STATUTORY });
  const docs = r2.record.extractedComplianceChecklist.additionalDocuments.join('\n');
  assert.match(docs, /SBD 4/);
  assert.match(docs, /SBD 6\.1/);
  assert.match(docs, /COIDA/);
});

test('no fabricated budget or completion score', async () => {
  const r = await executeRfpPipeline({ rawText: SILENT_TEXT, referenceId: 'T5', llmConfig: STATUTORY });
  assert.equal(r.record.estimatedBudget, 'Not Specified');
  for (const log of r.traceLogs) {
    assert.ok(!/Mandatory|Optional/.test(log), `trace must not label returnables mandatory/optional: ${log}`);
  }
});

test('skeleton template fabricates no score, identity, rate or closing date', () => {
  const sk = generateBidResponseSkeleton({ referenceNumber: 'X-1', title: 'T', issuingDepartment: 'D' });
  const blob = JSON.stringify(sk);
  assert.ok(!/96\.8/.test(blob), 'no fabricated evaluation score');
  assert.ok(!/Apex Strategic/.test(blob), 'no fabricated bidder identity');
  assert.ok(!/R (285|940|125|150),000/.test(blob), 'no fabricated rates');
  assert.ok(!/2026-11-30/.test(blob), 'no fabricated closing date');
  assert.ok(!/Mandatory/.test(blob), 'no blanket mandatory wording in the template');
  assert.match(sk.closingDate, /Confirm in the tender document/);
});

test('skeleton keeps the placeholder profile when none is on file', () => {
  const sk = generateBidResponseSkeleton({ referenceNumber: 'X-2' });
  assert.equal(sk.bidderProfile.csdNumber, '');
  assert.match(String(sk.bidderProfile.companyName), /^\[/);
});

test('reference extraction: narrative words are never captured as the ref', async () => {
  const r = await executeRfpPipeline({ rawText: LISTING_TEXT, referenceId: 'T6', llmConfig: STATUTORY });
  assert.equal(r.record.referenceNumber, 'RDM-2026-088');
  assert.equal(r.record.title.includes('RDM-2026-088'), false, 'title must not carry the ref tail');
});

test('preference-point system: unknown stays unconfirmed, never a silent 80/20', async () => {
  const r = await executeRfpPipeline({ rawText: SILENT_TEXT, referenceId: 'T7', llmConfig: STATUTORY });
  assert.equal(r.record.evaluationCriteria.preferencePointsSystem, 'unknown');
  assert.equal(r.record.evaluationCriteria.priceWeight, undefined);
  const sk = r.skeleton;
  assert.ok(!/Under the 80\/20 evaluation framework/.test(JSON.stringify(sk)), 'skeleton must not assert an unstated system');
  const r2 = await executeRfpPipeline({ rawText: LISTING_TEXT + '\nEvaluation: 90/10 preference point system applies.', referenceId: 'T8', llmConfig: STATUTORY });
  assert.equal(r2.record.evaluationCriteria.preferencePointsSystem, '90/10');
  assert.equal(r2.record.evaluationCriteria.priceWeight, 90);
});
