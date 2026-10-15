import React, { useState, useEffect } from 'react';
import { Download, X, Share2, Smartphone, WifiOff, CheckCircle2 } from 'lucide-react';

interface PwaInstallPromptProps {
  isDarkMode?: boolean;
}

export const PwaInstallPrompt: React.FC<PwaInstallPromptProps> = ({ isDarkMode = false }) => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showPrompt, setShowPrompt] = useState<boolean>(false);
  const [isIos, setIsIos] = useState<boolean>(false);
  const [isStandalone, setIsStandalone] = useState<boolean>(false);
  const [isOffline, setIsOffline] = useState<boolean>(!navigator.onLine);

  useEffect(() => {
    // Check if app is already running in standalone PWA mode
    const isStandaloneMode = window.matchMedia('(display-mode: standalone)').matches || 
      (window.navigator as any).standalone === true;
    setIsStandalone(isStandaloneMode);

    // Detect iOS
    const ua = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(ua);
    setIsIos(isIosDevice);

    // Listen for install prompt on Android / Chrome / Edge
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      // Check if user previously dismissed
      const dismissed = localStorage.getItem('tenderagent_pwa_dismissed');
      if (!dismissed && !isStandaloneMode) {
        setShowPrompt(true);
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // Listen for online / offline events
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // If iOS and not standalone, show hint if not dismissed
    if (isIosDevice && !isStandaloneMode) {
      const dismissed = localStorage.getItem('tenderagent_pwa_dismissed');
      if (!dismissed) {
        setShowPrompt(true);
      }
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setShowPrompt(false);
    }
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    localStorage.setItem('tenderagent_pwa_dismissed', 'true');
  };

  return (
    <>
      {/* Offline Status Pill Bar */}
      {isOffline && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-amber-500 text-amber-950 px-4 py-1.5 text-xs font-semibold flex items-center justify-center gap-2 shadow-md animate-in slide-in-from-top duration-300">
          <WifiOff className="w-4 h-4 shrink-0" />
          <span>Offline Mode Active · Running on local POPIA storage & cached South African tender datasets</span>
        </div>
      )}

      {/* Mobile PWA Install Banner */}
      {showPrompt && !isStandalone && (
        <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:bottom-6 sm:max-w-md z-50 animate-in slide-in-from-bottom duration-300">
          <div className={`p-4 rounded-2xl border shadow-2xl backdrop-blur-md ${
            isDarkMode 
              ? 'bg-slate-900/95 border-emerald-500/40 text-slate-100 shadow-emerald-950/40' 
              : 'bg-white/95 border-emerald-300 text-slate-900 shadow-slate-300'
          }`}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-white p-1 border border-slate-200 dark:border-slate-700 shadow-xs shrink-0 flex items-center justify-center">
                  <img 
                    src="/tenderagentfavicon.png" 
                    alt="TenderAgent App Icon" 
                    className="w-10 h-10 object-contain" 
                  />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <h4 className="font-bold text-sm tracking-tight">Install TenderAgent App</h4>
                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-bold uppercase font-mono">
                      PWA
                    </span>
                  </div>
                  <p className={`text-[11px] leading-relaxed mt-0.5 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    One-tap home screen access to RFP analysis, eTender feeds, and offline POPIA vault.
                  </p>
                </div>
              </div>

              <button
                onClick={handleDismiss}
                className={`p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200`}
                title="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Actions: Android Install vs iOS Share Guide */}
            <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2">
              {isIos ? (
                <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5 w-full">
                  <Share2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>Tap <strong>Share</strong> in Safari, then select <strong>&quot;Add to Home Screen&quot;</strong></span>
                </div>
              ) : deferredPrompt ? (
                <>
                  <button
                    onClick={handleDismiss}
                    className="px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                  >
                    Not now
                  </button>
                  <button
                    onClick={handleInstallClick}
                    className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1.5 shadow-xs transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Install App</span>
                  </button>
                </>
              ) : (
                <button
                  onClick={handleDismiss}
                  className="px-3.5 py-1.5 text-xs font-medium rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                >
                  Got it
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
