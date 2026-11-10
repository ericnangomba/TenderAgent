/**
 * Procurement requirement guidance for South African SME bidders.
 *
 * Source: TenderAgent procurement rules research, verified against primary
 * documents on 2026-11-10 (reports retained by the main agent). Rules:
 *  - Every item carries its source URL, an as-of date and a confidence.
 *  - Applicability is explicit: entity type, sector, buyer type, employees.
 *  - Nothing is labelled "required" unless a named statute/regulator or the
 *    tender document itself requires it. Buyer/tender-specific asks are
 *    marked as such.
 *  - Unresolved conflicts (e.g. CIDB available-capital figures) expose NO
 *    numbers and say to verify.
 * Not legal advice: the tender document and the buyer's SCM policy govern.
 */

export type GuidanceLayer = 'law' | 'sector-buyer' | 'tender-specific';
export type Confidence = 'verified' | 'verify-before-relying';

export interface GuidanceItem {
  id: string;
  title: string;
  layer: GuidanceLayer;
  /** Plain-language what-it-is. */
  summary: string;
  /** When it applies - the qualifier is the product value. */
  appliesWhen: string;
  /** What to do next, in one line. */
  nextStep: string;
  confidence: Confidence;
  /** 'verify-before-relying' items must explain what is unsettled. */
  caveat?: string;
  source: { name: string; url: string };
  asOf: string; // ISO date the source was checked
}

export const PROCUREMENT_FRAMEWORK_NOTE = {
  title: 'Current legal framework',
  text: 'Public procurement runs under the PPPFA with the Preferential Procurement Regulations 2022, PFMA SCM instructions and, for municipalities, the MFMA and Municipal SCM Regulations. The Public Procurement Act 28 of 2024 never came into force and was declared invalid in full by the Constitutional Court on 17 September 2026 ([2026] ZACC 37). Parliament may re-enact procurement legislation, so this picture is dated.',
  source: { name: 'Constitutional Court judgment [2026] ZACC 37 (SAFLII)', url: 'https://www.saflii.org/za/cases/ZACC/2026/37.html' },
  asOf: '2026-11-10',
};

export const PROCUREMENT_GUIDANCE: GuidanceItem[] = [
  {
    id: 'csd-registration',
    title: 'Central Supplier Database (CSD) registration',
    layer: 'law',
    summary: 'Registration on the national CSD gives you a MAAA supplier number. Organs of state use it to verify your tax and compliance status. Sole proprietors, partnerships, trusts and companies can all register - you do not need to be a registered company.',
    appliesWhen: 'Bidding to national/provincial departments and public entities (required for RFQ suppliers under PFMA SCM Instruction 2 of 2021/22). Most municipalities require it by policy. Not a requirement for private-sector tenders.',
    nextStep: 'Register free at secure.csd.gov.za; CSD pulls your SARS and CIPC data automatically.',
    confidence: 'verified',
    source: { name: 'PFMA SCM Instruction No. 2 of 2021/22 (OCPO)', url: 'https://ocpo.treasury.gov.za/Legislation/Instruction%20Notes/PFM%20SCM%20Instruction%20No.%2002%20of%202021-22%20Procurement%20thresholds%20and%20processes.pdf' },
    asOf: '2026-11-10',
  },
  {
    id: 'tax-compliance-status',
    title: 'Tax Compliance Status (TCS PIN)',
    layer: 'law',
    summary: 'SARS replaced Tax Clearance Certificates with the Tax Compliance Status system: a PIN that lets a buyer check your live status. It moves with your behaviour - it is a live status, not a one-time certificate.',
    appliesWhen: 'Public-sector bids. Many national/provincial buyers verify tax directly through CSD; some buyers (often municipal) still ask for the PIN itself.',
    nextStep: 'Get your PIN from SARS eFiling and keep your filings current; a buyer can reject on an inactive status at evaluation time.',
    confidence: 'verified',
    source: { name: 'SARS Tax Compliance Status leaflet (2024)', url: 'https://www.sars.gov.za/wp-content/uploads/Docs/SmallBusiness/TCS-leaflet-2024_updated-on-16-October-2024.pdf' },
    asOf: '2026-11-10',
  },
  {
    id: 'bbbee-status',
    title: 'B-BBEE status and preference points',
    layer: 'sector-buyer',
    summary: 'Under PPR 2022, preference points are awarded for "specific goals" that the organ of state defines in each tender - B-BBEE level is only one possible goal, not an automatic entitlement. Under the generic codes: EME (turnover up to R10m) uses a sworn affidavit and is automatically Level 4, Level 2 if at least 51% Black-owned, Level 1 if 100% Black-owned; QSE (R10m-R50m) uses an affidavit if at least 51% Black-owned, otherwise a SANAS-accredited certificate.',
    appliesWhen: 'Public-sector tenders under the PPPFA. Sector codes override the generic thresholds (e.g. ICT and Construction have different bands), so the right sector affidavit template matters.',
    nextStep: 'Confirm your sector code first, then use the matching affidavit template for your turnover band; check what specific goals the tender actually scores.',
    confidence: 'verified',
    caveat: 'Only the generic, ICT and Construction sector thresholds were checked against sources; other sector codes exist and may differ.',
    source: { name: 'Preferential Procurement Regulations, 2022 (Gazette 47452)', url: 'https://www.gov.za/sites/default/files/gcis_document/202211/47452gon2721.pdf' },
    asOf: '2026-11-10',
  },
  {
    id: 'preference-point-bands',
    title: '80/20 and 90/10 preference point bands',
    layer: 'law',
    summary: 'Price/preference scoring: the 80/20 system applies to tenders up to R50 million (all taxes included) and the 90/10 system above R50 million.',
    appliesWhen: 'Organs of state under the PPPFA/PPR 2022. Private buyers set their own evaluation methods.',
    nextStep: 'The tender document states which system it uses; check it before pricing strategy.',
    confidence: 'verified',
    source: { name: 'SBD 6.1 (PPR 2022 version, eTenders)', url: 'https://www.etenders.gov.za/home/Download/?blobName=f70c7b9f-affe-4d33-b4bc-26f4d736e69b.pdf&downloadedFileName=SBD+6.1+IN+TERMS+OF+PPR2022.pdf' },
    asOf: '2026-11-10',
  },
  {
    id: 'sourcing-thresholds',
    title: 'How buyers source, by buyer type',
    layer: 'sector-buyer',
    summary: 'National/provincial bodies: petty cash up to R2,000; written quotations above R2,000 up to R1,000,000 from CSD suppliers; open competitive bids above R1,000,000 - and an institution\'s own policy may set lower thresholds. Municipalities (2023 amendment): formal written quotations from R2,000 up to R300,000 (local), R200,000 (district) or R750,000 (metro), VAT included; competitive bidding above those.',
    appliesWhen: 'Public buyers. The buyer\'s own SCM policy can be stricter; private buyers are outside these rules.',
    nextStep: 'Identify the buyer type (department, public entity, local/district/metro municipality) before assuming a process.',
    confidence: 'verify-before-relying',
    caveat: 'National figures verified in PFMA SCM Instruction 2 of 2021/22 (no threshold amendment found on OCPO\'s index). Municipal figures verified in the 14 Dec 2023 gazette; a current consolidation was not checked, so confirm no later amendment before relying.',
    source: { name: 'Municipal SCM Regulations amendment, GN 4198 (Gazette 49863)', url: 'https://www.gov.za/sites/default/files/gcis_document/202312/49863gon4198.pdf' },
    asOf: '2026-11-10',
  },
  {
    id: 'cidb-grading',
    title: 'CIDB contractor grading (construction)',
    layer: 'sector-buyer',
    summary: 'Public-sector construction work requires CIDB registration. Your grade caps the tender value you may take: Grade 1 up to R500k, G2 R1m, G3 R3m, G4 R6m, G5 R10m, G6 R20m, G7 R60m, G8 R200m, G9 no limit. A grade applies per class of works (e.g. 4GB general building, 6CE civil engineering) - the class matters as much as the number.',
    appliesWhen: 'Public-sector construction contracts only; private construction work does not require CIDB.',
    nextStep: 'Register in the class of works you actually deliver; check the tender\'s required designation (e.g. "5GB or higher") before bidding.',
    confidence: 'verify-before-relying',
    caveat: 'Tender value limits verified against CIDB\'s May 2026 guide. CIDB documents conflict on the separate "available capital" financial criteria for grades 4-6, so those figures are intentionally not shown - verify with CIDB before relying on them.',
    source: { name: 'CIDB Guide to the Register of Contractors (May 2026)', url: 'https://www.cidb.org.za/wp-content/uploads/2026/05/guide-to-the-cidb-register-of-contractors.pdf' },
    asOf: '2026-11-10',
  },
  {
    id: 'coida-letter',
    title: 'COIDA letter of good standing',
    layer: 'law',
    summary: 'The Compensation Fund covers occupational injuries. If you employ anyone (including part-time or casual staff), registration is compulsory and buyers commonly ask for the letter of good standing. With no employees at all there may be no registration obligation.',
    appliesWhen: 'Employers. Frequently requested in construction, security and services tenders as a returnable.',
    nextStep: 'If you have employees, register with the Compensation Fund and keep assessments paid; if you have none, prepare a short explanation for buyers who ask for the letter.',
    confidence: 'verified',
    source: { name: 'Department of Employment & Labour COIDA service book', url: 'https://www.labour.gov.za/DocumentCenter/Publications/Compensation%20for%20Occupational%20Injuries%20and%20Diseases/COIDA_SERVICE_BOOK_VERSION_23.pdf' },
    asOf: '2026-11-10',
  },
  {
    id: 'vat-registration',
    title: 'VAT registration',
    layer: 'law',
    summary: 'VAT registration is not a general tender requirement. It affects how you quote (prices including or excluding VAT), and some buyers ask for it. SARS administers a compulsory registration threshold of R2.3 million per annum from 1 April 2026 (up from R1 million), while stating the legislative amendment had not yet been promulgated.',
    appliesWhen: 'Businesses whose taxable supplies cross the threshold, or voluntary registrants; relevant to how bid pricing is stated.',
    nextStep: 'State clearly whether your bid price includes VAT; confirm the current threshold with SARS if you are near it.',
    confidence: 'verify-before-relying',
    caveat: 'SARS applies R2.3m from 1 Apr 2026 but says the law amendment was not yet promulgated (SARS Budget 2026 FAQ); parts of the SARS site still show the old R1m text.',
    source: { name: 'SARS Budget 2026 FAQ', url: 'https://www.sars.gov.za/about/sars-tax-and-customs-system/budget/budget-2026-frequently-asked-questions/' },
    asOf: '2026-11-10',
  },
  {
    id: 'sbd-vs-mbd-forms',
    title: 'SBD forms vs MBD forms',
    layer: 'sector-buyer',
    summary: 'National/provincial bids use SBD forms; municipal bids use MBD forms (MBD 1, 4, 6.1, 7.2, 8, 9). The current SBD 4 ("Bidder\'s Disclosure") is the version effective 1 April 2022; a revised SBD 4 takes effect 1 February 2027 for departments and Schedule 2/3 public entities.',
    appliesWhen: 'Depends on the buyer: SBD for national/provincial, MBD for municipalities. The tender pack itself lists which forms must be returned.',
    nextStep: 'Work from the tender\'s own returnables checklist; watch for the revised SBD 4 from 1 Feb 2027.',
    confidence: 'verified',
    source: { name: 'PFMA SCM Instruction 14 of 2026/27 (OCPO)', url: 'https://ocpo.treasury.gov.za/Legislation/Instruction%20Notes/PFMA%20SCM%20Instruction%20replacing%20SBD4.pdf' },
    asOf: '2026-11-10',
  },
  {
    id: 'document-ages',
    title: 'Document ages and certified copies',
    layer: 'tender-specific',
    summary: '"Bank letter not older than 3 months", "certified ID copies", "municipal account statements" - these maximum ages and formats are set by each tender document or buyer policy, not by a single law.',
    appliesWhen: 'Whatever the specific tender document or municipal policy says; they differ between buyers.',
    nextStep: 'Read the returnables list in the tender itself and date-stamp documents against ITS stated limits.',
    confidence: 'verified',
    source: { name: 'Tender document governs (research finding)', url: 'https://ocpo.treasury.gov.za/Buyers_Area/Standard-Bidding-Forms/' },
    asOf: '2026-11-10',
  },
];
