import { ITender } from '../types/tender';

export const SAMPLE_TENDERS: ITender[] = [
  {
    id: 'tender-za-001',
    title: 'Supply, Delivery, Commissioning and Maintenance of Enterprise Hybrid Cloud IT Infrastructure',
    referenceNumber: 'RT57-2026-ICT',
    issuingDepartment: 'National Treasury of South Africa (Transversal Contracting)',
    closingDate: '2026-11-28T11:00:00.000Z',
    estimatedBudget: 'R 64,500,000.00 (ZAR)',
    province: 'Gauteng / National',
    category: 'ICT & Technology',
    cidbGradingRequired: undefined,
    extractedComplianceChecklist: {
      csdRequired: true,
      sarsPinRequired: true,
      bbbeeRequired: true,
      coidaRequired: true,
      compulsoryBriefing: true,
      subcontracting30Percent: true,
      additionalDocuments: [
        'SBD 1 - Invitation to Bid',
        'SBD 4 - Bidder Declaration of Interest',
        'SBD 6.1 - Preference Points Claim in terms of PPR 2022',
        'OEM Partner Tier 1 Accreditation Letter',
        'ISO 27001 Information Security Management Certificate',
        '3x Written Client Contactable Reference Letters (values > R15M)'
      ]
    },
    evaluationCriteria: {
      preferencePointsSystem: '90/10',
      technicalThresholdPercentage: 75,
      priceWeight: 90,
      specificGoalsWeight: 10
    },
    rawTextExcerpt: `BID NUMBER: RT57-2026-ICT
CLOSING DATE: 28 November 2026 AT 11:00 AM (SOUTH AFRICAN STANDARD TIME)
ISSUING AUTHORITY: NATIONAL TREASURY, REPUBLIC OF SOUTH AFRICA
DESCRIPTION: APPOINTMENT OF ACCREDITED SERVICE PROVIDERS FOR THE SUPPLY, DELIVERY, COMMISSIONING AND MAINTENANCE OF ENTERPRISE HYBRID CLOUD IT INFRASTRUCTURE ACROSS ORGANS OF STATE.

1. MANDATORY ELIGIBILITY & RETURNABLE CRITERIA (FAILURE TO COMPLY DISQUALIFIES BID):
- Bidders must be registered on the Central Supplier Database (CSD) with an active MAAA number. Verified tax compliance status through valid SARS TCS PIN.
- Valid B-BBEE Status Level Verification Certificate or sworn affidavit (EME/QSE) issued by SANAS-accredited verification agency.
- Certified copy of COIDA Letter of Good Standing issued by the Compensation Commissioner / FEM.
- Compulsory clarification virtual briefing session: 10 November 2026 at 10h00 via Microsoft Teams. Attendance register will be locked at 10h15.
- Pursuant to Preferential Procurement Regulations 2022, 30% designated group subcontracting condition applies for contracts exceeding R30 million to qualifying EMEs/QSEs with minimum 51% black ownership.

2. EVALUATION METHODOLOGY:
- Phase 1: Mandatory Compliance & Administrative Responsiveness
- Phase 2: Technical Functionality Threshold: 75% minimum cut-off required to advance.
- Phase 3: Price and Specific Goals Allocation System: 90/10 Preference Point System applies (Estimated contract value > R50,000,000).
  * Price: 90 points
  * Specific Goals (B-BBEE Level & Black Women/Youth Equity): 10 points`,
    scrapedSource: 'National Treasury eTender Portal (etenders.gov.za)',
    createdAt: '2026-10-10T08:30:00.000Z'
  },
  {
    id: 'tender-za-002',
    title: 'Routine Road Maintenance & Asphalt Resurfacing on National Route 1 Section 14 (KM 22.0 to KM 64.5)',
    referenceNumber: 'SANRAL/N.001-140-2026/1',
    issuingDepartment: 'South African National Roads Agency SOC Limited (SANRAL)',
    closingDate: '2026-11-14T14:00:00.000Z',
    estimatedBudget: 'R 38,200,000.00 (ZAR)',
    province: 'Western Cape',
    category: 'Civil & Construction',
    cidbGradingRequired: '7CE (or 6CE PE Potentially Emerging)',
    extractedComplianceChecklist: {
      csdRequired: true,
      sarsPinRequired: true,
      bbbeeRequired: true,
      coidaRequired: true,
      compulsoryBriefing: true,
      subcontracting30Percent: true,
      additionalDocuments: [
        'CIDB Contractor Registration printout Grade 7CE',
        'Proof of Registration with SACPCMP for Construction Safety Officer',
        'Letter of Intent for 10% Performance Guarantee from Registered Bank',
        'Site Inspection Certificate signed by SANRAL Project Manager',
        'Local Production & Content Declaration for Cement and Steel components'
      ]
    },
    evaluationCriteria: {
      preferencePointsSystem: '80/20',
      technicalThresholdPercentage: 70,
      priceWeight: 80,
      specificGoalsWeight: 20
    },
    rawTextExcerpt: `TENDER NOTICE NO: SANRAL N.001-140-2026/1
THE SOUTH AFRICAN NATIONAL ROADS AGENCY SOC LIMITED (SANRAL) INVITES TENDERS FOR:
ROUTINE ROAD MAINTENANCE AND CRACK SEALING, ASPHALT RESURFACING ON NATIONAL ROUTE 1 SECTION 14 BETWEEN TOUWS RIVER AND MATJIESFONTEIN.

ELIGIBILITY REQUIREMENTS:
- Contractors must be registered with the Construction Industry Development Board (CIDB) in a contractor grading designation equal to or higher than 7CE (Civil Engineering). Grade 6CE PE contractors may tender.
- Registration on National Treasury CSD with verified SARS Tax Compliance Status PIN.
- Valid COIDA Certificate reflecting roadworks classification.
- Evaluation will follow the 80/20 Preference Point System in accordance with the Preferential Procurement Policy Framework Act (PPPFA) where:
  * Price = 80 Points
  * Specific Goals (B-BBEE status & local economic development in target municipality) = 20 Points.
- Technical threshold: 70 points out of 100 on functionality.
- Minimum 30% subcontracting to Targeted Enterprises (CIDB grades 1CE to 3CE).`,
    scrapedSource: 'SANRAL Procurement Board & eTender',
    createdAt: '2026-10-12T10:15:00.000Z'
  },
  {
    id: 'tender-za-003',
    title: 'Provision of Integrated Physical Security, Access Control, and Guarding for Municipal Sub-Councils',
    referenceNumber: 'CPT-SEC-2026-109',
    issuingDepartment: 'City of Cape Town Metropolitan Municipality (Safety & Security Directorate)',
    closingDate: '2026-11-20T10:00:00.000Z',
    estimatedBudget: 'R 18,900,000.00 (ZAR)',
    province: 'Western Cape',
    category: 'Security & Facilities',
    cidbGradingRequired: undefined,
    extractedComplianceChecklist: {
      csdRequired: true,
      sarsPinRequired: true,
      bbbeeRequired: true,
      coidaRequired: true,
      compulsoryBriefing: false,
      subcontracting30Percent: false,
      additionalDocuments: [
        'PSIRA Company Registration Certificate (Active & Verified)',
        'PSIRA Director Registration Certificates for all active Directors',
        'Public Liability Insurance Cover Letter (Minimum R10 Million)',
        'Radio Communications ICASA Frequency License',
        'Proof of Fleet Inspection by Municipal Traffic Officers'
      ]
    },
    evaluationCriteria: {
      preferencePointsSystem: '80/20',
      technicalThresholdPercentage: 80,
      priceWeight: 80,
      specificGoalsWeight: 20
    },
    rawTextExcerpt: `CITY OF CAPE TOWN METROPOLITAN MUNICIPALITY
TENDER NO: CPT-SEC-2026-109
DESCRIPTION: PROVISION OF GUARDING, ALARM MONITORING, AND ARMED RESPONSE SERVICES AT CIVIC CENTRES AND COMMUNITY HALLS.
CLOSING: 20 NOVEMBER 2026 @ 10:00 AM

COMPLIANCE MANDATES:
1. PSIRA Registration: Bidders and all directors must possess active PSIRA accreditation in good standing.
2. Central Supplier Database: Full CSD Master Registration report showing tax compliant status.
3. COIDA: Valid Letter of Good Standing for security services classification.
4. Preference Points: 80/20 Point System (Price: 80 pts, Specific Goals B-BBEE Level: 20 pts).
5. Minimum functionality hurdle: 80 points. Bids scoring under 80% on operational methodology and vetted personnel will be declared non-responsive.`,
    scrapedSource: 'City of Cape Town Tender Portal (capetown.gov.za)',
    createdAt: '2026-10-14T11:45:00.000Z'
  },
  {
    id: 'tender-za-004',
    title: 'Supply and Commissioning of Fleet Telematics, Fuel Sensors, and Real-Time Driver Monitoring',
    referenceNumber: 'PRASA/CRES/HO/2026/08',
    issuingDepartment: 'Passenger Rail Agency of South Africa (PRASA)',
    closingDate: '2026-12-05T12:00:00.000Z',
    estimatedBudget: 'R 24,000,000.00 (ZAR)',
    province: 'Gauteng',
    category: 'Logistics & Fleet',
    cidbGradingRequired: undefined,
    extractedComplianceChecklist: {
      csdRequired: true,
      sarsPinRequired: true,
      bbbeeRequired: true,
      coidaRequired: false,
      compulsoryBriefing: true,
      subcontracting30Percent: false,
      additionalDocuments: [
        'ICASA Type Approval Certificates for GSM and GPS onboard modules',
        'SBD 4 Declaration of Interest Form signed',
        'SBD 6.1 Claim Form completed with B-BBEE status affidavit',
        'Cybersecurity ISO 27001 or SOC 2 Compliance Report for Cloud Telemetry Backend'
      ]
    },
    evaluationCriteria: {
      preferencePointsSystem: '80/20',
      technicalThresholdPercentage: 70,
      priceWeight: 80,
      specificGoalsWeight: 20
    },
    rawTextExcerpt: `PASSENGER RAIL AGENCY OF SOUTH AFRICA (PRASA)
TENDER: PRASA/CRES/HO/2026/08
FLEET TELEMATICS & ON-BOARD ASSET MONITORING SYSTEM FOR 450 RAIL MAINTENANCE UTILITY VEHICLES.
CLOSING: 05 DECEMBER 2026 AT 12:00.
MANDATORY RETURNABLES: CSD REPORT WITH ACTIVE MAAA NUMBER, SARS TCS PIN, B-BBEE CERTIFICATE/AFFIDAVIT. 80/20 PREFERENTIAL PROCUREMENT POINT SYSTEM.`,
    scrapedSource: 'PRASA E-Procurement Portal',
    createdAt: '2026-10-08T09:00:00.000Z'
  }
];
