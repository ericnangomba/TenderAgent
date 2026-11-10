import React, { useState, useEffect } from 'react';
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
import { IUserProfile, ITender, IBidResponseSkeleton, ISentrySpanRecord } from './lib/types/tender';
import { SAMPLE_TENDERS } from './lib/data/sampleTenders';
import { generateBidResponseSkeleton } from './lib/utils/skeletonGenerator';

export default function App() {
  const [activeTab, setActiveTab] = useState<TabKey>('analyzer');
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

  // Restore an existing session on load.
  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (d?.success) setAuth({ tenantId: d.tenantId, email: d.email, userId: d.userId, isAdmin: Boolean(d.isAdmin) });
      })
      .catch(() => undefined);
  }, []);

  const handleAuthChange = (next: AuthState | null) => {
    setAuth(next);
    // Profile is per-workspace once signed in - reload it for the new identity.
    fetch('/api/profile')
      .then(r => r.json())
      .then(d => { if (d.success && d.profile) setUserProfile(d.profile); })
      .catch(() => undefined);
  };

  // POPIA SME Profile
  // Empty until the workspace saves real company details; no sample company
  // is ever presented as a signed-in account's own data.
  const [userProfile, setUserProfile] = useState<IUserProfile>({} as IUserProfile);

  // Load profile from server on mount
  useEffect(() => {
    fetch('/api/profile')
      .then(r => r.json())
      .then(data => {
        if (data.success && data.profile) {
          setUserProfile(data.profile);
        }
      })
      .catch(err => console.warn('[App] Profile fetch fallback:', err));
  }, []);

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
    return <Landing onAuthChange={handleAuthChange} />;
  }

  return (
    <div className={`min-h-screen flex ${isDarkMode ? 'dark bg-slate-950 text-slate-100' : 'bg-[#FBFAF7] text-slate-900'} antialiased font-sans selection:bg-emerald-200 selection:text-emerald-900`}>

      {/* Sidebar Navigation */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isOpen={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
        isDarkMode={isDarkMode}
        userProfile={userProfile}
        isAdmin={Boolean(auth?.isAdmin)}
        isSampleProfile={!auth}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">

        {/* Unclouded Clean Header */}
        <Header
          activeTab={activeTab}
          onOpenMobileSidebar={() => setIsMobileSidebarOpen(true)}
          isDarkMode={isDarkMode}
          isAdmin={Boolean(auth?.isAdmin)}
          companyName={userProfile.companyName || auth?.email || ''}
          taxPinOnFile={Boolean(userProfile.taxComplianceStatusPin)}
          isSampleProfile={!auth}
        />

        {/* View Workspace */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {activeTab === 'analyzer' && (
            <RfpAnalyzer
              userProfile={userProfile}
              onOpenSkeleton={handleOpenSkeleton}
              onSwitchToCalculator={handleSwitchToCalculator}
              initialSelectedTender={selectedTender}
              isAdmin={Boolean(auth?.isAdmin)}
              isDarkMode={isDarkMode}
            />
          )}

          {activeTab === 'discovery' && (
            <TenderDiscovery
              onSelectTenderForAnalysis={handleSelectTenderFromDiscovery}
              isDarkMode={isDarkMode}
            />
          )}

          {activeTab === 'finetuning' && auth?.isAdmin && (
            <FineTuningStudio
              isDarkMode={isDarkMode}
            />
          )}

          {activeTab === 'readiness' && (
            <BidReadiness
              isDarkMode={isDarkMode}
              signedIn={Boolean(auth)}
              onOpenAccount={() => setActiveTab('account')}
            />
          )}

          {activeTab === 'calculator' && (
            <PointsCalculator
              initialSystem={calculatorSystem}
              tenderTitle={calculatorTenderTitle}
              userBbbeeLevel={userProfile.bbbeeLevel}
              isDarkMode={isDarkMode}
            />
          )}

          {activeTab === 'vault' && (
            <ProfileVault
              userProfile={userProfile}
              onUpdateProfile={(updated) => setUserProfile(updated)}
              isDarkMode={isDarkMode}
            />
          )}

          {activeTab === 'sbd' && (
            <SbdFormsGuide
              isDarkMode={isDarkMode}
            />
          )}

          {activeTab === 'tracing' && auth?.isAdmin && (
            <SentryTraceViewer
              recentSpans={recentSpans}
              isDarkMode={isDarkMode}
            />
          )}

          {activeTab === 'settings' && auth?.isAdmin && (
            <Settings
              isDarkMode={isDarkMode}
            />
          )}

          {activeTab === 'admin' && auth?.isAdmin && (
            <AdminDashboard />
          )}
          {activeTab === 'account' && (
            <Account
              isDarkMode={isDarkMode}
              auth={auth}
              onAuthChange={handleAuthChange}
            />
          )}
        </main>

        {/* Footer */}
        <footer className={`py-5 px-6 border-t text-xs ${isDarkMode ? 'border-slate-800 bg-slate-950 text-slate-500' : 'border-slate-200 bg-white text-slate-500'
          }`}>
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
            <span>TenderAgent · South African tender workspace</span>
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
      <PwaInstallPrompt isDarkMode={isDarkMode} />

    </div>
  );
}
