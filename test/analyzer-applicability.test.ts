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

test('closing date: explicit dates parsed, unstated stays null, never +21d', async () => {
  const r = await executeRfpPipeline({ rawText: SILENT_TEXT, referenceId: 'T9', llmConfig: STATUTORY });
  assert.equal(new Date(r.record.closingDate).toISOString().slice(0, 10), '2026-12-15');
  const noDate = await executeRfpPipeline({ rawText: 'Provision of catering services. BID NUMBER: CAT-2026-001.', referenceId: 'T10', llmConfig: STATUTORY });
  assert.equal(noDate.record.closingDate ?? null, null);
});

test('multiword explicit reference preserved (SANRAL style)', async () => {
  const r = await executeRfpPipeline({
    rawText: 'TENDER NUMBER: SANRAL N.001-140-2026/1\nProvision of road maintenance services.',
    referenceId: 'T11', llmConfig: STATUTORY,
  });
  assert.equal(r.record.referenceNumber, 'SANRAL N.001-140-2026/1');
});

test('category: cleaning is not ICT; unknown stays General Services', async () => {
  const r = await executeRfpPipeline({ rawText: SILENT_TEXT, referenceId: 'T12', llmConfig: STATUTORY });
  assert.equal(r.record.category, 'Security & Facilities');
  const generic = await executeRfpPipeline({ rawText: 'Appointment of a service provider for general work. BID NUMBER: GEN-1.', referenceId: 'T13', llmConfig: STATUTORY });
  assert.equal(generic.record.category, 'General Services');
});

test('skeleton: no unconditional VAT-inclusive claim or B-BBEE level 0', () => {
  const sk = generateBidResponseSkeleton({ title: 'T' });
  const blob = JSON.stringify(sk);
  assert.ok(!/strictly inclusive of 15%/.test(blob), 'no unconditional inclusive-VAT claim');
  assert.ok(!/Level 0/.test(blob), 'no B-BBEE level 0 assertion');
  assert.match(blob, /standard VAT rate is 15%/);
  assert.match(blob, /\[Tender reference/);
});

test('skeleton: no unverified eligibility claims (CIDB, registration no, B-BBEE level in exports)', () => {
  const sk = generateBidResponseSkeleton({ referenceNumber: 'X-4', title: 'T', cidbGradingRequired: '5CE' });
  const blob = JSON.stringify(sk);
  assert.ok(!/Qualified contractor/.test(blob), 'no unverified qualification claim');
  assert.match(blob, /\[this tender states 5CE/);
  assert.ok(!/Registration No: \)/.test(blob), 'no empty registration parenthetical');
  const withGrading = generateBidResponseSkeleton(
    { referenceNumber: 'X-5', title: 'T', cidbGradingRequired: '5CE' },
    { companyName: 'Test Co', registrationNumber: '2020/123456/07', csdNumber: 'MAAA0000001', taxComplianceStatusPin: 'PIN1', bbbeeLevel: 2, bbbeeType: 'QSE', cidbGrading: '4CE', coidaGoodStandingValid: false, coidaExpiryDate: '', contactEmail: '', contactPhone: '', province: '' }
  );
  const blob2 = JSON.stringify(withGrading);
  assert.match(blob2, /grading 4CE on file - verify it meets this tender's stated 5CE/);
  assert.ok(!/Qualified contractor/.test(blob2));
});

test('reference: trailing prose on the same line is never swallowed', async () => {
  const prose = await executeRfpPipeline({
    rawText: 'Appointment for road maintenance. BID NUMBER: RDM-2026-088. CIDB grading 5CE required. Closing date: 15 December 2026.',
    referenceId: 'T14', llmConfig: STATUTORY,
  });
  assert.equal(prose.record.referenceNumber, 'RDM-2026-088');
  const separateLine = await executeRfpPipeline({
    rawText: 'TENDER NUMBER: SANRAL N.001-140-2026/1\nCIDB grading 5CE required.',
    referenceId: 'T15', llmConfig: STATUTORY,
  });
  assert.equal(separateLine.record.referenceNumber, 'SANRAL N.001-140-2026/1');
  const singleLine = await executeRfpPipeline({
    rawText: 'BID NUMBER: CLN-2026-014',
    referenceId: 'T16', llmConfig: STATUTORY,
  });
  assert.equal(singleLine.record.referenceNumber, 'CLN-2026-014');
});
