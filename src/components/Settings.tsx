import React from 'react';
import { Settings as SettingsIcon, Shield, Database } from 'lucide-react';
import { DOCUMENT_REDACTION_NOTICE } from '../lib/utils/privacyCopy';

interface SettingsProps { isDarkMode: boolean; }

/** Status information only. Former preview controls did not change server behavior. */
export const Settings: React.FC<SettingsProps> = ({ isDarkMode }) => {
  const card = `border rounded-xl p-6 space-y-3 ${isDarkMode ? 'bg-slate-900 border-slate-800 text-slate-200' : 'bg-white border-slate-200 text-slate-700 shadow-sm'}`;
  return (
    <div className="space-y-6">
      <section className={card}>
        <h2 className="text-lg font-bold flex items-center gap-2"><SettingsIcon className="w-5 h-5" />Platform settings</h2>
        <p className="text-sm">Server settings are managed in the deployment configuration. This page does not change the AI engine, pricing rules, tracing, retention or redaction.</p>
      </section>
      <section className={card}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Shield className="w-4 h-4" />Document-text redaction</h3>
        <p className="text-sm leading-relaxed">{DOCUMENT_REDACTION_NOTICE}</p>
        <p className="text-sm">Supported patterns are always processed by the analysis pipeline. There is no redaction toggle here.</p>
      </section>
      <section className={card}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Database className="w-4 h-4" />Retention and deletion</h3>
        <p className="text-sm leading-relaxed">Analyses remain in server memory while the service runs and disappear on restart, not on tab close or logout. Saved profiles and bid drafts, including evidence notes, have no automatic expiry.</p>
        <p className="text-sm">Delete your saved profile from Account and individual drafts from Bid Readiness. Those actions do not delete your account, sessions, usage or billing records. This page does not clear server data or configure backup retention.</p>
      </section>
    </div>
  );
};
