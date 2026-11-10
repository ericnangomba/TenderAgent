import React, { useEffect, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';

/**
 * A new service worker has taken control of this already-open page, so the
 * running JS is one version behind. Reloading applies the update but drops
 * any unsaved work (tender text, uploads, drafts) - so the choice stays with
 * the user. Never reloads on its own.
 */
export const SwUpdatePrompt: React.FC<{ isDarkMode?: boolean }> = ({ isDarkMode = false }) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onUpdate = () => setVisible(true);
    window.addEventListener('tenderagent:sw-update', onUpdate);
    return () => window.removeEventListener('tenderagent:sw-update', onUpdate);
  }, []);

  if (!visible) return null;

  return (
    <div
      role="status"
      className={`fixed top-3 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 pl-4 pr-2 py-2 rounded-full border shadow-lg text-xs font-medium animate-in slide-in-from-top duration-300 ${
        isDarkMode
          ? 'bg-slate-900/95 border-emerald-500/40 text-slate-100'
          : 'bg-white/95 border-emerald-300 text-slate-800'
      }`}
    >
      <span>A new version is ready.</span>
      <button
        onClick={() => window.location.reload()}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-700 hover:bg-emerald-800 text-white font-semibold"
      >
        <RefreshCw className="w-3.5 h-3.5" /> Refresh
      </button>
      <button
        onClick={() => setVisible(false)}
        aria-label="Update later"
        title="Later"
        className="p-1.5 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};
