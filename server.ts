import { DOCUMENT_REDACTION_NOTICE } from './src/lib/utils/privacyCopy';
import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { executeRfpPipeline, inMemoryTenderStore, activeLlmConfig, resolveServerLlmConfig, publicLlmConfigView } from './src/lib/agents/mastraEngine';
import { encryptProfileFields, decryptProfileFields, fieldEncryptionEnabled, profileForClient, prepareProfileSave } from './src/lib/server/fieldCrypto';
import { fetchSouthAfricanTenders } from './src/lib/services/serpDiscovery';
import { extractTextFromPdf, isRawPdfString, parseRawPdfString } from './src/lib/services/documentParser';
import { detectLocalModels } from './src/lib/services/localModelDetector';
import { SAMPLE_TENDERS } from './src/lib/data/sampleTenders';
import { registerTenderFeedRoutes } from './src/lib/server/tenderFeed';
import { registerGeneratedDatasetRoute } from './src/lib/server/generatedDatasets';
import { registerSimulatedTrainingRoute } from './src/lib/server/simulatedTraining';
import { eraseTenantEphemeral } from './src/lib/server/ephemeralErasure';
import { IUserProfile, IPlatformModel, IFineTuningDataset, IFineTuningJob } from './src/lib/types/tender';

dotenv.config();

import { createFoundation } from './src/lib/server/foundation';
import { loadConfig, assertSafeConfig } from './src/lib/server/config';
import { createStoreRepos } from './src/lib/server/repos';
const foundationConfig = loadConfig();
// Fail closed before opening any store connection (e.g. STORE=postgres
// without DATABASE_URL must never attempt a localhost connection).
assertSafeConfig(foundationConfig);
const foundation = createFoundation({ config: foundationConfig, repos: await createStoreRepos(foundationConfig),
  eraseEphemeral: (tenantId) => eraseTenantEphemeral(tenantId, {
    tenders: inMemoryTenderStore, datasets: inMemoryDatasets, jobs: inMemoryJobs, timers: simulatedJobTimers,
  }),
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3001;

// Client IPs (used by the auth rate limiter) come from X-Forwarded-For only
// when TRUST_PROXY says a known proxy is in front. Default: trust nothing.
app.set('trust proxy', foundation.config.trustProxy);

/** True only for loopback HTTP(S) endpoints - used to block SSRF probes. */
function isLoopbackEndpoint(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    return ['localhost', '127.0.0.1', '[::1]', '::1'].includes(u.hostname);
  } catch {
    return false;
  }
}

// Bounded concurrency for heavy document/AI work so a burst of uploads cannot
// starve the process; excess requests get a clear 429 instead of queueing.
let heavyOpsInFlight = 0;
const HEAVY_OPS_MAX = Number(process.env.HEAVY_OPS_MAX || 4);
function heavyOpLimiter(req: Request, res: Response, next: () => void): void {
  if (heavyOpsInFlight >= HEAVY_OPS_MAX) {
    res.status(429).json({ success: false, error: 'server_busy', retry: 'Please retry shortly.' });
    return;
  }
  heavyOpsInFlight += 1;
  res.on('finish', () => { heavyOpsInFlight -= 1; });
  next();
}

// Standard security headers on every response (API and static). CSP stays
// with the static host's config; these are the safe universal set.
app.use((_req: Request, res: Response, next: () => void) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

// Billing webhooks need the raw body for HMAC signature verification - mount before JSON parsing
app.use('/api/billing/webhook', foundation.webhookRouter);

// Allow large payloads for PDF ingestion and multi-page documents
app.use(express.json({ limit: '50mb' }));

// Foundation: session resolution, subscription guards (no-op unless AUTH_REQUIRED=true), auth/account routes
app.use(foundation.originCheckMiddleware);
app.use('/api', foundation.apiCacheHeaders);
app.use(foundation.sessionMiddleware);
app.use(foundation.tenantWorkMiddleware);
app.use(foundation.guardMiddleware);
app.use('/api', foundation.router);
// Operator surface: read-only aggregate admin endpoints (requireAdmin enforced inside).
app.use('/api/admin', foundation.adminRouter);
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// No server-side sample identity: with no signed-in profile the skeleton
// falls back to bracketed placeholders, never a fabricated company.
let userSmeProfile: Partial<IUserProfile> = {};

// Seed sample tenders (all 14 tenders including 10 live Western Cape notices) into memory cache
SAMPLE_TENDERS.forEach(t => {
  inMemoryTenderStore.set(t.referenceNumber, t);
});

// Platform Models Registry
export const PLATFORM_MODELS: IPlatformModel[] = [
  {
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash (Gemma 2 Persona)',
    provider: 'google-genai',
    baseArchitecture: 'Gemini',
    description: 'Fast statutory auditor persona fine-tuned for South African PPPFA & SBD validation.',
    isOpenWeights: false,
    isFineTuned: false,
    contextWindow: '1M tokens',
    isAvailable: Boolean(process.env.GEMINI_API_KEY)
  },
  {
    id: 'llama-3.1-8b-instruct',
    name: 'Meta Llama 3.1 8B Instruct (Open LLM)',
    provider: 'ollama',
    baseArchitecture: 'Llama 3.1 8B',
    description: 'Open-weights 8B model served from your own infrastructure via Ollama/vLLM.',
    isOpenWeights: true,
    isFineTuned: false,
    contextWindow: '128k tokens',
    defaultEndpoint: 'http://localhost:11434/v1',
    isAvailable: true
  },
  {
    id: 'gemma-2-9b-it',
    name: 'Google Gemma 2 9B Instruct (Open LLM)',
    provider: 'ollama',
    baseArchitecture: 'Gemma 2',
    description: 'High-precision open weights architecture with sliding window attention for complex tenders.',
    isOpenWeights: true,
    isFineTuned: false,
    contextWindow: '8k tokens',
    defaultEndpoint: 'http://localhost:11434/v1',
    isAvailable: true
  },
  {
    id: 'fine-tuned-sa-tender-8b',
    name: 'Llama 3.1 8B - SA Procurement LoRA v1',
    provider: 'custom-finetuned' as any,
    baseArchitecture: 'Custom LoRA',
    description: 'Preview entry for the fine-tuning studio (simulated - no trained adapter artifact exists yet).',
    isOpenWeights: true,
    isFineTuned: true,
    contextWindow: '32k tokens',
    defaultEndpoint: 'http://localhost:11434/v1',
    isAvailable: false,
    isDemo: true
  },
  {
    id: 'gemma2-local',
    name: 'Gemma 2 Local Simulator (Deterministic)',
    provider: 'local-simulator',
    baseArchitecture: 'Gemma 2',
    description: 'Deterministic rule-based fallback. Runs offline with no external API calls.',
    isOpenWeights: true,
    isFineTuned: false,
    contextWindow: '16k tokens',
    isAvailable: true
  }
];

// Preloaded Fine-Tuning Datasets for South African Procurement
const inMemoryDatasets: IFineTuningDataset[] = [
  {
    id: 'dataset-sa-procure-v1',
    name: 'SA Procurement Legislation & SBD Compliance (PPPFA 2022)',
    description: 'Curated instruction dataset teaching LLMs the 2022 Preferential Procurement Regulations, SBD 1, 4, 6.1, CIDB Act grading, and CSD MAAA verification requirements.',
    category: 'National Statutory',
    version: '1.2.0',
    exampleCount: 42,
    tokenCountEst: 118400,
    format: 'alpaca',
    createdAt: '2026-10-10T10:00:00.000Z',
    examples: [
      {
        id: 'ex-01',
        domain: 'PPPFA 2022',
        prompt: 'Analyze RFP for procurement value R48,000,000 issued by Western Cape Government. Determine applicable point system and 30% subcontracting requirement under PPPFA 2022 regulations.',
        completion: JSON.stringify({
          system: '80/20 Preference Point System',
          statutoryBasis: 'PPR 2022 Section 4: 80/20 applies for tenders up to R50,000,000 (VAT inclusive). Price = 80 points, Specific Goals (B-BBEE / designated EME) = 20 points.',
          subcontracting30Percent: false,
          notes: '30% mandatory subcontracting only triggers when contract estimate exceeds R30M and market feasibility permits.'
        }, null, 2),
        referenceRfp: 'WCG/DOTP-ADV/2026/01',
        createdAt: '2026-10-10T10:05:00.000Z'
      },
      {
        id: 'ex-02',
        domain: 'CIDB Act',
        prompt: 'RFP requires civil works with estimate R45,000,000. Specify mandatory CIDB grading designation and emerging contractor concessions under CIDB Act 38 of 2000.',
        completion: JSON.stringify({
          requiredGrading: '7CE (Civil Engineering)',
          thresholdRange: 'R20,000,000 to R60,000,000',
          potentiallyEmergingConcession: 'Grade 6CE PE contractors are eligible to tender in terms of CIDB Regulation 25(8)',
          coidaRequired: true,
          safetyCert: 'SACPCMP Safety Manager registration mandatory'
        }, null, 2),
        referenceRfp: 'SANRAL/N.001-140-2026/1',
        createdAt: '2026-10-10T10:15:00.000Z'
      },
      {
        id: 'ex-03',
        domain: 'Western Cape SCM',
        prompt: 'Extract mandatory returnable schedules for Drakenstein Municipality security & tactical supply tender.',
        completion: JSON.stringify({
          mandatoryReturnables: [
            'National Treasury CSD Registration Report (Active MAAA number)',
            'Verified SARS Tax Compliance Status PIN',
            'SAPS Central Firearms Register Dealer License (FCA 60 of 2000)',
            'MBD 4 Declaration of Interest',
            'MBD 6.1 Preference Points Claim in terms of PPR 2022'
          ],
          disqualificationTriggers: 'Failure to submit active CSD MAAA, SARS PIN, or valid dealer license results in immediate bid invalidation.'
        }, null, 2),
        referenceRfp: 'CES 04/2026',
        createdAt: '2026-10-10T10:30:00.000Z'
      }
    ]
  },
  {
    id: 'dataset-wc-tenders-v2',
    name: 'Western Cape Municipal Notices & SCM Frameworks',
    description: 'Specific goal allocation matrices for City of Cape Town, Drakenstein, Swellendam, and Cape Agulhas municipalities.',
    category: 'Provincial & Municipal',
    version: '2.0.0',
    exampleCount: 28,
    tokenCountEst: 78500,
    format: 'sharegpt',
    createdAt: '2026-10-12T14:00:00.000Z',
    examples: []
  }
];

// In-Memory Fine-Tuning Jobs Registry
const inMemoryJobs: IFineTuningJob[] = [
  {
    simulated: true,
    id: 'ft-job-001',
    jobName: 'llama-3.1-8b-sa-procurement-lora-v1',
    baseModel: 'meta-llama/Meta-Llama-3.1-8B-Instruct',
    datasetId: 'dataset-sa-procure-v1',
    datasetName: 'SA Procurement Legislation & SBD Compliance (PPPFA 2022)',
    status: 'completed',
    progress: 100,
    currentEpoch: 3,
    totalEpochs: 3,
    currentStep: 60,
    totalSteps: 60,
    currentLoss: 0.312,
    learningRate: 0.00002,
    vramUsageGb: 7.4,
    etaSeconds: 0,
    lossHistory: [
      { step: 5, loss: 2.451 },
      { step: 10, loss: 1.823 },
      { step: 20, loss: 1.204 },
      { step: 30, loss: 0.812 },
      { step: 40, loss: 0.541 },
      { step: 50, loss: 0.389 },
      { step: 60, loss: 0.312, valLoss: 0.334 }
    ],
    loraRank: 16,
    loraAlpha: 32,
    loraDropout: 0.05,
    adapterArtifactName: 'adapter_model.safetensors',
    outputModelName: 'Llama 3.1 8B - SA Procurement LoRA v1',
    createdAt: '2026-10-14T09:00:00.000Z',
    completedAt: '2026-10-14T09:28:40.000Z'
  }
];

// ======================== API ROUTES ========================

// Health & Telemetry
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    engine: 'TenderAgent RFP pipeline',
    configuredModel: activeLlmConfig.modelId,
    configuredProvider: activeLlmConfig.provider,
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
    localModelCheck: 'on-demand via /api/models/detect',
    sentryTracing: Boolean(process.env.SENTRY_DSN),
    authRequired: foundation.config.authRequired,
    profileFieldEncryption: fieldEncryptionEnabled(foundation.config.profileFieldKey) ? 'on' : 'off',
    store: foundation.config.store,
    privacyNote: DOCUMENT_REDACTION_NOTICE,
    sampleTendersLoaded: SAMPLE_TENDERS.length
  });
});

// Document Ingestion: Clean extraction of PDF / Text / DOCX
app.post('/api/parse-document', heavyOpLimiter, async (req: Request, res: Response) => {
  try {
    const { rawText, base64Data, filename } = req.body;

    // Resource limits: reject oversized payloads before any parsing work.
    if (typeof base64Data === 'string' && base64Data.length > 40_000_000) {
      res.status(413).json({ success: false, error: 'document too large (max ~30MB PDF)' });
      return;
    }
    if (typeof rawText === 'string' && rawText.length > 5_000_000) {
      res.status(413).json({ success: false, error: 'text too large (max 5M characters)' });
      return;
    }

    // 1. If base64 binary provided
    if (base64Data) {
      const buffer = Buffer.from(base64Data, 'base64');
      const result = await extractTextFromPdf(buffer);
      res.json(result);
      return;
    }

    // 2. If rawText provided
    if (rawText && typeof rawText === 'string') {
      if (isRawPdfString(rawText)) {
        const result = await parseRawPdfString(rawText);
        res.json(result);
        return;
      }

      // Already clean text
      const refMatch = rawText.match(/(?:TENDER|BID|REF|RFP|RFQ|CONTRACT)[\s.:#№\/-]*([A-Z0-9\/\-_.]{3,35})/i);
      const deptMatch = rawText.match(/(?:ISSUING AUTHORITY|ORGAN OF STATE|DEPARTMENT|MUNICIPALITY)[:\s]+([^\n\r]{4,80})/i);
      const dateMatch = rawText.match(/(?:CLOSING DATE|DEADLINE)[:\s]+([0-9]{1,2}[\s\/\-][A-Za-z0-9]+[\s\/\-][0-9]{2,4})/i);

      res.json({
        success: true,
        text: rawText.trim(),
        pageCount: 1,
        referenceGuess: refMatch ? refMatch[1].trim() : undefined,
        issuingDeptGuess: deptMatch ? deptMatch[1].trim() : undefined,
        closingDateGuess: dateMatch ? dateMatch[1].trim() : undefined
      });
      return;
    }

    res.status(400).json({ success: false, error: 'No rawText or base64Data provided for document parsing' });
  } catch (err: any) {
    console.error('[API /api/parse-document Error]:', err);
    res.status(500).json({ success: false, error: err.message || 'Failed to parse document' });
  }
});

// Live eTenders & SerpApi Discovery Feed
app.get('/api/scrape', async (req: Request, res: Response) => {
  try {
    const query = typeof req.query.q === 'string' ? req.query.q : undefined;
    const province = typeof req.query.province === 'string' ? req.query.province : undefined;
    // Paid SerpApi credits are consumed only for a signed-in tenant with an
    // active subscription - in every mode. Everyone else gets the sample feed.
    const allowSerpApi = await foundation.serpApiAccess(req);
    const result = await fetchSouthAfricanTenders(query, province, { allowSerpApi });
    if (!result.serpApiConsumed) await foundation.releaseConsumption(req, 'serpapi');
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Tender feed (sync + tenant-aware listing) - shared implementation with the
// test harness so route security is exercised against the real handlers.
registerTenderFeedRoutes(app, { foundation, store: inMemoryTenderStore });

// Models Registry & Switcher
app.get('/api/models', (req: Request, res: Response) => {
  res.json({
    success: true,
    activeModel: activeLlmConfig.modelId,
    activeProvider: activeLlmConfig.provider,
    models: PLATFORM_MODELS
  });
});

// Detect Local Models (Gemma, Llama 3.1 8B, Ollama, LM Studio, vLLM)
// Requires a signed-in account in every mode: even loopback-only, an
// anonymous probe endpoint would let the public internet map which model
// runners and ports are live on this host.
app.get('/api/models/detect', foundation.requireAdmin, async (req: Request, res: Response) => {
  try {
    const customEndpoint = typeof req.query.endpoint === 'string' ? req.query.endpoint : undefined;
    // SSRF guard: model detection may only probe loopback runners on this
    // host. An arbitrary URL here would let anyone port-scan through us.
    if (customEndpoint && !isLoopbackEndpoint(customEndpoint)) {
      res.status(400).json({ success: false, error: 'endpoint must be a loopback address (localhost / 127.0.0.1 / ::1)' });
      return;
    }
    const report = await detectLocalModels(customEndpoint);

    // If local models were detected and current provider is local, optionally update PLATFORM_MODELS availability
    if (report.isLocalServerRunning) {
      PLATFORM_MODELS.forEach(m => {
        if (m.baseArchitecture === 'Llama 3.1 8B' && report.hasLlama31) m.isAvailable = true;
        if (m.baseArchitecture === 'Gemma 2' && report.hasGemma) m.isAvailable = true;
      });
    }

    res.json({
      success: true,
      report,
      activeModel: activeLlmConfig.modelId,
      activeProvider: activeLlmConfig.provider,
      cloudFailoverConfigured: Boolean(process.env.GEMINI_API_KEY),
      cloudFailoverPolicy: 'Paid cloud AI is used only for subscribed accounts.'
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Engine selection is per-tenant, from a server-side allowlist only. The old
// version of this route accepted provider/baseUrl/apiKey from the request body
// and echoed the full config - including the server's paid API key - back to
// anyone. baseUrl and apiKey are never accepted from clients now.
app.post('/api/models/active', foundation.requireAdmin, async (req: Request, res: Response) => {
  try {
    const { modelId } = req.body || {};
    if (typeof modelId !== 'string' || !modelId) {
      res.status(400).json({ success: false, error: 'modelId required' });
      return;
    }
    const allowed = PLATFORM_MODELS.filter(m => m.isAvailable && !m.isDemo).map(m => m.id);
    if (!(allowed as string[]).includes(modelId)) {
      res.status(400).json({ success: false, error: 'unknown_or_unavailable_model', allowed });
      return;
    }
    const existing = await foundation.repos.profiles.get(req.auth!.tenantId);
    const merged = { ...(existing ? existing.profile : {}), llmModelId: modelId as any };
    await foundation.repos.profiles.put({ tenantId: req.auth!.tenantId, profile: merged, updatedAt: new Date() });
    res.json({ success: true, selectedModelId: modelId, serverDefault: publicLlmConfigView() });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// POPIA Profile Get & Update
// Session required in EVERY mode: no company profile - not even the demo
// sample - is served over the API to anonymous callers. The signed-out demo
// never reads this endpoint (its sample lives client-side in the analyzer).
app.get('/api/profile', foundation.requireAuth, async (req: Request, res: Response) => {
  const stored = await foundation.repos.profiles.get(req.auth!.tenantId);
  const profile = stored ? profileForClient(foundation.config.profileFieldKey, stored.profile) : {};
  res.json({ success: true, profile });
});

// Self-serve erasure of the saved company profile. Immediate and total for
// this tenant's profile row; account, sessions and bid drafts are separate
// records with their own lifecycles (sessions die on logout, drafts are
// deleted one by one from the Bid Readiness view).
app.delete('/api/profile', foundation.requireAuth, async (req: Request, res: Response) => {
  await foundation.repos.profiles.delete(req.auth!.tenantId);
  res.json({ success: true, message: 'Saved company profile deleted.' });
});

// Saving a profile requires an account in EVERY mode: the signed-out demo
// profile is read-only sample data, and a shared writable global would leak
// one visitor's company details to every other visitor.
app.post('/api/profile', foundation.requireAuth, async (req: Request, res: Response) => {
  try {
    const existing = await foundation.repos.profiles.get(req.auth!.tenantId);
    const key = foundation.config.profileFieldKey;
    const saved = prepareProfileSave(key, existing?.profile || {}, req.body || {});
    await foundation.repos.profiles.put({ tenantId: req.auth!.tenantId, profile: saved, updatedAt: new Date() });
    res.json({ success: true, profile: profileForClient(key, saved) });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// RFP Pipeline Execution. The request body carries document text and profile
// context ONLY: the engine (model/baseUrl) is resolved server-side from the
// tenant's allowlisted selection, and paid cloud AI runs solely for
// subscribed accounts. If the pipeline fails, the consumed analysis unit is
// released so a missing key or failed run never bills the tenant.
app.post('/api/analyze', heavyOpLimiter, async (req: Request, res: Response) => {
  try {
    const { rawText, referenceId, companyProfile } = req.body || {};

    if (!rawText || typeof rawText !== 'string') {
      res.status(400).json({ success: false, error: 'rawText string is required for RFP analysis' });
      return;
    }
    if (rawText.length > 2_000_000) {
      res.status(413).json({ success: false, error: 'rawText too large (max 2M characters per analysis)' });
      return;
    }

    const ref = referenceId || `RFP-ZA-${Date.now().toString().slice(-5)}`;
    let profile = companyProfile || (Object.keys(userSmeProfile).length ? userSmeProfile : undefined);
    let selectedModelId: string | null = null;
    if (req.auth) {
      const stored = await foundation.repos.profiles.get(req.auth.tenantId);
      if (stored?.profile) {
        stored.profile = decryptProfileFields(foundation.config.profileFieldKey, stored.profile);
        selectedModelId = typeof (stored.profile as any).llmModelId === 'string' ? (stored.profile as any).llmModelId : null;
        if (!companyProfile) profile = stored.profile;
      }
    }
    const isBeta = req.auth && (await foundation.repos.entitlements.get(req.auth.tenantId))?.planId === 'test_cohort';
    const llmConfig = resolveServerLlmConfig(isBeta ? 'gemma2-local' : selectedModelId);
    const allowCloudLlm = await foundation.cloudLlmAccess(req);

    let result;
    try {
      result = await executeRfpPipeline({
        rawText,
        referenceId: ref,
        companyProfile: profile,
        llmConfig,
        allowCloudLlm
      });
    } catch (pipelineErr) {
      await foundation.releaseConsumption(req, 'analysis');
      throw pipelineErr;
    }


    res.json({
      success: true,
      tender: result.record,
      traceLogs: result.traceLogs,
      spans: result.spans,
      skeleton: result.skeleton,
      usedModel: result.usedModel
    });
  } catch (error: any) {
    console.error('[API /api/analyze Error]:', error);
    res.status(500).json({ success: false, error: error.message || 'Pipeline analysis failed' });
  }
});

// ======================== FINE-TUNING & DATASET STUDIO ========================

// Datasets. Curated samples are public read; anything a user creates belongs
// to their tenant and requires an account in every mode.
app.get('/api/finetune/datasets', foundation.requireAdmin, (req: Request, res: Response) => {
  const visible = inMemoryDatasets.filter(d => !d.tenantId || (req.auth && d.tenantId === req.auth.tenantId));
  res.json({ success: true, datasets: visible });
});

app.post('/api/finetune/datasets', foundation.requireAdmin, (req: Request, res: Response) => {
  try {
    const { name, description, category, examples, format } = req.body;
    const newDs: IFineTuningDataset = {
      tenantId: req.auth!.tenantId,
      id: `dataset-custom-${Date.now()}`,
      name: name || 'Custom Procurement Dataset',
      description: description || 'User-defined training dataset',
      category: category || 'Custom',
      version: '1.0.0',
      exampleCount: Array.isArray(examples) ? examples.length : 0,
      tokenCountEst: (Array.isArray(examples) ? examples.length : 0) * 1250,
      format: format || 'alpaca',
      examples: Array.isArray(examples) ? examples : [],
      createdAt: new Date().toISOString()
    };
    inMemoryDatasets.unshift(newDs);
    res.json({ success: true, dataset: newDs });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

registerGeneratedDatasetRoute(app, { foundation, store: inMemoryTenderStore, datasets: inMemoryDatasets });

// Fine-Tuning Jobs. Sample jobs are public read; a tenant's jobs are private.
app.get('/api/finetune/jobs', foundation.requireAdmin, (req: Request, res: Response) => {
  const visible = inMemoryJobs.filter(j => !j.tenantId || (req.auth && j.tenantId === req.auth.tenantId));
  res.json({ success: true, jobs: visible });
});

// Start Fine-Tuning Pipeline. NOTE: this is a SIMULATED training run for the
// studio preview - it performs no GPU execution and produces no adapter
// artifact. Real training runs from the exported Python script.
const simulatedJobTimers = new Map<string, ReturnType<typeof setInterval>>();
registerSimulatedTrainingRoute(app, { foundation, datasets: inMemoryDatasets, jobs: inMemoryJobs, timers: simulatedJobTimers });

// "Deploy" a fine-tuned model. Simulated preview only: it does NOT switch the
// active inference engine (there is no trained artifact to serve), and it can
// only touch the caller's own simulated jobs. Accepts jobId in body or path.
const deployHandler = (req: Request, res: Response) => {
  try {
    const jobId = req.params.jobId || (req.body || {}).jobId;
    const job = inMemoryJobs.find(j => j.id === jobId && j.tenantId === req.auth!.tenantId);
    if (!job) {
      res.status(404).json({ success: false, error: 'job_not_found' });
      return;
    }
    res.json({
      success: true,
      simulated: true,
      message: `Simulated deploy of "${job.outputModelName}". No model artifact exists yet, so the active engine was not changed.`,
      engineChanged: false
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
};
app.post('/api/finetune/deploy', foundation.requireAdmin, deployHandler);
app.post('/api/finetune/deploy/:jobId', foundation.requireAdmin, deployHandler);

// Side-by-side evaluator. Both outputs are FIXED ILLUSTRATIVE EXAMPLES, not
// live model inference - labelled as such in the response.
app.post('/api/finetune/compare', foundation.requireAdmin, async (req: Request, res: Response) => {
  try {
    const { prompt } = req.body;
    const testPrompt = prompt || 'What are the mandatory returnables and PPPFA formula for Drakenstein Municipality basic services tender?';

    // Baseline response (generic)
    const baseResponse = `The tender will likely require typical procurement documents including registration details, tax documents, and financial offers. Under South African law, general preferential points apply. Detailed criteria are listed in the tender pack.`;

    // Fine-Tuned response (deeply statutory, citing exact SBDs, Drakenstein requirements, CIDB 7CE)
    const fineTunedResponse = JSON.stringify({
      statutoryAudit: "DRAKENSTEIN MUNICIPALITY - CIVIL ENGINEERING (CE 08/2026)",
      mandatedSystem: "90/10 Preference Point System (Tender estimate R58M > R50M statutory threshold under 2022 PPPFA Regulations)",
      cidbRequirement: "Grade 7CE (Civil Engineering) or Grade 6CE PE (Potentially Emerging)",
      mandatoryReturnables: [
        "National Treasury Central Supplier Database (CSD) active MAAA report",
        "SARS Tax Compliance Status PIN (verified compliant)",
        "Valid COIDA Letter of Good Standing (Compensation Commissioner / FEM)",
        "Municipal MBD 4 (Declaration of Interest) & MBD 6.1 (Specific Goals Claim)",
        "Minimum 30% subcontracting agreement to local emerging EME/QSE contractors in Drakenstein"
      ],
      complianceHurdle: "Minimum technical functionality cut-off is 70 points out of 100 before price evaluation."
    }, null, 2);

    res.json({
      success: true,
      illustrative: true,
      note: 'Illustrative example outputs for comparison UI - not live model inference.',
      prompt: testPrompt,
      baseModel: 'meta-llama/Meta-Llama-3.1-8B-Instruct (Baseline, example output)',
      baseOutput: baseResponse,
      fineTunedModel: 'Llama 3.1 8B - SA Procurement LoRA v1 (example output, simulated)',
      fineTunedOutput: fineTunedResponse
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Standalone Python GPU Training Script Export
app.get('/api/finetune/export-script', foundation.requireAdmin, (req: Request, res: Response) => {
  const pythonScript = `# ==============================================================================
# TenderAgent South Africa - Llama 3.1 8B / Gemma 2 LoRA Fine-Tuning Pipeline
# Optimized for Unsloth / Hugging Face PEFT on NVIDIA GPUs (RTX 3090/4090, A100, H100)
# Legislation: PPPFA 2022, CIDB Act, National Treasury SCM Instructions
# ==============================================================================

import torch
from datasets import load_dataset
from trl import SFTTrainer
from transformers import TrainingArguments, AutoTokenizer, AutoModelForCausalLM
from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training

# 1. Configuration
MODEL_ID = "meta-llama/Meta-Llama-3.1-8B-Instruct" # or "google/gemma-2-9b-it"
OUTPUT_DIR = "./tenderagent-lora-sa-procure"
DATASET_PATH = "./sa_procurement_dataset.jsonl"

# 2. QLoRA 4-bit Quantization Config
lora_config = LoraConfig(
    r=16,
    lora_alpha=32,
    target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
    lora_dropout=0.05,
    bias="none",
    task_type="CAUSAL_LM"
)

print(f"[*] Initializing model {MODEL_ID} for South African Procurement Fine-Tuning...")
tokenizer = AutoTokenizer.from_pretrained(MODEL_ID)
tokenizer.pad_token = tokenizer.eos_token

# 3. Training Arguments
training_args = TrainingArguments(
    output_dir=OUTPUT_DIR,
    per_device_train_batch_size=2,
    gradient_accumulation_steps=4,
    learning_rate=2e-4,
    lr_scheduler_type="cosine",
    logging_steps=10,
    num_train_epochs=3,
    weight_decay=0.01,
    fp16=not torch.cuda.is_bf16_supported(),
    bf16=torch.cuda.is_bf16_supported(),
    optim="paged_adamw_8bit",
    report_to="none"
)

print("[*] Ready. Run this script in Google Colab, RunPod, or local GPU instance.")
`;
  res.setHeader('Content-Type', 'text/x-python');
  res.setHeader('Content-Disposition', 'attachment; filename="train_lora_sa_tenders.py"');
  res.send(pythonScript);
});

// Start Express server and mount Vite in development
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // The built frontend lives at ./dist relative to the repo root (tsx dev)
    // or next to the compiled bundle at dist-server/ (production image).
    const distDir = [path.resolve(__dirname, 'dist'), path.resolve(__dirname, '..', 'dist'), path.resolve(process.cwd(), 'dist')]
      .find((d) => fs.existsSync(path.join(d, 'index.html'))) || path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.resolve(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[TenderAgent Server] Listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('[TenderAgent] Fatal server bootstrap error:', err);
  process.exit(1);
});
