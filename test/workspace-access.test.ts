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
test('free beta guidance is distinct from future subscription and expired-beta guidance', () => {
  const beta=accessGuidance({beta:{redeemAvailable:true,endsAt:future},entitlement:{effectiveStatus:'none'}});
  assert.match(beta.title,/redeem your provided beta code/);
  assert.match(beta.body,/free; do not pay/);
  assert.match(accessGuidance({entitlement:{effectiveStatus:'cancelled',planId:'test_cohort'}}).title,/beta access has ended/);
  assert.match(accessGuidance({entitlement:{effectiveStatus:'none'}}).title,/subscribe/);
  assert.match(accessGuidance(null,true).title,/could not be checked/);
});
