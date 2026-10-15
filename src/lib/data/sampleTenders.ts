import { ITender } from '../types/tender';

export const SAMPLE_TENDERS: ITender[] = [
  // 1. Live Western Cape Tender: Personnel Recruitment Advertisements
  {
    id: 'tender-za-wc-001',
    title: 'APPOINTMENT OF A SERVICE PROVIDER TO DESIGN AND PLACE PERSONNEL RECRUITMENT ADVERTISEMENTS',
    referenceNumber: 'WCG/DOTP-ADV/2026/01',
    issuingDepartment: 'Western Cape Provincial Government (Department of the Premier)',
    closingDate: '2026-11-21T11:00:00.000Z',
    estimatedBudget: 'R 4,800,000.00 (ZAR)',
    province: 'Western Cape',
    category: 'Services: General' as any,
    extractedComplianceChecklist: {
      csdRequired: true,
      sarsPinRequired: true,
      bbbeeRequired: true,
      coidaRequired: false,
      compulsoryBriefing: false,
      subcontracting30Percent: false,
      additionalDocuments: [
        'SBD 1 - Invitation to Bid',
        'SBD 4 - Bidder Declaration of Interest',
        'SBD 6.1 - Preference Points Claim (PPR 2022)',
        'POPIA Compliance Declaration for Candidate Personal Data',
        'Media Buying Accreditation & Print/Digital Placement Portfolios'
      ]
    },
    evaluationCriteria: {
      preferencePointsSystem: '80/20',
      technicalThresholdPercentage: 70,
      priceWeight: 80,
      specificGoalsWeight: 20
    },
    rawTextExcerpt: `WESTERN CAPE GOVERNMENT - DEPARTMENT OF THE PREMIER
TENDER REFERENCE: WCG/DOTP-ADV/2026/01
SERVICES: GENERAL - APPOINTMENT OF A SERVICE PROVIDER TO DESIGN AND PLACE PERSONNEL RECRUITMENT ADVERTISEMENTS ACROSS DIGITAL AND PRINT CHANNELS.
PUBLISHED: 16/10/2026 | CLOSING DATE: 21 NOVEMBER 2026 (IN 37 DAYS) AT 11:00 AM.
MANDATORY RETURNABLES:
1. Central Supplier Database (CSD) active MAAA registration report showing compliant tax status.
2. Verified SARS Tax Compliance Status PIN.
3. B-BBEE Level 1 to Level 4 Verification Certificate or Sworn Affidavit.
4. Evaluation: 80/20 Preference Point System (Price = 80, Specific Goals = 20 points).
5. Technical functionality cutoff: 70 points. Minimum 3 contactable client reference letters for government recruitment advertising.`,
    scrapedSource: 'National Treasury eTender Portal (etenders.gov.za) - Western Cape',
    createdAt: '2026-10-15T08:00:00.000Z'
  },

  // 2. Live Western Cape Tender: Short-term Insurance Services (Drakenstein)
  {
    id: 'tender-za-wc-002',
    title: 'Provision of short-term insurance services for a period up to 30 June 2030',
    referenceNumber: 'CORP 12/2026',
    issuingDepartment: 'Drakenstein Municipality (Corporate Services Directorate)',
    closingDate: '2026-11-19T10:00:00.000Z',
    estimatedBudget: 'R 32,500,000.00 (ZAR)',
    province: 'Western Cape',
    category: 'Professional Services' as any,
    extractedComplianceChecklist: {
      csdRequired: true,
      sarsPinRequired: true,
      bbbeeRequired: true,
      coidaRequired: true,
      compulsoryBriefing: true,
      subcontracting30Percent: true,
      additionalDocuments: [
        'FSCA / Prudential Authority Insurance License Certificate',
        'FIA / SAIA Accreditation Certificate',
        'Municipal SBD 4 Declaration of Interest',
        'Municipal SBD 6.1 Specific Goals Claim Form',
        '30% Subcontracting Plan to Qualifying EMEs/QSEs in Drakenstein/Cape Winelands'
      ]
    },
    evaluationCriteria: {
      preferencePointsSystem: '90/10',
      technicalThresholdPercentage: 75,
      priceWeight: 90,
      specificGoalsWeight: 10
    },
    rawTextExcerpt: `DRAKENSTEIN MUNICIPALITY - FINANCIAL & CORPORATE SERVICES
BID NUMBER: CORP 12/2026
FINANCIAL AND INSURANCE ACTIVITIES: PROVISION OF SHORT-TERM INSURANCE SERVICES FOR A PERIOD UP TO 30 JUNE 2030 (ASSET, FLEET, PUBLIC LIABILITY & COUNCILLOR SPECIAL RISK).
PUBLISHED: 15/10/2026 | CLOSING DATE: 19 NOVEMBER 2026 (IN 35 DAYS) AT 10:00 AM.
MANDATORY ELIGIBILITY:
- Registered with Financial Sector Conduct Authority (FSCA).
- Central Supplier Database (CSD) compliant status with MAAA number.
- Valid SARS TCS PIN.
- COIDA Letter of Good Standing.
- Compulsory virtual briefing session: 28 October 2026 at 10h00.
- 90/10 Preference Point System (Tender value > R50m lifecycle aggregate). 30% local designated group participation condition applies.`,
    scrapedSource: 'Drakenstein Municipality Procurement & etenders.gov.za',
    createdAt: '2026-10-15T09:00:00.000Z'
  },

  // 3. Live Western Cape Tender: Firearms for Drakenstein Municipality
  {
    id: 'tender-za-wc-003',
    title: 'The supply and delivery of various types of firearms for the Drakenstein Municipality for a period up to 30 June 2030',
    referenceNumber: 'CES 04/2026',
    issuingDepartment: 'Drakenstein Municipality (Law Enforcement & Security Services)',
    closingDate: '2026-11-26T10:00:00.000Z',
    estimatedBudget: 'R 7,500,000.00 (ZAR)',
    province: 'Western Cape',
    category: 'Supplies: General' as any,
    extractedComplianceChecklist: {
      csdRequired: true,
      sarsPinRequired: true,
      bbbeeRequired: true,
      coidaRequired: false,
      compulsoryBriefing: false,
      subcontracting30Percent: false,
      additionalDocuments: [
        'SAPS Central Firearms Register Registered Firearms Dealer License (FCA Act 60 of 2000)',
        'SABS / CIP / SAAMI Ballistic Proof Certificates',
        'Municipal MBD 4 Declaration of Interest',
        'Municipal MBD 6.1 Preference Points Claim Form',
        'Authorised Distributorship or OEM Authorization Agreement'
      ]
    },
    evaluationCriteria: {
      preferencePointsSystem: '80/20',
      technicalThresholdPercentage: 80,
      priceWeight: 80,
      specificGoalsWeight: 20
    },
    rawTextExcerpt: `DRAKENSTEIN MUNICIPALITY - COMMUNITY & LAW ENFORCEMENT SERVICES
TENDER REFERENCE: CES 04/2026
SUPPLIES: GENERAL - THE SUPPLY AND DELIVERY OF VARIOUS TYPES OF FIREARMS FOR THE DRAKENSTEIN MUNICIPALITY FOR A PERIOD UP TO 30 JUNE 2030.
PUBLISHED: 15/10/2026 | CLOSING DATE: 26 NOVEMBER 2026 (IN 42 DAYS) AT 10:00 AM.
MANDATORY QUALIFYING CRITERIA:
1. Bidder must submit a certified copy of valid Firearms Dealer License issued under the Firearms Control Act 60 of 2000 by SAPS Central Firearms Register.
2. Active registration on National Treasury Central Supplier Database (CSD).
3. Valid SARS Tax Compliance Status PIN.
4. Preference Points: 80/20 Point System (Price: 80 points, B-BBEE & Local Specific Goals: 20 points).
5. Technical compliance: weapons must comply with South African Police Service and Municipal Police Service specification standards.`,
    scrapedSource: 'National Treasury eTender Portal (etenders.gov.za) - Drakenstein',
    createdAt: '2026-10-15T09:30:00.000Z'
  },

  // 4. Live Western Cape Tender: Tactical & Operational Equipment
  {
    id: 'tender-za-wc-004',
    title: 'Supply and delivery of Tactical and Operational Equipment for Law Enforcement & Security Services for a period until 30 June 2030',
    referenceNumber: 'CES 05/2026',
    issuingDepartment: 'Drakenstein Municipality (Public Safety & Law Enforcement)',
    closingDate: '2026-12-03T10:00:00.000Z',
    estimatedBudget: 'R 14,800,000.00 (ZAR)',
    province: 'Western Cape',
    category: 'Supplies: General' as any,
    extractedComplianceChecklist: {
      csdRequired: true,
      sarsPinRequired: true,
      bbbeeRequired: true,
      coidaRequired: false,
      compulsoryBriefing: true,
      subcontracting30Percent: false,
      additionalDocuments: [
        'SABS / SANS 1658 Ballistic Body Armor Compliance Certificate',
        'Municipal MBD 4 Declaration of Interest',
        'Municipal MBD 6.1 Specific Goals Claim',
        'Local Production & Content Declaration for Textile and Bulletproof Vests (SBD 6.2)',
        'Sample Inspection Protocol for Night Vision and Restraint Equipment'
      ]
    },
    evaluationCriteria: {
      preferencePointsSystem: '80/20',
      technicalThresholdPercentage: 75,
      priceWeight: 80,
      specificGoalsWeight: 20
    },
    rawTextExcerpt: `DRAKENSTEIN MUNICIPALITY
BID NOTICE NO: CES 05/2026
SUPPLIES: GENERAL - SUPPLY AND DELIVERY OF TACTICAL AND OPERATIONAL EQUIPMENT FOR LAW ENFORCEMENT & SECURITY SERVICES FOR A PERIOD UNTIL 30 JUNE 2030.
PUBLISHED: 15/10/2026 | CLOSING DATE: 03 DECEMBER 2026 (IN 49 DAYS) AT 10:00 AM.
REQUIREMENTS:
- Body armour, tactical helmets, duty belts, handcuffs, and high-visibility PPE.
- Local content thresholds apply for clothing and textile products (100% local content requirement).
- Central Supplier Database (CSD) active registration.
- SARS TCS PIN.
- Preference Points: 80/20 System. Compulsory clarification session: 04 November 2026.`,
    scrapedSource: 'etenders.gov.za & Drakenstein Municipality',
    createdAt: '2026-10-15T10:00:00.000Z'
  },

  // 5. Live Western Cape Tender: Civil Engineering Services Drakenstein
  {
    id: 'tender-za-wc-005',
    title: 'Construction of New Basic Services for Informal Settlements and all other areas within the Drakenstein Municipal Area for a period up to 30 June 2030',
    referenceNumber: 'CE 08/2026',
    issuingDepartment: 'Drakenstein Municipality (Civil Engineering Directorate)',
    closingDate: '2026-11-19T10:00:00.000Z',
    estimatedBudget: 'R 58,000,000.00 (ZAR)',
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
        'CIDB Contractor Registration Grade 7CE or 6CE PE Active Status Printout',
        'SACPCMP Construction Safety Manager Certification',
        'COIDA Letter of Good Standing for Civil Engineering Works',
        'Letter of Intent for 10% Construction Guarantee from Approved Financial Institution',
        '30% Targeted Enterprise Subcontracting Agreement with Local EME/QSE Contractors',
        'Compulsory Site Clarification Certificate'
      ]
    },
    evaluationCriteria: {
      preferencePointsSystem: '90/10',
      technicalThresholdPercentage: 70,
      priceWeight: 90,
      specificGoalsWeight: 10
    },
    rawTextExcerpt: `DRAKENSTEIN MUNICIPALITY - CIVIL ENGINEERING SERVICES
TENDER NO: CE 08/2026
CIVIL ENGINEERING - CONSTRUCTION OF NEW BASIC SERVICES (WATER RETICULATION, SEWER MAINS, ROADS & STORMWATER DRAINAGE) FOR INFORMAL SETTLEMENTS AND ALL OTHER AREAS WITHIN THE DRAKENSTEIN MUNICIPAL AREA FOR A PERIOD UP TO 30 JUNE 2030.
PUBLISHED: 15/10/2026 | CLOSING DATE: 19 NOVEMBER 2026 (IN 35 DAYS) AT 10:00 AM.
MANDATORY ELIGIBILITY:
1. CIDB Grading: 7CE or higher (6CE PE may tender).
2. National Treasury CSD registered with compliant SARS TCS PIN.
3. COIDA Letter of Good Standing valid at closing date.
4. Compulsory clarification site meeting: 29 October 2026 at Paarl Civic Centre.
5. In terms of Municipal SCM Policy and PPPFA 2022, 90/10 Preference Point System applies. Minimum 30% contract value subcontracted to local emerging CIDB 1CE-3CE enterprises.`,
    scrapedSource: 'etenders.gov.za & Drakenstein Tender Board',
    createdAt: '2026-10-15T10:30:00.000Z'
  },

  // 6. Live Western Cape Tender: Turbine Roof Ventilators
  {
    id: 'tender-za-wc-006',
    title: 'SUPPLY AND INSTALLATION OF TURBINE ROOF VENTILATORS AT MUNICIPAL STORES',
    referenceNumber: 'SCM/TURB-09/2026',
    issuingDepartment: 'Cape Agulhas Municipality / Overberg District (Western Cape)',
    closingDate: '2026-10-31T12:00:00.000Z',
    estimatedBudget: 'R 920,000.00 (ZAR)',
    province: 'Western Cape',
    category: 'Services: General' as any,
    cidbGradingRequired: '1ME or 2ME (Mechanical Engineering)',
    extractedComplianceChecklist: {
      csdRequired: true,
      sarsPinRequired: true,
      bbbeeRequired: true,
      coidaRequired: true,
      compulsoryBriefing: false,
      subcontracting30Percent: false,
      additionalDocuments: [
        'CIDB Grade 1ME / 2ME Registration',
        'MBD 4 Declaration of Interest',
        'MBD 6.1 Preference Points Claim',
        'COIDA Letter of Good Standing (Working at Heights Protocol)',
        'Manufacturer Warranty Certificate for Stainless Steel / Aluminium Turbines'
      ]
    },
    evaluationCriteria: {
      preferencePointsSystem: '80/20',
      technicalThresholdPercentage: 70,
      priceWeight: 80,
      specificGoalsWeight: 20
    },
    rawTextExcerpt: `CAPE AGULHAS MUNICIPALITY - OVERBERG DISTRICT, WESTERN CAPE
QUOTATION NOTICE: SCM/TURB-09/2026
SERVICES: GENERAL - SUPPLY AND INSTALLATION OF HEAVY-DUTY INDUSTRIAL TURBINE ROOF VENTILATORS AT BREDASDORP MUNICIPAL STORES AND WORKSHOPS.
PUBLISHED: 15/10/2026 | CLOSING DATE: 31 OCTOBER 2026 (IN 15 DAYS) AT 12:00 PM.
REQUIREMENTS:
- CIDB Grade 1ME or higher.
- CSD registration report with MAAA number.
- SARS Tax Compliance PIN.
- COIDA Certificate of Good Standing.
- 80/20 Preference Point System (Price: 80, Specific Goals: 20).`,
    scrapedSource: 'Western Cape Municipal Portal & etenders.gov.za',
    createdAt: '2026-10-15T11:00:00.000Z'
  },

  // 7. Live Western Cape Tender: Two-Way Radio Communication (GMT)
  {
    id: 'tender-za-wc-007',
    title: 'GMT009/26-27: TENDER FOR APPOINTMENT OF A SERVICE PROVIDER TO SUPPLY, DELIVERY, REPAIR AND INSTALLATION OF A DIGITAL TWO-WAY RADIO COMMUNICATION DEVICES, AND CONTROL ROOM SUPPORT SYSTEM FOR A PERIOD OF THREE YEARS, FROM DATE OF APPOINTMENT.',
    referenceNumber: 'GMT009/26-27',
    issuingDepartment: 'Government Motor Transport (GMT) - Western Cape Department of Mobility',
    closingDate: '2026-11-17T11:00:00.000Z',
    estimatedBudget: 'R 18,700,000.00 (ZAR)',
    province: 'Western Cape',
    category: 'ICT & Technology',
    extractedComplianceChecklist: {
      csdRequired: true,
      sarsPinRequired: true,
      bbbeeRequired: true,
      coidaRequired: false,
      compulsoryBriefing: true,
      subcontracting30Percent: false,
      additionalDocuments: [
        'ICASA Radio Dealer License and Frequency Spectrum Approval',
        'SBD 1 Invitation to Bid',
        'SBD 4 Bidder Declaration of Interest',
        'SBD 6.1 Preference Points Claim',
        'DMR / TETRA Digital Radio OEM Technical Authorization Letter',
        '24/7 Control Room SLA Support Methodology'
      ]
    },
    evaluationCriteria: {
      preferencePointsSystem: '80/20',
      technicalThresholdPercentage: 75,
      priceWeight: 80,
      specificGoalsWeight: 20
    },
    rawTextExcerpt: `GOVERNMENT MOTOR TRANSPORT (GMT) - WESTERN CAPE DEPARTMENT OF MOBILITY
BID NUMBER: GMT009/26-27
INFORMATION AND COMMUNICATION - TENDER FOR APPOINTMENT OF A SERVICE PROVIDER TO SUPPLY, DELIVERY, REPAIR AND INSTALLATION OF DIGITAL TWO-WAY RADIO COMMUNICATION DEVICES, REPEATERS, AND CONTROL ROOM SUPPORT SYSTEM FOR A PERIOD OF THREE YEARS, FROM DATE OF APPOINTMENT.
PUBLISHED: 15/10/2026 | CLOSING DATE: 17 NOVEMBER 2026 (IN 33 DAYS) AT 11:00 AM.
MANDATORY RETURNABLES:
1. ICASA Radio Dealer License.
2. Central Supplier Database (CSD) active registration.
3. SARS TCS PIN verified.
4. B-BBEE Certificate or Sworn Affidavit.
5. Compulsory briefing session: 27 October 2026 at 11h00 via Microsoft Teams.
6. 80/20 Preference Point System (Price: 80 pts, Specific Goals: 20 pts).`,
    scrapedSource: 'National Treasury eTender Portal (etenders.gov.za) - Western Cape GMT',
    createdAt: '2026-10-15T11:30:00.000Z'
  },

  // 8. Live Western Cape Tender: Grass Cutting Buffeljagsrivier (Swellendam)
  {
    id: 'tender-za-wc-008',
    title: 'PROVISION OF GRASS CUTTING SERVICES FOR A 18 MONTH PERIOD (BUFFELJAGSRIVIER)',
    referenceNumber: 'SMQ 14/25/26',
    issuingDepartment: 'Swellendam Municipality (Western Cape)',
    closingDate: '2026-10-24T12:00:00.000Z',
    estimatedBudget: 'R 750,000.00 (ZAR)',
    province: 'Western Cape',
    category: 'Services: General' as any,
    extractedComplianceChecklist: {
      csdRequired: true,
      sarsPinRequired: true,
      bbbeeRequired: true,
      coidaRequired: true,
      compulsoryBriefing: false,
      subcontracting30Percent: false,
      additionalDocuments: [
        'Municipal MBD 4 Declaration of Interest',
        'Municipal MBD 6.1 Preference Points Claim',
        'Proof of Municipal Rates and Taxes in Good Standing',
        'COIDA Letter of Good Standing for Grounds Maintenance',
        'Machinery & Equipment Schedule (Ride-on Mowers, Brush Cutters, Safety Gear)'
      ]
    },
    evaluationCriteria: {
      preferencePointsSystem: '80/20',
      technicalThresholdPercentage: 60,
      priceWeight: 80,
      specificGoalsWeight: 20
    },
    rawTextExcerpt: `SWELLENDAM MUNICIPALITY - WESTERN CAPE
FORMAL TENDER QUOTATION: SMQ 14/25/26
SERVICES: GENERAL - PROVISION OF GRASS CUTTING AND VEGETATION CLEARING SERVICES FOR A 18 MONTH PERIOD (BUFFELJAGSRIVIER AREA).
PUBLISHED: 15/10/2026 | CLOSING DATE: 24 OCTOBER 2026 (IN 8 DAYS) AT 12:00 PM.
URGENT PROCUREMENT:
- Central Supplier Database (CSD) compliant status with MAAA number.
- Valid SARS Tax Compliance PIN.
- COIDA Letter of Good Standing.
- 80/20 Point System in terms of Preferential Procurement Regulations 2022. Priority given to local EME/QSE suppliers located within Swellendam Municipal jurisdiction.`,
    scrapedSource: 'Swellendam Municipality & etenders.gov.za',
    createdAt: '2026-10-15T12:00:00.000Z'
  },

  // 9. Live Western Cape Tender: Grass Cutting Suurbraak (Swellendam)
  {
    id: 'tender-za-wc-009',
    title: 'PROVISION OF GRASS CUTTING SERVICES FOR A 18 MONTH PERIOD (SUURBRAAK)',
    referenceNumber: 'SMQ 15/25/26',
    issuingDepartment: 'Swellendam Municipality (Western Cape)',
    closingDate: '2026-10-24T12:00:00.000Z',
    estimatedBudget: 'R 680,000.00 (ZAR)',
    province: 'Western Cape',
    category: 'Services: General' as any,
    extractedComplianceChecklist: {
      csdRequired: true,
      sarsPinRequired: true,
      bbbeeRequired: true,
      coidaRequired: true,
      compulsoryBriefing: false,
      subcontracting30Percent: false,
      additionalDocuments: [
        'Municipal MBD 4 Declaration of Interest',
        'Municipal MBD 6.1 Preference Points Claim',
        'Proof of Municipal Rates & Services Good Standing',
        'COIDA Letter of Good Standing',
        'Equipment Ownership or Rental Commitment'
      ]
    },
    evaluationCriteria: {
      preferencePointsSystem: '80/20',
      technicalThresholdPercentage: 60,
      priceWeight: 80,
      specificGoalsWeight: 20
    },
    rawTextExcerpt: `SWELLENDAM MUNICIPALITY - WESTERN CAPE
FORMAL TENDER QUOTATION: SMQ 15/25/26
SERVICES: GENERAL - PROVISION OF GRASS CUTTING AND OPEN SPACE MAINTENANCE FOR A 18 MONTH PERIOD (SUURBRAAK AREA).
PUBLISHED: 15/10/2026 | CLOSING DATE: 24 OCTOBER 2026 (IN 8 DAYS) AT 12:00 PM.
MANDATORY RETURNABLES:
1. National Treasury CSD active MAAA registration.
2. SARS TCS PIN.
3. COIDA Certificate of Good Standing.
4. Evaluation: 80/20 Preferential Point Allocation. Local community upliftment designated criteria apply.`,
    scrapedSource: 'Swellendam Municipality & etenders.gov.za',
    createdAt: '2026-10-15T12:15:00.000Z'
  },

  // 10. Live Western Cape Tender: Grass Cutting Barrydale (Swellendam)
  {
    id: 'tender-za-wc-010',
    title: 'PROVISION OF GRASS CUTTING SERVICES FOR AN 18 MONTH PERIOD (BARRYDALE)',
    referenceNumber: 'SMQ 16/25/26',
    issuingDepartment: 'Swellendam Municipality (Western Cape)',
    closingDate: '2026-10-24T12:00:00.000Z',
    estimatedBudget: 'R 650,000.00 (ZAR)',
    province: 'Western Cape',
    category: 'Services: General' as any,
    extractedComplianceChecklist: {
      csdRequired: true,
      sarsPinRequired: true,
      bbbeeRequired: true,
      coidaRequired: true,
      compulsoryBriefing: false,
      subcontracting30Percent: false,
      additionalDocuments: [
        'Municipal MBD 4 Declaration of Interest',
        'Municipal MBD 6.1 Specific Goals Claim',
        'Proof of Municipal Utility Account Clear Status',
        'COIDA Letter of Good Standing',
        'List of Qualified Operators & Safety Equipment'
      ]
    },
    evaluationCriteria: {
      preferencePointsSystem: '80/20',
      technicalThresholdPercentage: 60,
      priceWeight: 80,
      specificGoalsWeight: 20
    },
    rawTextExcerpt: `SWELLENDAM MUNICIPALITY - WESTERN CAPE
FORMAL TENDER QUOTATION: SMQ 16/25/26
SERVICES: GENERAL - PROVISION OF GRASS CUTTING SERVICES FOR AN 18 MONTH PERIOD (BARRYDALE).
PUBLISHED: 15/10/2026 | CLOSING DATE: 24 OCTOBER 2026 (IN 8 DAYS) AT 12:00 PM.
CONDITIONS:
- CSD registered suppliers with active MAAA reference.
- Tax compliant status verified on SARS eFiling.
- Valid COIDA Letter of Good Standing.
- 80/20 Preference Point System (Price: 80, Specific Goals: 20).`,
    scrapedSource: 'Swellendam Municipality & etenders.gov.za',
    createdAt: '2026-10-15T12:30:00.000Z'
  },

  // 11. National Treasury Transversal Hybrid Cloud
  {
    id: 'tender-za-001',
    title: 'Supply, Delivery, Commissioning and Maintenance of Enterprise Hybrid Cloud IT Infrastructure',
    referenceNumber: 'RT57-2026-ICT',
    issuingDepartment: 'National Treasury of South Africa (Transversal Contracting)',
    closingDate: '2026-11-28T11:00:00.000Z',
    estimatedBudget: 'R 64,500,000.00 (ZAR)',
    province: 'Gauteng / National',
    category: 'ICT & Technology',
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

  // 12. SANRAL N1 Touws River Resurfacing (Western Cape)
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

  // 13. City of Cape Town Security Guarding (Western Cape)
  {
    id: 'tender-za-003',
    title: 'Provision of Integrated Physical Security, Access Control, and Guarding for Municipal Sub-Councils',
    referenceNumber: 'CPT-SEC-2026-109',
    issuingDepartment: 'City of Cape Town Metropolitan Municipality (Safety & Security Directorate)',
    closingDate: '2026-11-20T10:00:00.000Z',
    estimatedBudget: 'R 18,900,000.00 (ZAR)',
    province: 'Western Cape',
    category: 'Security & Facilities',
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

  // 14. PRASA Fleet Telematics
  {
    id: 'tender-za-004',
    title: 'Supply and Commissioning of Fleet Telematics, Fuel Sensors, and Real-Time Driver Monitoring',
    referenceNumber: 'PRASA/CRES/HO/2026/08',
    issuingDepartment: 'Passenger Rail Agency of South Africa (PRASA)',
    closingDate: '2026-12-05T12:00:00.000Z',
    estimatedBudget: 'R 24,000,000.00 (ZAR)',
    province: 'Gauteng',
    category: 'Logistics & Fleet',
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
