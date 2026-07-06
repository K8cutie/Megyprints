import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary'
import { initSentry } from './lib/sentry'
import { reportError } from './lib/report'

// Initialize Sentry before anything renders. No-op unless VITE_SENTRY_DSN is set.
initSentry()

// Global safety nets — route uncaught errors + unhandled promise rejections
// through the single reportError sink (console + optional endpoint + Sentry).
window.addEventListener('unhandledrejection', (e) => {
  reportError(e.reason, { kind: 'unhandledrejection' })
})
window.addEventListener('error', (e) => {
  reportError(e.error ?? e.message, { kind: 'error' })
})

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <HashRouter>
      <App />
    </HashRouter>
  </ErrorBoundary>,
)

// Auto-refresh an OPEN tab the moment a freshly deployed service worker takes
// control. With skipWaiting + clientsClaim, a new build's SW activates and claims
// the page, firing `controllerchange` — without this, the already-open app keeps
// serving the old cached bundle until it's fully closed (the "my fixes don't show
// up" problem). Guarded against reload loops.
// Ask the browser to KEEP our local data durable. Album photos live only in
// IndexedDB (never uploaded, by design) and are hundreds of MB for a big trip —
// far larger than the tiny localStorage album JSON. Without a persistence grant,
// storage is "best-effort": the browser can evict the heavy IndexedDB photo
// blobs under storage pressure while the small album layout survives, leaving an
// album full of EMPTY frames ("it didn't save"). persist() flips storage to
// "persistent" so it's only cleared by an explicit user action. Best-effort,
// idempotent, safe to call on every load.
if (navigator.storage?.persist) {
  navigator.storage.persisted()
    .then((already) => { if (!already) return navigator.storage.persist(); })
    .catch(() => { /* not supported / denied — nothing we can do */ });
}

if ('serviceWorker' in navigator) {
  let reloading = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return
    reloading = true
    window.location.reload()
  })
  // Proactively poll for a freshly deployed service worker so an ALREADY-OPEN app
  // (and an installed PWA, which rarely does a full navigation) picks up a new
  // build ON ITS OWN — not only on a cold load, and not a day later (the browser's
  // own check can be up to 24h). When a newer SW is found it self-activates
  // (skipWaiting + clientsClaim), fires `controllerchange`, and the handler above
  // reloads into the fresh bundle. The in-progress album persists in localStorage,
  // so the reload re-hydrates it — no lost work.
  const checkForUpdate = () => {
    navigator.serviceWorker.getRegistrations()
      .then((regs) => { for (const r of regs) r.update() })
      .catch(() => { /* offline / unsupported — just try again next tick */ })
  }
  checkForUpdate()                          // on this load
  setInterval(checkForUpdate, 60_000)       // every minute while the app stays open
  document.addEventListener('visibilitychange', () => {
    // And the moment the user returns to the tab/PWA (e.g. after we shipped a fix).
    if (document.visibilityState === 'visible') checkForUpdate()
  })
}
