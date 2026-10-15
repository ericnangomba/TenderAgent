import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ITender extends Document {
  title: string;
  referenceNumber: string;
  issuingDepartment: string;
  closingDate: Date;
  cidbGradingRequired?: string;
  estimatedBudget?: string;
  province?: string;
  category?: string;
  extractedComplianceChecklist: {
    csdRequired: boolean;
    sarsPinRequired: boolean;
    bbbeeRequired: boolean;
    coidaRequired: boolean;
    additionalDocuments: string[];
  };
  evaluationCriteria: {
    preferencePointsSystem: '80/20' | '90/10' | 'unknown';
    technicalThresholdPercentage: number;
  };
  rawTextExcerpt?: string;
  createdAt: Date;
}

const TenderSchema: Schema = new Schema({
  title: { type: String, required: true },
  referenceNumber: { type: String, required: true, unique: true },
  issuingDepartment: { type: String, required: true },
  closingDate: { type: Date, required: true },
  cidbGradingRequired: { type: String },
  estimatedBudget: { type: String },
  province: { type: String, default: 'National / South Africa' },
  category: { type: String, default: 'General' },
  extractedComplianceChecklist: {
    csdRequired: { type: Boolean, default: true },
    sarsPinRequired: { type: Boolean, default: true },
    bbbeeRequired: { type: Boolean, default: true },
    coidaRequired: { type: Boolean, default: false },
    additionalDocuments: [{ type: String }]
  },
  evaluationCriteria: {
    preferencePointsSystem: { type: String, enum: ['80/20', '90/10', 'unknown'], default: '80/20' },
    technicalThresholdPercentage: { type: Number, default: 70 }
  },
  rawTextExcerpt: { type: String },
  createdAt: { type: Date, default: Date.now }
});

// Provide resilient model export compatible with serverless/Vite re-evaluations
const TenderModel: Model<ITender> = 
  (mongoose.models && mongoose.models.Tender) 
    ? (mongoose.models.Tender as Model<ITender>) 
    : mongoose.model<ITender>('Tender', TenderSchema);

export default TenderModel;
