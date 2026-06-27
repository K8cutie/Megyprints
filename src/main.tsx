import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <HashRouter>
    <App />
  </HashRouter>,
)

// Auto-refresh an OPEN tab the moment a freshly deployed service worker takes
// control. With skipWaiting + clientsClaim, a new build's SW activates and claims
// the page, firing `controllerchange` — without this, the already-open app keeps
// serving the old cached bundle until it's fully closed (the "my fixes don't show
// up" problem). Guarded against reload loops.
if ('serviceWorker' in navigator) {
  let reloading = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return
    reloading = true
    window.location.reload()
  })
  // Proactively check for a newer SW on every load instead of waiting for the
  // browser's periodic (up to 24h) check — so a fresh deploy is picked up on the
  // next visit, not a day later.
  navigator.serviceWorker.getRegistrations().then((regs) => {
    for (const r of regs) r.update()
  }).catch(() => { /* ignore */ })
}
