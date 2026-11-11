import React, { useState } from 'react';
import {
  Upload, FileText, CheckCircle, ShieldAlert, Layers, RefreshCw,
  ChevronRight, Building, Calendar, DollarSign, Award, CheckCircle2,
  AlertCircle, Sparkles, Terminal, FileCode, Check, ShieldCheck, FileSearch
, MinusCircle } from 'lucide-react';
import { SAMPLE_TENDERS } from '../lib/data/sampleTenders';
import { ITender, IUserProfile, ISentrySpanRecord, IBidResponseSkeleton } from '../lib/types/tender';

interface RfpAnalyzerProps {
  userProfile: IUserProfile;
  onOpenSkeleton: (skeleton: IBidResponseSkeleton) => void;
  onSwitchToCalculator: (pointsSystem: '80/20' | '90/10', tenderTitle: string) => void;
  /** Operator flag: the model-switcher bar is platform tooling, not customer UI. */
  isAdmin?: boolean;
  initialSelectedTender?: ITender | null;
  isDarkMode?: boolean;
}

export const RfpAnalyzer: React.FC<RfpAnalyzerProps> = ({
  userProfile,
  onOpenSkeleton,
  onSwitchToCalculator,
  isAdmin = false,
  initialSelectedTender,
  isDarkMode = false
}) => {
  const [selectedPresetIndex, setSelectedPresetIndex] = useState<number>(0);
  const [analysisError, setAnalysisError] = useState('');
  const [showSamples, setShowSamples] = useState<boolean>(false);
  const [rawText, setRawText] = useState<string>(initialSelectedTender?.rawTextExcerpt || '');
  const [referenceId, setReferenceId] = useState<string>(initialSelectedTender?.referenceNumber || '');
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [traceLogs, setTraceLogs] = useState<string[]>([]);
  const [spans, setSpans] = useState<ISentrySpanRecord[]>([]);
  const [extractedData, setExtractedData] = useState<any | null>(initialSelectedTender || null);
  const [activeSkeleton, setActiveSkeleton] = useState<IBidResponseSkeleton | null>(null);

  const [isParsingPdf, setIsParsingPdf] = useState<boolean>(false);
  const [pdfMeta, setPdfMeta] = useState<{ pageCount?: number; title?: string; reference?: string; dept?: string } | null>(null);
  const [activeModel, setActiveModel] = useState<string>('gemma2:latest');
  const [activeProvider, setActiveProvider] = useState<string>('ollama');
  const [isLocalOnline, setIsLocalOnline] = useState<boolean>(false);
  const [isModelMenuOpen, setIsModelMenuOpen] = useState<boolean>(false);

  // Check local models on mount
  React.useEffect(() => {
    if (!isAdmin) return; // model detection is an operator endpoint
    fetch('/api/models/detect')
      .then(r => r.json())
      .then(d => {
        if (d.success && d.report) {
          setIsLocalOnline(d.report.isLocalServerRunning);
          if (d.report.hasGemma) {
            setActiveModel('gemma2:latest');
            setActiveProvider('ollama');
          } else if (d.report.hasLlama31) {
            setActiveModel('llama3.1:8b');
            setActiveProvider('ollama');
          }
        }
      })
      .catch(() => setIsLocalOnline(false));
  }, [isAdmin]);

  // Detect raw PDF binary stream
  const isRawPdfStream = rawText.trim().startsWith('%PDF-') || (rawText.includes('%PDF-') && rawText.includes('endobj'));

  const handleSelectPreset = (idx: number) => {
    setSelectedPresetIndex(idx);
    const preset = SAMPLE_TENDERS[idx];
    setRawText(preset.rawTextExcerpt || '');
    setReferenceId(preset.referenceNumber);
    setPdfMeta(null);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf') {
      setIsParsingPdf(true);
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const arrayBuffer = event.target?.result as ArrayBuffer;
          let binary = '';
          const bytes = new Uint8Array(arrayBuffer);
          const len = bytes.byteLength;
          for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          const base64Data = window.btoa(binary);

          const res = await fetch('/api/parse-document', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ base64Data, filename: file.name })
          });
          const parsed = await res.json();
          if (parsed.success && parsed.text) {
            setRawText(parsed.text);
            setPdfMeta({
              pageCount: parsed.pageCount,
              title: parsed.titleGuess,
              reference: parsed.referenceGuess,
              dept: parsed.issuingDeptGuess
            });
            if (parsed.referenceGuess) setReferenceId(parsed.referenceGuess);
          } else {
            setRawText(`[PDF Document: ${file.name}]\nFailed to parse binary PDF: ${parsed.error || 'Unknown error'}`);
          }
        } catch (err: any) {
          console.error('[Analyzer] PDF parsing error:', err);
        } finally {
          setIsParsingPdf(false);
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        setRawText(text);
        const refGuess = text.match(/(?:TENDER|BID|REF)[\s:-]*([A-Z0-9\/\-_]+)/i);
        if (refGuess && refGuess[1]) {
          setReferenceId(refGuess[1]);
        }
      };
      reader.readAsText(file);
    }
  };

  const handleDecodeRawPdfStream = async () => {
    setIsParsingPdf(true);
    try {
      const res = await fetch('/api/parse-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawText })
      });
      const parsed = await res.json();
      if (parsed.success && parsed.text) {
        setRawText(parsed.text);
        setPdfMeta({
          pageCount: parsed.pageCount,
          title: parsed.titleGuess,
          reference: parsed.referenceGuess,
          dept: parsed.issuingDeptGuess
        });
        if (parsed.referenceGuess) setReferenceId(parsed.referenceGuess);
      }
    } catch (err) {
      console.warn('PDF stream decode failed:', err);
    } finally {
      setIsParsingPdf(false);
    }
  };

  const executePipeline = async () => {
    setAnalysisError('');
    setIsUploading(true);
    window.dispatchEvent(new CustomEvent('tenderagent:busy', { detail: true }));
    setTraceLogs([]);
    setSpans([]);
    setExtractedData(null);
    setActiveSkeleton(null);

    // Call server API for live Mastra execution + Sentry tracing
    try {
      let textToProcess = rawText;

      // Auto-decode if user pasted raw PDF binary stream
      if (textToProcess.trim().startsWith('%PDF-') || (textToProcess.includes('%PDF-') && textToProcess.includes('endobj'))) {
        setTraceLogs(prev => [
          ...prev,
          '[PDF Engine] Detected raw binary %PDF stream in input. Auto-decoding document pages...'
        ]);
        try {
          const parseRes = await fetch('/api/parse-document', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rawText: textToProcess })
          });
          const parsed = await parseRes.json();
          if (parsed.success && parsed.text) {
            textToProcess = parsed.text;
            setRawText(parsed.text);
            setPdfMeta({
              pageCount: parsed.pageCount,
              title: parsed.titleGuess,
              reference: parsed.referenceGuess,
              dept: parsed.issuingDeptGuess
            });
            if (parsed.referenceGuess) setReferenceId(parsed.referenceGuess);
            setTraceLogs(prev => [
              ...prev,
              `[PDF Engine] Decoded ${parsed.pageCount} pages (${parsed.text.length} chars). Clean tender text restored.`
            ]);
          }
        } catch (e) {
          // continue with text
        }
      }

      const initialLogs = [
        'Submitting document to the analysis pipeline...',
        `Configured engine: ${activeModel}. The server trace below reports what actually ran.`,
      ];

      for (let i = 0; i < initialLogs.length; i++) {
        await new Promise(r => setTimeout(r, 200));
        setTraceLogs(prev => [...prev, initialLogs[i]]);
      }

      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rawText: textToProcess,
          referenceId,
          companyProfile: userProfile
        })
      });

      const data = await res.json();

      if (data.success) {
        setTraceLogs(data.traceLogs || []);
        setSpans(data.spans || []);
        setExtractedData(data.tender);
        setActiveSkeleton(data.skeleton);
      } else {
        throw new Error(data.error || 'Pipeline execution failed');
      }
    } catch (err: any) {
      setAnalysisError(`Analysis did not complete: ${err.message}. No replacement sample result was generated.`);
      setExtractedData(null); setActiveSkeleton(null);
    } finally {
      setIsUploading(false);
      window.dispatchEvent(new CustomEvent('tenderagent:busy', { detail: false }));
    }
  };

  // What THIS tender's text lists. Both result shapes (live API record and
  // sample-tender preview) are normalized here. false means "not found in
  // this tender's text" - never proof the item is unnecessary.
  const listed = extractedData ? {
    csd: Boolean(extractedData.extractedComplianceChecklist?.csdRequired ?? extractedData.checklist?.csd),
    sars: Boolean(extractedData.extractedComplianceChecklist?.sarsPinRequired ?? extractedData.checklist?.sars),
    bbbee: Boolean(extractedData.extractedComplianceChecklist?.bbbeeRequired ?? extractedData.checklist?.bbbee),
    coida: Boolean(extractedData.extractedComplianceChecklist?.coidaRequired ?? extractedData.checklist?.coida),
    cidb: extractedData.cidbGradingRequired || extractedData.checklist?.cidb || null,
  } : null;

  // Check SME eligibility against extracted requirements
  const isCsdOk = Boolean(userProfile.csdNumber);
  const isSarsOk = Boolean(userProfile.taxComplianceStatusPin);
  const isBbbeeOk = Boolean(userProfile.bbbeeLevel >= 1 && userProfile.bbbeeLevel <= 4);
  const isCoidaOk = userProfile.coidaGoodStandingValid;
  const isCidbOk = !extractedData?.cidbGradingRequired || Boolean(userProfile.cidbGrading);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">

      {/* Top Banner / Context */}
      <div className={`${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'} border rounded-xl p-4 sm:p-6 relative overflow-hidden`}>
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <FileSearch className="w-6 h-6 text-emerald-700" />
              <h2 className={`font-display text-lg sm:text-xl font-semibold tracking-tight ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                Check what a tender asks for
              </h2>
            </div>
            <p className={`hidden sm:block text-sm ${isDarkMode ? 'text-slate-300' : 'text-slate-600'} max-w-2xl leading-relaxed`}>
              Upload a tender document and get a clear list of its requirements - CSD registration, SARS TCS PIN, B-BBEE, CIDB and COIDA -
              plus a response outline you can build your bid on.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => userProfile && onOpenSkeleton(activeSkeleton || SAMPLE_TENDERS[0] as any)}
              disabled={!extractedData && !activeSkeleton}
              className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 ${extractedData || activeSkeleton
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm shadow-emerald-900/30'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-200 dark:bg-slate-800 dark:text-slate-500 dark:border-slate-800'
                }`}
            >
              <FileCode className="w-3.5 h-3.5" />
              <span>Bid Skeleton (.doc)</span>
            </button>
          </div>
        </div>

        {/* Subtle accent border bottom */}
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-emerald-600 via-amber-500 to-slate-400 opacity-60" />
      </div>

      {/* Main Grid: Upload & Presets (Left) + Execution Trace (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* Left Column: RFP Ingestion Form */}
        <div className="lg:col-span-6 space-y-4">
          <div className={`${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'} border rounded-xl p-6`}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Upload className="w-5 h-5 text-emerald-600" />
                <h3 className={`font-semibold text-base ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                  Upload a tender document
                </h3>
              </div>
            </div>

            <p className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-500'} mb-4`}>
              Drop the tender PDF or paste its text below. Your checklist appears on this page when the check finishes.
            </p>

            <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">Beta testers: use public or synthetic documents only. The free beta uses a rule-based preview, not a language model. Confirm every requirement against the source tender.</p>
            {/* Sample tenders: optional, clearly labeled, collapsed by default */}
            <div className="mb-4">
              <button
                type="button"
                onClick={() => setShowSamples(v => !v)}
                className={`text-xs font-medium flex items-center gap-1.5 ${isDarkMode ? 'text-slate-300 hover:text-white' : 'text-slate-600 hover:text-slate-900'}`}
              >
                <ChevronRight className={`w-3.5 h-3.5 transition-transform ${showSamples ? 'rotate-90' : ''}`} />
                No document handy? Try a sample tender
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-200 font-bold">SAMPLES</span>
              </button>
              {showSamples && (
              <div className="grid grid-cols-2 gap-2 text-xs mt-2">
                {SAMPLE_TENDERS.map((preset, idx) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleSelectPreset(idx)}
                    className={`p-2.5 rounded-lg text-left transition-all border ${selectedPresetIndex === idx
                        ? isDarkMode
                          ? 'bg-emerald-950/40 border-emerald-700/80 text-emerald-300 shadow-sm'
                          : 'bg-emerald-50/80 border-emerald-300 text-emerald-900 shadow-sm'
                        : isDarkMode
                          ? 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                          : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-300'
                      }`}
                  >
                    <div className="font-semibold text-[11px] truncate">{preset.referenceNumber}</div>
                    <div className={`text-[10px] ${isDarkMode ? 'text-slate-400' : 'text-slate-500'} truncate`}>
                      {preset.issuingDepartment.split('(')[0]}
                    </div>
                    <div className={`text-[9px] ${isDarkMode ? 'text-slate-500' : 'text-slate-400'} mt-1`}>
                      {preset.evaluationCriteria.preferencePointsSystem} · {preset.category}
                    </div>
                  </button>
                ))}
              </div>
              )}
            </div>

            {/* File Upload Drag/Drop Box */}
            <div className={`border border-dashed rounded-lg p-3.5 mb-3 text-center transition-colors ${isDarkMode
                ? 'border-slate-700 bg-slate-950/50 hover:border-emerald-500/60'
                : 'border-slate-300 bg-slate-50/60 hover:border-emerald-500/60'
              }`}>
              <input
                type="file"
                id="rfp-file"
                accept=".txt,.pdf,.doc,.docx"
                onChange={handleFileUpload}
                className="hidden"
              />
              <label htmlFor="rfp-file" className="cursor-pointer block">
                {isParsingPdf ? (
                  <div className="flex flex-col items-center justify-center py-1">
                    <RefreshCw className="w-5 h-5 text-emerald-500 animate-spin mb-1" />
                    <span className="text-xs font-semibold text-emerald-600">Extracting text & metadata from PDF binary...</span>
                  </div>
                ) : (
                  <>
                    <Upload className="w-5 h-5 text-slate-400 mx-auto mb-1" />
                    <span className={`text-xs font-medium ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                      Drop custom RFP or <span className="text-emerald-600 underline font-semibold">browse PDF / text</span>
                    </span>
                    <span className={`text-[10px] ${isDarkMode ? 'text-slate-500' : 'text-slate-400'} block mt-0.5`}>
                      Supports native South African government PDF tenders (SEDA, WCG, SANRAL, Municipalities)
                    </span>
                  </>
                )}
              </label>
            </div>

            {/* Extracted PDF Metadata Success Pill */}
            {pdfMeta && (
              <div className="mb-3 p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-800 text-xs flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <div>
                    <span className="font-bold text-emerald-900 dark:text-emerald-300">
                      Decoded {pdfMeta.pageCount || 1}-Page PDF Document
                    </span>
                    <div className="text-[10px] text-emerald-700 dark:text-emerald-400 truncate max-w-xs">
                      {pdfMeta.title || pdfMeta.dept || 'Tender Specifications Extracted'}
                    </div>
                  </div>
                </div>
                {pdfMeta.reference && (
                  <span className="px-2 py-0.5 bg-emerald-600 text-white rounded text-[10px] font-mono font-bold">
                    {pdfMeta.reference}
                  </span>
                )}
              </div>
            )}

            {/* Raw PDF Binary Stream Warning & One-Click Decode */}
            {isRawPdfStream && (
              <div className="mb-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-3 text-xs animate-in fade-in">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                  <div>
                    <span className="font-semibold text-amber-900 dark:text-amber-300">
                      Raw %PDF-1.7 binary stream detected
                    </span>
                    <p className="text-[10px] text-amber-800 dark:text-amber-400">
                      Unparsed PDF stream bytes detected in input. Decode to restore clean tender clauses.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleDecodeRawPdfStream}
                  disabled={isParsingPdf}
                  className="px-2.5 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded text-xs font-semibold shrink-0 shadow-xs flex items-center gap-1.5"
                >
                  {isParsingPdf && <RefreshCw className="w-3 h-3 animate-spin" />}
                  <span>Decode PDF Stream</span>
                </button>
              </div>
            )}

            {/* AI Engine & Local Model Detection Bar (operator only) */}
            {isAdmin && (
            <div className={`p-2.5 rounded-lg border mb-4 text-xs ${isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
              }`}>
              <div className="flex flex-col items-start gap-2 mb-1.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Terminal className="w-3.5 h-3.5 text-emerald-600" />
                  <span className={`font-semibold ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                    Active AI Model:
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-mono text-[10px] font-bold">
                    {activeModel}
                  </span>
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    {isLocalOnline ? 'Local Runner Active' : 'Local runner not detected'}
                  </span>
                </div>
                <div className="text-[10px] font-mono text-slate-500">
                  Provider use depends on account access
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] text-slate-400">Switch Model:</span>
                <button
                  type="button"
                  onClick={() => { setActiveModel('gemma2:latest'); setActiveProvider('ollama'); }}
                  className={`px-2 py-0.5 rounded text-[10px] font-mono font-medium transition-colors ${activeModel === 'gemma2:latest'
                      ? 'bg-emerald-600 text-white font-bold'
                      : isDarkMode ? 'bg-slate-800 text-slate-300 hover:bg-slate-700' : 'bg-white border text-slate-700 hover:bg-slate-100'
                    }`}
                >
                  Gemma 2 (Local)
                </button>
                <button
                  type="button"
                  onClick={() => { setActiveModel('llama3.1:8b'); setActiveProvider('ollama'); }}
                  className={`px-2 py-0.5 rounded text-[10px] font-mono font-medium transition-colors ${activeModel === 'llama3.1:8b'
                      ? 'bg-emerald-600 text-white font-bold'
                      : isDarkMode ? 'bg-slate-800 text-slate-300 hover:bg-slate-700' : 'bg-white border text-slate-700 hover:bg-slate-100'
                    }`}
                >
                  Llama 3.1 8B (Open LLM)
                </button>
                <button
                  type="button"
                  onClick={() => { setActiveModel('gemini-2.5-flash'); setActiveProvider('gemini'); }}
                  className={`px-2 py-0.5 rounded text-[10px] font-mono font-medium transition-colors ${activeModel === 'gemini-2.5-flash'
                      ? 'bg-emerald-600 text-white font-bold'
                      : isDarkMode ? 'bg-slate-800 text-slate-300 hover:bg-slate-700' : 'bg-white border text-slate-700 hover:bg-slate-100'
                    }`}
                >
                  Gemini 2.5 Flash
                </button>
                <button
                  type="button"
                  onClick={() => { setActiveModel('fine-tuned-sa-tender-8b'); setActiveProvider('ollama'); }}
                  className={`px-2 py-0.5 rounded text-[10px] font-mono font-medium transition-colors ${activeModel === 'fine-tuned-sa-tender-8b'
                      ? 'bg-emerald-600 text-white font-bold'
                      : isDarkMode ? 'bg-slate-800 text-slate-300 hover:bg-slate-700' : 'bg-white border text-slate-700 hover:bg-slate-100'
                    }`}
                >
                  LoRA Fine-Tuned v1
                </button>
              </div>
            </div>
            )}

            {/* Reference ID & Raw Text Preview Area */}
            <div className="space-y-3 mb-5">
              <div className="flex items-center gap-2">
                <span className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Tender Reference ID:</span>
                <input
                  type="text"
                  value={referenceId}
                  onChange={(e) => setReferenceId(e.target.value)}
                  placeholder="e.g. SEDA/2026/01 or RT57-2026-ICT"
                  className={`border rounded px-2.5 py-1 text-xs font-mono flex-1 focus:outline-none focus:border-emerald-500 ${isDarkMode
                      ? 'bg-slate-950 border-slate-800 text-slate-200'
                      : 'bg-slate-50 border-slate-300 text-slate-800'
                    }`}
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    Tender text (optional if you upload a file):
                  </span>
                  <span className={`text-[10px] ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                    {rawText.length} characters {isRawPdfStream && '(Raw Stream)'}
                  </span>
                </div>
                <textarea
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                  rows={6}
                  className={`w-full border rounded-lg p-2.5 text-xs font-mono focus:outline-none focus:border-emerald-500 leading-relaxed resize-none ${isDarkMode
                      ? 'bg-slate-950 border-slate-800 text-slate-300'
                      : 'bg-slate-50 border-slate-300 text-slate-800'
                    } ${isRawPdfStream ? 'border-amber-500/60' : ''}`}
                  placeholder="Or paste the tender's text here..."
                />
              </div>
            </div>

            {analysisError && <p role="alert" className="mb-3 rounded-lg border border-amber-400 bg-amber-50 p-3 text-sm text-amber-900">{analysisError}</p>}
            {/* Primary Action Button */}
            <button
              onClick={executePipeline}
              disabled={isUploading || !rawText.trim()}
              className={`w-full py-2.5 px-4 rounded-lg font-medium text-sm flex items-center justify-center gap-2 transition-all shadow-sm ${isUploading
                  ? 'bg-emerald-950 border border-emerald-700 text-emerald-400 cursor-wait'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                }`}
            >
              {isUploading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-emerald-400" />
                  <span>Checking your document...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Check this document</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Right Column: Execution Trace */}
        <div className="lg:col-span-6 space-y-4">
          <div className={`${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'} border rounded-xl p-6 flex flex-col h-full lg:min-h-[440px]`}>
            <div className="flex items-center justify-between mb-3 border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <RefreshCw className={`w-5 h-5 ${isUploading ? 'text-emerald-600 animate-spin' : 'text-slate-400'}`} />
                <h3 className={`font-semibold text-base ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                  Progress
                </h3>
              </div>
              <div className="flex items-center gap-2">
                {isUploading ? (
                  <>
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-xs text-slate-500">Checking your document...</span>
                  </>
                ) : extractedData ? (
                  <>
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">Finished - results below</span>
                  </>
                ) : (
                  <span className="text-xs text-slate-400">Waiting</span>
                )}
              </div>
            </div>

            {/* Technical details: collapsed by default - customer surface stays plain */}
            {traceLogs.length > 0 && (
              <details className="mb-3">
                <summary className="text-xs text-slate-400 cursor-pointer select-none py-1">Technical details (engine trace)</summary>
                <div className="mt-2">
            {spans.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-3">
                {spans.map((sp) => (
                  <span
                    key={sp.id}
                    className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-slate-700 dark:text-slate-300 flex items-center gap-1"
                  >
                    <span className={sp.status === 'success' ? 'text-emerald-500' : 'text-purple-400'}>●</span>
                    <span>{sp.op}</span>
                    {sp.durationMs && <span className="text-slate-400">{sp.durationMs}ms</span>}
                  </span>
                ))}
              </div>
            )}

            {/* Progress log: plain-language panel, light in both themes */}
            <div className={`rounded-lg p-4 text-xs flex-1 overflow-y-auto space-y-2 border max-h-[360px] ${traceLogs.length > 0 ? '' : ''} ${isDarkMode ? 'bg-slate-950/60 border-slate-800 text-slate-300' : 'bg-slate-50 border-slate-200 text-slate-600'}`}>
              {traceLogs.length === 0 ? (
                <div className="text-slate-400 flex flex-col items-center gap-2 h-full justify-center py-8 lg:py-16 text-center">
                  <FileText className="w-5 h-5 text-slate-300" />
                  <span>Nothing running yet. Upload a tender document and start the check - each step will be listed here as it happens.</span>
                </div>
              ) : (
                traceLogs.map((log, i) => (
                  <div key={i} className="flex items-start gap-2 leading-relaxed">
                    <span className="text-slate-400 select-none text-[10px] shrink-0 pt-0.5 font-mono">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span>{log}</span>
                  </div>
                ))
              )}
            </div>
                </div>
              </details>
            )}
            {traceLogs.length === 0 && (
              <div className={`rounded-lg p-4 text-xs border ${isDarkMode ? 'bg-slate-950/60 border-slate-800 text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-500'}`}>
                Nothing running yet. Upload a tender document and start the check.
              </div>
            )}
            {extractedData && !isUploading && (
              <div className={`rounded-lg p-4 text-xs border ${isDarkMode ? 'bg-slate-950/60 border-slate-800 text-slate-300' : 'bg-emerald-50 border-emerald-200 text-emerald-900'}`}>
                Your results are in the checklist below. Confirm every requirement against the tender's own returnables list.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Results Analysis Panel */}
      <div className={`${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'} border rounded-xl p-6`}>
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-emerald-600" />
            <h3 className={`font-semibold text-base ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
              Your compliance checklist
            </h3>
          </div>
          {extractedData && (
            <span className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              Parsed under Preferential Procurement Regulations 2022
            </span>
          )}
        </div>

        {!extractedData ? (
          <div className="text-center py-12 text-slate-400">
            <ShieldAlert className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm">Nothing checked yet.</p>
            <p className="text-xs text-slate-400 mt-1">Upload a tender document above and its requirements will be listed here.</p>
          </div>
        ) : (
          <div className="space-y-6">

            {/* Header / Contract Parameters */}
            <div className={`p-4 rounded-lg border ${isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
              }`}>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600 block mb-1">
                Identified Contract Parameters
              </span>
              <h4 className={`text-lg font-bold mb-1.5 ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                {extractedData.title}
              </h4>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                <span className={`font-medium ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                  {extractedData.issuingDepartment || extractedData.dept}
                </span>
                <span>·</span>
                <span className="font-mono text-emerald-600 font-semibold">
                  Ref: {extractedData.referenceNumber || extractedData.reference}
                </span>
                {extractedData.estimatedBudget && (
                  <>
                    <span>·</span>
                    <span className="text-amber-600 dark:text-amber-300 font-medium">Budget: {extractedData.estimatedBudget}</span>
                  </>
                )}
                {extractedData.category && (
                  <>
                    <span>·</span>
                    <span className="text-slate-600 dark:text-slate-300">{extractedData.category}</span>
                  </>
                )}
                {extractedData.province && (
                  <>
                    <span>·</span>
                    <span>{extractedData.province}</span>
                  </>
                )}
              </div>
            </div>

            {/* Split: Requirements Checklist (Left) & Allocation Evaluation Split (Right) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

              {/* Left: Requirements Checklist */}
              <div className={`border rounded-lg p-5 space-y-4 ${isDarkMode ? 'bg-slate-950/70 border-slate-800' : 'bg-slate-50/70 border-slate-200'
                }`}>
                <div className="flex items-center justify-between">
                  <h4 className={`font-semibold text-sm flex items-center gap-2 ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                    <Layers className="w-4 h-4 text-emerald-600" />
                    <span>Returnables Found in This Tender</span>
                  </h4>
                  <span className="text-[11px] text-slate-400">From the tender text - its own returnables list governs</span>
                </div>

                <div className="space-y-2.5">
                  {/* CSD */}
                  <div className={`flex items-center justify-between p-2.5 rounded border text-xs ${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
                    }`}>
                    <div>
                      <div className={`font-medium ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>CSD Registration</div>
                      <div className={`text-[10px] ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Central Supplier Database (MAAA Number)</div>
                    </div>
                    {listed?.csd ? (
<span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-800">
                      Listed by tender
                    </span>
                    ) : (
<span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold bg-slate-100 text-slate-500 border border-slate-200 dark:bg-slate-850 dark:text-slate-400 dark:border-slate-800">
                      Not listed - check returnables
                    </span>
                    )}
                  </div>

                  {/* SARS */}
                  <div className={`flex items-center justify-between p-2.5 rounded border text-xs ${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
                    }`}>
                    <div>
                      <div className={`font-medium ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>SARS TCS PIN</div>
                      <div className={`text-[10px] ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Tax Compliance Status System PIN</div>
                    </div>
                    {listed?.sars ? (
<span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-800">
                      Listed by tender
                    </span>
                    ) : (
<span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold bg-slate-100 text-slate-500 border border-slate-200 dark:bg-slate-850 dark:text-slate-400 dark:border-slate-800">
                      Not listed - check returnables
                    </span>
                    )}
                  </div>

                  {/* B-BBEE */}
                  <div className={`flex items-center justify-between p-2.5 rounded border text-xs ${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
                    }`}>
                    <div>
                      <div className={`font-medium ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>B-BBEE Certificate / Affidavit</div>
                      <div className={`text-[10px] ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Level 1-8 verification or EME affidavit</div>
                    </div>
                    {listed?.bbbee ? (
<span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-800">
                      Listed by tender
                    </span>
                    ) : (
<span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold bg-slate-100 text-slate-500 border border-slate-200 dark:bg-slate-850 dark:text-slate-400 dark:border-slate-800">
                      Not listed - check returnables
                    </span>
                    )}
                  </div>

                  {/* CIDB */}
                  <div className={`flex items-center justify-between p-2.5 rounded border text-xs ${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
                    }`}>
                    <div>
                      <div className={`font-medium ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>CIDB Grading</div>
                      <div className={`text-[10px] ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Construction Industry Development Board</div>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold ${listed?.cidb
                        ? 'bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800'
                        : 'bg-slate-100 text-slate-500 border border-slate-200 dark:bg-slate-850 dark:text-slate-400 dark:border-slate-800'
                      }`}>
                      {listed?.cidb || 'Not listed - check returnables'}
                    </span>
                  </div>

                  {/* COIDA */}
                  <div className={`flex items-center justify-between p-2.5 rounded border text-xs ${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
                    }`}>
                    <div>
                      <div className={`font-medium ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>COIDA Letter of Good Standing</div>
                      <div className={`text-[10px] ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Compensation Commissioner certification</div>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold ${listed?.coida
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-800'
                        : 'bg-slate-100 text-slate-500 border border-slate-200 dark:bg-slate-850 dark:text-slate-400 dark:border-slate-800'
                      }`}>
                      {listed?.coida ? 'Listed by tender' : 'Not listed - check returnables'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Right: Allocation Evaluation Point Splits & SME Compliance Status */}
              <div className="space-y-4">

                {/* Evaluation Frame Split Card */}
                <div className={`border rounded-lg p-5 ${isDarkMode ? 'bg-slate-950/70 border-slate-800' : 'bg-slate-50/70 border-slate-200'
                  }`}>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className={`font-semibold text-sm ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Evaluation Frame Split</h4>
                    <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded dark:text-amber-400 dark:bg-amber-950 dark:border-amber-800">
                      PPPFA 2022
                    </span>
                  </div>

                  <div className={`text-3xl font-bold mb-2 font-mono ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                    {(() => {
                      const sys = extractedData.evaluationCriteria?.preferencePointsSystem || extractedData.points;
                      return sys === '80/20' || sys === '90/10' || sys === '80/20 System' || sys === '90/10 System' ? sys : 'Not stated';
                    })()}
                  </div>

                  <p className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-600'} leading-relaxed mb-4`}>
                    80/20 applies to values up to R50 million and 90/10 above it under the Preferential Procurement Regulations 2022; the tender's stated system and formula govern.
                    {(() => {
                      const sys = String(extractedData.evaluationCriteria?.preferencePointsSystem || extractedData.points || '');
                      if (sys.includes('90')) return ' This text indicates 90/10 (90 Price / 10 Specific Goals), used for values above R50 million.';
                      if (sys.includes('80')) return ' This text indicates 80/20 (80 Price / 20 Specific Goals), used for values up to R50 million.';
                      return ' The tender text did not state the preference-point system - confirm 80/20 or 90/10 in the tender document.';
                    })()}
                  </p>

                  <div className="flex items-center gap-2 p-2.5 rounded bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-300">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Confirm the preference-point system and specific goals stated in this tender document.</span>
                  </div>
                </div>

                {/* SME Readiness / Profile Match Card */}
                <div className={`border rounded-lg p-5 ${isDarkMode ? 'bg-slate-950/70 border-slate-800' : 'bg-slate-50/70 border-slate-200'
                  }`}>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className={`font-semibold text-xs uppercase tracking-wider ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                      Bidder Profile Readiness Check
                    </h4>
                    <span className="text-[11px] text-slate-500">{userProfile.companyName}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px] mb-3">
                    <div className={`flex items-center gap-1.5 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                      {!listed?.csd ? <MinusCircle className="w-3.5 h-3.5 text-slate-400" /> : isCsdOk ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> : <AlertCircle className="w-3.5 h-3.5 text-rose-500" />}
                      <span>CSD: {!listed?.csd ? 'Not listed by this tender' : userProfile.csdNumber || 'Missing for a listed requirement'}</span>
                    </div>

                    <div className={`flex items-center gap-1.5 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                      {!listed?.sars ? <MinusCircle className="w-3.5 h-3.5 text-slate-400" /> : isSarsOk ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> : <AlertCircle className="w-3.5 h-3.5 text-rose-500" />}
                      <span>SARS PIN: {!listed?.sars ? 'Not listed by this tender' : userProfile.taxComplianceStatusPin ? 'On file' : 'Missing for a listed requirement'}</span>
                    </div>

                    <div className={`flex items-center gap-1.5 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                      {!listed?.bbbee ? <MinusCircle className="w-3.5 h-3.5 text-slate-400" /> : isBbbeeOk ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> : <AlertCircle className="w-3.5 h-3.5 text-amber-500" />}
                      <span>B-BBEE: {!listed?.bbbee ? 'Not listed by this tender' : `Level ${userProfile.bbbeeLevel} (${userProfile.bbbeeType})`}</span>
                    </div>

                    <div className={`flex items-center gap-1.5 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                      {!listed?.cidb ? <MinusCircle className="w-3.5 h-3.5 text-slate-400" /> : isCidbOk ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> : <AlertCircle className="w-3.5 h-3.5 text-amber-500" />}
                      <span>CIDB: {!listed?.cidb ? 'Not listed by this tender' : userProfile.cidbGrading || 'Missing for a listed requirement'}</span>
                    </div>
                  </div>

                  <div className={`p-2 rounded border text-[11px] flex items-center justify-between ${isDarkMode ? 'bg-slate-900 border-slate-800 text-slate-400' : 'bg-white border-slate-200 text-slate-600'
                    }`}>
                    <span>Profile fields on file:</span>
                    <span className="font-semibold text-emerald-600">
                      {listed && ((listed.csd && !isCsdOk) || (listed.sars && !isSarsOk) || (listed.cidb && !isCidbOk))
                        ? <span className="text-rose-500">A listed requirement is missing from your profile</span>
                        : 'Nothing listed is missing - confirm the tender\u2019s returnables list'}
                    </span>
                  </div>
                </div>

              </div>

            </div>

            {/* Bottom Actions Row */}
            <div className={`pt-4 border-t flex flex-col sm:flex-row items-center justify-between gap-3 ${isDarkMode ? 'border-slate-800' : 'border-slate-200'
              }`}>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>This result is response-only. Save a bid draft separately to keep your work.</span>
              </div>

              <div className="flex items-center gap-3 w-full sm:w-auto">
                <button
                  onClick={() => onSwitchToCalculator(
                    extractedData.evaluationCriteria?.preferencePointsSystem === '90/10' ? '90/10' : '80/20',
                    extractedData.title
                  )}
                  className={`px-4 py-2 text-xs font-medium rounded-lg border transition-colors flex-1 sm:flex-none text-center ${isDarkMode
                      ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                      : 'bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200'
                    }`}
                >
                  {(() => {
                    const sys = extractedData.evaluationCriteria?.preferencePointsSystem;
                    return sys === '80/20' || sys === '90/10' ? `Test Price Math (${sys})` : 'Test Price Math';
                  })()}
                </button>

                <button
                  onClick={() => onOpenSkeleton(activeSkeleton || SAMPLE_TENDERS[0] as any)}
                  className="px-4 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow-sm shadow-emerald-900/30 flex-1 sm:flex-none"
                >
                  <FileCode className="w-3.5 h-3.5" />
                  <span>Download Draft Bid Response Skeleton (.doc)</span>
                </button>
              </div>
            </div>

          </div>
        )}
      </div>

    </div>
  );
};
