import React from 'react';

/**
 * Catches render-time exceptions so one bad component cannot white-screen
 * the app. This used to exist but was never mounted, which is exactly why a
 * crash showed as a blank page with nothing to go on.
 *
 * The error message is shown on purpose: it is the only clue available, and
 * a blank page is worse than an ugly one.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    this.setState({ info });
    console.error('Unhandled UI error:', error, info?.componentStack);
  }

  handleReset = () => {
    this.setState({ error: null, info: null });
  };

  render() {
    const { error, info } = this.state;
    if (!error) return this.props.children;

    const detail = [
      String(error?.message || error),
      info?.componentStack ? `\n${info.componentStack.trim().split('\n').slice(0, 6).join('\n')}` : '',
    ].join('');

    return (
      <div className="min-h-screen grid place-items-center p-6" style={{ background: 'var(--canvas)' }}>
        <div className="panel w-full max-w-lg p-6">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-rose-600 dark:text-rose-400 mb-3">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
            Interface error
          </span>

          <h1 className="text-lg font-semibold ink mb-1.5">This screen crashed</h1>
          <p className="text-sm ink-soft leading-relaxed mb-4">
            Your mail is safe on the server. Reload to continue, and copy the
            detail below if it keeps happening.
          </p>

          <pre className="mb-4 p-3 rounded-xl text-[11px] leading-relaxed overflow-x-auto whitespace-pre-wrap"
               style={{ background: 'rgba(100,116,139,0.08)', border: '1px solid var(--line)' }}>
            {detail || 'Unknown error'}
          </pre>

          <div className="flex flex-wrap gap-2">
            <button onClick={() => window.location.reload()} className="btn-primary">
              Reload
            </button>
            <button onClick={this.handleReset} className="btn-ghost">
              Try again
            </button>
          </div>
        </div>
      </div>
    );
  }
}
