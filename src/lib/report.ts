/**
 * Central error sink. The ErrorBoundary and global handlers all flow through
 * here, so production reporting is wired in ONE place.
 *
 * Set `VITE_ERROR_ENDPOINT` (e.g. a Sentry tunnel, a serverless collector, or a
 * logging webhook) to ship errors off-box; without it, it just logs to console.
 *
 * When `VITE_SENTRY_DSN` is set, errors are ALSO sent to Sentry via
 * captureException (see lib/sentry.ts). Both sinks are independent and optional:
 * with neither configured this just logs to console.
 */
import { captureException } from './sentry';

const env = import.meta.env as unknown as Record<string, string | undefined>;
const ENDPOINT = env.VITE_ERROR_ENDPOINT?.trim();

export function reportError(error: unknown, context?: Record<string, unknown>) {
  if (import.meta.env.DEV || !ENDPOINT) {
    console.error('[Megyprints]', error, context ?? '');
  }

  // Sentry sink — self-gates on VITE_SENTRY_DSN; no-op when unset, never throws.
  captureException(error, context);

  if (!ENDPOINT) return;

  try {
    const payload = JSON.stringify({
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      context,
      url: typeof location !== 'undefined' ? location.href : undefined,
      ts: new Date().toISOString(),
    });
    // Prefer sendBeacon (survives page unload); fall back to fetch.
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      navigator.sendBeacon(ENDPOINT, new Blob([payload], { type: 'application/json' }));
    } else {
      void fetch(ENDPOINT, {
        method: 'POST',
        body: payload,
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  } catch {
    // Never let the reporter throw.
  }
}
