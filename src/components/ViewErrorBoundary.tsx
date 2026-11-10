import React from 'react';
import { WifiOff } from 'lucide-react';

interface Props { children: React.ReactNode; isDarkMode?: boolean; }
interface State { failed: boolean; }

/**
 * One view must never blank the whole workspace. If a view throws (e.g. a
 * render path that assumed data which a dropped connection never delivered),
 * the rest of the app keeps working and the view fails honestly.
 */
export class ViewErrorBoundary extends React.Component<Props, State> {
  state: State = { failed: false };
  static getDerivedStateFromError(): State { return { failed: true }; }
  componentDidCatch(err: unknown) { console.warn('[TenderAgent] View render failure:', err); }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className={`rounded-2xl border p-8 text-center ${this.props.isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
        <WifiOff className="w-6 h-6 mx-auto mb-3 text-slate-400" />
        <p className={`text-sm font-semibold ${this.props.isDarkMode ? 'text-slate-200' : 'text-slate-700'}`}>
          This view could not load.
        </p>
        <p className={`text-xs mt-1 ${this.props.isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
          Check your connection, then switch to another tab and back to retry. Your other tabs keep working.
        </p>
      </div>
    );
  }
}
