import React, { useEffect, useRef, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';

/**
 * A new service worker has taken control of this already-open page, so the
 * running JS is one version behind. Refreshing applies the update but drops
 * any unsaved work (tender text, uploads, drafts), so the choice stays with
 * the user - and when typing has happened since load, Refresh asks for an
 * explicit confirmation first. Never reloads on its own.
 */
export const SwUpdatePrompt: React.FC<{ isDarkMode?: boolean }> = ({ isDarkMode = false }) => {
  const [visible, setVisible] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const dirtyRef = useRef(false);
  const busyRef = useRef(false);

  useEffect(() => {
    const onUpdate = () => setVisible(true);
    window.addEventListener('tenderagent:sw-update', onUpdate);
    // Any user edit means a refresh could lose work. Capture phase so it
    // fires regardless of component-level handlers.
    const onInput = (e: Event) => {
      const t = e.target;
      if (t instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)) {
        dirtyRef.current = true;
      }
    };
    window.addEventListener('input', onInput, true);
    // Uploads/analyses in flight: refreshing would kill them.
    const onBusy = (e: Event) => { busyRef.current = Boolean((e as CustomEvent).detail); };
    window.addEventListener('tenderagent:busy', onBusy);
    return () => {
      window.removeEventListener('tenderagent:sw-update', onUpdate);
      window.removeEventListener('input', onInput, true);
      window.removeEventListener('tenderagent:busy', onBusy);
    };
  }, []);

  if (!visible) return null;

  const handleRefresh = () => {
    if ((dirtyRef.current || busyRef.current) && !confirming) {
      setConfirming(true);
      return;
    }
    window.location.reload();
  };

  return (
    <div
      role="status"
      className={`fixed left-3 right-3 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:w-[26rem] z-50 rounded-xl border shadow-lg animate-in slide-in-from-top duration-300 ${
        isDarkMode ? 'bg-slate-900/95 border-emerald-500/40 text-slate-100' : 'bg-white/95 border-emerald-300 text-slate-800'
      }`}
      style={{ top: 'calc(env(safe-area-inset-top, 0px) + 0.75rem)' }}
    >
      <div className="flex items-center gap-3 pl-4 pr-1.5 py-2.5">
        <span className="flex-1 text-sm font-medium leading-snug">
          {confirming
            ? (busyRef.current
                ? 'An upload or analysis is still running - refreshing will stop it and lose unsaved text. Refresh anyway?'
                : 'Refresh now? Text you have typed on this page will be lost.')
            : 'A new version of TenderAgent is ready.'}
        </span>
        <button
          onClick={handleRefresh}
          className="flex items-center justify-center gap-1.5 min-h-[44px] px-4 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-semibold shrink-0"
        >
          <RefreshCw className="w-4 h-4" /> {confirming ? 'Refresh anyway' : 'Refresh'}
        </button>
        <button
          onClick={() => { setVisible(false); setConfirming(false); }}
          aria-label="Later"
          title="Later"
          className="flex items-center justify-center w-11 h-11 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 shrink-0"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};
