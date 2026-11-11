import React from 'react';
import { AuthCard, AuthState } from './AuthCard';
import tenderAgentLogo from '../assets/tenderagentlogo-trimmed.png';

interface Props {
  onAuthChange: (auth: AuthState) => void;
}

const features = [
  {
    title: 'RFP compliance audit',
    body: 'Upload a tender document and get the returnables it asks for extracted - such as CSD registration, SARS TCS PIN, B-BBEE, CIDB or COIDA - with a checklist you can work from.',
  },
  {
    title: 'Bid response skeletons',
    body: 'Turn the requirements into a structured Word-compatible .doc response framework aligned to the tender, ready for your pricing and technical content.',
  },
  {
    title: 'Live tender feed & PPPFA math',
    body: 'Follow new South African tender notices and score opportunities with the 80/20 and 90/10 preference-point formulas built in.',
  },
];

/**
 * The public face of TenderAgent: what a visitor sees before signing in.
 * Auth lives here, outside the dashboard, per the product direction. Light
 * theme only; wording stays measured - no absolute compliance or privacy
 * claims.
 */
export const Landing: React.FC<Props> = ({ onAuthChange }) => {
  return (
    <div className="min-h-screen pb-28 bg-[#FBFAF7] text-[#14201C] antialiased">
      {/* Top bar */}
      <header className="max-w-6xl mx-auto px-6 pt-6 flex items-center justify-between">
        <div className="flex items-center">
          <img src={tenderAgentLogo} alt="TenderAgent" className="h-16 sm:h-20 w-auto object-contain" />
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500 hidden sm:block">
            South African tender workspace
          </span>
          <a
            href="#auth"
            className="text-xs font-semibold px-3.5 py-2 rounded-lg bg-emerald-800 text-white hover:bg-emerald-700 transition-colors"
          >
            Sign in
          </a>
        </div>
      </header>

      {/* Hero */}
      <main className="max-w-6xl mx-auto px-6 pt-10 sm:pt-20 pb-16 flex flex-col lg:grid lg:grid-cols-[1.15fr_0.85fr] gap-10 lg:gap-16 items-start">
        <section className="order-1 lg:order-none w-full">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-emerald-800 mb-5">
            CSD &middot; SARS TCS &middot; B-BBEE &middot; CIDB &middot; PPPFA 2022
          </p>
          <h1 className="font-display text-[2.6rem] leading-[1.05] sm:text-6xl sm:leading-[1.03] font-semibold tracking-tight">
            Read the tender.<br />
            Know what it takes.<br />
            <span className="text-emerald-800 italic">Answer once, properly.</span>
          </h1>
          <p className="mt-6 text-base sm:text-lg leading-relaxed text-stone-600 max-w-xl">
            TenderAgent turns South African RFP documents into a clear compliance
            checklist and a structured bid skeleton, so a small business can see
            exactly what a tender demands before deciding to bid.
          </p>

        </section>

        <aside id="auth" className="order-2 lg:order-none w-full lg:row-span-2 lg:sticky lg:top-10 scroll-mt-6">
          <AuthCard onAuthChange={onAuthChange} initialMode="signup" />
          <p className="text-[11px] leading-relaxed text-stone-400 mt-4 px-1">
            Your workspace keeps your company documents under your own account.
            Analyses run against the documents you choose to upload.
          </p>
        </aside>

        <section className="order-3 lg:order-none w-full">
          <div className="lg:mt-10 border-t border-stone-200 pt-8">
            {features.map((f, i) => (
              <div key={f.title} className={`py-5 ${i > 0 ? 'border-t border-stone-200' : ''}`}>
                <div>
                  <h3 className="font-display text-lg font-semibold">{f.title}</h3>
                  <p className="text-sm leading-relaxed text-stone-600 mt-1 max-w-lg">{f.body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-stone-200">
        <div className="max-w-6xl mx-auto px-6 py-6 flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
          <span className="text-xs text-stone-500">TenderAgent &middot; Built for South African SMEs</span>
          <span className="text-xs text-stone-400">Preferential Procurement Regulations, 2022</span>
        </div>
      </footer>
    </div>
  );
};
