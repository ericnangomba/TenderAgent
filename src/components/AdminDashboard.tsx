import React, { useEffect, useState } from 'react';
import { Activity, Building2, Users, CreditCard, Gauge, Server } from 'lucide-react';

interface Overview {
  tenants: number;
  users: number;
  entitlementsByStatus: Record<string, number>;
  usage: { analyses: number; serpapiLookups: number };
}

interface Health {
  status: string;
  store: string;
  authRequired: boolean;
  geminiConfigured: boolean;
  sentryTracing: boolean;
}

/**
 * Operator dashboard: aggregate-only platform statistics from /api/admin/*
 * (server-enforced requireAdmin) plus the public health echo. No per-tenant
 * rows, no emails, no secrets - counts are enough for settings and
 * performance checks.
 */
export const AdminDashboard: React.FC = () => {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin/overview')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`overview ${r.status}`))))
      .then((d) => setOverview(d.overview))
      .catch((e) => setError(e.message));
    fetch('/api/health')
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => undefined);
  }, []);

  const stat = 'bg-white border border-stone-200 rounded-xl p-5';
  const statLabel = 'text-xs font-semibold uppercase tracking-wider text-stone-500';
  const statValue = 'font-display text-3xl font-semibold mt-1 text-[#14201C]';

  const entitlementEntries = overview ? Object.entries(overview.entitlementsByStatus) : [];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h2 className="font-display text-2xl font-semibold text-[#14201C]">Platform overview</h2>
        <p className="text-sm text-stone-500 mt-1">Aggregate operator statistics. Individual workspaces are never listed here.</p>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 text-sm rounded-lg p-3">Could not load overview: {error}</div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className={stat}>
          <div className="flex items-center gap-2"><Building2 className="w-4 h-4 text-emerald-700" /><span className={statLabel}>Workspaces</span></div>
          <div className={statValue}>{overview?.tenants ?? '-'}</div>
        </div>
        <div className={stat}>
          <div className="flex items-center gap-2"><Users className="w-4 h-4 text-emerald-700" /><span className={statLabel}>Accounts</span></div>
          <div className={statValue}>{overview?.users ?? '-'}</div>
        </div>
        <div className={stat}>
          <div className="flex items-center gap-2"><Gauge className="w-4 h-4 text-emerald-700" /><span className={statLabel}>Analyses this month</span></div>
          <div className={statValue}>{overview?.usage.analyses ?? '-'}</div>
        </div>
        <div className={stat}>
          <div className="flex items-center gap-2"><Activity className="w-4 h-4 text-emerald-700" /><span className={statLabel}>Tender lookups</span></div>
          <div className={statValue}>{overview?.usage.serpapiLookups ?? '-'}</div>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className={stat}>
          <div className="flex items-center gap-2 mb-3"><CreditCard className="w-4 h-4 text-emerald-700" /><span className={statLabel}>Subscriptions by status</span></div>
          {entitlementEntries.length === 0 ? (
            <p className="text-sm text-stone-500">No subscriptions recorded yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {entitlementEntries.map(([status, n]) => (
                <li key={status} className="flex justify-between text-sm">
                  <span className="text-stone-600">{status}</span>
                  <span className="font-semibold text-[#14201C]">{n}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className={stat}>
          <div className="flex items-center gap-2 mb-3"><Server className="w-4 h-4 text-emerald-700" /><span className={statLabel}>System</span></div>
          {health ? (
            <ul className="space-y-1.5 text-sm">
              <li className="flex justify-between"><span className="text-stone-600">Service</span><span className="font-semibold">{health.status}</span></li>
              <li className="flex justify-between"><span className="text-stone-600">Store</span><span className="font-semibold">{health.store}</span></li>
              <li className="flex justify-between"><span className="text-stone-600">Accounts required</span><span className="font-semibold">{health.authRequired ? 'yes' : 'no'}</span></li>
              <li className="flex justify-between"><span className="text-stone-600">Cloud AI key configured</span><span className="font-semibold">{health.geminiConfigured ? 'yes' : 'no'}</span></li>
            </ul>
          ) : (
            <p className="text-sm text-stone-500">Health endpoint unavailable.</p>
          )}
        </div>
      </div>
    </div>
  );
};
