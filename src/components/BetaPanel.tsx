import React, { useEffect, useState } from 'react';
import type { PilotAccount, PilotCampaign, PilotChange } from '../lib/server/betaPilot';

/**
 * Private operator view, admin-gated on every request. The pilot campaign is
 * concluded: this panel is now a READ-ONLY historical record (campaign
 * window, per-account outcome and the audit change log). Live onboarding
 * controls (start, issue, revoke) were retired with the campaign; the
 * server-side audit history is preserved untouched.
 */
const formatTime = (value: string) => new Date(value).toLocaleString('en-ZA', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit', timeZoneName:'short' });

export function BetaPanel() {
  const [data, setData] = useState<{ campaign: PilotCampaign | null; accounts: PilotAccount[]; changes: PilotChange[]; legacyConfigured: boolean } | null>(null);
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const refresh = async (q = query) => {
    const response = await fetch(`/api/admin/beta?q=${encodeURIComponent(q)}`);
    if (!response.ok) throw new Error('Pilot history could not be loaded. Check your operator sign-in and retry.');
    const next = await response.json().catch(() => { throw new Error('Pilot history could not be read. Refresh to retry.'); });
    setData(next); setLastUpdated(new Date().toLocaleTimeString());
  };
  useEffect(() => { refresh('').catch(error => setMessage(error.message)); }, []);
  useEffect(() => {
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible' && !busy) refresh().catch(() => setMessage('Automatic refresh failed. Last shown status may be out of date.')); }, 30000);
    return () => window.clearInterval(timer);
  }, [query, busy]);
  const open = data?.campaign && Date.now() >= Date.parse(data.campaign.startsAt) && Date.now() < Date.parse(data.campaign.endsAt);
  return <section className="bg-white border border-stone-200 rounded-xl p-5 space-y-4">
    <h3 className="font-display text-xl font-semibold">Pilot access (ended)</h3>
    <p className="text-sm text-stone-600">Historical record of the concluded free pilot. Read-only: no new access is granted here. Every signed-in account now gets the free monthly baseline automatically.</p>
    <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3 space-y-2">
      <h4 className="text-sm font-semibold">Admin notifications</h4>
      <p className="text-xs text-stone-600">Confirmed activity from the server. No external email. {lastUpdated ? `Last checked ${lastUpdated}.` : 'Loading status...'}</p>
      {!data?.changes?.length && <p className="text-sm">No pilot activity recorded yet.</p>}
      {data?.changes?.slice(0,5).map((change,index) => <p key={index} className="text-xs break-words">{formatTime(change.at)} - {change.action.endsWith('_failed') ? 'Operator action not confirmed; check status before retrying' : change.action === 'redeemed' ? 'Access granted after code redemption' : change.action === 'revoked' ? 'Pilot access revoked' : change.action === 'code_issued' ? 'Code issued; awaiting redemption' : 'Shared pilot started'}{change.userId ? `: ${data.accounts.find(a => a.userId === change.userId)?.email || change.userId}` : ''}</p>)}
    </div>
    {message && <p role="status" className="text-sm bg-stone-100 rounded-lg p-3 break-words">{message}</p>}
    {data?.legacyConfigured ? <p role="alert" className="text-sm text-amber-800">An older deployment campaign is configured. Operator setup must be reconciled before any new campaign is considered.</p> : data?.campaign && <div className="text-sm space-y-1">
      <p>{open ? 'Shared pilot open' : 'Shared pilot ended'}</p><p>Started {formatTime(data.campaign.startsAt)}</p><p>Ends {formatTime(data.campaign.endsAt)}</p>
      <p>The pilot allowed 20 analyses per account, no paid searches, public or synthetic documents only.</p>
    </div>}
    <form className="flex flex-col sm:flex-row gap-2" onSubmit={e => { e.preventDefault(); setBusy(true); refresh().catch(error => setMessage(error.message)).finally(() => setBusy(false)); }}>
      <input aria-label="Find registered account" value={query} onChange={e => setQuery(e.target.value)} maxLength={100} placeholder="Email or company name" className="border rounded-lg p-2 min-w-0 flex-1" />
      <button disabled={busy} className="border rounded-lg px-3 py-2">Search / refresh status</button>
    </form>
    <p className="text-xs text-stone-500">Status refreshes every 30 seconds while this panel is visible. Up to 50 registered accounts.</p>
    <div className="space-y-2 max-h-80 overflow-auto">
      {data?.accounts.map(account => <div key={account.userId} className="w-full border rounded-lg p-3 text-left break-words">
        <span className="block font-medium">{account.companyName}</span><span className="block text-sm">{account.email}</span>
        <span className="block text-xs mt-1">Pilot usage {account.analyses}/20 analyses, {account.lookups}/0 paid lookups. Saved profile: {account.hasSavedProfile ? 'yes' : 'no'}.</span>
        <span className="block text-xs mt-1">{account.redeemedAt ? `Redeemed ${formatTime(account.redeemedAt)}; current stored status: ${account.status}` : account.issuedAt ? 'Code issued; awaiting redemption' : `Registered; access status: ${account.status}`}</span>
      </div>)}
    </div>
    <details className="border-t pt-3"><summary className="cursor-pointer font-medium text-sm">Change record (latest 100)</summary>
      <ul className="space-y-2 mt-3 text-xs text-stone-600">
        {data?.changes?.map((change,index) => <li key={index} className="break-words">{formatTime(change.at)} - {change.action.replace('_',' ')} - {change.userId ? data.accounts.find(a => a.userId === change.userId)?.email || change.userId : 'shared campaign'}<br /><span className="break-all">Actor account {change.actorId}</span></li>)}
      </ul>
    </details>
  </section>;
}
