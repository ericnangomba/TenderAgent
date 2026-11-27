import { test } from 'node:test';
import assert from 'node:assert/strict';
import { journeySteps, nextJourneyStep, journeyComplete, SKELETON_DOWNLOAD_FLAG, ANALYSIS_DONE_FLAG } from '../src/lib/journey/journey';

test('steps derive only from real state: nothing done for a signed-out visitor', () => {
  const steps = journeySteps({ signedIn: false, profileSaved: false, draftCount: 0, skeletonDownloaded: false });
  assert.deepEqual(steps.map((s) => s.id), ['account', 'profile', 'analysis', 'download']);
  assert.ok(steps.every((s) => !s.done));
  assert.equal(nextJourneyStep({ signedIn: false, profileSaved: false, draftCount: 0, skeletonDownloaded: false })?.id, 'account');
});

test('guidance follows journey order: a fresh account is pointed at the optional profile first', () => {
  const input = { signedIn: true, profileSaved: false, draftCount: 0, skeletonDownloaded: false };
  assert.equal(nextJourneyStep(input)?.id, 'profile');
  assert.equal(journeyComplete(input), false);
});

test('profile step is optional and never gates completion', () => {
  const input = { signedIn: true, profileSaved: false, draftCount: 1, skeletonDownloaded: true };
  const profile = journeySteps(input).find((s) => s.id === 'profile')!;
  assert.equal(profile.optional, true);
  assert.equal(journeyComplete(input), true);
  // With all required steps done, the optional profile is the suggested next.
  assert.equal(nextJourneyStep(input)?.id, 'profile');
});

test('required steps gate: analysis missing keeps the journey incomplete', () => {
  const input = { signedIn: true, profileSaved: true, draftCount: 0, skeletonDownloaded: false };
  assert.equal(journeyComplete(input), false);
  assert.equal(nextJourneyStep(input)?.id, 'analysis');
});

test('unknown draft count (null) is never treated as done', () => {
  const input = { signedIn: true, profileSaved: true, draftCount: null, skeletonDownloaded: false };
  const analysis = journeySteps(input).find((s) => s.id === 'analysis')!;
  assert.equal(analysis.done, false);
  assert.equal(nextJourneyStep(input)?.id, 'analysis');
});

test('full journey completes in order and suggests nothing when done', () => {
  const input = { signedIn: true, profileSaved: true, draftCount: 2, skeletonDownloaded: true };
  assert.ok(journeySteps(input).every((s) => s.done));
  assert.equal(journeyComplete(input), true);
  assert.equal(nextJourneyStep(input), null);
});

test('analysis step completes from a real analysis in this browser, without any server history', () => {
  const input = { signedIn: true, profileSaved: false, draftCount: 0, skeletonDownloaded: false, analysisCompleted: true };
  const analysis = journeySteps(input).find((s) => s.id === 'analysis')!;
  assert.equal(analysis.done, true);
  assert.equal(ANALYSIS_DONE_FLAG, 'ta_first_analysis_done');
});

test('download step is honest about the .doc format and keyed to the local flag', () => {
  const download = journeySteps({ signedIn: true, profileSaved: false, draftCount: 1, skeletonDownloaded: false }).find((s) => s.id === 'download')!;
  assert.match(download.detail, /\.doc/);
  assert.doesNotMatch(download.detail, /\.docx/);
  assert.equal(SKELETON_DOWNLOAD_FLAG, 'ta_skeleton_downloaded');
  assert.equal(download.done, false);
  assert.equal(journeySteps({ signedIn: true, profileSaved: false, draftCount: 1, skeletonDownloaded: true }).find((s) => s.id === 'download')!.done, true);
});
