import React from 'react';
import { 
  FileSearch, Sparkles, Scale, Building2, Terminal, Settings as SettingsIcon, 
  BookOpen, ShieldCheck, Moon, Sun, ChevronRight, X, Cpu, CheckCircle2
} from 'lucide-react';
import { IUserProfile } from '../lib/types/tender';

export type TabKey = 'analyzer' | 'discovery' | 'finetuning' | 'calculator' | 'vault' | 'sbd' | 'tracing' | 'settings';

interface SidebarProps {
  activeTab: TabKey;
  setActiveTab: (tab: TabKey) => void;
  isOpen: boolean;
  onCloseMobile: () => void;
  isDarkMode: boolean;
  onToggleTheme: () => void;
  userProfile: IUserProfile;
  isProcessing?: boolean;
}

interface NavItem {
  key: TabKey;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  count?: string;
  status?: string;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  isOpen,
  onCloseMobile,
  isDarkMode,
  onToggleTheme,
  userProfile,
  isProcessing
}) => {
  const navSections: NavSection[] = [
    {
      title: 'RFP WORKFLOW',
      items: [
        {
          key: 'analyzer' as TabKey,
          label: 'RFP Analyzer',
          description: 'Document ingestion & compliance',
          icon: FileSearch,
          badge: isProcessing ? 'Running' : undefined
        },
        {
          key: 'discovery' as TabKey,
          label: 'eTender Feed',
          description: 'Live etenders.gov.za & WCG',
          icon: Sparkles,
          count: '10 WC'
        },
        {
          key: 'finetuning' as TabKey,
          label: 'LLM Fine-Tuning',
          description: 'Llama 3.1 & Gemma 2 Studio',
          icon: Cpu,
          badge: 'LoRA'
        },
        {
          key: 'calculator' as TabKey,
          label: '80/20 & 90/10 Math',
          description: 'PPPFA preference formula',
          icon: Scale
        }
      ]
    },
    {
      title: 'COMPLIANCE & TOOLS',
      items: [
        {
          key: 'vault' as TabKey,
          label: 'SME Profile Vault',
          description: 'CSD, SARS, B-BBEE, CIDB',
          icon: Building2,
          status: userProfile.csdNumber ? 'MAAA' : 'Incomplete'
        },
        {
          key: 'sbd' as TabKey,
          label: 'SBD Returnables Guide',
          description: 'SBD 1, 4, 6.1 templates',
          icon: BookOpen
        },
        {
          key: 'tracing' as TabKey,
          label: 'Sentry Agent Traces',
          description: 'Live transaction spans',
          icon: Terminal
        }
      ]
    },
    {
      title: 'PREFERENCES',
      items: [
        {
          key: 'settings' as TabKey,
          label: 'Platform Settings',
          description: 'AI engine, POPIA, VAT rate',
          icon: SettingsIcon
        }
      ]
    }
  ];

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div 
          onClick={onCloseMobile}
          className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm lg:hidden"
        />
      )}

      {/* Sidebar Container */}
      <aside className={`fixed top-0 bottom-0 left-0 z-50 w-80 flex flex-col transition-transform duration-200 ease-in-out lg:static lg:translate-x-0 ${
        isOpen ? 'translate-x-0' : '-translate-x-full'
      } ${
        isDarkMode 
          ? 'bg-slate-950 border-r border-slate-800 text-slate-100' 
          : 'bg-white border-r border-slate-200 text-slate-800 shadow-sm'
      }`}>
        
        {/* Top Brand Header */}
        <div className={`relative min-h-[136px] p-4 flex items-center justify-center border-b ${
          isDarkMode ? 'border-slate-800/80 bg-slate-950' : 'border-slate-200/80 bg-white'
        }`}>
          <div className="flex items-center justify-center w-full">
            <div className={`p-2.5 rounded-2xl ${isDarkMode ? 'bg-white/95 shadow-md' : 'bg-transparent'} flex items-center justify-center w-full`}>
              <img 
                src="/tenderagentlogo.png" 
                alt="TenderAgent Logo" 
                className="h-28 sm:h-32 w-auto object-contain max-w-[270px] transition-transform hover:scale-105 duration-200" 
              />
            </div>
          </div>

          <button
            onClick={onCloseMobile}
            className={`p-1.5 rounded-md lg:hidden absolute top-3 right-3 ${
              isDarkMode ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Sections */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
          {navSections.map((sec, sIdx) => (
            <div key={sIdx} className="space-y-1">
              <div className={`px-3 text-[10px] font-semibold uppercase tracking-wider ${
                isDarkMode ? 'text-slate-500' : 'text-slate-400'
              } mb-2`}>
                {sec.title}
              </div>

              {sec.items.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.key;

                return (
                  <button
                    key={item.key}
                    onClick={() => {
                      setActiveTab(item.key);
                      onCloseMobile();
                    }}
                    className={`w-full text-left px-3 py-2.5 rounded-lg flex items-center justify-between transition-all text-xs font-medium ${
                      isActive
                        ? isDarkMode
                          ? 'bg-slate-800 text-emerald-400 shadow-sm border border-slate-700/80'
                          : 'bg-emerald-50 text-emerald-800 shadow-sm border border-emerald-200'
                        : isDarkMode
                          ? 'text-slate-300 hover:bg-slate-900 hover:text-white'
                          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Icon className={`w-4 h-4 shrink-0 ${
                        isActive 
                          ? isDarkMode ? 'text-emerald-400' : 'text-emerald-700' 
                          : isDarkMode ? 'text-slate-400' : 'text-slate-500'
                      }`} />
                      <div>
                        <div className="leading-snug">{item.label}</div>
                        <div className={`text-[10px] ${
                          isActive
                            ? isDarkMode ? 'text-slate-400' : 'text-emerald-600'
                            : isDarkMode ? 'text-slate-500' : 'text-slate-400'
                        }`}>
                          {item.description}
                        </div>
                      </div>
                    </div>

                    {item.badge && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-mono animate-pulse">
                        {item.badge}
                      </span>
                    )}
                    {item.count && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                        isDarkMode ? 'bg-slate-900 text-slate-400' : 'bg-slate-200 text-slate-700'
                      }`}>
                        {item.count}
                      </span>
                    )}
                    {item.status && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-mono font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-400">
                        {item.status}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Bottom Section: Profile + Theme Toggle */}
        <div className={`p-4 border-t ${
          isDarkMode ? 'border-slate-800/80 bg-slate-950/60' : 'border-slate-200/80 bg-slate-50/70'
        } space-y-3`}>
          
          {/* Active Profile Info */}
          <div className={`p-2.5 rounded-lg border text-xs ${
            isDarkMode ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200'
          }`}>
            <div className="flex items-center justify-between mb-1">
              <span className={`font-semibold truncate max-w-[140px] ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                {userProfile.companyName}
              </span>
              <span className="text-[9px] font-mono text-emerald-600 font-bold">
                Lvl {userProfile.bbbeeLevel}
              </span>
            </div>
            <div className={`text-[10px] ${isDarkMode ? 'text-slate-400' : 'text-slate-500'} flex items-center justify-between`}>
              <span>CSD: {userProfile.csdNumber || 'Unset'}</span>
              <span className="text-emerald-600 font-semibold">100% POPIA Safe</span>
            </div>
          </div>

          {/* Theme Switcher Button */}
          <div className="flex items-center justify-between pt-1">
            <button
              onClick={onToggleTheme}
              className={`w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-medium border transition-colors ${
                isDarkMode
                  ? 'bg-slate-900 hover:bg-slate-800 border-slate-800 text-slate-300'
                  : 'bg-white hover:bg-slate-100 border-slate-200 text-slate-700 shadow-2xs'
              }`}
            >
              {isDarkMode ? (
                <>
                  <Sun className="w-3.5 h-3.5 text-amber-400" />
                  <span>Light Theme</span>
                </>
              ) : (
                <>
                  <Moon className="w-3.5 h-3.5 text-slate-600" />
                  <span>Dark Theme</span>
                </>
              )}
            </button>
          </div>

        </div>

      </aside>
    </>
  );
};
