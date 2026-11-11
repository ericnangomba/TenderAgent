import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Sidebar, TabKey } from './components/Sidebar';
import { Header } from './components/Header';
import { RfpAnalyzer } from './components/RfpAnalyzer';
import { TenderDiscovery } from './components/TenderDiscovery';
import { PointsCalculator } from './components/PointsCalculator';
import { FineTuningStudio } from './components/FineTuningStudio';
import { ProfileVault } from './components/ProfileVault';
import { SbdFormsGuide } from './components/SbdFormsGuide';
import { SentryTraceViewer } from './components/SentryTraceViewer';
import { Settings } from './components/Settings';
import { Account } from './components/Account';
import { AuthState } from './components/AuthCard';
import { Landing } from './components/Landing';
import { AdminDashboard } from './components/AdminDashboard';
import { BidReadiness } from './components/BidReadiness';
import { BidSkeletonModal } from './components/BidSkeletonModal';
import { PwaInstallPrompt } from './components/PwaInstallPrompt';
import { SwUpdatePrompt } from './components/SwUpdatePrompt';
import { ViewErrorBoundary } from './components/ViewErrorBoundary';
import { IUserProfile, ITender, IBidResponseSkeleton, ISentrySpanRecord } from './lib/types/tender';
import { SAMPLE_TENDERS } from './lib/data/sampleTenders';
import { generateBidResponseSkeleton } from './lib/utils/skeletonGenerator';

import { toolsAvailable, accessGuidance, type WorkspaceAccount } from './lib/access/workspaceAccess';

export default function App() {
  const [activeTab, setActiveTab] = useState<TabKey>('account');
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState<boolean>(false);
  // Light-first product: theme toggle removed by product decision (redesign).
  const isDarkMode = false;
  const [selectedTender, setSelectedTender] = useState<ITender | null>(null);
  const [calculatorSystem, setCalculatorSystem] = useState<'80/20' | '90/10'>('80/20');
  const [calculatorTenderTitle, setCalculatorTenderTitle] = useState<string>('National Treasury RT57-2026-ICT');
  const [activeSkeleton, setActiveSkeleton] = useState<IBidResponseSkeleton | null>(null);
  const [isSkeletonModalOpen, setIsSkeletonModalOpen] = useState<boolean>(false);
  const [recentSpans, setRecentSpans] = useState<ISentrySpanRecord[]>([]);
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [customerMode, setCustomerMode] = useState(false);
  const operationsMode = Boolean(auth?.isAdmin) && !customerMode;

  const currentOwner = useRef(auth?.userId);
  currentOwner.current = auth?.userId;
  const [access, setAccess] = useState<WorkspaceAccount | null>(null);
  const [accessFailed, setAccessFailed] = useState(false);
  const refreshAccess = useCallback(async () => {
    const owner = auth?.userId;
    if (!owner || auth?.isAdmin) return;
    try {
      const response = await fetch('/api/account', { cache: 'no-store' });
      if (!response.ok) throw new Error('access');
      const data = await response.json();
      if (!data.success || !data.account) throw new Error('access');
      if (currentOwner.current === owner) { setAccess(data.account); setAccessFailed(false); }
    } catch { if (currentOwner.current === owner) { setAccess(null); setAccessFailed(true); } }
  }, [auth?.userId, auth?.isAdmin]);
  useEffect(() => {
    if (!auth || auth.isAdmin) return;
    // No polling: recheck on entry and on returning to this browser tab.
    let current = true;
    const check = async () => {
      try {
        const response = await fetch('/api/account', { cache: 'no-store' });
        if (!response.ok) throw new Error('access');
        const data = await response.json();
        if (!data.success || !data.account) throw new Error('access');
        if (current) { setAccess(data.account); setAccessFailed(false); }
      } catch { if (current) { setAccess(null); setAccessFailed(true); } }
    };
    void check();
    const visible = () => { if (document.visibilityState === 'visible') void check(); };
    document.addEventListener('visibilitychange', visible);
    return () => { current = false; document.removeEventListener('visibilitychange', visible); };
  }, [auth?.userId, auth?.isAdmin]);
  useEffect(() => {
    const end = access?.entitlement?.currentPeriodEnd;
    if (!end || !toolsAvailable(access)) return;
    const timer = window.setTimeout(() => setAccess(current => current ? { ...current, entitlement: { ...current.entitlement, effectiveStatus: 'cancelled' } } : null), Math.min(Math.max(0, Date.parse(end) - Date.now()), 2147483647));
    return () => window.clearTimeout(timer);
  }, [access]);
  const toolsUnlocked = toolsAvailable(access, Boolean(auth?.isAdmin));
  const guidance = accessGuidance(access, accessFailed);
  const safeTab = toolsUnlocked || ['account', 'vault'].includes(activeTab) ? activeTab : 'account';
  const navigate = (tab: TabKey) => setActiveTab(toolsUnlocked || ['account', 'vault'].includes(tab) ? tab : 'account');

  // Restore an existing session on load.
  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (d?.success) { setAuth({ tenantId: d.tenantId, email: d.email, userId: d.userId, isAdmin: Boolean(d.isAdmin) }); setActiveTab(d.isAdmin ? 'admin' : 'account'); }
      })
      .catch(() => undefined);
  }, []);

  const handleAuthChange = (next: AuthState | null) => {
    setAccess(null); setAccessFailed(false);
    setAuth(next);
    setCustomerMode(false);
    setActiveTab(next?.isAdmin ? 'admin' : 'account');
    setUserProfile(EMPTY_PROFILE);
    setProfileStatus('loading');
  };

  // POPIA SME Profile
  // Empty until the workspace saves real company details; no sample company
  // is ever presented as a signed-in account's own data.
  // A complete empty profile (never partial): views render it even when the
  // profile fetch fails offline, so no account view can crash on a missing
  // field. Empty values - no sample company is ever presented as the account.
  const EMPTY_PROFILE: IUserProfile = {
    companyName: '', registrationNumber: '', csdNumber: '', taxComplianceStatusPin: '',
    bbbeeLevel: 0, bbbeeType: 'EME', cidbGrading: '', coidaGoodStandingValid: false,
    coidaExpiryDate: '', contactEmail: '', contactPhone: '', province: '',
  };
  const [userProfile, setUserProfile] = useState<IUserProfile>(EMPTY_PROFILE);
  // 'unavailable' = we could not load the account's profile (offline/failure).
  // Distinct from a KNOWN empty profile: views must not treat it as empty or overwrite it.
  const [profileStatus, setProfileStatus] = useState<'loading' | 'ready' | 'unavailable'>('loading');

  // Customer profile is not an operator onboarding dependency.
  useEffect(() => {
    if (!auth || operationsMode) { setUserProfile(EMPTY_PROFILE); return; }
    let current = true;
    fetch('/api/profile')
      .then(r => r.json())
      .then(data => {
        if (!current) return;
        if (data.success && data.profile) {
          setUserProfile(prev => ({ ...prev, ...data.profile }));
          setProfileStatus('ready');
        } else {
          setProfileStatus('unavailable');
        }
      })
      .catch(() => { if (current) setProfileStatus('unavailable'); });
    return () => { current = false; };
  }, [auth?.userId, operationsMode]);

  const handleOpenSkeleton = (skeleton?: IBidResponseSkeleton) => {
    if (skeleton && skeleton.sections) {
      setActiveSkeleton(skeleton);
    } else {
      const generated = generateBidResponseSkeleton(selectedTender || SAMPLE_TENDERS[0], userProfile);
      setActiveSkeleton(generated);
    }
    setIsSkeletonModalOpen(true);
  };

  const handleSelectTenderFromDiscovery = (tender: Partial<ITender>) => {
    const fullTender: ITender = {
      title: tender.title || 'South African Public Sector RFP',
      referenceNumber: tender.referenceNumber || 'RFP-2026',
      issuingDepartment: tender.issuingDepartment || 'Organ of State',
      closingDate: tender.closingDate || '2026-12-01',
      category: tender.category || 'ICT & Technology',
      province: tender.province || 'National',
      cidbGradingRequired: tender.cidbGradingRequired,
      extractedComplianceChecklist: {
        csdRequired: true,
        sarsPinRequired: true,
        bbbeeRequired: true,
        coidaRequired: Boolean(tender.cidbGradingRequired),
        additionalDocuments: ['SBD 1', 'SBD 4', 'SBD 6.1']
      },
      evaluationCriteria: {
        preferencePointsSystem: '80/20',
        technicalThresholdPercentage: 70
      },
      rawTextExcerpt: tender.rawTextExcerpt || tender.title,
      createdAt: new Date().toISOString()
    };
    setSelectedTender(fullTender);
    setActiveTab('analyzer');
  };

  const handleSwitchToCalculator = (pointsSystem: '80/20' | '90/10', tenderTitle: string) => {
    setCalculatorSystem(pointsSystem);
    setCalculatorTenderTitle(tenderTitle);
    setActiveTab('calculator');
  };

  // Signed-out visitors see the public landing page only. The customer
  // dashboard and all operator tooling stay behind a live session.
  if (!auth) {
    // Install prompt lives pre-auth: the banner belongs on the landing, never
    // over the workspace where it would cover the form.
    return (
      <>
        <Landing onAuthChange={handleAuthChange} />
        <PwaInstallPrompt isDarkMode={isDarkMode} showInstall />
        <SwUpdatePrompt isDarkMode={isDarkMode} />
      </>
    );
  }

  return (
    <div className={`min-h-screen flex ${isDarkMode ? 'dark bg-slate-950 text-slate-100' : 'bg-[#FBFAF7] text-slate-900'} antialiased font-sans selection:bg-emerald-200 selection:text-emerald-900`}>

      {/* Sidebar Navigation */}
      <Sidebar
        activeTab={safeTab}
        setActiveTab={navigate}
        isOpen={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
        isDarkMode={isDarkMode}
        userProfile={userProfile}
        isAdmin={Boolean(auth?.isAdmin)}
        operationsMode={operationsMode}
        toolsLocked={!toolsUnlocked}
        onSwitchWorkspace={() => { setCustomerMode(!customerMode); setActiveTab(customerMode ? 'admin' : 'analyzer'); }}
        isSampleProfile={!auth}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">

        {/* Unclouded Clean Header */}
        <Header
          activeTab={safeTab}
          onOpenMobileSidebar={() => setIsMobileSidebarOpen(true)}
          isDarkMode={isDarkMode}
          isAdmin={Boolean(auth?.isAdmin)}
          operationsMode={operationsMode}
          companyName={operationsMode ? auth.email : userProfile.companyName || auth.email}
          taxPinOnFile={Boolean(userProfile.taxComplianceStatusPin)}
          isSampleProfile={!auth}
        />

        {/* View Workspace: one view's failure must never blank the app */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {!operationsMode && !toolsUnlocked && <section role="status" aria-live="polite" className="mb-6 rounded-2xl border-2 border-amber-400 bg-amber-50 p-5 text-amber-950">
            <h2 className="text-xl font-semibold">{guidance.title}</h2>
            <p className="mt-2 text-sm leading-relaxed">{guidance.body}</p>
            <div className="mt-4 flex flex-wrap gap-3">
              {safeTab === 'account' && access?.beta?.redeemAvailable && access.entitlement?.effectiveStatus === 'none' && <a href="#beta-code" className="rounded-lg bg-emerald-800 px-4 py-2 text-sm font-medium text-white">Enter beta code</a>}
              {safeTab !== 'account' && <button onClick={() => navigate('account')} className="rounded-lg bg-emerald-800 px-4 py-2 text-sm font-medium text-white">Open Account</button>}
              <button onClick={() => navigate('vault')} className="rounded-lg border border-amber-700 bg-white px-4 py-2 text-sm font-medium">Complete company information</button>
              {accessFailed && <button onClick={refreshAccess} className="rounded-lg border border-amber-700 bg-white px-4 py-2 text-sm">Retry access check</button>}
            </div>
          </section>}
          <ViewErrorBoundary key={safeTab} isDarkMode={isDarkMode}>
          {safeTab === 'analyzer' && (
            <RfpAnalyzer
              userProfile={userProfile}
              onOpenSkeleton={handleOpenSkeleton}
              onSwitchToCalculator={handleSwitchToCalculator}
              initialSelectedTender={selectedTender}
              isAdmin={Boolean(auth?.isAdmin)}
              isDarkMode={isDarkMode}
            />
          )}

          {safeTab === 'discovery' && (
            <TenderDiscovery
              onSelectTenderForAnalysis={handleSelectTenderFromDiscovery}
              isDarkMode={isDarkMode}
            />
          )}

          {safeTab === 'finetuning' && auth?.isAdmin && (
            <FineTuningStudio
              isDarkMode={isDarkMode}
            />
          )}

          {safeTab === 'readiness' && (
            <BidReadiness
              isDarkMode={isDarkMode}
              signedIn={Boolean(auth)}
              onOpenAccount={() => setActiveTab('account')}
            />
          )}

          {safeTab === 'calculator' && (
            <PointsCalculator
              initialSystem={calculatorSystem}
              tenderTitle={calculatorTenderTitle}
              userBbbeeLevel={userProfile.bbbeeLevel}
              isDarkMode={isDarkMode}
            />
          )}

          {safeTab === 'vault' && (
            <ProfileVault
              userProfile={userProfile}
              profileStatus={profileStatus}
              onUpdateProfile={(updated) => setUserProfile(updated)}
              isDarkMode={isDarkMode}
            />
          )}

          {safeTab === 'sbd' && (
            <SbdFormsGuide
              isDarkMode={isDarkMode}
            />
          )}

          {safeTab === 'tracing' && auth?.isAdmin && (
            <SentryTraceViewer
              recentSpans={recentSpans}
              isDarkMode={isDarkMode}
            />
          )}

          {safeTab === 'settings' && auth?.isAdmin && (
            <Settings
              isDarkMode={isDarkMode}
            />
          )}

          {safeTab === 'admin' && auth?.isAdmin && (
            <AdminDashboard />
          )}
          {safeTab === 'account' && (
            <Account
              isDarkMode={isDarkMode}
              auth={auth}
              onAuthChange={handleAuthChange}
              operationsMode={operationsMode}
              accessInfo={access}
              onAccessChange={setAccess}
            />
          )}
                  </ViewErrorBoundary>
          </main>

        {/* Footer */}
        <footer className={`py-5 px-6 border-t text-xs ${isDarkMode ? 'border-slate-800 bg-slate-950 text-slate-500' : 'border-slate-200 bg-white text-slate-500'
          }`}>
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
            <span>{operationsMode ? 'TenderAgent · Operations' : 'TenderAgent · South African tender workspace'}</span>
          </div>
        </footer>

      </div>

      {/* Bid Response Skeleton Modal */}
      {isSkeletonModalOpen && (
        <BidSkeletonModal
          skeleton={activeSkeleton}
          onClose={() => setIsSkeletonModalOpen(false)}
          isDarkMode={isDarkMode}
        />
      )}

      {/* PWA Mobile Installation & Offline Status Prompt */}
      <PwaInstallPrompt isDarkMode={isDarkMode} showInstall={false} />
      <SwUpdatePrompt isDarkMode={isDarkMode} />

    </div>
  );
}
