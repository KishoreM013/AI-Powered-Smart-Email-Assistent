import React from 'react';

/**
 * Catches render-time exceptions so a single bad component cannot white-screen
 * the whole app. The previous build had no boundary at all.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Unhandled UI error:', error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#080C16] p-6">
        <div className="max-w-md w-full rounded-2xl bg-white dark:bg-[#0D121F] border border-rose-200 dark:border-rose-900/60 p-6 text-left shadow-xl">
          <h1 className="text-lg font-extrabold text-slate-900 dark:text-white mb-2">
            Something went wrong
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
            The interface hit an unexpected error. Reloading usually clears it.
          </p>
          <pre className="mb-4 p-3 rounded-xl bg-slate-100 dark:bg-slate-950 text-[11px] font-mono text-slate-700 dark:text-slate-300 overflow-x-auto whitespace-pre-wrap">
            {String(this.state.error?.message || this.state.error)}
          </pre>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition"
          >
            Reload the app
          </button>
        </div>
      </div>
    );
  }
}
