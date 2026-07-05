import { Component, type ReactNode } from 'react';
import { reportError } from '../lib/report';

interface State {
  hasError: boolean;
  message?: string;
  chunkError?: boolean;
}

/** A stale-deploy chunk failure looks like a crash but just needs a reload — the
 *  new build changed chunk hashes under a still-open tab. Detect it so we can show
 *  a friendlier "new version ready" message. (Megyprints already self-heals the
 *  service worker on controllerchange in main.tsx; this is the render-time belt.) */
function isChunkLoadError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  return /Loading chunk|dynamically imported module|Importing a module script failed|Failed to fetch dynamically/i.test(msg);
}

/** App-level boundary — don't wrap only one route (Megyprints already has a
 *  builder-only BuilderErrorBoundary). A render error ANYWHERE should show a
 *  recoverable screen, not a white page, and always reach reportError(). */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message, chunkError: isChunkLoadError(error) };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    // reportError is the single sink: console + VITE_ERROR_ENDPOINT + Sentry
    // captureException (DSN-gated, see lib/report.ts → lib/sentry.ts). The
    // componentStack rides along as Sentry `extra` context.
    reportError(error, { componentStack: info.componentStack });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-[#FFF8F0] px-6 text-center">
          <h1 className="font-display text-2xl font-bold text-[#2D2D2D]">
            {this.state.chunkError ? 'A new version is ready' : 'Something went wrong'}
          </h1>
          <p className="mt-2 max-w-sm text-sm text-[#6B6B6B]">
            {this.state.chunkError
              ? 'Megy Prints was updated while this tab was open. Reload to get the latest version.'
              : 'We hit an unexpected error. Refreshing usually fixes it — your photos are saved on this device.'}
          </p>
          {/* Only surface raw error text in development — in production it could
              leak internal detail. The full error always goes to reportError(). */}
          {import.meta.env.DEV && this.state.message && (
            <code className="mt-3 max-w-md break-words rounded-lg bg-black/5 px-3 py-2 text-xs text-[#6B6B6B]">
              {this.state.message}
            </code>
          )}
          <button
            onClick={() => window.location.reload()}
            className="mt-6 rounded-lg bg-[#F4C2A1] px-6 py-2.5 font-body text-sm font-semibold text-white transition-all hover:brightness-105"
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
