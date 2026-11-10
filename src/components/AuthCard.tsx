import React, { useState } from 'react';
import { AlertCircle, Loader2, LogIn, UserPlus } from 'lucide-react';

export interface AuthState {
  tenantId: string;
  email: string;
  userId: string;
  isAdmin: boolean;
}

interface Props {
  onAuthChange: (auth: AuthState) => void;
  /** Start on the signup form (e.g. landing "Create account" emphasis). */
  initialMode?: 'login' | 'signup';
}

/**
 * Sign-in / create-account card. Used on the public landing page; the
 * dashboard itself only renders for signed-in workspaces. Light-only styling:
 * the theme toggle was removed per product direction.
 */
export const AuthCard: React.FC<Props> = ({ onAuthChange, initialMode = 'login' }) => {
  const [mode, setMode] = useState<'login' | 'signup'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const input = 'w-full px-4 py-2.5 rounded-lg border border-stone-300 bg-white text-sm text-stone-900 outline-none transition-colors focus:border-emerald-700 placeholder:text-stone-400';
  const label = 'block text-xs font-semibold uppercase tracking-wider mb-1.5 text-stone-500';

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
      onAuthChange({ tenantId: data.tenantId, email: data.email, userId: data.userId, isAdmin: Boolean(data.isAdmin) });
    } catch {
      setError('Could not reach the server.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-white border border-stone-200 rounded-2xl shadow-[0_18px_50px_-24px_rgba(20,32,28,0.35)] p-6 sm:p-8">
      <div className="flex rounded-lg p-1 mb-6 bg-stone-100">
        {(['login', 'signup'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => { setMode(m); setError(null); }}
            className={`flex-1 py-2 rounded-md text-sm font-semibold transition-colors ${mode === m
              ? 'bg-white text-emerald-800 shadow-sm'
              : 'text-stone-500 hover:text-stone-700'}`}
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
          <div className="flex items-start gap-2 text-xs rounded-lg p-3 bg-red-50 text-red-700">
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold bg-emerald-700 hover:bg-emerald-800 text-white transition-colors disabled:opacity-60"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : (mode === 'login' ? <LogIn className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />)}
          {mode === 'login' ? 'Sign in' : 'Create account'}
        </button>
      </form>

      <p className="text-[11px] leading-relaxed mt-4 text-stone-400">
        Your company profile and tender analyses are tied to your workspace account.
      </p>
    </div>
  );
};
