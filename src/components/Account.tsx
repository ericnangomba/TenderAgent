import React, { useState } from 'react';
import { LogIn, UserPlus, LogOut, ShieldCheck, Building2, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';

export interface AuthState {
  tenantId: string;
  email: string;
}

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

export const Account: React.FC<AccountProps> = ({ isDarkMode, auth, onAuthChange }) => {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  const card = `rounded-2xl border p-6 ${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'}`;
  const input = `w-full px-4 py-2.5 rounded-xl border text-sm outline-none transition-colors ${isDarkMode
    ? 'bg-slate-950 border-slate-700 text-slate-100 focus:border-emerald-500'
    : 'bg-slate-50 border-slate-300 text-slate-900 focus:border-emerald-600'}`;
  const label = `block text-xs font-semibold uppercase tracking-wider mb-1.5 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/auth/${mode === 'login' ? 'login' : 'signup'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mode === 'login' ? { email, password } : { email, password, companyName }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(
          data.error === 'invalid_credentials' ? 'Email or password is incorrect.'
          : data.error === 'email_already_registered' ? 'An account with this email already exists. Sign in instead.'
          : data.error === 'too_many_attempts' ? 'Too many attempts. Please wait a few minutes and try again.'
          : data.error || 'Something went wrong.',
        );
        return;
      }
      onAuthChange({ tenantId: data.tenantId, email: data.email });
    } catch {
      setError('Could not reach the server.');
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    onAuthChange(null);
  };

  if (auth) {
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
  }

  return (
    <div className="max-w-md mx-auto">
      <div className={card}>
        <div className={`flex rounded-xl p-1 mb-6 ${isDarkMode ? 'bg-slate-950' : 'bg-slate-100'}`}>
          {(['login', 'signup'] as const).map((m) => (
            <button
              key={m}
              onClick={() => { setMode(m); setError(null); }}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${mode === m
                ? (isDarkMode ? 'bg-slate-800 text-emerald-400' : 'bg-white text-emerald-700 shadow-sm')
                : (isDarkMode ? 'text-slate-400 hover:text-slate-300' : 'text-slate-500 hover:text-slate-700')}`}
            >
              {m === 'login' ? 'Sign in' : 'Create account'}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="space-y-4">
          {mode === 'signup' && (
            <div>
              <label className={label}>Company name</label>
              <input className={input} value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Apex Strategic Solutions (Pty) Ltd" />
            </div>
          )}
          <div>
            <label className={label}>Email</label>
            <input className={input} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.co.za" />
          </div>
          <div>
            <label className={label}>Password</label>
            <input className={input} type="password" required minLength={10} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 10 characters" />
          </div>

          {error && (
            <div className={`flex items-start gap-2 text-xs rounded-lg p-3 ${isDarkMode ? 'bg-red-500/10 text-red-400' : 'bg-red-50 text-red-700'}`}>
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-colors ${isDarkMode
              ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
              : 'bg-emerald-600 hover:bg-emerald-700 text-white'} disabled:opacity-60`}
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : (mode === 'login' ? <LogIn className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />)}
            {mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <p className={`text-[11px] leading-relaxed mt-4 ${isDarkMode ? 'text-slate-500' : 'text-slate-500'}`}>
          Your company profile and tender analyses are tied to your workspace account.
        </p>
      </div>
    </div>
  );
};
