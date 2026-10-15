import React, { useState } from 'react';
import { Terminal, Activity, Layers, Database, Cpu, CheckCircle2, ShieldCheck, Copy, Check, Code } from 'lucide-react';
import { ISentrySpanRecord } from '../lib/types/tender';

interface SentryTraceViewerProps {
  recentSpans: ISentrySpanRecord[];
  isDarkMode?: boolean;
}

export const SentryTraceViewer: React.FC<SentryTraceViewerProps> = ({ 
  recentSpans,
  isDarkMode = false
}) => {
  const [activeCodeTab, setActiveCodeTab] = useState<'mastra' | 'mongo' | 'serp'>('mastra');
  const [copied, setCopied] = useState(false);

  // Default sample spans if no run has occurred yet
  const displaySpans: ISentrySpanRecord[] = recentSpans.length > 0 ? recentSpans : [
    {
      id: 'span-root-01',
      name: 'RFP Ingestion Pipeline Execution',
      op: 'agent.pipeline',
      status: 'success',
      startTime: Date.now() - 1450,
      durationMs: 1450,
      description: 'End-to-end ingestion and compliance parsing root transaction'
    },
    {
      id: 'span-popia-02',
      name: 'POPIA Data Sanitization & Compliance Verification',
      op: 'popia.sanitize',
      status: 'success',
      startTime: Date.now() - 1400,
      durationMs: 75,
      description: 'Scrub sensitive bank accounts & PII per Act 4 of 2013'
    },
    {
      id: 'span-gemma-03',
      name: 'Gemma 2 Information Extraction Tactic',
      op: 'agent.llm.call',
      status: 'success',
      startTime: Date.now() - 1320,
      durationMs: 980,
      description: 'Extract CSD, SARS PIN, B-BBEE, CIDB, and 80/20 criteria'
    },
    {
      id: 'span-comp-04',
      name: 'South African Regulatory Checklist Evaluation',
      op: 'compliance.evaluate',
      status: 'success',
      startTime: Date.now() - 340,
      durationMs: 45,
      description: 'Validate returnables against National Treasury SCM standards'
    },
    {
      id: 'span-mongo-05',
      name: 'Persist Extracted Schema to Database',
      op: 'db.mongo',
      status: 'success',
      startTime: Date.now() - 290,
      durationMs: 120,
      description: 'Upsert record into MongoDB Atlas tenders collection'
    }
  ];

  const codeSnippets = {
    mastra: `// src/lib/agents/mastraEngine.ts
import { Agent } from 'mastra';
import * as Sentry from '@sentry/node';
import Tender from '@/lib/models/Tender';

export const rfpAnalysisAgent = new Agent({
  name: 'TenderAgentParser',
  instructions: \`You are an expert South African tender compliance auditor.
  Always look out for:
  - CSD registration mandates (MAAA numbers)
  - SARS Tax Compliance PIN criteria
  - B-BBEE level goals & affidavits
  - CIDB construction grading tiers (e.g. 7CE)
  - The evaluation framework allocation split (80/20 or 90/10 pricing matrices).\`,
  model: {
    provider: 'OLLAMA',
    name: 'gemma2',
    toolConfig: {}
  }
});

export async function executeRfpPipeline({ rawText, referenceId }: ParseExecutionPayload) {
  return await Sentry.startSpan({
    name: 'RFP Ingestion Pipeline Execution',
    op: 'agent.pipeline',
  }, async (span) => {
    const extractionSpan = Sentry.startInactiveSpan({
      name: 'Gemma 2 Information Extraction Tactic',
      op: 'agent.llm.call'
    });
    
    // Gemma LLM Inference...
    extractionSpan.end();
    
    const dbSpan = Sentry.startInactiveSpan({ 
      name: 'Persist Extracted Schema to Database', 
      op: 'db.mongo' 
    });
    await Tender.create({ ... });
    dbSpan.end();
  });
}`,
    mongo: `// src/lib/models/Tender.ts
import mongoose, { Schema, Document } from 'mongoose';

export interface ITender extends Document {
  title: string;
  referenceNumber: string;
  issuingDepartment: string;
  closingDate: Date;
  cidbGradingRequired?: string;
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

export default mongoose.models.Tender || mongoose.model<ITender>('Tender', TenderSchema);`,
    serp: `// src/app/api/scrape/route.ts
import { NextResponse } from 'next/server';
import { getJson } from 'serpapi';

export async function GET() {
  try {
    const searchResults = await getJson({
      engine: 'google',
      q: 'site:gov.za "tender" OR "RFP" "closing date" "CSD"',
      gl: 'za',
      hl: 'en',
      api_key: process.env.SERPAPI_API_KEY
    });

    const simpleLeads = (searchResults.organic_results || []).map((item: any) => ({
      title: item.title,
      link: item.link,
      snippet: item.snippet,
      source: 'Google Scraped Gov Boards'
    }));

    return NextResponse.json({ success: true, leads: simpleLeads });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}`
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(codeSnippets[activeCodeTab]);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      
      {/* Top Banner */}
      <div className={`${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'} border rounded-xl p-6`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <Activity className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              <h2 className={`text-lg font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                Sentry Agent Tracing & Architecture Inspector
              </h2>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-800 font-semibold">
                Span Telemetry Active
              </span>
            </div>
            <p className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-600'} leading-relaxed max-w-2xl`}>
              Inspect transaction boundaries, custom agent spans, and asynchronous LLM orchestration
              across the Mastra framework, Gemma 2 inference layer, and MongoDB Atlas persistence engine.
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className={`px-2.5 py-1 rounded border font-mono ${
              isDarkMode ? 'bg-slate-950 border-slate-800 text-slate-300' : 'bg-slate-100 border-slate-200 text-slate-700'
            }`}>
              Total Spans: {displaySpans.length}
            </span>
          </div>
        </div>
      </div>

      {/* Architecture Flow Diagram */}
      <div className={`${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'} border rounded-xl p-6`}>
        <h3 className={`text-sm font-semibold mb-4 flex items-center gap-2 ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
          <Layers className="w-4 h-4 text-emerald-600" />
          <span>System Execution Topology & Transaction Boundaries</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 font-mono text-xs">
          
          {/* Stage 1 */}
          <div className={`p-3.5 rounded-lg border space-y-1 ${
            isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
          }`}>
            <div className={`flex items-center justify-between text-[10px] ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              <span>01. INGESTION</span>
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            </div>
            <div className={`font-bold ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>POPIA Sandbox</div>
            <div className={`text-[10px] ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>Pii scrubbing & redaction per Act 4 of 2013</div>
          </div>

          {/* Stage 2 */}
          <div className={`p-3.5 rounded-lg border space-y-1 ${
            isDarkMode ? 'bg-slate-950 border-purple-900/60' : 'bg-purple-50/50 border-purple-200'
          }`}>
            <div className="flex items-center justify-between text-[10px] text-purple-600 dark:text-purple-400">
              <span>02. TRACING</span>
              <Activity className="w-3.5 h-3.5" />
            </div>
            <div className={`font-bold ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>Sentry Root Span</div>
            <div className={`text-[10px] ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>op: agent.pipeline transaction initiation</div>
          </div>

          {/* Stage 3 */}
          <div className={`p-3.5 rounded-lg border space-y-1 ${
            isDarkMode ? 'bg-slate-950 border-amber-900/60' : 'bg-amber-50/50 border-amber-200'
          }`}>
            <div className="flex items-center justify-between text-[10px] text-amber-600 dark:text-amber-400">
              <span>03. INFERENCE</span>
              <Cpu className="w-3.5 h-3.5" />
            </div>
            <div className={`font-bold ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>Mastra + Gemma 2</div>
            <div className={`text-[10px] ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>op: agent.llm.call structural parser</div>
          </div>

          {/* Stage 4 */}
          <div className={`p-3.5 rounded-lg border space-y-1 ${
            isDarkMode ? 'bg-slate-950 border-emerald-900/60' : 'bg-emerald-50/50 border-emerald-200'
          }`}>
            <div className="flex items-center justify-between text-[10px] text-emerald-600 dark:text-emerald-400">
              <span>04. STATUTES</span>
              <CheckCircle2 className="w-3.5 h-3.5" />
            </div>
            <div className={`font-bold ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>Compliance Audit</div>
            <div className={`text-[10px] ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>CSD, SARS, B-BBEE, CIDB, 80/20 check</div>
          </div>

          {/* Stage 5 */}
          <div className={`p-3.5 rounded-lg border space-y-1 ${
            isDarkMode ? 'bg-slate-950 border-blue-900/60' : 'bg-blue-50/50 border-blue-200'
          }`}>
            <div className="flex items-center justify-between text-[10px] text-blue-600 dark:text-blue-400">
              <span>05. PERSIST</span>
              <Database className="w-3.5 h-3.5" />
            </div>
            <div className={`font-bold ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>MongoDB Atlas</div>
            <div className={`text-[10px] ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>op: db.mongo schema record storage</div>
          </div>

        </div>
      </div>

      {/* Live Spans Telemetry Table */}
      <div className={`${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'} border rounded-xl p-6`}>
        <div className="flex items-center justify-between mb-4">
          <h3 className={`text-sm font-semibold flex items-center gap-2 ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
            <Terminal className="w-4 h-4 text-purple-600 dark:text-purple-400" />
            <span>Active Sentry Transaction Spans</span>
          </h3>
          <span className={`text-xs font-mono ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Traces Sample Rate: 1.0</span>
        </div>

        <div className={`overflow-x-auto rounded-lg border ${isDarkMode ? 'border-slate-800' : 'border-slate-200'}`}>
          <table className="w-full text-left text-xs font-mono">
            <thead className={`border-b ${
              isDarkMode ? 'bg-slate-950 text-slate-400 border-slate-800' : 'bg-slate-50 text-slate-600 border-slate-200'
            }`}>
              <tr>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3">Span Op</th>
                <th className="py-2.5 px-3">Span Name</th>
                <th className="py-2.5 px-3">Duration</th>
                <th className="py-2.5 px-3">Description / Metadata</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${
              isDarkMode ? 'divide-slate-800 bg-slate-950/40 text-slate-300' : 'divide-slate-200 bg-white text-slate-700'
            }`}>
              {displaySpans.map((sp) => (
                <tr key={sp.id} className={isDarkMode ? 'hover:bg-slate-850' : 'hover:bg-slate-50'}>
                  <td className="py-2.5 px-3">
                    <span className="flex items-center gap-1.5 text-emerald-600">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      <span>{sp.status}</span>
                    </span>
                  </td>
                  <td className="py-2.5 px-3 font-semibold text-purple-600 dark:text-purple-400">{sp.op}</td>
                  <td className={`py-2.5 px-3 font-sans font-medium ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{sp.name}</td>
                  <td className="py-2.5 px-3 font-semibold text-amber-600 dark:text-amber-300">{sp.durationMs || 45}ms</td>
                  <td className={`py-2.5 px-3 font-sans truncate max-w-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>{sp.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Code Blueprints Viewer */}
      <div className={`${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'} border rounded-xl p-6`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <Code className="w-4 h-4 text-emerald-600" />
            <h3 className={`text-sm font-semibold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Implementation Architecture Code</h3>
          </div>

          <div className="flex items-center gap-2">
            <div className={`flex items-center p-1 rounded-lg text-xs border ${
              isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-100 border-slate-200'
            }`}>
              <button
                onClick={() => setActiveCodeTab('mastra')}
                className={`px-2.5 py-1 rounded transition-colors ${
                  activeCodeTab === 'mastra' 
                    ? isDarkMode ? 'bg-slate-800 text-emerald-400 font-semibold' : 'bg-white text-emerald-800 font-semibold shadow-2xs'
                    : isDarkMode ? 'text-slate-400' : 'text-slate-600'
                }`}
              >
                mastraEngine.ts
              </button>
              <button
                onClick={() => setActiveCodeTab('mongo')}
                className={`px-2.5 py-1 rounded transition-colors ${
                  activeCodeTab === 'mongo' 
                    ? isDarkMode ? 'bg-slate-800 text-emerald-400 font-semibold' : 'bg-white text-emerald-800 font-semibold shadow-2xs'
                    : isDarkMode ? 'text-slate-400' : 'text-slate-600'
                }`}
              >
                Tender.ts (Mongoose)
              </button>
              <button
                onClick={() => setActiveCodeTab('serp')}
                className={`px-2.5 py-1 rounded transition-colors ${
                  activeCodeTab === 'serp' 
                    ? isDarkMode ? 'bg-slate-800 text-emerald-400 font-semibold' : 'bg-white text-emerald-800 font-semibold shadow-2xs'
                    : isDarkMode ? 'text-slate-400' : 'text-slate-600'
                }`}
              >
                route.ts (SerpApi)
              </button>
            </div>

            <button
              onClick={handleCopyCode}
              className={`flex items-center gap-1 px-2.5 py-1.5 text-xs rounded border transition-colors ${
                isDarkMode 
                  ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700' 
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
              }`}
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
        </div>

        <div className="bg-slate-950 border border-slate-800 rounded-lg p-4 font-mono text-xs text-slate-300 overflow-x-auto max-h-[360px]">
          <pre>{codeSnippets[activeCodeTab]}</pre>
        </div>
      </div>

    </div>
  );
};
