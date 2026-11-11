import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateBidResponseSkeleton} from '../src/lib/utils/skeletonGenerator';
import {buildBidSkeletonDoc, buildBidSkeletonText} from '../src/lib/utils/bidSkeletonDoc';

test('draft does not invent legal privilege, eligibility, delivery or returnables',()=>{
 const sk=generateBidResponseSkeleton({referenceNumber:'SYNTH-1',title:'Cleaning'});
 const text=JSON.stringify(sk);
 assert.doesNotMatch(text,/confidential procurement privilege|70%|Weeks 1|Minimum 3|Last 2 Fiscal|Commissioner-stamped|Core Engineering|Pending Renewal|strictly under/);
 assert.match(text,/Bidder's Disclosure/);
 assert.match(text,/Not listed in this tender - confirm applicability/);
 assert.ok(sk.complianceChecklist.every(c=> !('compliant' in c)));
 assert.equal(sk.priceScheduleFramework[0].quantity,'[Quantity from source]');
 assert.match(sk.sections[0].content,/NOT READY FOR SUBMISSION/);
 assert.match(sk.sections[1].content,/No schedule is assumed/);
});
test('doc uses same draft content and escapes tender and profile text',()=>{
 const sk=generateBidResponseSkeleton({referenceNumber:'SYNTH-<b>',title:'<img src=x onerror=alert(1)> & "text"'}, {companyName:'<script>bad</script>'});
 const html=buildBidSkeletonDoc(sk);
 assert.match(html,/application|Draft Bid Response Framework/);
 assert.match(html,/&lt;img/); assert.match(html,/&lt;script&gt;/);
 assert.doesNotMatch(html,/<img|<script>/);
 assert.match(html,/Not ready for submission/);
 assert.match(html,/Quantity from source/);
 assert.doesNotMatch(html,/confidential procurement privilege/);
});

test('framework must be the exact explicit analyzer field, not legacy label or fuzzy text',()=>{
 for (const input of [{points:'80/20'}, {evaluationCriteria:{preferencePointsSystem:'maybe 90/10'}}, {}]) {
  const s=generateBidResponseSkeleton(input);
  assert.doesNotMatch(s.sections[2].title,/80\/20|90\/10/);
  assert.doesNotMatch(s.sections[2].content,/Under the .* evaluation framework/);
  assert.match(s.sections[2].content,/No system is assumed/);
 }
 const s=generateBidResponseSkeleton({evaluationCriteria:{preferencePointsSystem:'90/10'}});
 assert.match(s.sections[2].title,/90\/10/);
 assert.match(s.sections[2].content,/Under the 90\/10/);
 assert.doesNotMatch(JSON.stringify(s),/15%/);
});

test('clipboard text preserves warning and declared-not-verified labels',()=>{
 const sk=generateBidResponseSkeleton({referenceNumber:'COPY-1'}, {companyName:'Example',csdNumber:'MAAA123',bbbeeLevel:2});
 const text=buildBidSkeletonText(sk);
 assert.ok(text.startsWith('DRAFT FRAMEWORK - NOT READY FOR SUBMISSION'));
 assert.match(text,/not proof|proof of compliance/);
 assert.match(text,/CSD \(declared, not verified\): MAAA123/);
 assert.match(text,/B-BBEE \(declared, not verified\): Level 2/);
 assert.match(buildBidSkeletonDoc(sk),/Declared CSD \(not verified\)/);
});
