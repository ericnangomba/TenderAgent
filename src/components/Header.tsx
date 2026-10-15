import React from 'react';
import { Menu, ShieldCheck, Sun, Moon, FileCode, CheckCircle2 } from 'lucide-react';
import { TabKey } from './Sidebar';

interface HeaderProps {
  activeTab: TabKey;
  onOpenMobileSidebar: () => void;
  isDarkMode: boolean;
  onToggleTheme: () => void;
  onOpenSkeletonModal: () => void;
  hasAnalyzedTender: boolean;
  companyName: string;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  onOpenMobileSidebar,
  isDarkMode,
  onToggleTheme,
  onOpenSkeletonModal,
  hasAnalyzedTender,
  companyName
}) => {
  const [detectorReport, setDetectorReport] = React.useState<any>(null);
  const [isDetecting, setIsDetecting] = React.useState<boolean>(false);
  const [isModelModalOpen, setIsModelModalOpen] = React.useState<boolean>(false);

  const scanLocalModels = async () => {
    setIsDetecting(true);
    try {
      const res = await fetch('/api/models/detect');
      const data = await res.json();
      if (data.success && data.report) {
        setDetectorReport(data.report);
      }
    } catch (e) {
      console.warn('Local model scan failed:', e);
    } finally {
      setIsDetecting(false);
    }
  };

  React.useEffect(() => {
    scanLocalModels();
  }, []);

  const getTabLabel = (key: TabKey) => {
    switch (key) {
      case 'analyzer': return 'RFP Ingestion & Compliance Analyzer';
      case 'discovery': return 'South African eTender Discovery Feed';
      case 'finetuning': return 'LLM Dataset & LoRA Fine-Tuning Studio';
      case 'calculator': return '80/20 & 90/10 Preference Points Calculator';
      case 'vault': return 'POPIA SME Credential Vault';
      case 'sbd': return 'SBD Returnables & Tender Documents Guide';
      case 'tracing': return 'Sentry Agent Tracing & Architecture Telemetry';
      case 'settings': return 'Platform & Model Settings';
      default: return 'TenderAgent Platform';
    }
  };

  return (
    <header className={`h-16 px-4 sm:px-6 lg:px-8 border-b flex items-center justify-between sticky top-0 z-30 transition-colors backdrop-blur ${
      isDarkMode 
        ? 'bg-slate-950/80 border-slate-800/80 text-slate-100' 
        : 'bg-white/80 border-slate-200/80 text-slate-800'
    }`}>
      {/* Left: Mobile Menu Trigger + Breadcrumb */}
      <div className="flex items-center gap-3">
        <button
          onClick={onOpenMobileSidebar}
          aria-label="Open navigation sidebar"
          className={`p-2 rounded-lg border lg:hidden transition-colors ${
            isDarkMode 
              ? 'bg-slate-900 border-slate-800 text-slate-300 hover:text-white' 
              : 'bg-slate-50 border-slate-200 text-slate-600 hover:text-slate-900'
          }`}
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2">
          <div className="lg:hidden p-0.5 rounded bg-white/95 dark:bg-white shadow-2xs">
            <img 
              src="/tenderagentlogo.png" 
              alt="TenderAgent Logo" 
              className="h-6 w-auto object-contain max-w-[110px]" 
            />
          </div>
          <div className="hidden sm:flex items-center gap-2">
            <span className={`text-xs font-medium ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              TenderAgent
            </span>
            <span className={`text-xs ${isDarkMode ? 'text-slate-600' : 'text-slate-300'}`}>/</span>
          </div>
          <h1 className={`text-sm font-semibold tracking-tight ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
            {getTabLabel(activeTab)}
          </h1>
        </div>
      </div>

      {/* Right: Clean, unclouded status & action controls */}
      <div className="flex items-center gap-2.5">
        
        {/* Local Model & Automatic Failover Indicator Pill */}
        <div className="relative">
          <button
            onClick={() => setIsModelModalOpen(!isModelModalOpen)}
            className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border transition-all ${
              detectorReport?.hasGemma || detectorReport?.hasLlama31
                ? 'bg-emerald-50 border-emerald-300 text-emerald-800 dark:bg-emerald-950/60 dark:border-emerald-700 dark:text-emerald-300'
                : 'bg-amber-50 border-amber-300 text-amber-800 dark:bg-amber-950/60 dark:border-amber-700 dark:text-amber-300'
            }`}
            title="Click to view Local Model Detector & Auto-Failover Policy"
          >
            <span className={`w-2 h-2 rounded-full ${
              detectorReport?.hasGemma || detectorReport?.hasLlama31 ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
            }`} />
            <span className="font-semibold text-[11px]">
              {detectorReport?.hasGemma ? 'Local: Gemma 2 Online' : detectorReport?.hasLlama31 ? 'Local: Llama 3.1 8B' : 'Cloud Failover Active'}
            </span>
            <span className="text-[9px] px-1 py-0.2 rounded bg-black/10 dark:bg-white/10 font-mono">
              🛡️ Failover
            </span>
          </button>

          {/* Model Status Popover Dropdown */}
          {isModelModalOpen && (
            <div className={`absolute right-0 mt-2 w-80 rounded-xl shadow-xl border p-4 z-50 text-xs ${
              isDarkMode ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-white border-slate-200 text-slate-800'
            }`}>
              <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-200 dark:border-slate-800">
                <div className="font-bold text-sm flex items-center gap-1.5">
                  <span>🤖</span> Local Model Orchestrator
                </div>
                <button
                  onClick={scanLocalModels}
                  disabled={isDetecting}
                  className="px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-semibold flex items-center gap-1"
                >
                  <span>{isDetecting ? 'Scanning...' : 'Re-scan'}</span>
                </button>
              </div>

              <div className="space-y-2 mb-3">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Local Server (localhost:11434):</span>
                  <span className={`font-mono font-bold ${detectorReport?.isLocalServerRunning ? 'text-emerald-500' : 'text-slate-400'}`}>
                    {detectorReport?.isLocalServerRunning ? `Online (${detectorReport?.activeRunner?.toUpperCase()})` : 'Offline'}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Detected Models:</span>
                  <span className="font-bold text-emerald-600">
                    {detectorReport?.detectedModels?.length > 0 
                      ? detectorReport.detectedModels.map((m: any) => m.name).join(', ') 
                      : 'None'}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Cloud Failover Target:</span>
                  <span className="font-bold text-slate-600 dark:text-slate-300">Gemini 2.5 Flash</span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Statutory Fallback:</span>
                  <span className="font-bold text-slate-600 dark:text-slate-300">PPPFA 2022 Engine (Offline)</span>
                </div>
              </div>

              <div className="p-2 rounded bg-slate-100 dark:bg-slate-950 text-[10px] leading-relaxed text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800">
                {detectorReport?.message || 'Local models run tasks without cloud dependency. If local models are busy or cloud is overloaded, tasks fail over automatically.'}
              </div>

              <button
                onClick={() => setIsModelModalOpen(false)}
                className="mt-3 w-full py-1 text-center bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 rounded text-[11px] font-medium"
              >
                Close
              </button>
            </div>
          )}
        </div>

        {/* Subtle POPIA Indicator */}
        <div className={`hidden md:flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border ${
          isDarkMode ? 'bg-slate-900 border-slate-800 text-slate-300' : 'bg-slate-50 border-slate-200 text-slate-600'
        }`}>
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
          <span>POPIA Sandboxed</span>
        </div>

        {/* Quick Bid Skeleton Download Button */}
        {hasAnalyzedTender && (
          <button
            onClick={onOpenSkeletonModal}
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors shadow-2xs"
          >
            <FileCode className="w-3.5 h-3.5" />
            <span>Bid Skeleton (.doc)</span>
          </button>
        )}

        {/* Theme Toggle Button */}
        <button
          onClick={onToggleTheme}
          aria-label={isDarkMode ? 'Switch to light theme' : 'Switch to dark theme'}
          className={`p-2 rounded-lg border transition-colors ${
            isDarkMode 
              ? 'bg-slate-900 border-slate-800 text-slate-300 hover:text-white' 
              : 'bg-slate-50 border-slate-200 text-slate-600 hover:text-slate-900'
          }`}
          title={isDarkMode ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
        >
          {isDarkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-600" />}
        </button>

        {/* User SME Badge */}
        <div className={`hidden sm:flex items-center gap-2 pl-2 border-l ${
          isDarkMode ? 'border-slate-800' : 'border-slate-200'
        }`}>
          <div className="text-right">
            <div className={`text-xs font-semibold truncate max-w-[120px] ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>
              {companyName}
            </div>
            <div className="text-[10px] text-emerald-600 font-medium">
              Tax Compliant
            </div>
          </div>
          <div className="h-8 w-8 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800 flex items-center justify-center font-bold text-xs">
            AZ
          </div>
        </div>
      </div>
    </header>
  );
};
