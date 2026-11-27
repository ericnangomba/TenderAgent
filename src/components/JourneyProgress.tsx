import React from 'react';
import { Check, Circle, ChevronRight, AlertTriangle } from 'lucide-react';
import type { TabKey } from './Sidebar';
import type { JourneyStep } from '../lib/journey/journey';

interface JourneyProgressProps {
  steps: JourneyStep[];
  /** Id of the suggested next step, or null when there is no suggestion. */
  nextStepId: string | null;
  /** True when every required step is done (optional steps never gate). */
  complete: boolean;
  /** True when the journey data (draft count) could not be loaded. */
  loadFailed: boolean;
  onRetry: () => void;
  /** Navigation only - tapping a step never marks it done. */
  onNavigate: (tab: TabKey) => void;
  isDarkMode?: boolean;
}

/**
 * The guided journey stepper. Mobile-first: one tappable row per step, no
 * horizontal scrolling. Completion always reflects real state computed by
 * the caller; this component renders, it does not decide.
 */
export const JourneyProgress: React.FC<JourneyProgressProps> = ({ steps, nextStepId, complete, loadFailed, onRetry, onNavigate, isDarkMode = false }) => {
  const doneCount = steps.filter((s) => s.done).length;
  return (
    <section aria-label="Your setup journey" className={`mb-6 rounded-2xl border p-4 sm:p-5 ${isDarkMode ? 'border-slate-700 bg-slate-900 text-slate-100' : 'border-slate-200 bg-white text-slate-800'}`}>
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className={`text-sm font-bold uppercase tracking-wider ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>
          {complete ? 'Journey complete' : `Your journey - ${doneCount} of ${steps.length} steps done`}
        </h2>
      </div>
      {loadFailed && (
        <div role="alert" className={`mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900`}>
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>Could not check your progress. Completed steps are never guessed.</span>
          <button type="button" onClick={onRetry} className="ml-auto rounded-lg border border-amber-400 px-3 py-1.5 font-semibold">Retry</button>
        </div>
      )}
      <ol className="space-y-1">
        {steps.map((step, i) => {
          const isNext = step.id === nextStepId;
          const row = (
            <>
              <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${
                step.done
                  ? 'border-emerald-600 bg-emerald-600 text-white'
                  : isNext
                    ? 'border-emerald-600 text-emerald-700'
                    : isDarkMode ? 'border-slate-600 text-slate-500' : 'border-slate-300 text-slate-400'
              }`}>
                {step.done ? <Check className="w-3.5 h-3.5" /> : i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block text-sm font-semibold ${step.done ? (isDarkMode ? 'text-slate-400 line-through' : 'text-slate-400 line-through') : ''}`}>
                  {step.title}
                  {step.optional && <span className={`ml-2 text-[10px] font-bold uppercase tracking-wide ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>Optional</span>}
                </span>
                <span className={`block text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>{step.detail}</span>
              </span>
              {step.tab && !step.done && <ChevronRight className={`mt-1 w-4 h-4 shrink-0 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`} />}
            </>
          );
          return (
            <li key={step.id}>
              {step.tab ? (
                <button
                  type="button"
                  onClick={() => step.tab && onNavigate(step.tab)}
                  aria-current={isNext ? 'step' : undefined}
                  className={`flex w-full items-start gap-3 rounded-xl p-2.5 text-left transition-colors ${
                    isNext ? (isDarkMode ? 'bg-slate-800 ring-1 ring-emerald-700' : 'bg-emerald-50 ring-1 ring-emerald-200') : isDarkMode ? 'hover:bg-slate-800' : 'hover:bg-slate-50'
                  }`}
                >
                  {row}
                </button>
              ) : (
                <div className="flex w-full items-start gap-3 p-2.5" aria-current={isNext ? 'step' : undefined}>{row}</div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
};
