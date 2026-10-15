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

export type LLMModelId = 
  | 'gemini-2.5-flash'
  | 'gemma-2-9b-it'
  | 'gemma-2-27b-it'
  | 'llama-3.1-8b-instruct'
  | 'fine-tuned-sa-tender-8b'
  | 'gemma2-local';

export type LLMProvider = 
  | 'google-genai' 
  | 'ollama' 
  | 'huggingface' 
  | 'openrouter' 
  | 'vllm' 
  | 'local-simulator' 
  | 'llama-3.1-8b' 
  | 'gemma-2-9b'
  | 'gemini'
  | 'statutory';

export interface IOpenLlmConfig {
  provider: LLMProvider;
  modelId: string;
  baseUrl?: string;
  apiKey?: string;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  systemPrompt?: string;
}

export interface IPlatformModel {
  id: LLMModelId;
  name: string;
  provider: LLMProvider;
  baseArchitecture: 'Gemini' | 'Gemma 2' | 'Llama 3.1 8B' | 'Custom LoRA';
  description: string;
  isOpenWeights: boolean;
  isFineTuned: boolean;
  contextWindow: string;
  defaultEndpoint?: string;
  isAvailable: boolean;
}

export interface IFineTuningExample {
  id: string;
  prompt: string;
  completion: string;
  domain: 'PPPFA 2022' | 'CIDB Act' | 'SBD Returnables' | 'Western Cape SCM' | 'Financial & General' | 'Functionality Scoring';
  referenceRfp?: string;
  createdAt: string;
}

export interface IFineTuningDataset {
  id: string;
  name: string;
  description: string;
  category: string;
  version: string;
  exampleCount: number;
  tokenCountEst: number;
  format: 'alpaca' | 'sharegpt' | 'chatml';
  examples: IFineTuningExample[];
  createdAt: string;
}

export interface IFineTuningJob {
  id: string;
  jobName: string;
  baseModel: 'meta-llama/Meta-Llama-3.1-8B-Instruct' | 'google/gemma-2-9b-it' | 'google/gemma-2-27b-it';
  datasetId: string;
  datasetName: string;
  status: 'idle' | 'preparing' | 'training' | 'evaluating' | 'completed' | 'failed';
  progress: number; // 0 - 100
  currentEpoch: number;
  totalEpochs: number;
  currentStep: number;
  totalSteps: number;
  currentLoss: number;
  learningRate: number;
  vramUsageGb: number;
  etaSeconds: number;
  lossHistory: { step: number; loss: number; valLoss?: number }[];
  loraRank: number;
  loraAlpha: number;
  loraDropout: number;
  adapterArtifactName: string;
  outputModelName: string;
  createdAt: string;
  completedAt?: string;
}

