import React from 'react';

/**
 * Privacy & data handling notice. Every statement here is grounded in what the
 * code actually does today - read the source before editing the wording. This
 * page deliberately avoids: POPIA-compliance claims, confidentiality guarantees
 * for uploaded documents, promises about future behavior, and any statement
 * about backups or data residency (both currently unresolved at the platform
 * level).
 */

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="py-5 border-t border-stone-200 first:border-t-0">
    <h2 className="font-display text-lg font-semibold">{title}</h2>
    <div className="mt-2 text-sm leading-relaxed text-stone-600 space-y-2">{children}</div>
  </section>
);

export const PrivacyNotice: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  return (
    <div className="min-h-screen bg-[#FBFAF7] text-[#14201C] antialiased">
      <main className="max-w-3xl mx-auto px-6 py-10 sm:py-16">
        <button
          onClick={onBack}
          className="text-xs font-semibold text-emerald-800 hover:text-emerald-700 mb-8"
        >
          &larr; Back to TenderAgent
        </button>

        <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight">
          Privacy &amp; data handling
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-stone-500">
          What TenderAgent stores, where your documents go, and what the current
          limits are. This page describes actual behavior; it is not a compliance
          certification.
        </p>

        <div className="mt-8">
          <Section title="What your account stores">
            <p>
              Your account holds your email address, password (stored only as a
              salted hash), company profile details you choose to save, and your
              monthly usage counts. Your SARS Tax Compliance Status PIN, if you
              save one, is stored encrypted (AES-256-GCM); other profile fields
              are not individually encrypted at this time.
            </p>
          </Section>

          <Section title="What happens when you analyse a tender">
            <p>
              The document you upload is processed to extract what the tender asks
              for, and the result is returned to your browser. TenderAgent does
              not keep a server-side history of your analysis results after they
              are returned to you.
            </p>
            <p>
              Processing runs on TenderAgent&apos;s own hosted service. Analysis
              currently runs on a privately hosted model; no cloud AI provider is
              configured.
            </p>
          </Section>

          <Section title="Document redaction - and its limits">
            <p>
              When you run an analysis, the tender text passes through pattern
              redaction inside the analysis pipeline, before the extraction step.
              Only the redacted text is sent to the model that does the
              extraction, and the short excerpt shown with your result is taken
              from the redacted text. That step masks patterns that look like
              13-16 digit ID or card numbers, email addresses, South African
              phone numbers (contiguous, spaced, or +27 forms), and VAT-like
              numbers.
            </p>
            <p>
              Dash-separated local phone numbers, names, physical addresses, and
              other personal details can still pass through. This redaction is not
              a guarantee that a document is safe to share with cloud AI. Only
              upload public or synthetic documents.
            </p>
          </Section>

          <Section title="Retention and deletion">
            <p>
              You can delete your saved company profile yourself at any time.
              Bid drafts you save stay saved until you delete them one by one
              from the Bid Readiness view - there is no automatic expiry.
              Evidence notes you add to a requirement are stored with that
              draft and are removed with it. Deleting your company profile
              does not delete your drafts; each record has its own lifecycle.
              Self-service deletion of a whole account is not available in the
              product today.
            </p>
            <p>
              Backup behavior and data-residency guarantees are not stated here
              because they are not yet settled at the platform level - ask before
              relying on either.
            </p>
          </Section>

          <Section title="What this page does not claim">
            <p>
              TenderAgent does not claim POPIA compliance certification, and does
              not claim that uploaded documents are kept confidential beyond the
              measures described above. If your tender documents are confidential,
              do not upload them.
            </p>
          </Section>
        </div>
      </main>
    </div>
  );
};
