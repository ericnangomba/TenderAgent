import React from 'react';
import { SAMPLE_ANALYSIS_CHECKLIST, SAMPLE_ANALYSIS_EXCERPT } from '../lib/data/sampleAnalysisPreview';

/**
 * Worked example shown to signed-out visitors: a FICTIONAL tender excerpt with
 * a prepared checklist whose every row is drawn from that excerpt (enforced by
 * test). Static content only - viewing it never triggers an analysis run or
 * any external call, and it is not an AI result.
 */

export const SampleAnalysisPreview: React.FC = () => {
  return (
    <section className="max-w-6xl mx-auto px-6 pb-16">
      <div className="border border-stone-200 rounded-2xl bg-white shadow-sm overflow-hidden">
        <div className="px-5 sm:px-8 pt-6 pb-4 border-b border-stone-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-800">
            Worked example
          </p>
          <p className="text-[11px] leading-snug text-stone-400 sm:text-right">
            Fictional tender, prepared illustration -<br className="hidden sm:block" /> not a live notice or a real result.
          </p>
        </div>

        <div className="px-5 sm:px-8 py-6 grid gap-8 lg:grid-cols-2">
          {/* Fictional tender excerpt */}
          <div>
            <h4 className="text-sm font-semibold text-stone-700 mb-3">
              Excerpt from the fictional tender
            </h4>
            <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-stone-600 bg-stone-50 border border-stone-100 rounded-lg p-4">
              {SAMPLE_ANALYSIS_EXCERPT}
            </pre>
          </div>

          {/* Prepared checklist, each row drawn from the excerpt */}
          <div>
            <h4 className="text-sm font-semibold text-stone-700 mb-1">
              The checklist TenderAgent prepares from it
            </h4>
            <p className="text-[11px] text-stone-400 mb-3">
              Static prepared example, not an AI result - each checklist line comes from the excerpt shown.
            </p>
            <ul className="divide-y divide-stone-100 border-y border-stone-100">
              {SAMPLE_ANALYSIS_CHECKLIST.map((c) => (
                <li key={c.item} className="py-2 flex items-start gap-2.5 text-sm">
                  <span
                    className={`mt-0.5 inline-block h-4 w-4 shrink-0 rounded-full border text-center text-[10px] leading-4 ${
                      c.required
                        ? 'border-emerald-700 bg-emerald-800 text-white'
                        : 'border-stone-300 text-stone-400'
                    }`}
                    aria-hidden="true"
                  >
                    {c.required ? '✓' : '–'}
                  </span>
                  <span className="text-stone-700">{c.item}</span>
                  <span className={`ml-auto shrink-0 text-[10px] font-semibold uppercase tracking-wide ${c.required ? 'text-emerald-800' : 'text-stone-400'}`}>
                    {c.required ? 'Required' : 'If applicable'}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="px-5 sm:px-8 py-4 bg-stone-50 border-t border-stone-100">
          <p className="text-xs leading-relaxed text-stone-500">
            This is what one uploaded tender becomes: the returnables it asks for,
            the SBD forms due, and how it will be scored.{' '}
            <a href="#auth" className="font-semibold text-emerald-800 hover:text-emerald-700">
              Create a free account
            </a>{' '}
            to run this on your own tender document.
          </p>
        </div>
      </div>
    </section>
  );
};
