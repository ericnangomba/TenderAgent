import React, { useEffect, useState } from 'react';
import type { PilotAccount, PilotCampaign, PilotChange } from '../lib/server/betaPilot';

/** Private operator controls. Every request is independently admin-gated. */
const formatTime = (value: string) => new Date(value).toLocaleString('en-ZA', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit', timeZoneName:'short' });

export function BetaPanel() {
  const [data, setData] = useState<{ campaign: PilotCampaign | null; accounts: PilotAccount[]; changes: PilotChange[]; legacyConfigured: boolean } | null>(null);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<PilotAccount | null>(null);
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [confirmStart, setConfirmStart] = useState(false);
  const refresh = async (q = query) => {
    const response = await fetch(`/api/admin/beta?q=${encodeURIComponent(q)}`);
    if (!response.ok) throw new Error('Beta status could not be loaded. Check your operator sign-in and retry.');
    const next = await response.json().catch(() => { throw new Error('Beta status could not be read. Refresh to retry.'); });
    setData(next); setLastUpdated(new Date().toLocaleTimeString());
    setSelected(current => current ? next.accounts.find((a: PilotAccount) => a.userId === current.userId) || null : null);
  };
  useEffect(() => { refresh('').catch(error => setMessage(error.message)); }, []);
  useEffect(() => {
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible' && !busy && !code) refresh().catch(() => setMessage('Automatic status refresh failed. Last shown status may be out of date.')); }, 30000);
    return () => window.clearInterval(timer);
  }, [query, busy, code]);
  const post = async (path: string, body: unknown) => {
    const response = await fetch(`/api/admin/beta/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!response.ok) throw new Error(path === 'start' ? 'Start not confirmed. Refresh status before trying again.' : 'Code not issued. Check the campaign and account status, then refresh.');
    return response.json();
  };
  const start = async () => {
    setBusy(true); setMessage('');
    try { const result = await post('start', { confirmation: 'START SHARED SEVEN DAY BETA' }); setConfirmStart(false); await refresh(); setMessage(`Shared beta confirmed. Ends ${formatTime(result.campaign.endsAt)}. No account has been granted access by this step.`); }
    catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
  };
  const issue = async () => {
    if (!selected) return;
    setBusy(true); setCode(''); setMessage('');
    try { const result = await post('issue', { userId: selected.userId, tenantId: selected.tenantId, confirmation: 'ISSUE ACCOUNT BOUND CODE' }); setCode(result.code); await refresh(); setMessage('Code issued, not access granted. Keep this code private. This is its only display; a replacement invalidates the previous unused code.'); }
    catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
  };
  const revoke = async () => {
    if (!selected || !confirmRevoke) return;
    setBusy(true); setCode(''); setMessage('');
    try { await post('revoke', { userId:selected.userId,tenantId:selected.tenantId,confirmation:'REVOKE BETA ACCESS' }); await refresh(); setConfirmRevoke(false); setMessage('Beta access revoked. Account, saved profile and drafts were not deleted.'); }
    catch { setMessage('Revocation not confirmed. Refresh status before retrying.'); } finally { setBusy(false); }
  };
  const open = data?.campaign && Date.now() >= Date.parse(data.campaign.startsAt) && Date.now() < Date.parse(data.campaign.endsAt);
  return <section className="bg-white border border-stone-200 rounded-xl p-5 space-y-4">
    <h3 className="font-display text-xl font-semibold">Beta access</h3>
    <p className="text-sm text-stone-600">Register, receive an account-bound code, apply it in Account. Access starts only after successful redemption. No per-tester deployment.</p>
    <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3 space-y-2">
      <h4 className="text-sm font-semibold">Admin notifications</h4>
      <p className="text-xs text-stone-600">Confirmed activity from the server. No external email. {lastUpdated ? `Last checked ${lastUpdated}.` : 'Loading status...'}</p>
      {!data?.changes?.length && <p className="text-sm">No beta activity recorded yet.</p>}
      {data?.changes?.slice(0,5).map((change,index) => <p key={index} className="text-xs break-words">{formatTime(change.at)} - {change.action.endsWith('_failed') ? 'Operator action not confirmed; check status before retrying' : change.action === 'redeemed' ? 'Access granted after code redemption' : change.action === 'revoked' ? 'Beta access revoked' : change.action === 'code_issued' ? 'Code issued; awaiting redemption' : 'Shared beta started'}{change.userId ? `: ${data.accounts.find(a => a.userId === change.userId)?.email || change.userId}` : ''}</p>)}
    </div>
    {message && <p role="status" className="text-sm bg-stone-100 rounded-lg p-3 break-words">{message}</p>}
    {data?.legacyConfigured ? <p role="alert" className="text-sm text-amber-800">An older deployment campaign is configured. Do not start a second campaign. Operator setup must be reconciled first.</p> : data && !data.campaign ? <div className="space-y-3">
      <p className="text-sm">The clock is off. Start once when ready. All testers share the same seven-day end, including late joiners. Starting cannot be undone or extended here.</p>
      <label className="flex gap-2 text-sm"><input type="checkbox" checked={confirmStart} onChange={e => setConfirmStart(e.target.checked)} />I am ready to start the shared seven-day beta now.</label>
      <button disabled={busy || !confirmStart} onClick={start} className="rounded-lg bg-emerald-800 text-white px-4 py-2 disabled:opacity-50">Start shared beta</button>
    </div> : data?.campaign && <div className="text-sm space-y-1">
      <p>{open ? 'Shared beta open' : 'Shared beta ended'}</p><p>Started {formatTime(data.campaign.startsAt)}</p><p>Ends {formatTime(data.campaign.endsAt)}</p>
      <p>20 analyses total per pilot account. No paid searches, card collection or automatic paid conversion. Public or synthetic documents only.</p>
    </div>}
    <form className="flex flex-col sm:flex-row gap-2" onSubmit={e => { e.preventDefault(); setBusy(true); refresh().catch(error => setMessage(error.message)).finally(() => setBusy(false)); }}>
      <input aria-label="Find registered account" value={query} onChange={e => setQuery(e.target.value)} maxLength={100} placeholder="Email or company name" className="border rounded-lg p-2 min-w-0 flex-1" />
      <button disabled={busy} className="border rounded-lg px-3 py-2">Search / refresh status</button>
    </form>
    <p className="text-xs text-stone-500">Status refreshes every 30 seconds while this panel is visible (paused while a private code is displayed). Up to 50 registered accounts. Select the intended account and check its email and company before issuing a code. Email ownership is not verified by registration.</p>
    <div className="space-y-2 max-h-80 overflow-auto">
      {data?.accounts.map(account => <button key={account.userId} disabled={busy} onClick={() => { setSelected(account); setConfirmRevoke(false); setCode(''); setMessage(''); }} className={`w-full border rounded-lg p-3 text-left break-words ${selected?.userId === account.userId ? 'border-emerald-800 bg-emerald-50' : ''}`}>
        <span className="block font-medium">{account.companyName}</span><span className="block text-sm">{account.email}</span>
        <span className="block text-xs mt-1">Pilot usage {account.analyses}/20 analyses, {account.lookups}/0 paid lookups. Saved profile: {account.hasSavedProfile ? 'yes' : 'no'}.</span>
        <span className="block text-xs mt-1">{account.redeemedAt ? `Redeemed ${formatTime(account.redeemedAt)}; current stored status: ${account.status}` : account.issuedAt ? 'Code issued; awaiting redemption' : `Registered; access status: ${account.status}`}</span>
      </button>)}
    </div>
    {selected && <div className="space-y-2 border-t pt-3">
      <p className="text-sm break-words">Selected: {selected.companyName} ({selected.email})</p>
      <p className="text-xs text-stone-500 break-all">Account {selected.userId} / Workspace {selected.tenantId}</p>
      <button disabled={busy || !open || selected.status !== 'none' || Boolean(selected.redeemedAt) || data?.legacyConfigured} onClick={issue} className="rounded-lg bg-emerald-800 text-white px-4 py-2 disabled:opacity-50">{selected.issuedAt ? 'Replace unused code' : 'Issue code for selected account'}</button>
      {selected.planId === 'test_cohort' && selected.status === 'active' && <div className="space-y-2">
        <label className="flex gap-2 text-sm"><input type="checkbox" checked={confirmRevoke} onChange={e => setConfirmRevoke(e.target.checked)} />Revoke beta access for this selected account. This does not delete data.</label>
        <button disabled={busy || !confirmRevoke} onClick={revoke} className="rounded-lg border border-red-700 text-red-800 px-4 py-2 disabled:opacity-50">Revoke selected beta access</button>
      </div>}
      {code && <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2"><p className="text-sm">Private code for {selected.email}. Give it only to the approved operator or tester. It is not their login password.</p><code className="block break-all select-all text-sm">{code}</code><button onClick={() => { setCode(''); setMessage('Code hidden. Refresh status after the tester applies it.'); }} className="text-sm underline">Hide code</button></div>}
    </div>}
    <details className="border-t pt-3"><summary className="cursor-pointer font-medium text-sm">Change record (latest 100)</summary>
      <ul className="space-y-2 mt-3 text-xs text-stone-600">
        {data?.changes?.map((change,index) => <li key={index} className="break-words">{formatTime(change.at)} - {change.action.replace('_',' ')} - {change.userId ? data.accounts.find(a => a.userId === change.userId)?.email || change.userId : 'shared campaign'}<br /><span className="break-all">Actor account {change.actorId}</span></li>)}
      </ul>
    </details>
  </section>;
}
