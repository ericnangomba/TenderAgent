import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toolsAvailable, accessGuidance } from '../src/lib/access/workspaceAccess';
const future = new Date(Date.now()+86400000).toISOString();
test('workspace tools fail closed while loading, failed, inactive, missing end or expired', () => {
  for (const status of ['none','past_due','cancelled',undefined]) assert.equal(toolsAvailable({entitlement:{effectiveStatus:status,currentPeriodEnd:future}}),false);
  assert.equal(toolsAvailable(null),false);
  assert.equal(toolsAvailable({entitlement:{effectiveStatus:'active'}}),false);
  assert.equal(toolsAvailable({entitlement:{effectiveStatus:'active',currentPeriodEnd:'invalid'}}),false);
  assert.equal(toolsAvailable({entitlement:{effectiveStatus:'active',currentPeriodEnd:future}},false,Date.parse(future)),false);
  assert.equal(toolsAvailable({entitlement:{effectiveStatus:'active',currentPeriodEnd:future}},false,Date.parse(future)-1),true);
  assert.equal(toolsAvailable(null,true),true);
});
test('freemium guidance: remaining, exhausted, and no beta wording anywhere', () => {
  const remaining = accessGuidance({freemium:{includedAnalyses:3,resetsAt:'2026-12-01T00:00:00.000Z'},usage:{analyses:1,serpapiLookups:0},entitlement:{effectiveStatus:'none'}});
  assert.match(remaining.title,/Free plan/);
  assert.match(remaining.body,/2 of 3/);
  const exhausted = accessGuidance({freemium:{includedAnalyses:3,resetsAt:'2026-12-01T00:00:00.000Z'},usage:{analyses:3,serpapiLookups:0},entitlement:{effectiveStatus:'cancelled',planId:'test_cohort'}});
  assert.match(exhausted.title,/used your 3 free analyses/);
  for (const g of [remaining, exhausted, accessGuidance({entitlement:{effectiveStatus:'none'}}), accessGuidance(null,true)]) {
    assert.doesNotMatch(g.title + ' ' + g.body, /beta/i);
  }
  assert.match(accessGuidance({entitlement:{effectiveStatus:'none'}}).title,/subscribe/);
  assert.match(accessGuidance({entitlement:{effectiveStatus:'cancelled'}}).title,/subscribe/);
  assert.match(accessGuidance(null,true).title,/could not be checked/);
});
test('freemium baseline unlocks tools until the free monthly analyses are used', () => {
  assert.equal(toolsAvailable({freemium:{includedAnalyses:3,resetsAt:'2026-12-01T00:00:00.000Z'},usage:{analyses:0,serpapiLookups:0},entitlement:{effectiveStatus:'none'}}),true);
  assert.equal(toolsAvailable({freemium:{includedAnalyses:3,resetsAt:'2026-12-01T00:00:00.000Z'},usage:{analyses:2,serpapiLookups:0},entitlement:{effectiveStatus:'cancelled',planId:'test_cohort'}}),true);
  assert.equal(toolsAvailable({freemium:{includedAnalyses:3,resetsAt:'2026-12-01T00:00:00.000Z'},usage:{analyses:3,serpapiLookups:0},entitlement:{effectiveStatus:'none'}}),false);
});
