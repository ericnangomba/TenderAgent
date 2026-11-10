import React, { useState } from 'react';
import { LogOut, ShieldCheck, Building2, AlertCircle, CheckCircle2, KeyRound } from 'lucide-react';
import type { AuthState } from './AuthCard';

interface AccountProps {
  isDarkMode: boolean;
  auth: AuthState | null;
  onAuthChange: (auth: AuthState | null) => void;
}

interface AccountInfo {
  entitlement?: { effectiveStatus?: string; planId?: string | null; currentPeriodEnd?: string | null };
  usage?: { analyses: number; serpapiLookups: number };
  allowances?: { includedAnalyses: number; includedSerpapiLookups: number } | null;
}

/**
 * Signed-in workspace account view: identity, subscription status and usage.
 * Sign-in/registration lives on the landing page (AuthCard), not here.
 */
export const Account: React.FC<AccountProps> = ({ isDarkMode, auth, onAuthChange }) => {
  const [info, setInfo] = useState<AccountInfo | null>(null);

  React.useEffect(() => {
    if (!auth) {
      setInfo(null);
      return;
    }
    fetch('/api/account')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.success && setInfo(d.account))
      .catch(() => setInfo(null));
  }, [auth]);

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    // No account data may outlive the session on this device: purge every
    // CacheStorage entry (legacy service-worker builds cached /api/ GETs,
    // including the company profile) and reload for a clean in-memory slate.
    try {
      if (navigator.serviceWorker?.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_CACHES' });
      }
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } catch {
      // Best effort - the reload below still drops all in-memory state.
    }
    onAuthChange(null);
    window.location.reload();
  };

  if (!auth) return null;

  const card = `rounded-2xl border p-6 ${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'}`;

  const status = info?.entitlement?.effectiveStatus || 'none';
  const statusLabel: Record<string, string> = {
    none: 'No active subscription', active: 'Subscription active', past_due: 'Payment outstanding', cancelled: 'Subscription cancelled',
  };
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className={card}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl ${isDarkMode ? 'bg-emerald-500/10' : 'bg-emerald-50'}`}>
              <Building2 className={`w-5 h-5 ${isDarkMode ? 'text-emerald-400' : 'text-emerald-600'}`} />
            </div>
            <div>
              <h2 className={`text-lg font-bold ${isDarkMode ? 'text-slate-100' : 'text-slate-900'}`}>{auth.email}</h2>
              <p className={`text-xs ${isDarkMode ? 'text-slate-500' : 'text-slate-500'}`}>Workspace {auth.tenantId.slice(0, 8)}</p>
            </div>
          </div>
          <button
            onClick={logout}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${isDarkMode ? 'bg-slate-800 hover:bg-slate-700 text-slate-300' : 'bg-slate-100 hover:bg-slate-200 text-slate-600'}`}
          >
            <LogOut className="w-3.5 h-3.5" /> Sign out
          </button>
        </div>

        {/* Workspace identifiers: the operator copies their own user ID into
            the deployment environment (ADMIN_USER_IDS) to manage platform
            settings. Own IDs only - no one else's are shown anywhere. */}
        <details className={`mt-4 pt-4 border-t ${isDarkMode ? 'border-slate-800' : 'border-slate-100'}`}>
          <summary className={`cursor-pointer select-none flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>
            <KeyRound className="w-3.5 h-3.5" />
            Support details
          </summary>
          <p className={`mt-2 text-[11px] ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>
            Quote these if you ever need help with your workspace.
          </p>
          <dl className={`mt-1 text-xs space-y-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
            <div className="flex gap-2"><dt className="w-20 shrink-0">User ID</dt><dd className="font-mono break-all">{auth.userId}</dd></div>
            <div className="flex gap-2"><dt className="w-20 shrink-0">Tenant ID</dt><dd className="font-mono break-all">{auth.tenantId}</dd></div>
          </dl>
        </details>
      </div>

      <div className={card}>
        <div className="flex items-center gap-2.5 mb-4">
          <ShieldCheck className={`w-5 h-5 ${isDarkMode ? 'text-emerald-400' : 'text-emerald-600'}`} />
          <h3 className={`text-sm font-bold uppercase tracking-wider ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>Subscription</h3>
        </div>
        <div className="flex items-center gap-2.5">
          {status === 'active'
            ? <CheckCircle2 className={`w-4 h-4 ${isDarkMode ? 'text-emerald-400' : 'text-emerald-600'}`} />
            : <AlertCircle className={`w-4 h-4 ${isDarkMode ? 'text-amber-400' : 'text-amber-600'}`} />}
          <span className={`text-sm font-medium ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>{statusLabel[status] || status}</span>
        </div>
        {info?.entitlement?.currentPeriodEnd && status === 'active' && (
          <p className={`text-xs mt-2 ${isDarkMode ? 'text-slate-500' : 'text-slate-500'}`}>
            Paid up to {new Date(info.entitlement.currentPeriodEnd).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        )}
        {info?.allowances && (
          <div className={`mt-4 pt-4 border-t ${isDarkMode ? 'border-slate-800' : 'border-slate-100'}`}>
            <p className={`text-xs font-semibold uppercase tracking-wider mb-2 ${isDarkMode ? 'text-slate-500' : 'text-slate-500'}`}>Usage this month</p>
            <div className={`grid grid-cols-2 gap-3 text-sm ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
              <div className={`rounded-xl p-3 ${isDarkMode ? 'bg-slate-950' : 'bg-slate-50'}`}>
                <div className="text-lg font-bold">{info.usage?.analyses ?? 0}<span className={`text-xs font-normal ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}> / {info.allowances.includedAnalyses}</span></div>
                <div className={`text-xs ${isDarkMode ? 'text-slate-500' : 'text-slate-500'}`}>RFP analyses</div>
              </div>
              <div className={`rounded-xl p-3 ${isDarkMode ? 'bg-slate-950' : 'bg-slate-50'}`}>
                <div className="text-lg font-bold">{info.usage?.serpapiLookups ?? 0}<span className={`text-xs font-normal ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}> / {info.allowances.includedSerpapiLookups}</span></div>
                <div className={`text-xs ${isDarkMode ? 'text-slate-500' : 'text-slate-500'}`}>Live tender lookups</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
