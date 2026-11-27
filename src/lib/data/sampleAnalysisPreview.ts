/**
 * Fictional worked example for the signed-out landing page. Static, prepared
 * content only - never an input to or output of a live analysis run. Every
 * checklist row MUST be traceable to the excerpt: test/sample-analysis-preview.test.ts
 * asserts each row's sourcePhrase appears in the mandatory ("Bidders must
 * submit") or conditional ("Where applicable") sentence of the excerpt, so the
 * example can never promise a returnable its own source text does not contain.
 * The excerpt is deliberately and repeatedly marked fictional.
 */

export const SAMPLE_ANALYSIS_EXCERPT = `EXAMPLE LOCAL MUNICIPALITY (FICTIONAL)
TENDER REFERENCE: EXAMPLE/2026/001
SUPPLY AND DELIVERY OF OFFICE FURNITURE FOR MUNICIPAL OFFICES
CLOSING: FRIDAY 11:00 (FICTIONAL DATE)

Bidders must submit: an active Central Supplier Database (CSD) registration report; a SARS Tax Compliance Status (TCS) PIN; a B-BBEE verification certificate or sworn affidavit; and completed SBD 1 (Invitation to Bid), SBD 4 (Declaration of Interest) and SBD 6.1 (Preference Points Claim) forms.

Where applicable: a COIDA letter of good standing, and attendance of the briefing session where the bidder's work requires on-site installation.

Evaluation: the 80/20 preference point system will apply, as stated in this fictional tender.`;

export interface SampleChecklistRow {
  item: string;
  required: boolean;
  /** Verbatim phrase from SAMPLE_ANALYSIS_EXCERPT that this row is drawn from. */
  sourcePhrase: string;
}

export const SAMPLE_ANALYSIS_CHECKLIST: SampleChecklistRow[] = [
  { item: 'Central Supplier Database (CSD) registration report', required: true, sourcePhrase: 'Central Supplier Database (CSD) registration report' },
  { item: 'SARS Tax Compliance Status (TCS) PIN', required: true, sourcePhrase: 'SARS Tax Compliance Status (TCS) PIN' },
  { item: 'B-BBEE certificate or sworn affidavit', required: true, sourcePhrase: 'B-BBEE verification certificate or sworn affidavit' },
  { item: 'SBD 1 - Invitation to Bid', required: true, sourcePhrase: 'SBD 1 (Invitation to Bid)' },
  { item: 'SBD 4 - Declaration of Interest', required: true, sourcePhrase: 'SBD 4 (Declaration of Interest)' },
  { item: 'SBD 6.1 - Preference Points Claim', required: true, sourcePhrase: 'SBD 6.1 (Preference Points Claim)' },
  { item: 'COIDA letter of good standing', required: false, sourcePhrase: 'COIDA letter of good standing' },
  { item: 'Briefing session (on-site installation only)', required: false, sourcePhrase: 'briefing session' },
];
