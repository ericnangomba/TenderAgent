import { IBidResponseSkeleton, IUserProfile } from '../types/tender';

/**
 * Generates an unverified draft framework from extracted tender fields and declared profile data
 * (Client and server safe - no Node.js built-ins)
 */
export function generateBidResponseSkeleton(
  tenderData: any,
  companyProfile?: Partial<IUserProfile>
): IBidResponseSkeleton {
  // Placeholder baseline: any field the profile lacks renders as a bracketed
  // instruction, never blank and never a fabricated value.
  const PLACEHOLDERS = {
    companyName: '[Your registered company name]',
    registrationNumber: '',
    csdNumber: '',
    taxComplianceStatusPin: '',
    bbbeeLevel: 0,
    bbbeeType: 'EME' as const,
    cidbGrading: '',
    coidaGoodStandingValid: false,
    coidaExpiryDate: '',
    contactEmail: '[Contact email]',
    contactPhone: '[Contact phone]',
    province: '[Province]'
  };
  const company = { ...PLACEHOLDERS, ...Object.fromEntries(
    Object.entries(companyProfile || {}).filter(([, v]) => v !== undefined && v !== null && v !== '')
  ) };
  if (!company.companyName) company.companyName = PLACEHOLDERS.companyName;

  const tenderRef = tenderData.referenceNumber || '[Tender reference - confirm from the tender document]';
  const tenderTitle = tenderData.title || 'Procurement of Goods & Services';
  const dept = tenderData.issuingDepartment || tenderData.dept || 'Organ of State';
  // Only the analyzer's explicit tender field may select a framework.
  // Legacy display labels and partial text must not become source evidence.
  const rawPoints = tenderData.evaluationCriteria?.preferencePointsSystem;
  const points: '80/20' | '90/10' | null = rawPoints === '80/20' || rawPoints === '90/10' ? rawPoints
    : null;

  return {
    tenderReference: tenderRef,
    tenderTitle: tenderTitle,
    issuingDepartment: dept,
    closingDate: tenderData.closingDate ? String(tenderData.closingDate) : 'Confirm in the tender document',
    bidderProfile: company,
    sections: [
      {
        title: 'Section 1: Executive Summary & Bidder Eligibility Declaration',
        description: 'Draft prompts only. Confirm eligibility and use the official forms supplied with this tender.',
        content: `DRAFT FRAMEWORK - NOT READY FOR SUBMISSION
Confirm every extracted field against the original tender. This is not an official bidding form, legal advice or proof of compliance.

1.1 Introduction
${company.companyName}${company.registrationNumber ? ` (Registration No: ${company.registrationNumber})` : ''}
[Write an introduction for tender ${tenderRef}: "${tenderTitle}", issued by ${dept}. Do not claim qualifications or commitments you cannot support.]

1.2 Declared profile details - not verified
- CSD: ${company.csdNumber ? `MAAA supplier number on file: ${company.csdNumber}` : '[MAAA supplier number, if required]'}.
- SARS TCS PIN: ${company.taxComplianceStatusPin || '[TCS PIN, if required]'}.
${company.bbbeeLevel ? `- B-BBEE: Declared Level ${company.bbbeeLevel} (${company.bbbeeType}); verify the supporting document.` : '- B-BBEE: [level per your certificate or affidavit, if required]'}
${tenderData.cidbGradingRequired ? (company.cidbGrading
  ? `- CIDB Registration: grading ${company.cidbGrading} on file - verify it meets this tender's stated ${tenderData.cidbGradingRequired} requirement.`
  : `- CIDB Registration: [this tender states ${tenderData.cidbGradingRequired} - add your cidb registration and grading, or confirm it does not apply]`) : '- CIDB: Not listed in the extracted requirements. Confirm applicability in the original tender.'}

1.3 Information protection
[Add the information-protection terms required by this tender. Do not include personal information unless needed and lawfully shared. This template does not create a confidentiality guarantee or privilege.]`
      },
      {
        title: 'Section 2: Technical Methodology & Implementation Plan',
        description: 'Complete from the tender specifications and your actual delivery plan.',
        content: `2.1 Scope and method
[Quote the tender clause and describe how you will meet each specification.]

2.2 Resources and delivery dates
[Add personnel, equipment, milestones and dates supported by your proposed delivery plan. No schedule is assumed.]

2.3 Evaluation and evidence
[Copy any functionality threshold and evaluation criteria from the source tender. Add evidence for each criterion. Do not assume a threshold.]`
      },
      {
        title: points ? `Section 3: Commercial Proposal & ${points} Preference Points Matrix` : 'Section 3: Commercial Proposal & Preference Points',
        description: points
          ? `Pricing structure under the ${points} formula stated in this tender (Preferential Procurement Regulations 2022).`
          : 'Pricing structure - confirm the preference-point system (80/20 or 90/10) stated in the tender document.',
        content: `3.1 Price Responsiveness
All pricing is stated in South African Rand (ZAR). State here whether your prices include or exclude VAT, as this tender's pricing schedule requires. [Confirm applicable VAT treatment from the source and your tax status.]

3.2 Preference Points Claim (PPPFA 2022)
${points ? `Under the ${points} evaluation framework stated in this tender:
- Price Allocation: ${points === '90/10' ? '90 Points' : '80 Points'}
- Specific Goals: ${points === '90/10' ? '10 Points' : '20 Points'}
Your final score is computed by the organ of state from all received bids under the ${points} formula; this template does not estimate it.`
: 'The tender text did not state the preference-point system. [Confirm the preference-point system and specific goals in the source tender before completing this claim. No system is assumed.]'}`
      },
      {
        title: 'Section 4: Returnable Schedules & Annexures',
        description: 'Index of returnable schedules - include only those this tender lists.',
        content: `The tender's own returnables list governs. Use its official SBD or MBD forms, versions, instructions and signature requirements.
[Create an annexure index from the source tender: document name, clause/page, required evidence and completion status.]
Do not assume that SBD 4 requires commissioner stamping or that SBD 8 or SBD 9 applies. The revised Treasury SBD 4 is titled Bidder's Disclosure. Use the forms in the actual tender pack and clarify any conflicting instructions with the issuer.`
      }
    ],
    complianceChecklist: [
      {
        item: 'Central Supplier Database (CSD)',
        requirement: 'Active MAAA Number & Tax Compliance Status (TCS) PIN',
        smeStatus: company.csdNumber ? `Registered (${company.csdNumber})` : 'Missing CSD Number',
        referenceDocument: 'CSD Master Supplier Report'
      },
      {
        item: 'SARS Tax Compliance Status',
        requirement: 'Valid TCS PIN for third-party verification',
        smeStatus: company.taxComplianceStatusPin ? `PIN on file (${company.taxComplianceStatusPin})` : 'Missing Tax PIN',
        referenceDocument: 'SARS TCS Verification Printout'
      },
      {
        item: 'B-BBEE Status & Specific Goals',
        requirement: 'SANAS Verification Certificate or EME Affidavit',
        smeStatus: company.bbbeeLevel ? `Declared Level ${company.bbbeeLevel} (${company.bbbeeType}) - certificate/affidavit to attach` : 'Level not set - add your certificate or affidavit level',
        referenceDocument: 'Sworn Affidavit / SANAS Certificate'
      },
      {
        item: 'COIDA Letter of Good Standing',
        requirement: 'Compensation Commissioner current certification',
        smeStatus: company.coidaGoodStandingValid ? 'Declared current on file - verify date and evidence' : 'Not provided or not confirmed current',
        referenceDocument: 'COIDA Letter of Good Standing'
      },
      {
        item: "SBD 4 Bidder's Disclosure",
        requirement: 'Declaration of any state employment ties, where this tender calls for SBD 4',
        smeStatus: 'To complete and sign',
        referenceDocument: 'SBD 4 Original Signed'
      },
      {
        item: 'CIDB Contractor Grading',
        requirement: tenderData.cidbGradingRequired ? `Stated Grade ${tenderData.cidbGradingRequired} - confirm from source` : 'Not listed - confirm applicability',
        smeStatus: tenderData.cidbGradingRequired ? (company.cidbGrading ? `Declared grading ${company.cidbGrading} - verify against the tender` : 'Not provided') : 'Not listed in this tender - confirm applicability',
        referenceDocument: 'Source tender and registration evidence, if applicable'
      }
    ],
    priceScheduleFramework: [
      { item: '[Deliverable from tender pricing schedule]', unit: '[Unit from source]', quantity: '[Quantity from source]', estimatedRate: '[Your rate]', notes: '[Quote source clause; confirm VAT treatment and total]' }
    ],
    recommendedSbdForms: [
      "Use only the official SBD or MBD forms and versions included in this tender pack. Confirm its returnables list; no standard set is assumed."
    ]
  };
}
