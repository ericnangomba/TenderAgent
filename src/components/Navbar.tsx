import React from 'react';
import { ShieldCheck, Activity, Cpu, Sparkles, FileSearch, Scale, Building2, Terminal } from 'lucide-react';

interface NavbarProps {
  activeTab: 'analyzer' | 'discovery' | 'calculator' | 'vault' | 'tracing';
  setActiveTab: (tab: 'analyzer' | 'discovery' | 'calculator' | 'vault' | 'tracing') => void;
  isProcessing?: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({ activeTab, setActiveTab, isProcessing }) => {
  return (
    <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Identity */}
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-emerald-950 border border-emerald-700/60 flex items-center justify-center font-bold text-lg text-emerald-400 shadow-sm shadow-emerald-900/30">
              <span className="text-base select-none">🇿🇦</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold tracking-tight text-white">TenderAgent</span>
                <span className="text-[10px] tracking-wider uppercase font-semibold text-emerald-400 border border-emerald-800/80 bg-emerald-950/50 px-1.5 py-0.5 rounded">
                  Micro-SaaS
                </span>
              </div>
              <p className="text-xs text-slate-400">South African RFP Compliance & Response Synthesizer</p>
            </div>
          </div>

          {/* Navigation Controls */}
          <nav className="hidden md:flex items-center gap-1 p-1 bg-slate-900/90 border border-slate-800 rounded-lg text-xs font-medium">
            <button
              onClick={() => setActiveTab('analyzer')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors ${
                activeTab === 'analyzer'
                  ? 'bg-slate-800 text-emerald-400 shadow-sm border border-slate-700/60'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <FileSearch className="w-3.5 h-3.5" />
              <span>RFP Analyzer</span>
              {isProcessing && (
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              )}
            </button>

            <button
              onClick={() => setActiveTab('discovery')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors ${
                activeTab === 'discovery'
                  ? 'bg-slate-800 text-emerald-400 shadow-sm border border-slate-700/60'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>eTender Feed</span>
            </button>

            <button
              onClick={() => setActiveTab('calculator')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors ${
                activeTab === 'calculator'
                  ? 'bg-slate-800 text-emerald-400 shadow-sm border border-slate-700/60'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Scale className="w-3.5 h-3.5" />
              <span>80/20 & 90/10 Math</span>
            </button>

            <button
              onClick={() => setActiveTab('vault')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors ${
                activeTab === 'vault'
                  ? 'bg-slate-800 text-emerald-400 shadow-sm border border-slate-700/60'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>SME Profile Vault</span>
            </button>

            <button
              onClick={() => setActiveTab('tracing')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors ${
                activeTab === 'tracing'
                  ? 'bg-slate-800 text-emerald-400 shadow-sm border border-slate-700/60'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Terminal className="w-3.5 h-3.5" />
              <span>Sentry Traces</span>
            </button>
          </nav>

          {/* Compliance & Engine Status */}
          <div className="flex items-center gap-2">
            <div className="hidden lg:flex items-center gap-1.5 text-xs text-slate-300 bg-slate-900 border border-slate-800 px-2.5 py-1 rounded-md">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>POPIA Sandboxed</span>
              <span className="text-slate-500">·</span>
              <span className="text-slate-400">Act 4 of 2013</span>
            </div>

            <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-300 bg-slate-900 border border-slate-800 px-2.5 py-1 rounded-md">
              <Cpu className="w-3.5 h-3.5 text-amber-400" />
              <span>Mastra Gemma 2</span>
            </div>

            <div className="flex items-center gap-1.5 text-xs text-slate-300 bg-slate-900 border border-slate-800 px-2.5 py-1 rounded-md">
              <Activity className="w-3.5 h-3.5 text-purple-400" />
              <span className="hidden sm:inline">Sentry Traced</span>
            </div>
          </div>
        </div>

        {/* Mobile Nav Tabs */}
        <div className="flex md:hidden overflow-x-auto py-2 gap-1 border-t border-slate-800/80 text-xs">
          <button
            onClick={() => setActiveTab('analyzer')}
            className={`px-2.5 py-1 rounded whitespace-nowrap ${activeTab === 'analyzer' ? 'bg-slate-800 text-emerald-400' : 'text-slate-400'}`}
          >
            RFP Analyzer
          </button>
          <button
            onClick={() => setActiveTab('discovery')}
            className={`px-2.5 py-1 rounded whitespace-nowrap ${activeTab === 'discovery' ? 'bg-slate-800 text-emerald-400' : 'text-slate-400'}`}
          >
            eTender Feed
          </button>
          <button
            onClick={() => setActiveTab('calculator')}
            className={`px-2.5 py-1 rounded whitespace-nowrap ${activeTab === 'calculator' ? 'bg-slate-800 text-emerald-400' : 'text-slate-400'}`}
          >
            80/20 Math
          </button>
          <button
            onClick={() => setActiveTab('vault')}
            className={`px-2.5 py-1 rounded whitespace-nowrap ${activeTab === 'vault' ? 'bg-slate-800 text-emerald-400' : 'text-slate-400'}`}
          >
            SME Vault
          </button>
          <button
            onClick={() => setActiveTab('tracing')}
            className={`px-2.5 py-1 rounded whitespace-nowrap ${activeTab === 'tracing' ? 'bg-slate-800 text-emerald-400' : 'text-slate-400'}`}
          >
            Sentry Traces
          </button>
        </div>
      </div>
    </header>
  );
};
