/**
 * Central error sink. Today it logs; in production wire a real reporter here
 * (e.g. Sentry.captureException) — one place, so the ErrorBoundary and the
 * global handlers all flow through it. SECURITY.md lists this as a launch gate.
 */
export function reportError(error: unknown, context?: Record<string, unknown>) {
  // TODO(prod): Sentry.captureException(error, { extra: context });
  console.error("[Yayamove]", error, context ?? "");
}
