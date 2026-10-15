export interface IComplianceChecklist {
  csdRequired: boolean;
  sarsPinRequired: boolean;
  bbbeeRequired: boolean;
  coidaRequired: boolean;
  compulsoryBriefing?: boolean;
  subcontracting30Percent?: boolean;
  additionalDocuments: string[];
}

export interface IEvaluationCriteria {
  preferencePointsSystem: '80/20' | '90/10' | 'unknown';
  technicalThresholdPercentage: number;
  priceWeight?: number;
  specificGoalsWeight?: number;
}

export interface ITender {
  id?: string;
  _id?: string;
  title: string;
  referenceNumber: string;
  issuingDepartment: string;
  closingDate: string | Date;
  estimatedBudget?: string;
  province?: string;
  category?: 'ICT & Technology' | 'Civil & Construction' | 'Security & Facilities' | 'Logistics & Fleet' | 'Professional Services' | 'Medical & Healthcare';
  cidbGradingRequired?: string;
  extractedComplianceChecklist: IComplianceChecklist;
  evaluationCriteria: IEvaluationCriteria;
  rawTextExcerpt?: string;
  scrapedSource?: string;
  createdAt: string | Date;
}

export interface IDiscoveredLead {
  id: string;
  title: string;
  referenceNumber: string;
  department: string;
  closingDate: string;
  province: string;
  category: string;
  budgetEst: string;
  link: string;
  snippet: string;
  source: string;
  csdMandatory: boolean;
  cidbGrading?: string;
  rawSampleText?: string;
}

export interface IUserProfile {
  companyName: string;
  registrationNumber: string;
  csdNumber: string; // MAAAxxxxxxx
  taxComplianceStatusPin: string;
  bbbeeLevel: number; // 1 to 8
  bbbeeType: 'EME' | 'QSE' | 'Generic';
  cidbGrading: string; // e.g. "7GB PE" or "1CE"
  coidaGoodStandingValid: boolean;
  coidaExpiryDate: string;
  contactEmail: string;
  contactPhone: string;
  province: string;
}

export interface ISentrySpanRecord {
  id: string;
  name: string;
  op: 'agent.pipeline' | 'agent.llm.call' | 'db.mongo' | 'popia.sanitize' | 'compliance.evaluate' | 'serp.scrape';
  status: 'pending' | 'running' | 'success' | 'failed';
  startTime: number;
  durationMs?: number;
  description?: string;
  metadata?: Record<string, any>;
}

export interface IBidResponseSkeleton {
  tenderReference: string;
  tenderTitle: string;
  issuingDepartment: string;
  closingDate: string;
  bidderProfile: Partial<IUserProfile>;
  sections: {
    title: string;
    description: string;
    content: string;
  }[];
  complianceChecklist: {
    item: string;
    requirement: string;
    smeStatus: string;
    compliant: boolean;
    referenceDocument: string;
  }[];
  priceScheduleFramework: {
    item: string;
    unit: string;
    quantity: number;
    estimatedRate: string;
    notes: string;
  }[];
  recommendedSbdForms: string[];
}
