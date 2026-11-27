import type { TabKey } from '../../components/Sidebar';

/**
 * Guided client journey: the four steps a new customer works through, in
 * order. Every "done" flag is derived from real state only - session, saved
 * profile, actual bid drafts, and a locally recorded skeleton download. No
 * step is ever marked complete on aspiration or partial data.
 *
 * The profile step is OPTIONAL: analysis works without a saved profile, so
 * the journey never gates on it (steering: no unnecessary gates).
 */

export interface JourneyInput {
  signedIn: boolean;
  /** A company profile with at least a company name saved to the account. */
  profileSaved: boolean;
  /**
   * Number of saved bid drafts on the account (server-truth), or null when
   * the count could not be loaded. Unknown is never treated as zero-with-
   * confidence: the step stays incomplete and the UI shows retry.
   */
  draftCount: number | null;
  /** The customer downloaded a bid-response skeleton from this browser. */
  skeletonDownloaded: boolean;
}

export interface JourneyStep {
  id: 'account' | 'profile' | 'analysis' | 'download';
  title: string;
  detail: string;
  /** Workspace tab this step lives on, or null when it is already implicit. */
  tab: TabKey | null;
  /** Optional steps never block journey completion. */
  optional: boolean;
  done: boolean;
}

export const SKELETON_DOWNLOAD_FLAG = 'ta_skeleton_downloaded';

export function journeySteps(input: JourneyInput): JourneyStep[] {
  return [
    {
      id: 'account',
      title: 'Create your account',
      detail: 'Your workspace keeps your profile and drafts under your own login.',
      tab: 'account',
      optional: false,
      done: input.signedIn,
    },
    {
      id: 'profile',
      title: 'Save your company profile',
      detail: 'Optional, but recommended: CSD number, B-BBEE level and the details analyses are matched against.',
      tab: 'vault',
      optional: true,
      done: input.profileSaved,
    },
    {
      id: 'analysis',
      title: 'Analyse your first tender',
      detail: 'Upload a public tender document to get its returnables checklist and a bid draft.',
      tab: 'analyzer',
      optional: false,
      done: (input.draftCount ?? 0) > 0,
    },
    {
      id: 'download',
      title: 'Download your bid skeleton',
      detail: 'A Word-compatible (.doc) response framework aligned to the tender, ready for your pricing.',
      tab: 'readiness',
      optional: false,
      done: input.skeletonDownloaded,
    },
  ];
}

/**
 * The suggested next step: the first incomplete REQUIRED step, else the
 * first incomplete optional step, else null when everything is done.
 */
export function nextJourneyStep(input: JourneyInput): JourneyStep | null {
  const steps = journeySteps(input);
  return steps.find((step) => !step.done && !step.optional)
    ?? steps.find((step) => !step.done)
    ?? null;
}

/** True when every required step is complete (optional steps never gate). */
export function journeyComplete(input: JourneyInput): boolean {
  return journeySteps(input).every((step) => step.done || step.optional);
}
