import React, { useState } from 'react';
import { FileText, CheckCircle2, AlertCircle, Copy, Check, Download, ExternalLink, HelpCircle, BookOpen, Scale, Building, ClipboardList } from 'lucide-react';
import { PROCUREMENT_GUIDANCE, PROCUREMENT_FRAMEWORK_NOTE, type GuidanceLayer } from '../lib/data/procurementGuidance';

interface SbdFormsGuideProps {
  isDarkMode: boolean;
}

export const SbdFormsGuide: React.FC<SbdFormsGuideProps> = ({ isDarkMode }) => {
  const [activeForm, setActiveForm] = useState<string>('sbd4');
  const [copied, setCopied] = useState(false);

  const formsData = [
    {
      id: 'sbd1',
      code: 'SBD 1',
      title: 'Invitation to Bid & Administrative Responsiveness',
      authority: 'National Treasury Transversal Contracting',
      mandatory: true,
      summary: 'Part A contains bid specifications and Part B contains terms and conditions for bidding. Mandatory returnable signed by authorized company representative.',
      keyClauses: [
        'Submission confirms unconditional acceptance of General Conditions of Contract (GCC)',
        'Tax Compliance Requirement: TCS PIN or verified CSD MAAA registration',
        'Foreign suppliers must answer questionnaire regarding permanent establishment in RSA'
      ],
      sampleTemplate: `STANDARD BIDDING DOCUMENT 1 (SBD 1)
PART A: INVITATION TO BID
BID NUMBER: [TENDER_REF]
CLOSING DATE: [CLOSING_DATE]  CLOSING TIME: 11:00 AM (SAST)
DESCRIPTION: [TENDER_TITLE]

BID RESPONSE DOCUMENTS MUST BE DEPOSITED IN THE BID BOX SITUATED AT:
[ORGAN_OF_STATE_ADDRESS]

BIDDER SUMMARY:
NAME OF BIDDER: [YOUR REGISTERED NAME OR TRADING NAME]
POSTAL ADDRESS: [POSTAL ADDRESS]
STREET ADDRESS: [STREET ADDRESS]
TELEPHONE NUMBER: [CONTACT NUMBER]
TAX COMPLIANCE STATUS PIN: [YOUR SARS TCS PIN]
CENTRAL SUPPLIER DATABASE (CSD) NO: [YOUR MAAA NUMBER]
B-BBEE STATUS LEVEL: [LEVEL PER YOUR AFFIDAVIT OR CERTIFICATE]`
    },
    {
      id: 'sbd4',
      code: 'SBD 4',
      title: 'Bidder\'s Declaration of Interest (Consolidated)',
      authority: 'National Treasury SCM Instruction Note No. 03 of 2021/2022',
      mandatory: true,
      summary: 'Consolidates old SBD 4, SBD 8 (past SCM practices), and SBD 9 (prohibition of bid rigging) into a single strict statutory declaration.',
      keyClauses: [
        'Clause 2.1: Disclose whether any director/trustee/shareholder is employed by the organ of state',
        'Clause 2.2: Disclose relationships with any person involved in evaluation or adjudication',
        'Clause 3.1: Confirm bid is arrived at independently without consultation or collusive agreement',
        'Failure to disclose truthfully leads to immediate blacklisting on National Treasury Register for Tender Defaulters'
      ],
      sampleTemplate: `STANDARD BIDDING DOCUMENT 4 (SBD 4)
BIDDER'S DECLARATION OF INTEREST & INDEPENDENT BID DETERMINATION

1. PURPOSE OF THE FORM
Any person (natural or juristic) may make an offer or offers in terms of this invitation to bid. In line with the principles of transparency, accountability, and ethics as enshrined in the Constitution of the Republic of South Africa.

2. BIDDER'S DECLARATION
2.1 Is the bidder, or any of its directors / trustees / shareholders / members / partners or any person having a controlling interest in the enterprise, employed by the state?
[ ] YES  [X] NO

2.2 Do you, or any person connected with the bidder, have a relationship with any person who is involved in the evaluation and or adjudication of this bid?
[ ] YES  [X] NO

3. DECLARATION OF INDEPENDENT BID RIGGING PROHIBITION
3.1 The bidder has arrived at the accompanying bid independently from, and without consultation, communication, agreement or arrangement with any competitor.
3.2 In addition, there have been no consultations, communications, agreements or arrangements with any competitor regarding the quality, quantity, specifications, prices, including methods, factors or formulas used to calculate prices.`
    },
    {
      id: 'sbd6.1',
      code: 'SBD 6.1',
      title: 'Preference Points Claim Form (PPR 2022)',
      authority: 'Preferential Procurement Regulations, 2022 (PPPFA)',
      mandatory: true,
      summary: 'Serves as a claim form for preference points for specific goals under the 80/20 or 90/10 point allocation systems.',
      keyClauses: [
        'Points for tenders equal to or below R50 Million: 80/20 Preference Point System',
        'Points for tenders above R50 Million: 90/10 Preference Point System',
        'Specific goals are defined by the organ of state in each tender - B-BBEE level is one possible goal, not automatic',
        'Evidence for a claimed goal is usually a SANAS-accredited certificate or sworn affidavit, as the tender specifies'
      ],
      sampleTemplate: `STANDARD BIDDING DOCUMENT 6.1 (SBD 6.1)
PREFERENCE POINTS CLAIM FORM IN TERMS OF THE PREFERENTIAL PROCUREMENT REGULATIONS 2022

1. GENERAL CONDITIONS
1.1 The following preference point systems are applicable to invitations to tender:
- the 80/20 system for requirements with a Rand value of up to R50 000 000 (all applicable taxes included); or
- the 90/10 system for requirements with a Rand value above R50 000 000 (all applicable taxes included).

2. POINTS AWARDED FOR PRICE (THE 80/20 OR 90/10 PREFERENCE POINT SYSTEMS)
Ps = 80 [ 1 - (Pt - Pmin) / Pmin ]

3. POINTS AWARDED FOR SPECIFIC GOALS (B-BBEE LEVEL ALLOCATION)
B-BBEE Status Level 1 Contributor: 20 Points Claimed (80/20) or 10 Points Claimed (90/10)
Supporting Evidence Attached: Commissioner of Oaths stamped EME B-BBEE Sworn Affidavit.`
    },
    {
      id: 'cidb',
      code: 'CIDB Matrix',
      title: 'Construction Industry Development Board Grading (public sector)',
      authority: 'CIDB Act 38 of 2000',
      mandatory: false,
      summary: 'Specifies contractor capability limits for public sector civil and building engineering works.',
      keyClauses: [
        'Grade 1: Works up to R 500,000',
        'Grade 2: Works up to R 1,000,000',
        'Grade 3: Works up to R 3,000,000',
        'Grade 4: Works up to R 6,000,000',
        'Grade 5: Works up to R 10,000,000',
        'Grade 6: Works up to R 20,000,000',
        'Grade 7: Works up to R 60,000,000',
        'Grade 8: Works up to R 200,000,000',
        'Grade 9: Works with no limit',
        'Values per CIDB May 2026 guide (checked 10 Nov 2026); grade is per class of works',
        'Available-capital criteria for grades 4-6 differ between CIDB documents - verify with CIDB'
      ],
      sampleTemplate: `CIDB CONTRACTOR GRADING DESIGNATIONS (SOUTH AFRICA)
Class of Works Codes:
- CE: Civil Engineering (Roads, bridges, water infrastructure)
- GB: General Building (Offices, residential, schools)
- EP: Electrical Engineering Infrastructure
- ME: Mechanical Engineering
- PE: Potentially Emerging status (allows bidding one tier higher)`
    }
  ];

  const current = formsData.find(f => f.id === activeForm) || formsData[0];

  const handleCopy = () => {
    navigator.clipboard.writeText(current.sampleTemplate);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      
      {/* Top Banner */}
      <div className={`${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'} border rounded-xl p-6`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <BookOpen className="w-5 h-5 text-emerald-600" />
              <h2 className={`text-lg font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                Bidding documents and requirement rules
              </h2>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">
                SCM Statutes
              </span>
            </div>
            <p className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-500'} leading-relaxed`}>
              Standard bidding documents and the rules behind common tender requirements. What applies to you depends on the buyer, your sector and the tender itself.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              Sources and check dates shown per rule
            </span>
          </div>
        </div>
      </div>

      {/* Main Grid: Form List (Left) + Detail & Template (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Form Selector */}
        <div className="lg:col-span-4 space-y-2">
          {formsData.map((f) => (
            <button
              key={f.id}
              onClick={() => setActiveForm(f.id)}
              className={`w-full text-left p-4 rounded-xl border transition-all ${
                activeForm === f.id
                  ? isDarkMode
                    ? 'bg-emerald-950/40 border-emerald-700 text-emerald-300 shadow-sm'
                    : 'bg-emerald-50/80 border-emerald-300 text-emerald-900 shadow-sm'
                  : isDarkMode
                    ? 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                    : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-mono text-xs font-bold text-emerald-600">
                  {f.code}
                </span>
                <span className={`text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded ${
                  f.mandatory 
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' 
                    : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                }`}>
                  {f.mandatory ? 'Returnable' : 'Reference'}
                </span>
              </div>
              <div className="text-xs font-semibold leading-tight mb-1">{f.title}</div>
              <div className={`text-[11px] ${isDarkMode ? 'text-slate-400' : 'text-slate-500'} line-clamp-2`}>
                {f.summary}
              </div>
            </button>
          ))}
        </div>

        {/* Right Column: Full Details & Template Preview */}
        <div className="lg:col-span-8 space-y-4">
          <div className={`${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'} border rounded-xl p-6 space-y-5`}>
            
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
              <div>
                <span className="font-mono text-xs font-bold text-emerald-600 block mb-0.5">
                  {current.code}
                </span>
                <h3 className={`text-base font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                  {current.title}
                </h3>
                <span className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  Authority: {current.authority}
                </span>
              </div>

              <button
                onClick={handleCopy}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                  isDarkMode 
                    ? 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700' 
                    : 'bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied Template' : 'Copy Sample Template'}</span>
              </button>
            </div>

            {/* Key Legal Clauses */}
            <div>
              <h4 className={`text-xs font-semibold uppercase tracking-wider ${isDarkMode ? 'text-slate-400' : 'text-slate-600'} mb-2`}>
                Statutory Compliance Requirements
              </h4>
              <ul className="space-y-1.5 text-xs">
                {current.keyClauses.map((clause, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                    <span className={isDarkMode ? 'text-slate-300' : 'text-slate-700'}>{clause}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Template Box */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className={`text-xs font-semibold ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                  Document Skeleton & Structure:
                </span>
                <span className={`text-[10px] ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                  Ready to paste into submission bundle
                </span>
              </div>
              <pre className="p-4 rounded-lg bg-slate-950 text-slate-200 font-mono text-xs overflow-x-auto max-h-[340px] leading-relaxed border border-slate-800">
                {current.sampleTemplate}
              </pre>
            </div>

          </div>
        </div>

      </div>

      {/* What applies to you: sourced rules with applicability, no blanket lists */}
      <div className={`${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'} border rounded-xl p-6 space-y-4`}>
        <div className="flex items-start gap-3">
          <Scale className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          <div>
            <h3 className={`text-sm font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
              {PROCUREMENT_FRAMEWORK_NOTE.title}
            </h3>
            <p className={`text-xs leading-relaxed mt-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
              {PROCUREMENT_FRAMEWORK_NOTE.text}
            </p>
            <a href={PROCUREMENT_FRAMEWORK_NOTE.source.url} target="_blank" rel="noreferrer"
               className={`text-[11px] inline-flex items-center gap-1 mt-1 ${isDarkMode ? 'text-emerald-400' : 'text-emerald-700'} hover:underline`}>
              {PROCUREMENT_FRAMEWORK_NOTE.source.name} <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
          {PROCUREMENT_GUIDANCE.map((item) => (
            <div key={item.id} className={`rounded-lg border p-4 ${isDarkMode ? 'border-slate-800 bg-slate-950/40' : 'border-slate-200 bg-slate-50/60'}`}>
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className={`text-xs font-bold ${isDarkMode ? 'text-slate-100' : 'text-slate-800'}`}>{item.title}</span>
                <span className={`text-[9px] uppercase font-semibold px-1.5 py-0.5 rounded shrink-0 ${
                  item.layer === 'law'
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                    : item.layer === 'sector-buyer'
                      ? 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300'
                      : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                }`}>
                  {item.layer === 'law' ? 'Law / regulator' : item.layer === 'sector-buyer' ? 'Sector or buyer' : 'Per tender'}
                </span>
              </div>
              <p className={`text-[11px] leading-relaxed ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>{item.summary}</p>
              <p className={`text-[11px] leading-relaxed mt-1.5 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                <span className="font-semibold">Applies: </span>{item.appliesWhen}
              </p>
              <p className={`text-[11px] leading-relaxed mt-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                <span className="font-semibold">Next: </span>{item.nextStep}
              </p>
              {item.caveat && (
                <p className={`text-[10px] leading-relaxed mt-1.5 italic ${isDarkMode ? 'text-amber-400/90' : 'text-amber-700'}`}>
                  {item.caveat}
                </p>
              )}
              <div className={`flex items-center justify-between mt-2 pt-2 border-t ${isDarkMode ? 'border-slate-800' : 'border-slate-200'}`}>
                <a href={item.source.url} target="_blank" rel="noreferrer"
                   className={`text-[10px] inline-flex items-center gap-1 ${isDarkMode ? 'text-emerald-400' : 'text-emerald-700'} hover:underline`}>
                  {item.source.name} <ExternalLink className="w-2.5 h-2.5" />
                </a>
                <span className={`text-[9px] ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>checked {item.asOf}</span>
              </div>
            </div>
          ))}
        </div>

        <p className={`text-[10px] leading-relaxed ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>
          Not legal advice. The tender document and the buyer's supply-chain policy always govern a specific bid.
        </p>
      </div>

    </div>
  );
};
