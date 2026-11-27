import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SAMPLE_ANALYSIS_CHECKLIST, SAMPLE_ANALYSIS_EXCERPT } from '../src/lib/data/sampleAnalysisPreview';

test('every checklist row is drawn from the fictional tender excerpt', () => {
  const mandatory = SAMPLE_ANALYSIS_EXCERPT.slice(
    SAMPLE_ANALYSIS_EXCERPT.indexOf('Bidders must submit'),
    SAMPLE_ANALYSIS_EXCERPT.indexOf('Where applicable'),
  );
  const conditional = SAMPLE_ANALYSIS_EXCERPT.slice(SAMPLE_ANALYSIS_EXCERPT.indexOf('Where applicable'));
  for (const row of SAMPLE_ANALYSIS_CHECKLIST) {
    const source = row.required ? mandatory : conditional;
    assert.ok(
      source.includes(row.sourcePhrase),
      `${row.required ? 'required' : 'conditional'} row "${row.item}" must come from the ${row.required ? '"Bidders must submit"' : '"Where applicable"'} part of the excerpt`,
    );
  }
});

test('the example is unmissably marked fictional and static', () => {
  assert.ok(SAMPLE_ANALYSIS_EXCERPT.includes('FICTIONAL'), 'excerpt carries the fictional marker');
  assert.ok(SAMPLE_ANALYSIS_EXCERPT.includes('EXAMPLE/2026/001'), 'reference is the fictional one');
  for (const row of SAMPLE_ANALYSIS_CHECKLIST) {
    assert.ok(!row.item.includes('80/20'), 'checklist rows describe returnables, not scoring claims');
  }
});

test('landing wires the preview and the privacy page', () => {
  const landing = readFileSync(new URL('../src/components/Landing.tsx', import.meta.url), 'utf8');
  assert.ok(landing.includes("import { SampleAnalysisPreview }"), 'Landing imports the preview');
  assert.ok(landing.includes('<SampleAnalysisPreview />'), 'Landing renders the preview');
  assert.ok(landing.includes("import { PrivacyNotice }"), 'Landing imports the privacy notice');
  assert.ok(landing.includes("href=\"#privacy\""), 'footer links to #privacy');
  assert.ok(landing.includes("hash === '#privacy'"), 'hash route renders the privacy notice');
});

test('privacy notice keeps the firm restriction and honest limits', () => {
  const privacy = readFileSync(new URL('../src/components/PrivacyNotice.tsx', import.meta.url), 'utf8');
  assert.ok(privacy.includes('Only\n              upload public or synthetic documents') || privacy.includes('public or synthetic documents'), 'public-or-synthetic-only restriction is stated');
  assert.ok(privacy.includes('does not claim POPIA'), 'no POPIA-compliance claim');
  assert.ok(!privacy.includes('on request'), 'no unverified operator-erasure-on-request promise');
  assert.ok(!privacy.includes('will say so before'), 'no promise about future page updates');
  const preview = readFileSync(new URL('../src/components/SampleAnalysisPreview.tsx', import.meta.url), 'utf8');
  assert.ok(preview.includes('not an AI result'), 'static-not-AI label near the checklist');
});
