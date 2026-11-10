import React, { useEffect, useState } from 'react';
import {
  ClipboardCheck, Plus, FileText, AlertCircle, CheckCircle2, RefreshCw,
  ChevronLeft, BookOpen, FileSearch, LogIn, Send
} from 'lucide-react';

/**
 * Bid readiness workspace. Backed by /api/applications (account required in
 * every mode). Product rules mirrored from the server engine:
 *  - incomplete applications always save as drafts;
 *  - "ready" is blocked until every requirement is resolved by a human:
 *    satisfied with an evidence note, or recorded not applicable with a reason;
 *  - every requirement names its source (tender clause or official rule);
 *  - seeded rules whose applicability is not verified for this tender start
 *    as "needs review" - nothing is blindly treated as compulsory;
 *  - this screen never submits a bid and never claims guaranteed eligibility.
 */

type RequirementStatus = 'missing' | 'satisfied' | 'needs_review' | 'not_applicable';

interface Requirement {
  id: string;
  label: string;
  source: { type: 'tender_clause' | 'official_rule'; reference: string; url?: string };
  status: RequirementStatus;
  evidenceNote?: string;
  notApplicableReason?: string;
}

interface BidApplication {
  id: string;
  tenderRef: string;
  title: string;
  state: 'draft' | 'ready';
  requirements: Requirement[];
  updatedAt: string;
}

interface ReadinessReport {
  ready: boolean;
  blockers: Array<{ requirementId: string; label: string; reason: string }>;
  resolvedCount?: number;
  totalCount?: number;
}

const isResolved = (r: Requirement) => r.status === 'satisfied' || r.status === 'not_applicable';

interface Props {
  isDarkMode: boolean;
  signedIn: boolean;
  onOpenAccount: () => void;
}

const STATUS_STYLE: Record<RequirementStatus, string> = {
  satisfied: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400',
  missing: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400',
  needs_review: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400',
  not_applicable: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
};

const STATUS_LABEL: Record<RequirementStatus, string> = {
  satisfied: 'Satisfied',
  missing: 'Missing',
  needs_review: 'Needs review',
  not_applicable: 'Not applicable',
};

export const BidReadiness: React.FC<Props> = ({ isDarkMode, signedIn, onOpenAccount }) => {
  const [applications, setApplications] = useState<BidApplication[]>([]);
  const [selected, setSelected] = useState<BidApplication | null>(null);
  const [readiness, setReadiness] = useState<ReadinessReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newRef, setNewRef] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newText, setNewText] = useState('');

  const [reqLabel, setReqLabel] = useState('');
  const [reqSourceType, setReqSourceType] = useState<'tender_clause' | 'official_rule'>('tender_clause');
  const [reqReference, setReqReference] = useState('');
  const [evidenceDrafts, setEvidenceDrafts] = useState<Record<string, string>>({});
  const [naDrafts, setNaDrafts] = useState<Record<string, string>>({});
  const [naOpen, setNaOpen] = useState<Record<string, boolean>>({});

  const card = isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm';
  const text = isDarkMode ? 'text-white' : 'text-slate-900';
  const sub = isDarkMode ? 'text-slate-400' : 'text-slate-500';
  const input = `w-full px-3 py-2 rounded-lg border text-sm ${isDarkMode ? 'bg-slate-950 border-slate-700 text-slate-200' : 'bg-white border-slate-300 text-slate-800'}`;

  const load = async () => {
    if (!signedIn) return;
    setLoading(true);
    try {
      const res = await fetch('/api/applications');
      const d = await res.json().catch(() => null);
      if (res.ok && d?.success) setApplications(d.applications);
      else setError(d?.error || `Could not load applications (${res.status})`);
    } catch {
      setError('Could not reach the applications service.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [signedIn]);

  const openApplication = async (id: string) => {
    const res = await fetch(`/api/applications/${id}`);
    const d = await res.json().catch(() => null);
    if (res.ok && d?.success) {
      setSelected(d.application);
      setReadiness(d.readiness);
      setEvidenceDrafts({});
      setError(null);
    } else {
      setError(d?.error || `Could not open application (${res.status})`);
    }
  };

  const createApplication = async () => {
    const res = await fetch('/api/applications', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenderRef: newRef, title: newTitle, rawText: newText || undefined }),
    });
    const d = await res.json().catch(() => null);
    if (res.ok && d?.success) {
      setNewRef(''); setNewTitle(''); setNewText('');
      await load();
      setSelected(d.application);
      setReadiness(d.readiness);
      setError(null);
    } else {
      setError(d?.error || `Could not save draft (${res.status})`);
    }
  };

  const addRequirement = async () => {
    if (!selected) return;
    const res = await fetch(`/api/applications/${selected.id}/requirements`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: reqLabel, sourceType: reqSourceType, sourceReference: reqReference }),
    });
    const d = await res.json().catch(() => null);
    if (res.ok && d?.success) {
      setReqLabel(''); setReqReference('');
      setSelected(d.application); setReadiness(d.readiness); setError(null);
    } else {
      setError(d?.error || `Could not add requirement (${res.status})`);
    }
  };

  const satisfy = async (reqId: string) => {
    if (!selected) return;
    const res = await fetch(`/api/applications/${selected.id}/requirements/${reqId}/satisfy`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ evidenceNote: evidenceDrafts[reqId] || '' }),
    });
    const d = await res.json().catch(() => null);
    if (res.ok && d?.success) {
      setSelected(d.application); setReadiness(d.readiness); setError(null);
    } else {
      setError(d?.error || `Could not update requirement (${res.status})`);
    }
  };

  const markNotApplicable = async (reqId: string) => {
    if (!selected) return;
    const reason = (naDrafts[reqId] || '').trim();
    if (!reason) { setError('Record why this requirement does not apply to this tender.'); return; }
    const res = await fetch(`/api/applications/${selected.id}/requirements/${reqId}/not-applicable`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    });
    const d = await res.json().catch(() => null);
    if (res.ok && d?.success) {
      setSelected(d.application); setReadiness(d.readiness); setError(null);
      setNaOpen(prev => { const n = { ...prev }; delete n[reqId]; return n; });
    } else {
      setError(d?.error || `Could not update requirement (${res.status})`);
    }
  };

  const markReady = async () => {
    if (!selected) return;
    const res = await fetch(`/api/applications/${selected.id}/mark-ready`, { method: 'POST' });
    const d = await res.json().catch(() => null);
    if (res.ok && d?.success) {
      setSelected(d.application); setReadiness(d.readiness); setError(null);
      load();
    } else {
      // 409 carries the live readiness report - show exactly what still blocks.
      if (d?.readiness) setReadiness(d.readiness);
      setError(d?.error === 'application_incomplete'
        ? 'Not ready yet: every requirement must be resolved first - satisfied with evidence or recorded not applicable with a reason.'
        : (d?.error || `Could not mark ready (${res.status})`));
    }
  };

  if (!signedIn) {
    return (
      <div className={`${card} border rounded-xl p-8 max-w-xl mx-auto text-center`}>
        <LogIn className="w-8 h-8 mx-auto mb-3 text-emerald-600" />
        <h2 className={`font-semibold text-lg ${text} mb-2`}>Sign in to track bid readiness</h2>
        <p className={`text-sm ${sub} mb-5`}>
          Bid applications are private business data, so they are saved to your account.
          The signed-out workspace is read-only sample data.
        </p>
        <button
          onClick={onOpenAccount}
          className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium"
        >
          Go to Account
        </button>
      </div>
    );
  }

  const removeApplication = async (id: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/applications/${id}`, { method: 'DELETE' });
      const d = await res.json().catch(() => null);
      if (!res.ok || !d?.success) {
        setError(d?.error || `Could not delete draft (${res.status})`);
        return;
      }
      setApplications((prev) => prev.filter((a) => a.id !== id));
      setSelected(null);
      setReadiness(null);
    } catch {
      setError('Could not reach the applications service.');
    }
  };

  // ---------- Detail view ----------
  if (selected) {
    const done = selected.requirements.filter(isResolved).length;
    return (
      <div className="space-y-4">
        <button onClick={() => { setSelected(null); setReadiness(null); setError(null); }}
          className={`flex items-center gap-1 text-sm ${sub} hover:text-emerald-600`}>
          <ChevronLeft className="w-4 h-4" /> All applications
        </button>

        <div className={`${card} border rounded-xl p-6`}>
          <div className="flex flex-wrap items-start justify-between gap-3 mb-1">
            <div>
              <h2 className={`font-semibold text-lg ${text}`}>{selected.title}</h2>
              <p className={`text-xs ${sub} font-mono`}>{selected.tenderRef}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-xs px-2 py-1 rounded-full ${selected.state === 'ready'
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400'
                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
                {selected.state === 'ready' ? 'Ready (checklist complete)' : 'Draft'}
              </span>
              <button
                onClick={() => { if (window.confirm('Delete this bid draft? This cannot be undone.')) removeApplication(selected.id); }}
                className={`text-xs px-2 py-1 rounded-lg font-semibold ${isDarkMode ? 'bg-slate-800 text-slate-300 hover:text-red-300' : 'bg-slate-100 text-slate-600 hover:text-red-600'}`}
              >
                Delete draft
              </button>
            </div>
          </div>
          <p className={`text-xs ${sub} mb-4`}>
            {done} of {selected.requirements.length} requirements resolved (satisfied with evidence or recorded not applicable).
            Readiness means your checklist is complete as confirmed by you - it is not an eligibility guarantee.
          </p>

          {error && (
            <div className={`text-xs px-3 py-2 rounded-lg mb-4 flex items-center gap-2 ${isDarkMode ? 'bg-amber-950 text-amber-300' : 'bg-amber-50 text-amber-700'}`}>
              <AlertCircle className="w-4 h-4 shrink-0" /> {error}
            </div>
          )}

          <div className="space-y-3">
            {selected.requirements.map((r) => (
              <div key={r.id} className={`border rounded-lg p-3 ${isDarkMode ? 'border-slate-800' : 'border-slate-200'}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className={`text-sm font-medium ${text}`}>{r.label}</span>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full ${STATUS_STYLE[r.status]}`}>
                    {STATUS_LABEL[r.status]}
                  </span>
                </div>
                <p className={`text-[11px] ${sub} mt-1 flex items-center gap-1`}>
                  {r.source.type === 'tender_clause'
                    ? <FileSearch className="w-3 h-3 shrink-0" />
                    : <BookOpen className="w-3 h-3 shrink-0" />}
                  {r.source.type === 'tender_clause' ? 'Tender clause' : 'Official rule'}: {r.source.reference}
                  {r.source.url && (
                    <a href={r.source.url} target="_blank" rel="noopener noreferrer"
                      className="text-emerald-600 hover:underline ml-1">
                      official source
                    </a>
                  )}
                </p>
                {r.status === 'satisfied' ? (
                  <p className={`text-xs mt-2 flex items-center gap-1 ${isDarkMode ? 'text-emerald-400' : 'text-emerald-700'}`}>
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    Evidence: {r.evidenceNote || 'recorded'}
                  </p>
                ) : r.status === 'not_applicable' ? (
                  <p className={`text-xs mt-2 ${sub}`}>
                    Recorded not applicable to this tender: {r.notApplicableReason}
                  </p>
                ) : (
                  <div className="space-y-2 mt-2">
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        className={input}
                        placeholder="Evidence note (e.g. document name and date)"
                        value={evidenceDrafts[r.id] || ''}
                        onChange={(e) => setEvidenceDrafts(prev => ({ ...prev, [r.id]: e.target.value }))}
                      />
                      <button
                        onClick={() => satisfy(r.id)}
                        className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium whitespace-nowrap"
                      >
                        Mark satisfied
                      </button>
                      <button
                        onClick={() => setNaOpen(prev => ({ ...prev, [r.id]: !prev[r.id] }))}
                        className={`px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap border ${isDarkMode ? 'border-slate-700 text-slate-300 hover:bg-slate-800' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}
                      >
                        Not applicable
                      </button>
                    </div>
                    {naOpen[r.id] && (
                      <div className="flex flex-col sm:flex-row gap-2">
                        <input
                          className={input}
                          placeholder="Why does this not apply to this tender? (required)"
                          value={naDrafts[r.id] || ''}
                          onChange={(e) => setNaDrafts(prev => ({ ...prev, [r.id]: e.target.value }))}
                        />
                        <button
                          onClick={() => markNotApplicable(r.id)}
                          className={`px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap ${isDarkMode ? 'bg-slate-700 hover:bg-slate-600 text-slate-100' : 'bg-slate-200 hover:bg-slate-300 text-slate-700'}`}
                        >
                          Record not applicable
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Add a requirement from the tender document */}
          <div className={`mt-5 pt-4 border-t ${isDarkMode ? 'border-slate-800' : 'border-slate-200'}`}>
            <h3 className={`text-sm font-semibold ${text} mb-2 flex items-center gap-2`}>
              <Plus className="w-4 h-4" /> Add a requirement from this tender
            </h3>
            <div className="grid sm:grid-cols-2 gap-2 mb-2">
              <input className={input} placeholder="Requirement (e.g. SBD 4 declaration)"
                value={reqLabel} onChange={(e) => setReqLabel(e.target.value)} />
              <select className={input} value={reqSourceType}
                onChange={(e) => setReqSourceType(e.target.value as any)}>
                <option value="tender_clause">Tender clause</option>
                <option value="official_rule">Official rule</option>
              </select>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <input className={input}
                placeholder={reqSourceType === 'tender_clause' ? 'Clause reference (e.g. page 12, item 3.2)' : 'Rule reference (e.g. PPPFA 2022 regulation 4)'}
                value={reqReference} onChange={(e) => setReqReference(e.target.value)} />
              <button
                onClick={addRequirement}
                disabled={!reqLabel.trim() || !reqReference.trim()}
                className="px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 disabled:opacity-40 text-white text-xs font-medium whitespace-nowrap"
              >
                Add requirement
              </button>
            </div>
          </div>

          {/* Mark ready */}
          {selected.state !== 'ready' && (
            <div className="mt-5">
              <button
                onClick={markReady}
                disabled={!readiness?.ready}
                className="w-full py-2.5 px-4 rounded-lg font-medium text-sm flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white"
              >
                <Send className="w-4 h-4" />
                Mark checklist ready
              </button>
              {readiness && !readiness.ready && (
                <p className={`text-[11px] ${sub} mt-2`}>
                  Blocked by {readiness.blockers.length} open requirement{readiness.blockers.length === 1 ? '' : 's'}.
                  Drafts save freely; ready needs every requirement resolved.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ---------- List + create view ----------
  return (
    <div className="space-y-4">
      <div className={`${card} border rounded-xl p-6`}>
        <div className="flex items-center gap-2 mb-1">
          <ClipboardCheck className="w-5 h-5 text-emerald-600" />
          <h2 className={`font-semibold text-lg ${text}`}>Bid Readiness</h2>
        </div>
        <p className={`text-xs ${sub} mb-4`}>
          One checklist per tender you intend to bid on. Every requirement names its source -
          a tender clause or an official rule - and a human confirms each one with evidence.
          Incomplete work always saves as a draft.
        </p>

        {error && (
          <div className={`text-xs px-3 py-2 rounded-lg mb-4 flex items-center gap-2 ${isDarkMode ? 'bg-amber-950 text-amber-300' : 'bg-amber-50 text-amber-700'}`}>
            <AlertCircle className="w-4 h-4 shrink-0" /> {error}
          </div>
        )}

        {loading ? (
          <p className={`text-sm ${sub} flex items-center gap-2`}><RefreshCw className="w-4 h-4 animate-spin" /> Loading...</p>
        ) : applications.length === 0 ? (
          <p className={`text-sm ${sub}`}>No bid applications yet. Start one below.</p>
        ) : (
          <div className="space-y-2">
            {applications.map((a) => {
              const done = a.requirements.filter(isResolved).length;
              return (
                <button key={a.id} onClick={() => openApplication(a.id)}
                  className={`w-full text-left border rounded-lg p-3 hover:border-emerald-500 transition-colors ${isDarkMode ? 'border-slate-800' : 'border-slate-200'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-sm font-medium ${text} flex items-center gap-2`}>
                      <FileText className="w-4 h-4 shrink-0 text-slate-400" /> {a.title}
                    </span>
                    <span className={`text-[11px] ${sub}`}>
                      {a.state === 'ready' ? 'Ready' : `Draft - ${done}/${a.requirements.length} satisfied`}
                    </span>
                  </div>
                  <p className={`text-[11px] ${sub} font-mono mt-0.5`}>{a.tenderRef}</p>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className={`${card} border rounded-xl p-6`}>
        <h3 className={`text-sm font-semibold ${text} mb-3 flex items-center gap-2`}>
          <Plus className="w-4 h-4" /> Start a bid application
        </h3>
        <div className="grid sm:grid-cols-2 gap-2 mb-2">
          <input className={input} placeholder="Tender reference (e.g. WCG/DOTP-ADV/2026/01)"
            value={newRef} onChange={(e) => setNewRef(e.target.value)} />
          <input className={input} placeholder="Short title (e.g. WCG advertising services)"
            value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
        </div>
        <textarea
          className={`${input} mb-2`}
          rows={3}
          placeholder="Optional: paste tender text here. Common official requirements (CSD, SARS TCS, cidb where the tender mentions it) are pre-filled with their official sources - you confirm which ones apply to this tender."
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
        />
        <button
          onClick={createApplication}
          disabled={!newRef.trim() || !newTitle.trim()}
          className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-sm font-medium"
        >
          Save draft
        </button>
      </div>
    </div>
  );
};
