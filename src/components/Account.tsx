import React, { useState } from 'react';
import { LogOut, ShieldCheck, Building2, AlertCircle, CheckCircle2, KeyRound, Trash2 } from 'lucide-react';
import type { AuthState } from './AuthCard';

interface AccountProps {
  isDarkMode: boolean;
  auth: AuthState | null;
  onAuthChange: (auth: AuthState | null) => void;
}

interface AccountInfo {
  beta?: { redeemAvailable: boolean; endsAt: string | null };
  accountDeletionAvailable?: boolean;
  entitlement?: { effectiveStatus?: string; planId?: string | null; currentPeriodEnd?: string | null };
  usage?: { analyses: number; serpapiLookups: number };
  allowances?: { includedAnalyses: number; includedSerpapiLookups: number } | null;
}

/**
 * Signed-in workspace account view: identity, subscription status and usage.
 * Sign-in/registration lives on the landing page (AuthCard), not here.
 */
export const Account: React.FC<AccountProps> = ({ isDarkMode, auth, onAuthChange }) => {
  const [betaCode, setBetaCode] = useState('');
  const [betaMessage, setBetaMessage] = useState('');
  const [betaBusy, setBetaBusy] = useState(false);
  const [info, setInfo] = useState<AccountInfo | null>(null);
  const [accountDeleteOpen, setAccountDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [accountDeleteError, setAccountDeleteError] = useState<string | null>(null);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [profileDelete, setProfileDelete] = useState<'idle' | 'confirm' | 'busy' | 'done' | 'error'>('idle');

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

  // Fixed campaign expiry also closes an already-open code form. The server
  // remains authoritative if a backgrounded browser delays this timer.
  React.useEffect(() => {
    const end = info?.beta?.endsAt;
    if (!end) return;
    const remaining = Date.parse(end) - Date.now();
    const close = () => setInfo(current => current ? { ...current, beta: { ...current.beta!, redeemAvailable: false },
      entitlement: current.entitlement?.planId === 'test_cohort' ? { ...current.entitlement, effectiveStatus: 'cancelled' } : current.entitlement } : current);
    if (remaining <= 0) { if (info.beta?.redeemAvailable || (info.entitlement?.planId === 'test_cohort' && info.entitlement.effectiveStatus === 'active')) close(); return; }
    const timer = window.setTimeout(close, Math.min(remaining, 2147483647));
    return () => window.clearTimeout(timer);
  }, [info?.beta?.endsAt, info?.beta?.redeemAvailable, info?.entitlement?.effectiveStatus]);

  const redeemBeta = async (e: React.FormEvent) => {
    e.preventDefault(); setBetaBusy(true); setBetaMessage('');
    try {
      const res = await fetch('/api/beta/redeem', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: betaCode }) });
      setBetaCode('');
      if (!res.ok) { setBetaMessage(res.status === 429 ? 'Too many attempts. Wait ten minutes.' : 'Code not accepted. It may be expired or not available for this account.'); return; }
      const account = await fetch('/api/account');
      if (!account.ok) throw new Error('refresh');
      const d = await account.json(); setInfo(d.account);
      setBetaMessage('Beta access is active. No payment was taken.');
    } catch { setBetaMessage('Could not confirm access. Refresh your account before trying again.'); }
    finally { setBetaBusy(false); }
  };

  const logout = async () => {
    setLogoutError(null);
    // The server session must end first: a failed or aborted request leaves
    // the account signed in, and silently reloading would re-auth the
    // dashboard and look like a successful sign-out. Say so explicitly.
    let res: Response;
    try {
      res = await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      setLogoutError('Sign out failed - no connection. You are still signed in.');
      return;
    }
    if (!res.ok) {
      setLogoutError('Sign out failed on the server. You are still signed in - please try again.');
      return;
    }
    // No account data may outlive the session on this device: purge this app's
    // CacheStorage entries (legacy service-worker builds cached /api/ GETs,
    // including the company profile) and reload for a clean in-memory slate.
    try {
      if (navigator.serviceWorker?.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_CACHES' });
      }
      if ('caches' in window) {
        const keys = await caches.keys();
        // Only tenderagent-* keys are ours; other same-origin tooling is left alone.
        await Promise.all(keys.filter((k) => k.startsWith('tenderagent-')).map((k) => caches.delete(k)));
      }
    } catch {
      // Best effort - the reload below still drops all in-memory state.
    }
    onAuthChange(null);
    window.location.reload();
  };

  const deleteAccount = async () => {
    setDeleteBusy(true); setAccountDeleteError(null);
    try {
      const res = await fetch('/api/account', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: deletePassword, confirmation: deleteConfirmation }) });
      setDeletePassword('');
      const data = await res.json();
      if (!res.ok) {
        const messages: Record<string, string> = {
          reauthentication_failed: 'Password not accepted. Nothing was deleted.',
          billing_resolution_required: 'This account has external billing records. Resolve cancellation and record handling with support before deleting. Nothing was deleted.',
          too_many_attempts: 'Too many attempts. Wait ten minutes and try again.',
          deletion_outcome_unconfirmed: 'Deletion status could not be confirmed. Do not repeat it yet; ask support to check the account.',
        };
        setAccountDeleteError(messages[data.error] || 'Account deletion did not finish. Check your connection and account status before retrying.');
        return;
      }
      try {
        navigator.serviceWorker?.controller?.postMessage({ type: 'CLEAR_CACHES' });
        if ('caches' in window) await Promise.all((await caches.keys()).filter(k => k.startsWith('tenderagent-')).map(k => caches.delete(k)));
      } catch { /* reload clears in-memory page state */ }
      onAuthChange(null); window.location.reload();
    } catch { setDeletePassword(''); setAccountDeleteError('Deletion status could not be confirmed. Check your connection and account status before retrying.'); }
    finally { setDeleteBusy(false); }
  };

  const deleteProfile = async () => {
    setProfileDelete('busy');
    try {
      const res = await fetch('/api/profile', { method: 'DELETE' });
      if (!res.ok) {
        setProfileDelete('error');
        return;
      }
      setProfileDelete('done');
      // Reload so no view keeps showing the erased profile from memory.
      setTimeout(() => window.location.reload(), 1200);
    } catch {
      setProfileDelete('error');
    }
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
          <div className="flex items-center gap-3 min-w-0">
            <div className={`p-2.5 rounded-xl ${isDarkMode ? 'bg-emerald-500/10' : 'bg-emerald-50'}`}>
              <Building2 className={`w-5 h-5 ${isDarkMode ? 'text-emerald-400' : 'text-emerald-600'}`} />
            </div>
            <div className="min-w-0">
              <h2 className={`text-lg font-bold break-all ${isDarkMode ? 'text-slate-100' : 'text-slate-900'}`}>{auth.email}</h2>
              <p className={`text-xs ${isDarkMode ? 'text-slate-500' : 'text-slate-500'}`}>Workspace {auth.tenantId.slice(0, 8)}</p>
            </div>
          </div>
          <button
            onClick={logout}
            className={`shrink-0 flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${isDarkMode ? 'bg-slate-800 hover:bg-slate-700 text-slate-300' : 'bg-slate-100 hover:bg-slate-200 text-slate-600'}`}
          >
            <LogOut className="w-3.5 h-3.5" /> Sign out
          </button>
        </div>
        {logoutError && (
          <p role="alert" className={`mt-3 text-xs font-medium ${isDarkMode ? 'text-amber-300' : 'text-amber-700'}`}>
            {logoutError}
          </p>
        )}

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
          <h3 className={`text-sm font-bold uppercase tracking-wider ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>Access and billing</h3>
        </div>
        <div className="flex items-center gap-2.5">
          {status === 'active'
            ? <CheckCircle2 className={`w-4 h-4 ${isDarkMode ? 'text-emerald-400' : 'text-emerald-600'}`} />
            : <AlertCircle className={`w-4 h-4 ${isDarkMode ? 'text-amber-400' : 'text-amber-600'}`} />}
          <span className={`text-sm font-medium ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>{info?.entitlement?.planId === 'test_cohort' ? (status === 'active' ? 'Free beta access active' : 'Beta access ended') : statusLabel[status] || status}</span>
        </div>
        {info?.entitlement?.currentPeriodEnd && status === 'active' && (
          <p className={`text-xs mt-2 ${isDarkMode ? 'text-slate-500' : 'text-slate-500'}`}>
            {info.entitlement.planId === 'test_cohort' ? 'Beta ends' : 'Access ends'} {new Date(info.entitlement.currentPeriodEnd).toLocaleString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' })}
          </p>
        )}
        <p className="text-xs mt-3 text-slate-500">Real payments are not connected. Beta access does not collect a card or start a paid subscription.</p>
        {info?.entitlement?.planId === 'test_cohort' && <p className="text-xs mt-2 text-slate-500">Public or synthetic documents only. Rule-based preview, not a language model. No paid searches. Check the source tender before relying on results.</p>}
        {info?.beta?.redeemAvailable && info.entitlement?.effectiveStatus === 'none' && (
          <form onSubmit={redeemBeta} className="mt-4 space-y-2">
            <label htmlFor="beta-code" className="block text-sm font-medium">Redeem beta code</label>
            <p className="text-xs text-slate-500">One shared beta window. Late joiners get the time remaining, not a new seven days.</p>
            <input id="beta-code" type="password" autoComplete="off" value={betaCode} onChange={e => setBetaCode(e.target.value)} maxLength={256} required className="w-full rounded-lg border border-slate-300 bg-transparent p-3" />
            <button disabled={betaBusy} className="rounded-lg bg-emerald-700 text-white px-4 py-2 disabled:opacity-50">{betaBusy ? 'Checking...' : 'Apply beta code'}</button>
          </form>
        )}
        {betaMessage && <p role="status" className="text-sm mt-3">{betaMessage}</p>}
        {info?.allowances && (
          <div className={`mt-4 pt-4 border-t ${isDarkMode ? 'border-slate-800' : 'border-slate-100'}`}>
            <p className={`text-xs font-semibold uppercase tracking-wider mb-2 ${isDarkMode ? 'text-slate-500' : 'text-slate-500'}`}>{info.entitlement?.planId === 'test_cohort' ? 'Usage across this beta pilot' : 'Usage this month'}</p>
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

      <div className={card}>
        <div className="flex items-center gap-2.5 mb-4">
          <Trash2 className={`w-5 h-5 ${isDarkMode ? 'text-emerald-400' : 'text-emerald-600'}`} />
          <h3 className={`text-sm font-bold uppercase tracking-wider ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>Your data</h3>
        </div>
        <p className={`text-xs leading-relaxed mb-4 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
          Your company profile and bid drafts stay saved until you delete them - there is no automatic expiry.
          Tender analyses are returned to this browser view without a saved server-side analysis history. Leaving or reloading the view loses that result. Evidence notes you add to a requirement stay saved with that draft until you delete the
          draft. Bid drafts can be deleted one by one from the Bid Readiness view.
        </p>
        {profileDelete === 'done' ? (
          <p className={`text-xs font-medium ${isDarkMode ? 'text-emerald-400' : 'text-emerald-700'}`}>
            Saved company profile deleted.
          </p>
        ) : profileDelete === 'confirm' || profileDelete === 'busy' ? (
          <div className={`rounded-xl p-3 ${isDarkMode ? 'bg-slate-950' : 'bg-slate-50'}`}>
            <p className={`text-xs mb-3 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
              Delete your saved company profile now? This cannot be undone. Your account and sign-in stay active.
            </p>
            <div className="flex gap-2">
              <button
                onClick={deleteProfile}
                disabled={profileDelete === 'busy'}
                className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-xs font-semibold"
              >
                {profileDelete === 'busy' ? 'Deleting...' : 'Yes, delete my profile'}
              </button>
              <button
                onClick={() => setProfileDelete('idle')}
                disabled={profileDelete === 'busy'}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${isDarkMode ? 'bg-slate-800 text-slate-300' : 'bg-slate-200 text-slate-700'}`}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <button
              onClick={() => setProfileDelete('confirm')}
              className={`px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${isDarkMode ? 'bg-slate-800 hover:bg-slate-700 text-slate-300' : 'bg-slate-100 hover:bg-slate-200 text-slate-600'}`}
            >
              Delete saved company profile
            </button>
            {profileDelete === 'error' && (
              <span className={`text-xs ${isDarkMode ? 'text-amber-300' : 'text-amber-700'}`}>Delete failed - please try again.</span>
            )}
          </div>
        )}
      </div>
      {info?.accountDeletionAvailable && (
        <div className={card}>
          <h3 className={`text-sm font-bold uppercase mb-3 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>Delete account</h3>
          <p className={`text-xs leading-relaxed mb-4 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Deletes your sign-in, all sessions, saved company profile, all bid drafts and evidence notes, saved training examples/jobs, and app usage/test-access records. This cannot be undone. It does not recall exports or erase provider recovery copies immediately. External billing records must be resolved first.</p>
          {!accountDeleteOpen ? <button className="text-xs px-3 py-2 rounded-lg bg-red-600 text-white" onClick={() => setAccountDeleteOpen(true)}>Delete my account</button> : (
            <form onSubmit={e => { e.preventDefault(); void deleteAccount(); }} className="space-y-3">
              <label className="block text-xs">Current password<input type="password" autoComplete="current-password" required value={deletePassword} onChange={e => setDeletePassword(e.target.value)} className="block w-full mt-1 p-2 rounded border bg-white text-slate-900" /></label>
              <label className="block text-xs">Type DELETE MY ACCOUNT<input required value={deleteConfirmation} onChange={e => setDeleteConfirmation(e.target.value)} className="block w-full mt-1 p-2 rounded border bg-white text-slate-900" /></label>
              <div className="flex gap-3"><button type="submit" disabled={deleteBusy || deleteConfirmation !== 'DELETE MY ACCOUNT'} className="text-xs px-3 py-2 rounded-lg bg-red-600 disabled:opacity-50 text-white">{deleteBusy ? 'Deleting...' : 'Permanently delete account'}</button><button type="button" disabled={deleteBusy} className="text-xs px-3 py-2 rounded-lg border" onClick={() => { setAccountDeleteOpen(false); setDeletePassword(''); setDeleteConfirmation(''); setAccountDeleteError(null); }}>Cancel</button></div>
            </form>
          )}
          {accountDeleteError && <p role="alert" className="text-xs mt-3 text-amber-600">{accountDeleteError}</p>}
        </div>
      )}
    </div>
  );
};
