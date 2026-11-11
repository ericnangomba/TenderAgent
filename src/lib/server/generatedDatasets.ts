/** Tenant-scoped generated examples. Shared curated datasets stay immutable. */
import type { Express, Request, Response } from 'express';
import type { Foundation } from './foundation';
import type { IFineTuningDataset } from '../types/tender';

export function registerGeneratedDatasetRoute(app: Express, deps: {
  foundation: Foundation; store: Map<string, any>; datasets: IFineTuningDataset[];
}): void {
  const { foundation, store, datasets } = deps;
// Auto-synthesize dataset pairs from active tenders
app.post('/api/finetune/datasets/generate-from-tenders', foundation.requireAdmin, (req: Request, res: Response) => {
  try {
    // Only this tenant's own records plus the public sample feed.
    const tenders = Array.from(store.values())
      .filter((t: any) => !t.tenantId || t.tenantId === req.auth!.tenantId);
    const generatedExamples = tenders.map((t, idx) => ({
      id: `gen-ex-${idx + 1}-${Date.now().toString().slice(-4)}`,
      domain: (t.province?.includes('Western Cape') ? 'Western Cape SCM' : (t.cidbGradingRequired ? 'CIDB Act' : 'PPPFA 2022')) as any,
      prompt: `Audit South African procurement document "${t.title}" (Ref: ${t.referenceNumber}) issued by ${t.issuingDepartment}. Extract mandatory statutory eligibility, CIDB grading, and preference points system.`,
      completion: JSON.stringify({
        title: t.title,
        referenceNumber: t.referenceNumber,
        issuingDepartment: t.issuingDepartment,
        province: t.province,
        closingDate: t.closingDate,
        pointsSystem: t.evaluationCriteria?.preferencePointsSystem || '80/20',
        cidbGrading: t.cidbGradingRequired || null,
        mandatoryEligibility: {
          csdMaAA: t.extractedComplianceChecklist?.csdRequired ?? true,
          sarsTcsPin: t.extractedComplianceChecklist?.sarsPinRequired ?? true,
          bbbeeStatus: t.extractedComplianceChecklist?.bbbeeRequired ?? true,
          coidaGoodStanding: t.extractedComplianceChecklist?.coidaRequired ?? false,
          compulsoryBriefing: t.extractedComplianceChecklist?.compulsoryBriefing ?? false,
          designatedSubcontracting30Percent: t.extractedComplianceChecklist?.subcontracting30Percent ?? false
        },
        returnableSchedules: t.extractedComplianceChecklist?.additionalDocuments || ['SBD 1', 'SBD 4', 'SBD 6.1']
      }, null, 2),
      referenceRfp: t.referenceNumber,
      createdAt: new Date().toISOString()
    }));

    // Generated data is tenant-owned, even when some inputs are public.
    // Never append private tender metadata into the unowned curated fixture.
    const tenantId = req.auth!.tenantId;
    let ds = datasets.find(d => d.id === `dataset-generated-${tenantId}` && d.tenantId === tenantId);
    if (!ds) {
      ds = {
        id: `dataset-generated-${tenantId}`, tenantId,
        name: 'Generated tender examples', description: 'Examples from this workspace and public tenders.',
        category: 'Custom', version: '1.0.0', format: 'alpaca', examples: [],
        exampleCount: 0, tokenCountEst: 0, createdAt: new Date().toISOString(),
      };
      datasets.unshift(ds);
    }
    ds.examples = [...generatedExamples, ...ds.examples];
    ds.exampleCount = ds.examples.length;
    ds.tokenCountEst = ds.examples.length * 1400;

    res.json({
      success: true,
      generatedCount: generatedExamples.length,
      dataset: ds
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

}
