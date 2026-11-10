/**
 * Bid-application readiness engine.
 *
 * Product rule (from Eric's SME discovery, Oct 16): an incomplete application
 * may be saved as a draft at any time, but it must never be treated as ready
 * to submit while a compulsory requirement lacks verified evidence.
 *
 * Every requirement carries its source (a tender clause or an official rule
 * reference) - no blanket checklists. Rules whose applicability is not
 * verified for THIS tender are 'needs_review' and block readiness until a
 * human resolves them. This engine never submits anything and never claims
 * guaranteed eligibility.
 */

export type RequirementStatus = 'missing' | 'satisfied' | 'needs_review' | 'not_applicable';

export interface Requirement {
  id: string;
  label: string;
  /** Where this requirement comes from: tender clause or official rule. */
  source: { type: 'tender_clause' | 'official_rule'; reference: string; url?: string };
  status: RequirementStatus;
  /** What evidence satisfied it (e.g. uploaded document name), set by a human. */
  evidenceNote?: string;
  /** Why a human judged this requirement not applicable to this tender.
   *  Required when status is 'not_applicable' - an applicability decision is
   *  recorded with its reason, never silently dropped and never shown as
   *  satisfied. */
  notApplicableReason?: string;
}

export interface BidApplication {
  id: string;
  tenantId: string;
  tenderRef: string;
  title: string;
  state: 'draft' | 'ready';
  requirements: Requirement[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ReadinessReport {
  ready: boolean;
  blockers: Array<{ requirementId: string; label: string; reason: RequirementStatus | 'no_requirements' }>;
  /** Resolved = satisfied or recorded as not applicable with a reason. */
  resolvedCount: number;
  totalCount: number;
}

const RESOLVED: RequirementStatus[] = ['satisfied', 'not_applicable'];

export function evaluateReadiness(app: BidApplication): ReadinessReport {
  if (app.requirements.length === 0) {
    return {
      ready: false,
      blockers: [{ requirementId: '', label: 'No requirements recorded for this tender yet', reason: 'no_requirements' }],
      resolvedCount: 0,
      totalCount: 0,
    };
  }
  const blockers = app.requirements
    .filter((r) => !RESOLVED.includes(r.status))
    .map((r) => ({ requirementId: r.id, label: r.label, reason: r.status }));
  const resolvedCount = app.requirements.length - blockers.length;
  return { ready: blockers.length === 0, blockers, resolvedCount, totalCount: app.requirements.length };
}

/**
 * Seed requirement starters for a tender.
 *
 * Applicability discipline: nothing is seeded as firmly compulsory on the
 * strength of a general rule alone. A requirement starts as 'missing' only
 * when the tender text itself calls for it; a rule that commonly applies to
 * South African public tenders but is not verified for THIS tender starts as
 * 'needs_review' so a human confirms applicability. A human can then satisfy
 * it with evidence or record it not applicable with a reason - both are
 * explicit decisions, and 'not_applicable' is never reported as satisfied.
 *
 * Sources cited are the official pages verified on 2026-11-10:
 * - cidb Register of Contractors (CIDB Act 38 of 2000 + CID Regulations 2004
 *   as amended): cidb.org.za procurement guide.
 * - National Treasury Central Supplier Database: csd.gov.za.
 * - SARS Tax Compliance Status: sars.gov.za TCS pages.
 */
export function seedRequirementsForTender(input: {
  tenderRef: string;
  rawText?: string;
}): Requirement[] {
  const text = input.rawText || '';
  const cidbMentioned = /\bCIDB\b|\b[1-9](CE|GB|EB|EP|ME|SF|SQ|SW|SB|SC|SD|SE|SH|SI|SJ|SK|SL|SM|SN|SO)\b/i.test(text);
  const csdMentioned = /\bCSD\b|central supplier database|\bMAAA\d+/i.test(text);
  const sarsMentioned = /\bSARS\b|\bTCS\b|tax compliance status|tax pin/i.test(text);

  const reqs: Requirement[] = [
    {
      id: 'req-csd',
      label: csdMentioned
        ? 'CSD registration (MAAA supplier number)'
        : 'Confirm whether this tender requires CSD registration (MAAA supplier number)',
      source: {
        type: 'official_rule',
        reference: 'National Treasury Central Supplier Database - organ-of-state supplier registration',
        url: 'https://www.csd.gov.za/',
      },
      // Firm only when the tender itself asks for CSD; otherwise a human
      // confirms applicability for this tender before it blocks anything.
      status: csdMentioned ? 'missing' : 'needs_review',
    },
    {
      id: 'req-sars-tcs',
      label: sarsMentioned
        ? 'SARS Tax Compliance Status (TCS PIN)'
        : 'Confirm whether this tender requires a SARS Tax Compliance Status PIN',
      source: {
        type: 'official_rule',
        reference: 'SARS Tax Compliance Status (TCS) system - how to request your TCS PIN',
        url: 'https://www.sars.gov.za/individuals/manage-your-tax-compliance-status/how-to-request-your-tax-compliance-status/',
      },
      status: sarsMentioned ? 'missing' : 'needs_review',
    },
  ];

  if (cidbMentioned) {
    reqs.push({
      id: 'req-cidb',
      label: 'cidb contractor registration at the grading stated in this tender',
      source: {
        type: 'official_rule',
        reference: 'CIDB Act 38 of 2000 + CID Regulations 2004 (as amended) - Register of Contractors',
        url: 'https://www.cidb.org.za/clients/procurement-guides/applying-register-of-contractors/',
      },
      // The tender text mentions cidb, but the exact class/grading and whether
      // this award is construction works must be confirmed by a human.
      status: 'needs_review',
    });
  }

  return reqs;
}
