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
  const getTabLabel = (key: TabKey) => {
    switch (key) {
      case 'analyzer': return 'RFP Ingestion & Compliance Analyzer';
      case 'discovery': return 'South African eTender Discovery Feed';
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

        <div>
          <div className="flex items-center gap-2">
            <span className={`text-xs font-medium ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              TenderAgent
            </span>
            <span className={`text-xs ${isDarkMode ? 'text-slate-600' : 'text-slate-300'}`}>/</span>
            <h1 className={`text-sm font-semibold tracking-tight ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
              {getTabLabel(activeTab)}
            </h1>
          </div>
        </div>
      </div>

      {/* Right: Clean, unclouded status & action controls */}
      <div className="flex items-center gap-3">
        {/* Subtle POPIA Indicator */}
        <div className={`hidden md:flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border ${
          isDarkMode ? 'bg-slate-900 border-slate-800 text-slate-300' : 'bg-slate-50 border-slate-200 text-slate-600'
        }`}>
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
          <span>POPIA Sandboxed</span>
          <span className={isDarkMode ? 'text-slate-600' : 'text-slate-300'}>·</span>
          <span className="font-mono text-[11px] text-emerald-600">Act 4 of 2013</span>
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
