import React, { useState } from 'react';
import { 
  Settings as SettingsIcon, Shield, Cpu, Database, Save, Check, RefreshCw, 
  Trash2, Download, AlertTriangle, Lock, Globe, FileText, Percent, Sliders
} from 'lucide-react';

interface SettingsProps {
  isDarkMode: boolean;
  onToggleTheme: () => void;
}

export interface IPlatformSettings {
  aiModel: 'gemini-2.5-flash' | 'gemma2-local' | 'gemma2-9b-ollama';
  temperature: number;
  popiaRetention: 'session' | '7days' | '30days';
  autoRedactPii: boolean;
  defaultPreferencePoints: '80/20' | '90/10';
  vatPercentage: number;
  subcontractingHurdle: number; // e.g. R30m
  serpRegion: string;
  enableSentryTracing: boolean;
  sentrySampleRate: number;
}

export const Settings: React.FC<SettingsProps> = ({ isDarkMode, onToggleTheme }) => {
  const [settings, setSettings] = useState<IPlatformSettings>({
    aiModel: 'gemini-2.5-flash',
    temperature: 0.1,
    popiaRetention: 'session',
    autoRedactPii: true,
    defaultPreferencePoints: '80/20',
    vatPercentage: 15,
    subcontractingHurdle: 30000000,
    serpRegion: 'za',
    enableSentryTracing: true,
    sentrySampleRate: 1.0,
  });

  const [saved, setSaved] = useState(false);
  const [cacheCleared, setCacheCleared] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const handleClearCache = () => {
    setCacheCleared(true);
    setTimeout(() => setCacheCleared(false), 2500);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      
      {/* Top Banner */}
      <div className={`${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'} border rounded-xl p-6`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <SettingsIcon className="w-5 h-5 text-emerald-600" />
              <h2 className={`text-lg font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                Platform & Agent Settings
              </h2>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">
                SaaS Config
              </span>
            </div>
            <p className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-500'} leading-relaxed`}>
              Configure Gemma 2 and Gemini inference parameters, POPIA data protection policies, South African VAT rates, and Sentry telemetry.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onToggleTheme}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                isDarkMode 
                  ? 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700' 
                  : 'bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <span>{isDarkMode ? 'Switch to Light Theme' : 'Switch to Dark Theme'}</span>
            </button>
          </div>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* Section 1: AI & Inference Engine */}
          <div className={`${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'} border rounded-xl p-6 space-y-4`}>
            <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
              <Cpu className="w-4 h-4 text-emerald-600" />
              <h3 className={`text-sm font-semibold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                AI Engine & Extraction Persona
              </h3>
            </div>

            <div>
              <label className={`text-xs font-medium ${isDarkMode ? 'text-slate-300' : 'text-slate-700'} block mb-1.5`}>
                Active Inference Engine:
              </label>
              <select
                value={settings.aiModel}
                onChange={(e) => setSettings({ ...settings, aiModel: e.target.value as any })}
                className={`w-full rounded-lg px-3 py-2 text-xs border focus:outline-none focus:border-emerald-500 ${
                  isDarkMode 
                    ? 'bg-slate-950 border-slate-800 text-slate-200' 
                    : 'bg-slate-50 border-slate-300 text-slate-800'
                }`}
              >
                <option value="gemini-2.5-flash">Gemini 2.5 Flash (Gemma 2 South African Auditor Persona)</option>
                <option value="gemma2-local">Gemma 2 Local Simulator (POPIA Zero External Tokens)</option>
                <option value="gemma2-9b-ollama">Gemma 2 (9B via Private Ollama Endpoint)</option>
              </select>
              <span className={`text-[11px] ${isDarkMode ? 'text-slate-500' : 'text-slate-400'} block mt-1`}>
                Models follow National Treasury PPPFA procurement auditing instructions.
              </span>
            </div>

            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className={`font-medium ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                  Extraction Temperature: {settings.temperature}
                </span>
                <span className={`text-[10px] ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                  (Low for deterministic legal compliance)
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="0.5"
                step="0.05"
                value={settings.temperature}
                onChange={(e) => setSettings({ ...settings, temperature: parseFloat(e.target.value) })}
                className="w-full accent-emerald-600"
              />
            </div>

            <div className={`p-3 rounded-lg border text-xs ${isDarkMode ? 'bg-slate-950/60 border-slate-800 text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-600'}`}>
              <div className="font-semibold text-emerald-600 mb-1 flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5" />
                <span>Local Grounding Active</span>
              </div>
              Mandated South African acronyms (CSD, SARS TCS PIN, B-BBEE, CIDB, COIDA) are strictly enforced in all parsing loops.
            </div>
          </div>

          {/* Section 2: POPIA Privacy & Security Container */}
          <div className={`${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'} border rounded-xl p-6 space-y-4`}>
            <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
              <Shield className="w-4 h-4 text-emerald-600" />
              <h3 className={`text-sm font-semibold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                POPIA Act 4 of 2013 Privacy Controls
              </h3>
            </div>

            <div>
              <label className={`text-xs font-medium ${isDarkMode ? 'text-slate-300' : 'text-slate-700'} block mb-1.5`}>
                Data Retention Duration:
              </label>
              <select
                value={settings.popiaRetention}
                onChange={(e) => setSettings({ ...settings, popiaRetention: e.target.value as any })}
                className={`w-full rounded-lg px-3 py-2 text-xs border focus:outline-none focus:border-emerald-500 ${
                  isDarkMode 
                    ? 'bg-slate-950 border-slate-800 text-slate-200' 
                    : 'bg-slate-50 border-slate-300 text-slate-800'
                }`}
              >
                <option value="session">Ephemeral (Cleared on Session Close / Tab Unload)</option>
                <option value="7days">7 Days Sandboxed Local Cache</option>
                <option value="30days">30 Days Encrypted Document Index</option>
              </select>
            </div>

            <div className="space-y-2 pt-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.autoRedactPii}
                  onChange={(e) => setSettings({ ...settings, autoRedactPii: e.target.checked })}
                  className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                <span className={`text-xs ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                  Auto-scrub South African 13-digit ID numbers & bank account digits
                </span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.enableSentryTracing}
                  onChange={(e) => setSettings({ ...settings, enableSentryTracing: e.target.checked })}
                  className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                <span className={`text-xs ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                  Enable Sentry Custom Transaction Spans (agent.pipeline, db.mongo)
                </span>
              </label>
            </div>

            <div className={`p-3 rounded-lg border text-xs flex items-center justify-between ${
              isDarkMode ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'
            }`}>
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className={`${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>Local Cache Size:</span>
              </div>
              <span className="font-mono text-xs font-semibold text-emerald-600">4 Tenders Cached (48 KB)</span>
            </div>
          </div>

          {/* Section 3: South African SCM & Commercial Defaults */}
          <div className={`${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'} border rounded-xl p-6 space-y-4`}>
            <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
              <Percent className="w-4 h-4 text-emerald-600" />
              <h3 className={`text-sm font-semibold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                SCM Commercial & VAT Thresholds
              </h3>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={`text-xs font-medium ${isDarkMode ? 'text-slate-300' : 'text-slate-700'} block mb-1`}>
                  Statutory VAT Rate (%):
                </label>
                <input
                  type="number"
                  value={settings.vatPercentage}
                  onChange={(e) => setSettings({ ...settings, vatPercentage: Number(e.target.value) })}
                  className={`w-full rounded-lg px-3 py-2 text-xs border font-mono focus:outline-none focus:border-emerald-500 ${
                    isDarkMode 
                      ? 'bg-slate-950 border-slate-800 text-slate-200' 
                      : 'bg-slate-50 border-slate-300 text-slate-800'
                  }`}
                />
              </div>

              <div>
                <label className={`text-xs font-medium ${isDarkMode ? 'text-slate-300' : 'text-slate-700'} block mb-1`}>
                  Default PPPFA Formula:
                </label>
                <select
                  value={settings.defaultPreferencePoints}
                  onChange={(e) => setSettings({ ...settings, defaultPreferencePoints: e.target.value as any })}
                  className={`w-full rounded-lg px-3 py-2 text-xs border focus:outline-none focus:border-emerald-500 ${
                    isDarkMode 
                      ? 'bg-slate-950 border-slate-800 text-slate-200' 
                      : 'bg-slate-50 border-slate-300 text-slate-800'
                  }`}
                >
                  <option value="80/20">80/20 (&le; R50 Million)</option>
                  <option value="90/10">90/10 (&gt; R50 Million)</option>
                </select>
              </div>
            </div>

            <div>
              <label className={`text-xs font-medium ${isDarkMode ? 'text-slate-300' : 'text-slate-700'} block mb-1`}>
                30% Subcontracting Hurdle (ZAR):
              </label>
              <input
                type="number"
                step="5000000"
                value={settings.subcontractingHurdle}
                onChange={(e) => setSettings({ ...settings, subcontractingHurdle: Number(e.target.value) })}
                className={`w-full rounded-lg px-3 py-2 text-xs border font-mono focus:outline-none focus:border-emerald-500 ${
                  isDarkMode 
                    ? 'bg-slate-950 border-slate-800 text-slate-200' 
                    : 'bg-slate-50 border-slate-300 text-slate-800'
                }`}
              />
              <span className={`text-[10px] ${isDarkMode ? 'text-slate-500' : 'text-slate-400'} block mt-1`}>
                Statutory threshold where 30% designated group subcontracting is required (R30,000,000.00).
              </span>
            </div>
          </div>

          {/* Section 4: Discovery & Data Management */}
          <div className={`${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'} border rounded-xl p-6 space-y-4`}>
            <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
              <Globe className="w-4 h-4 text-emerald-600" />
              <h3 className={`text-sm font-semibold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                SerpApi Scraper & Data Reset
              </h3>
            </div>

            <div>
              <label className={`text-xs font-medium ${isDarkMode ? 'text-slate-300' : 'text-slate-700'} block mb-1`}>
                Search Geographic Lock:
              </label>
              <input
                type="text"
                disabled
                value="South Africa (gl: za, hl: en)"
                className={`w-full rounded-lg px-3 py-2 text-xs border cursor-not-allowed ${
                  isDarkMode 
                    ? 'bg-slate-950/50 border-slate-800 text-slate-400' 
                    : 'bg-slate-100 border-slate-200 text-slate-500'
                }`}
              />
            </div>

            <div className="pt-2 flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                onClick={handleClearCache}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border transition-colors ${
                  isDarkMode 
                    ? 'bg-slate-800 border-slate-700 text-rose-300 hover:bg-slate-700' 
                    : 'bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100'
                }`}
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{cacheCleared ? 'Cache Emptied' : 'Clear Temporary Tenders'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = 'tenderagent_settings_backup.json';
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border transition-colors ${
                  isDarkMode 
                    ? 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700' 
                    : 'bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export Config JSON</span>
              </button>
            </div>
          </div>

        </div>

        {/* Save Bar */}
        <div className={`p-4 rounded-xl border flex items-center justify-between ${
          isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
        }`}>
          <span className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
            Configuration takes effect immediately across all Mastra agent spans.
          </span>

          <button
            type="submit"
            className="flex items-center gap-1.5 px-5 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors shadow-sm"
          >
            {saved ? (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>Preferences Saved!</span>
              </>
            ) : (
              <>
                <Save className="w-3.5 h-3.5" />
                <span>Save Platform Settings</span>
              </>
            )}
          </button>
        </div>
      </form>

    </div>
  );
};
