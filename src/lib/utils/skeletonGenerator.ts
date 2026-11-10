import { IBidResponseSkeleton, IUserProfile } from '../types/tender';

/**
 * Generates an end-to-end Bid Response Skeleton matching South African National Treasury standards
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
  const rawPoints = tenderData.evaluationCriteria?.preferencePointsSystem || tenderData.points;
  const points: '80/20' | '90/10' | null = rawPoints === '80/20' || rawPoints === '90/10' ? rawPoints
    : String(rawPoints || '').includes('90') ? '90/10' : String(rawPoints || '').includes('80') ? '80/20' : null;

  return {
    tenderReference: tenderRef,
    tenderTitle: tenderTitle,
    issuingDepartment: dept,
    closingDate: tenderData.closingDate ? String(tenderData.closingDate) : 'Confirm in the tender document',
    bidderProfile: company,
    sections: [
      {
        title: 'Section 1: Executive Summary & Bidder Eligibility Declaration',
        description: 'Formal statement of compliance with South African procurement statutes (PPPFA & SCM regulations).',
        content: `1.1 Introduction
${company.companyName}${company.registrationNumber ? ` (Registration No: ${company.registrationNumber})` : ''} is honored to submit this formal proposal in response to tender ${tenderRef}: "${tenderTitle}" issued by ${dept}.

1.2 Legal Standing & Statutory Verification
- Central Supplier Database (CSD): ${company.csdNumber ? `MAAA supplier number on file: ${company.csdNumber}` : '[MAAA supplier number]'}.
- South African Revenue Service (SARS): Tax Compliance Status (TCS) PIN: ${company.taxComplianceStatusPin || '[TCS PIN]'}.
${company.bbbeeLevel ? `- Broad-Based Black Economic Empowerment (B-BBEE): Level ${company.bbbeeLevel} Contributor (${company.bbbeeType}).` : '- B-BBEE: [level per your certificate or affidavit]'}
${company.coidaGoodStandingValid && company.coidaExpiryDate ? `- Compensation Fund (COIDA): Letter of Good Standing held, expiry ${company.coidaExpiryDate}.` : ''}
${tenderData.cidbGradingRequired ? (company.cidbGrading
  ? `- CIDB Registration: grading ${company.cidbGrading} on file - verify it meets this tender's stated ${tenderData.cidbGradingRequired} requirement.`
  : `- CIDB Registration: [this tender states ${tenderData.cidbGradingRequired} - add your cidb registration and grading, or confirm it does not apply]`) : ''}

1.3 Protection of Personal Information Act (POPIA) Undertaking
In accordance with Act 4 of 2013, all candidate personnel credentials, financial statements, and proprietary project methodologies contained herein are submitted under confidential procurement privilege.`
      },
      {
        title: 'Section 2: Technical Methodology & Implementation Plan',
        description: 'Detailed work breakdown structure, service level agreements, and quality control plan.',
        content: `2.1 Approach & Methodology
Our operational methodology follows an agile, milestones-based execution model tailored specifically to ${dept}'s operating environment.

Phase 1: Mobilization & Stakeholder Alignment (Weeks 1 - 2)
- Initial kick-off briefing and service level agreement (SLA) sign-off.
- Site inspection and health & safety compliance baseline audits.

Phase 2: Core Execution & Resource Deployment (Weeks 3 - 10)
- Deployment of accredited personnel and certified hardware/materials.
- Real-time milestone tracking with weekly governance status reports.

Phase 3: Quality Assurance, Handover & Warranties
- Pre-commissioning testing against minimum functionality thresholds (${tenderData.evaluationCriteria?.technicalThresholdPercentage || 70}%+ standard).
- Skills transfer and formal close-out certification.`
      },
      {
        title: points ? `Section 3: Commercial Proposal & ${points} Preference Points Matrix` : 'Section 3: Commercial Proposal & Preference Points',
        description: points
          ? `Pricing structure under the ${points} formula stated in this tender (Preferential Procurement Regulations 2022).`
          : 'Pricing structure - confirm the preference-point system (80/20 or 90/10) stated in the tender document.',
        content: `3.1 Price Responsiveness
All pricing is stated in South African Rand (ZAR). State here whether your prices include or exclude VAT, as this tender's pricing schedule requires (the standard VAT rate is 15%).

3.2 Preference Points Claim (PPPFA 2022)
${points ? `Under the ${points} evaluation framework stated in this tender:
- Price Allocation: ${points === '90/10' ? '90 Points' : '80 Points'}
- Specific Goals: ${points === '90/10' ? '10 Points' : '20 Points'}
Your final score is computed by the organ of state from all received bids under the ${points} formula; this template does not estimate it.`
: 'The tender text did not state the preference-point system. Confirm 80/20 or 90/10 in the tender document before completing this claim (80/20 applies up to R50 million and 90/10 above it under the Preferential Procurement Regulations 2022).'}`
      },
      {
        title: 'Section 4: Returnable Schedules & Annexures',
        description: 'Index of returnable schedules - include only those this tender lists.',
        content: `The tender's own returnables list governs which annexures are required. The list below is a common starting set - include only what this tender calls for:
- Annexure A: Completed & Signed SBD 1 (Invitation to Bid)
- Annexure B: Completed & Commissioner-stamped SBD 4 (Declaration of Interest)
- Annexure C: Completed SBD 6.1 (Preference Points Claim under PPR 2022)
- Annexure D: Full CSD Master Registration Summary Report
- Annexure E: SANAS-Accredited B-BBEE Certificate / Commissioner Sworn Affidavit
- Annexure F: Valid COIDA Letter of Good Standing
- Annexure G: Audited Financial Statements (Last 2 Fiscal Years)
- Annexure H: Contactable Client Reference Letters (Minimum 3 verified projects)`
      }
    ],
    complianceChecklist: [
      {
        item: 'Central Supplier Database (CSD)',
        requirement: 'Active MAAA Number & Tax Compliance Status (TCS) PIN',
        smeStatus: company.csdNumber ? `Registered (${company.csdNumber})` : 'Missing CSD Number',
        compliant: Boolean(company.csdNumber),
        referenceDocument: 'CSD Master Supplier Report'
      },
      {
        item: 'SARS Tax Compliance Status',
        requirement: 'Valid TCS PIN for third-party verification',
        smeStatus: company.taxComplianceStatusPin ? `PIN on file (${company.taxComplianceStatusPin})` : 'Missing Tax PIN',
        compliant: Boolean(company.taxComplianceStatusPin),
        referenceDocument: 'SARS TCS Verification Printout'
      },
      {
        item: 'B-BBEE Status & Specific Goals',
        requirement: 'SANAS Verification Certificate or EME Affidavit',
        smeStatus: company.bbbeeLevel ? `Declared Level ${company.bbbeeLevel} (${company.bbbeeType}) - certificate/affidavit to attach` : 'Level not set - add your certificate or affidavit level',
        compliant: Boolean(company.bbbeeLevel),
        referenceDocument: 'Sworn Affidavit / SANAS Certificate'
      },
      {
        item: 'COIDA Letter of Good Standing',
        requirement: 'Compensation Commissioner current certification',
        smeStatus: company.coidaGoodStandingValid ? 'Marked current on file' : 'Pending Renewal',
        compliant: Boolean(company.coidaGoodStandingValid),
        referenceDocument: 'COIDA Letter of Good Standing'
      },
      {
        item: 'SBD 4 Declaration of Interest',
        requirement: 'Declaration of any state employment ties, where this tender calls for SBD 4',
        smeStatus: 'To complete and sign',
        compliant: false,
        referenceDocument: 'SBD 4 Original Signed'
      },
      {
        item: 'CIDB Contractor Grading',
        requirement: tenderData.cidbGradingRequired ? `Minimum Grade ${tenderData.cidbGradingRequired}` : 'Not Required for this category',
        smeStatus: company.cidbGrading || 'Not Registered',
        compliant: tenderData.cidbGradingRequired ? Boolean(company.cidbGrading) : true,
        referenceDocument: 'CIDB Contractor Registration Printout'
      }
    ],
    priceScheduleFramework: [
      { item: 'Phase 1: Project Mobilization, Site Risk & Statutory Setup', unit: 'Sum', quantity: 1, estimatedRate: 'To be costed', notes: 'Includes safety plan, SCM compliance, and initial site coordination.' },
      { item: 'Phase 2: Core Engineering, Supply & Implementation Works', unit: 'Monthly', quantity: 6, estimatedRate: 'To be costed', notes: 'Direct deliverables, accredited specialist labor, and materials.' },
      { item: 'Phase 3: System Testing, Verification & Client SLA Support', unit: 'Quarterly', quantity: 4, estimatedRate: 'To be costed', notes: 'Post-delivery technical support and preventative maintenance.' },
      { item: 'Contingency Provision (if the tender allows one)', unit: 'Sum', quantity: 1, estimatedRate: 'To be costed', notes: 'Subject to prior written client sign-off.' }
    ],
    recommendedSbdForms: [
      'SBD 1: Invitation to Bid',
      'SBD 4: Declaration of Bidder Past Supply Chain Practices',
      'SBD 6.1: Preference Points Claim Form (PPR 2022)',
      'SBD 8: Declaration of Past Practices (Transversal)',
      'SBD 9: Certificate of Independent Bid Determination'
    ]
  };
}
