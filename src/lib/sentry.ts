/**
 * Sentry wiring — DSN-gated so it is a complete no-op until VITE_SENTRY_DSN is
 * set. Dev/demo builds without a DSN never call Sentry.init and never capture,
 * so there is zero runtime/network effect and no SDK side effects.
 *
 * The DSN is a *publishable* client DSN: it is safe to ship in the frontend
 * bundle (like the Supabase anon key). It only authorizes SENDING events, not
 * reading them. See docs/MONITORING-ACTIVATION.md for turn-on steps.
 *
 * NOTE: the app CSP (vercel.json → connect-src) must allow the Sentry ingest
 * host or the browser will block every event. The US-region hosts are already
 * allowlisted; if you pick a non-US Sentry region, add its ingest host there.
 */
import * as Sentry from '@sentry/react';

const env = import.meta.env as unknown as Record<string, string | undefined>;
const DSN = env.VITE_SENTRY_DSN?.trim();

/** True only when a DSN is configured — used to gate captureException calls. */
export const sentryEnabled = Boolean(DSN);

/** Call once at app startup, before render. No-op when no DSN is set. */
export function initSentry() {
  if (!DSN) return;
  Sentry.init({
    dsn: DSN,
    environment: import.meta.env.MODE,
    // Keep performance tracing light; this is monitoring, not profiling.
    tracesSampleRate: 0.1,
    integrations: [Sentry.browserTracingIntegration()],
  });
}

/**
 * Capture an exception in Sentry when enabled. Safe to call unconditionally —
 * it self-gates on the DSN and never throws.
 */
export function captureException(error: unknown, context?: Record<string, unknown>) {
  if (!sentryEnabled) return;
  try {
    Sentry.captureException(error, context ? { extra: context } : undefined);
  } catch {
    // Never let the reporter throw.
  }
}
