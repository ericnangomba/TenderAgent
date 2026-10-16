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
import { BidSkeletonModal } from './components/BidSkeletonModal';
import { PwaInstallPrompt } from './components/PwaInstallPrompt';
import { IUserProfile, ITender, IBidResponseSkeleton, ISentrySpanRecord } from './lib/types/tender';
import { SAMPLE_TENDERS } from './lib/data/sampleTenders';
import { generateBidResponseSkeleton } from './lib/utils/skeletonGenerator';

export default function App() {
  const [activeTab, setActiveTab] = useState<TabKey>('analyzer');
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState<boolean>(false);
  const [isDarkMode, setIsDarkMode] = useState<boolean>(false); // Light theme default
  const [selectedTender, setSelectedTender] = useState<ITender | null>(SAMPLE_TENDERS[0]);
  const [calculatorSystem, setCalculatorSystem] = useState<'80/20' | '90/10'>('80/20');
  const [calculatorTenderTitle, setCalculatorTenderTitle] = useState<string>('National Treasury RT57-2026-ICT');
  const [activeSkeleton, setActiveSkeleton] = useState<IBidResponseSkeleton | null>(null);
  const [isSkeletonModalOpen, setIsSkeletonModalOpen] = useState<boolean>(false);
  const [recentSpans, setRecentSpans] = useState<ISentrySpanRecord[]>([]);

  // POPIA SME Profile
  const [userProfile, setUserProfile] = useState<IUserProfile>({
    companyName: 'Apex Strategic Solutions (Pty) Ltd',
    registrationNumber: '2023/849201/07',
    csdNumber: 'MAAA0821945',
    taxComplianceStatusPin: 'TCS-9482104-Z',
    bbbeeLevel: 1,
    bbbeeType: 'EME',
    cidbGrading: '7CE PE',
    coidaGoodStandingValid: true,
    coidaExpiryDate: '2027-04-30',
    contactEmail: 'tenders@apexstrategic.co.za',
    contactPhone: '+27 (0)11 482 9200',
    province: 'Gauteng'
  });

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

  const toggleTheme = () => {
    setIsDarkMode(prev => !prev);
  };

  return (
    <div className={`min-h-screen flex ${isDarkMode ? 'dark bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'} antialiased font-sans selection:bg-emerald-200 selection:text-emerald-900`}>

      {/* Sidebar Navigation */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isOpen={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
        isDarkMode={isDarkMode}
        onToggleTheme={toggleTheme}
        userProfile={userProfile}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">

        {/* Unclouded Clean Header */}
        <Header
          activeTab={activeTab}
          onOpenMobileSidebar={() => setIsMobileSidebarOpen(true)}
          isDarkMode={isDarkMode}
          onToggleTheme={toggleTheme}
          onOpenSkeletonModal={() => handleOpenSkeleton(activeSkeleton || undefined)}
          hasAnalyzedTender={Boolean(selectedTender)}
          companyName={userProfile.companyName}
        />

        {/* View Workspace */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {activeTab === 'analyzer' && (
            <RfpAnalyzer
              userProfile={userProfile}
              onOpenSkeleton={handleOpenSkeleton}
              onSwitchToCalculator={handleSwitchToCalculator}
              initialSelectedTender={selectedTender}
              isDarkMode={isDarkMode}
            />
          )}

          {activeTab === 'discovery' && (
            <TenderDiscovery
              onSelectTenderForAnalysis={handleSelectTenderFromDiscovery}
              isDarkMode={isDarkMode}
            />
          )}

          {activeTab === 'finetuning' && (
            <FineTuningStudio
              isDarkMode={isDarkMode}
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

          {activeTab === 'tracing' && (
            <SentryTraceViewer
              recentSpans={recentSpans}
              isDarkMode={isDarkMode}
            />
          )}

          {activeTab === 'settings' && (
            <Settings
              isDarkMode={isDarkMode}
              onToggleTheme={toggleTheme}
            />
          )}
        </main>

        {/* Clean Footer */}
        <footer className={`py-5 px-6 border-t text-xs ${isDarkMode ? 'border-slate-800 bg-slate-950 text-slate-500' : 'border-slate-200 bg-white text-slate-500'
          }`}>
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span>🇿🇦 TenderAgent Micro-SaaS</span>
              <span>·</span>
              <span>POPIA Act 4 of 2013 Sandboxed</span>
              <span>·</span>
              <span>PPPFA & Preferential Procurement Regs 2022</span>
            </div>
            <div>
              Mastra Agent SDK · Gemma 2 AI Engine · Sentry Custom Spans
            </div>
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
