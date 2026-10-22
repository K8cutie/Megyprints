/**
 * Central error sink. The ErrorBoundary and global handlers all flow through
 * here, so production reporting is wired in ONE place.
 *
 * Reports go to `VITE_ERROR_ENDPOINT` when it is set, and otherwise, in a
 * production build, to the app's own /api/client-error (0050): the owner reads
 * them in the console's Errors tab. Until 2026-10-22 neither was set on the
 * live site, so a checkout that lost its cover (MP-2026-KGCFSQN) reported it
 * to the customer's phone console only. Dev builds just log to the console.
 *
 * When `VITE_SENTRY_DSN` is set, errors are ALSO sent to Sentry via
 * captureException (see lib/sentry.ts). Both sinks are independent and optional.
 */
import { captureException } from './sentry';

const env = import.meta.env as unknown as Record<string, string | undefined>;

/** Where reports go: VITE_ERROR_ENDPOINT, else /api/client-error in a
 *  production build, else nowhere (dev logs to the console). */
export function errorEndpoint(e: Record<string, string | undefined>, prod: boolean): string | undefined {
  return e.VITE_ERROR_ENDPOINT?.trim() || (prod ? '/api/client-error' : undefined);
}

const ENDPOINT = errorEndpoint(env, import.meta.env.PROD);

/** At most this many reports leave one page load, and the same error at most
 *  SAME_ERROR_MAX times: an error in a loop (a render that keeps failing) must
 *  not send hundreds. */
export const PAGE_REPORT_MAX = 20;
export const SAME_ERROR_MAX = 3;
const sentByKey = new Map<string, number>();
let sentTotal = 0;

/** True when one more report with this key may go. */
export function takeReportSlot(key: string): boolean {
  if (sentTotal >= PAGE_REPORT_MAX) return false;
  const n = sentByKey.get(key) ?? 0;
  if (n >= SAME_ERROR_MAX) return false;
  sentByKey.set(key, n + 1);
  sentTotal += 1;
  return true;
}

/** The page a report came from, without what can carry a sign-in token: the
 *  sign-in return link has the customer's tokens in its query or after #.
 *  (The endpoint scrubs again.) */
export function pageOf(href: string): string {
  return href.replace(/([?#&])((?:access|refresh|provider)_token|code|token)=[^&#]*/gi, '$1$2=[removed]');
}

/** Tests only: a fresh page load. */
export function resetReportSlots(): void {
  sentByKey.clear();
  sentTotal = 0;
}

export function reportError(error: unknown, context?: Record<string, unknown>) {
  if (import.meta.env.DEV || !ENDPOINT) {
    console.error('[Megyprints]', error, context ?? '');
  }

  // Sentry sink — self-gates on VITE_SENTRY_DSN; no-op when unset, never throws.
  captureException(error, context);

  if (!ENDPOINT) return;

  try {
    const message = error instanceof Error ? error.message : String(error);
    if (!takeReportSlot(`${message}|${String(context?.step ?? '')}`)) return;
    const payload = JSON.stringify({
      message,
      stack: error instanceof Error ? error.stack : undefined,
      context,
      url: typeof location !== 'undefined' ? pageOf(location.href) : undefined,
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
      }).catch(() => { /* never let the reporter throw */ });
    }
  } catch {
    // Never let the reporter throw.
  }
}
