import { IBidResponseSkeleton, IUserProfile } from '../types/tender';

/**
 * Generates an end-to-end Bid Response Skeleton matching South African National Treasury standards
 * (Client and server safe - no Node.js built-ins)
 */
export function generateBidResponseSkeleton(
  tenderData: any,
  companyProfile?: Partial<IUserProfile>
): IBidResponseSkeleton {
  const company = companyProfile || {
    companyName: 'Apex Strategic Solutions (Pty) Ltd',
    registrationNumber: '2023/849201/07',
    csdNumber: 'MAAA0821945',
    taxComplianceStatusPin: 'TCS-9482104-Z',
    bbbeeLevel: 1,
    bbbeeType: 'EME',
    cidbGrading: '7CE PE',
    coidaGoodStandingValid: true,
    coidaExpiryDate: '2027-04-30',
    contactEmail: 'tenders@apexstrategic.co.za',
    contactPhone: '+27 (0)11 482 9200',
    province: 'Gauteng'
  };

  const tenderRef = tenderData.referenceNumber || 'RFP-REF-2026';
  const tenderTitle = tenderData.title || 'Procurement of Goods & Services';
  const dept = tenderData.issuingDepartment || tenderData.dept || 'Organ of State';
  const points = tenderData.evaluationCriteria?.preferencePointsSystem || tenderData.points || '80/20';

  return {
    tenderReference: tenderRef,
    tenderTitle: tenderTitle,
    issuingDepartment: dept,
    closingDate: String(tenderData.closingDate || '2026-11-30'),
    bidderProfile: company,
    sections: [
      {
        title: 'Section 1: Executive Summary & Bidder Eligibility Declaration',
        description: 'Formal statement of compliance with South African procurement statutes (PPPFA & SCM regulations).',
        content: `1.1 Introduction
${company.companyName} (Registration No: ${company.registrationNumber}) is honored to submit this formal proposal in response to tender ${tenderRef}: "${tenderTitle}" issued by ${dept}.

1.2 Legal Standing & Statutory Verification
- Central Supplier Database (CSD): Registered under Master Supplier Number ${company.csdNumber}.
- South African Revenue Service (SARS): Verified Tax Compliant with Active TCS PIN: ${company.taxComplianceStatusPin}.
- Broad-Based Black Economic Empowerment (B-BBEE): Level ${company.bbbeeLevel} Contributor (${company.bbbeeType}) conferring 135% procurement recognition.
- Compensation Fund (COIDA): Valid Letter of Good Standing active until ${company.coidaExpiryDate}.
${tenderData.cidbGradingRequired ? `- CIDB Registration: Qualified contractor status holding ${company.cidbGrading || 'applicable grading'}.` : ''}

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
        title: `Section 3: Commercial Proposal & ${points} Preference Points Matrix`,
        description: `Pricing structure optimized for South African ${points} formula under Preferential Procurement Regulations 2022.`,
        content: `3.1 Price Responsiveness
Our commercial model has been calculated strictly inclusive of 15% Value Added Tax (VAT) in South African Rand (ZAR).

3.2 Preference Points Claim (PPPFA 2022)
Under the ${points} evaluation framework:
- Price Allocation: ${String(points).includes('90') ? '90 Points' : '80 Points'}
- Specific Goals (B-BBEE Level ${company.bbbeeLevel}): ${String(points).includes('90') ? '10 Points (Maximum Allocation)' : '20 Points (Maximum Allocation)'}
Total Estimated Score: 96.8 / 100 Points based on competitive pricing threshold.`
      },
      {
        title: 'Section 4: Mandatory Returnable Schedules & Annexures',
        description: 'Index of all statutory schedules ready for submission binding.',
        content: `The following bound annexures accompany this tender envelope:
- Annexure A: Completed & Signed SBD 1 (Invitation to Bid)
- Annexure B: Completed & Commissioner-stamped SBD 4 (Declaration of Interest)
- Annexure C: Completed SBD 6.1 (Preference Points Claim under PPR 2022)
- Annexure D: Full CSD Master Registration Summary Report (Tax Status Verified)
- Annexure E: SANAS-Accredited B-BBEE Certificate / Commissioner Sworn Affidavit
- Annexure F: Valid COIDA Letter of Good Standing
- Annexure G: Audited Financial Statements (Last 2 Fiscal Years)
- Annexure H: Contactable Client Reference Letters (Minimum 3 verified projects)`
      }
    ],
    complianceChecklist: [
      {
        item: 'Central Supplier Database (CSD)',
        requirement: 'Active MAAA Number & Verified Tax Compliant',
        smeStatus: company.csdNumber ? `Registered (${company.csdNumber})` : 'Missing CSD Number',
        compliant: Boolean(company.csdNumber),
        referenceDocument: 'CSD Master Supplier Report'
      },
      {
        item: 'SARS Tax Compliance Status',
        requirement: 'Valid TCS PIN for third-party verification',
        smeStatus: company.taxComplianceStatusPin ? `Verified (${company.taxComplianceStatusPin})` : 'Missing Tax PIN',
        compliant: Boolean(company.taxComplianceStatusPin),
        referenceDocument: 'SARS TCS Verification Printout'
      },
      {
        item: 'B-BBEE Status & Specific Goals',
        requirement: 'SANAS Verification Certificate or EME Affidavit',
        smeStatus: `Level ${company.bbbeeLevel} (${company.bbbeeType})`,
        compliant: true,
        referenceDocument: 'Sworn Affidavit / SANAS Certificate'
      },
      {
        item: 'COIDA Letter of Good Standing',
        requirement: 'Compensation Commissioner current certification',
        smeStatus: company.coidaGoodStandingValid ? 'Current (In Good Standing)' : 'Pending Renewal',
        compliant: Boolean(company.coidaGoodStandingValid),
        referenceDocument: 'COIDA Letter of Good Standing'
      },
      {
        item: 'SBD 4 Declaration of Interest',
        requirement: 'Mandatory declaration of any state employment ties',
        smeStatus: 'Completed & Certified Clear',
        compliant: true,
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
      { item: 'Phase 1: Project Mobilization, Site Risk & Statutory Setup', unit: 'Sum', quantity: 1, estimatedRate: 'R 285,000.00', notes: 'Includes safety plan, SCM compliance, and initial site coordination.' },
      { item: 'Phase 2: Core Engineering, Supply & Implementation Works', unit: 'Monthly', quantity: 6, estimatedRate: 'R 940,000.00', notes: 'Direct deliverables, accredited specialist labor, and materials.' },
      { item: 'Phase 3: System Testing, Verification & Client SLA Support', unit: 'Quarterly', quantity: 4, estimatedRate: 'R 125,000.00', notes: 'Post-delivery technical support and preventative maintenance.' },
      { item: 'Contingency Provision (Statutory Municipal Clause)', unit: 'Sum', quantity: 1, estimatedRate: 'R 150,000.00', notes: 'Subject to prior written client sign-off.' }
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
