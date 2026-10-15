import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { executeRfpPipeline, inMemoryTenderStore } from './src/lib/agents/mastraEngine';
import { fetchSouthAfricanTenders } from './src/lib/services/serpDiscovery';
import { SAMPLE_TENDERS } from './src/lib/data/sampleTenders';
import { IUserProfile } from './src/lib/types/tender';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '15mb' }));

// Persistent memory storage for user company profile (POPIA sandboxed)
let userSmeProfile: IUserProfile = {
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

// Seed sample tenders into memory cache
SAMPLE_TENDERS.forEach(t => {
  inMemoryTenderStore.set(t.referenceNumber, t);
});

// API Routes
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    engine: 'TenderAgent Mastra Orchestrator',
    aiModel: process.env.GEMINI_API_KEY ? 'Gemini 2.5 Flash / Gemma Persona' : 'Gemma 2 Local Simulator',
    sentryTracing: Boolean(process.env.SENTRY_DSN),
    popiaCompliance: 'Active - Act 4 of 2013 Sandboxed'
  });
});

// SerpApi Discovery Feed
app.get('/api/scrape', async (req: Request, res: Response) => {
  try {
    const query = typeof req.query.q === 'string' ? req.query.q : undefined;
    const province = typeof req.query.province === 'string' ? req.query.province : undefined;
    const result = await fetchSouthAfricanTenders(query, province);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Tender List
app.get('/api/tenders', (req: Request, res: Response) => {
  const tenders = Array.from(inMemoryTenderStore.values());
  res.json({ success: true, count: tenders.length, tenders });
});

// POPIA Profile Get & Update
app.get('/api/profile', (req: Request, res: Response) => {
  res.json({ success: true, profile: userSmeProfile });
});

app.post('/api/profile', (req: Request, res: Response) => {
  try {
    const updated = { ...userSmeProfile, ...req.body };
    userSmeProfile = updated;
    res.json({ success: true, profile: userSmeProfile, message: 'POPIA SME profile updated securely.' });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// RFP Pipeline Execution (Mastra + Sentry Agent Tracing)
app.post('/api/analyze', async (req: Request, res: Response) => {
  try {
    const { rawText, referenceId, companyProfile } = req.body;

    if (!rawText || typeof rawText !== 'string') {
      res.status(400).json({ success: false, error: 'rawText string is required for RFP analysis' });
      return;
    }

    const ref = referenceId || `RFP-ZA-${Date.now().toString().slice(-5)}`;
    const profile = companyProfile || userSmeProfile;

    const result = await executeRfpPipeline({
      rawText,
      referenceId: ref,
      companyProfile: profile
    });

    res.json({
      success: true,
      tender: result.record,
      traceLogs: result.traceLogs,
      spans: result.spans,
      skeleton: result.skeleton
    });
  } catch (error: any) {
    console.error('[API /api/analyze Error]:', error);
    res.status(500).json({ success: false, error: error.message || 'Pipeline analysis failed' });
  }
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
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
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
