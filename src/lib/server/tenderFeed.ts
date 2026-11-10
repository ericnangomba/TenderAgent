/**
 * Tender feed routes: portal sync + tenant-aware listing.
 *
 * Extracted from server.ts so the SAME handlers run in production and in the
 * test harness - security behavior must be tested against the real code, not
 * a copy.
 *
 * Boundary rules:
 * - POST /api/etenders/sync mutates shared state, so it requires a live
 *   session in EVERY mode (requireAuth), independent of AUTH_REQUIRED. An
 *   anonymous caller can read the public fixture feed but can never write.
 * - Records a sync writes are tagged with the caller's tenant; untagged
 *   records are only the public fixtures seeded at boot.
 * - GET /api/tenders returns untagged (public) records plus the caller's own
 *   tagged records; anonymous callers receive untagged records only.
 * - Paid SerpApi credits stay behind serpApiAccess (signed-in tenant with an
 *   active subscription) regardless of the above.
 */
import type { Express, Request, Response } from 'express';
import type { Foundation } from './foundation';
import { fetchSouthAfricanTenders } from '../services/serpDiscovery';

export interface TenderFeedDeps {
  foundation: Foundation;
  store: Map<string, any>;
}

export function registerTenderFeedRoutes(app: Express, deps: TenderFeedDeps): void {
  const { foundation, store } = deps;

  // Live Sync with etenders.gov.za portal - session required in every mode.
  app.post('/api/etenders/sync', foundation.requireAuth, async (req: Request, res: Response) => {
    try {
      const allowSerpApi = await foundation.serpApiAccess(req);
      const result = await fetchSouthAfricanTenders(undefined, 'Western Cape', { allowSerpApi });
      if (!result.serpApiConsumed) await foundation.releaseConsumption(req, 'serpapi');

      // Register discovered items into the store, tagged to THIS tenant.
      result.leads.forEach(l => {
        if (!store.has(l.referenceNumber)) {
          store.set(l.referenceNumber, {
            tenantId: req.auth!.tenantId,
            title: l.title,
            referenceNumber: l.referenceNumber,
            issuingDepartment: l.department,
            closingDate: l.closingDate,
            province: l.province,
            category: l.category,
            cidbGradingRequired: l.cidbGrading,
            estimatedBudget: l.budgetEst,
            rawTextExcerpt: l.rawSampleText || l.snippet,
            extractedComplianceChecklist: {
              csdRequired: l.csdMandatory,
              sarsPinRequired: true,
              bbbeeRequired: true,
              coidaRequired: Boolean(l.cidbGrading),
              additionalDocuments: ['SBD 1', 'SBD 4', 'SBD 6.1']
            },
            evaluationCriteria: {
              preferencePointsSystem: '80/20',
              technicalThresholdPercentage: 70
            },
            createdAt: new Date()
          });
        }
      });

      res.json({
        success: true,
        syncedCount: result.syncedCount,
        westernCapeCount: result.leads.filter(l => l.province.includes('Western Cape')).length,
        source: result.source,
        isLiveEtendersPortal: result.isLiveEtendersPortal,
        timestamp: new Date().toISOString()
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Tender List
  app.get('/api/tenders', (req: Request, res: Response) => {
    let tenders = Array.from(store.values());
    // Untagged records are the shared public feed; tagged records belong to one
    // tenant only. Anonymous callers must NEVER receive tenant-tagged items.
    tenders = req.auth
      ? tenders.filter((t: any) => !t.tenantId || t.tenantId === req.auth!.tenantId)
      : tenders.filter((t: any) => !t.tenantId);
    res.json({ success: true, count: tenders.length, tenders });
  });
}
