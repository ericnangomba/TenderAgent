/**
 * Invariants for the procurement guidance model: sourced, dated,
 * applicability-qualified, and never universally mandatory.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PROCUREMENT_GUIDANCE, PROCUREMENT_FRAMEWORK_NOTE } from '../src/lib/data/procurementGuidance';

test('every guidance item carries a source URL and as-of date', () => {
  for (const item of PROCUREMENT_GUIDANCE) {
    assert.ok(item.source.url.startsWith('https://'), `${item.id} needs a source URL`);
    assert.ok(item.source.name.length > 0, `${item.id} needs a source name`);
    assert.match(item.asOf, /^\d{4}-\d{2}-\d{2}$/, `${item.id} needs an ISO as-of date`);
  }
  assert.ok(PROCUREMENT_FRAMEWORK_NOTE.source.url.startsWith('https://'));
});

test('every item states when it applies and what to do next', () => {
  for (const item of PROCUREMENT_GUIDANCE) {
    assert.ok(item.appliesWhen.length > 20, `${item.id} needs an applicability statement`);
    assert.ok(item.nextStep.length > 10, `${item.id} needs a next step`);
  }
});

test('verify-before-relying items must name what is unsettled', () => {
  for (const item of PROCUREMENT_GUIDANCE.filter(i => i.confidence === 'verify-before-relying')) {
    assert.ok(item.caveat && item.caveat.length > 20, `${item.id} must carry a caveat`);
  }
});

test('no item declares anything universally mandatory', () => {
  for (const item of PROCUREMENT_GUIDANCE) {
    assert.ok(!/mandatory for all|required for all|all sectors|every tender/i.test(item.summary + item.appliesWhen),
      `${item.id} must not make universal-mandatory claims`);
  }
});

test('CIDB guidance exposes no available-capital figures (source conflict unresolved)', () => {
  const cidb = PROCUREMENT_GUIDANCE.find(i => i.id === 'cidb-grading')!;
  assert.equal(cidb.confidence, 'verify-before-relying');
  // G4-G6 capital figures from either conflicting document must not appear.
  assert.ok(!/R200 ?000|R650 ?000|R1\.3 ?m|R300 ?000|available capital.{0,40}R\d/i.test(cidb.summary), 'no capital figures while sources conflict');
});

test('framework note records the PPA invalidation with its case citation', () => {
  assert.ok(PROCUREMENT_FRAMEWORK_NOTE.text.includes('ZACC 37'));
  assert.match(PROCUREMENT_FRAMEWORK_NOTE.asOf, /^\d{4}-\d{2}-\d{2}$/);
});
