import { useEffect, lazy, Suspense } from 'react';
import { Routes, Route, Outlet, Navigate } from 'react-router-dom';
import { AuthProvider } from './lib/authContext';
import { AuthModalProvider } from './components/AuthModalProvider';
import Layout from './components/Layout';
import Home from './pages/Home';
import Templates from './pages/Templates';
import About from './pages/About';
import Contact from './pages/Contact';
import Privacy from './pages/Privacy';
import Order from './pages/Order';
import Profile from './pages/Profile';
import MyMemories from './pages/MyMemories';
import ProtectedRoute from './components/ProtectedRoute';

// Code-split the two heavy routes so their weight never lands on Home or the
// /order checkout path. BuilderRoute pulls in face-api.js + tfjs + the whole
// editor + the assistant (~3 MB); Admin pulls in recharts. These MUST be the
// only reference to the builder subtree from App — statically importing
// BuilderProvider/BuilderErrorBoundary here would drag the same chain back into
// the entry chunk (which is exactly why it wasn't splitting before).
const BuilderRoute = lazy(() => import('./pages/builder/BuilderRoute'));
const Admin = lazy(() => import('./pages/Admin'));
import InstallPrompt from './components/InstallPrompt';
import { loadTemplateSettings } from './lib/templateSettings';
import { loadStoreSettings } from './lib/storeSettings';

export default function App() {
  // Load operator template overrides + the store price multiple once on start.
  useEffect(() => { void loadTemplateSettings(); void loadStoreSettings(); }, []);

  // Return to where the user was after an OAuth round-trip. redirectTo can't
  // carry a #hash, so Google sends us back to a bare path (→ Home on this
  // HashRouter app). signInWithOAuth stashed the route it left from; restore it
  // so a sign-in from the builder lands back in the builder, not on Home (the
  // "signing in threw away my album" bug). The draft itself survives in
  // localStorage (flushed on the OAuth navigation), so restoring the route
  // brings the whole in-progress album back.
  useEffect(() => {
    let ret: string | null = null;
    try { ret = sessionStorage.getItem('megy-auth-return'); } catch { /* ignore */ }
    if (!ret) return;
    try { sessionStorage.removeItem('megy-auth-return'); } catch { /* ignore */ }
    if (ret !== '#/' && window.location.hash !== ret) window.location.hash = ret;
    // OAuth lands us on a real path (redirectTo /profile) that the SPA fallback
    // serves — tidy the URL bar back to the root so it isn't ".../profile#/…".
    if (window.location.pathname !== '/') {
      try { window.history.replaceState(null, '', '/' + (window.location.hash || '')); } catch { /* ignore */ }
    }
  }, []);

  return (
    <AuthProvider>
      <AuthModalProvider>
      <InstallPrompt />
      <Suspense fallback={<div className="min-h-screen bg-[#FFF8F0]" aria-busy="true" />}>
      <Routes>
        <Route element={<Layout><Outlet /></Layout>}>
          <Route path="/" element={<Home />} />
          <Route path="/templates" element={<Templates />} />
          {/* About page + Navbar/Footer both linked to /about, but the route was
              never registered — the link blank-screened. Wired here. */}
          <Route path="/about" element={<About />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/order" element={<Order />} />
          <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
          <Route path="/memories" element={<ProtectedRoute><MyMemories /></ProtectedRoute>} />
        </Route>
        {/* Builder — a full-screen app with its own chrome. Kept OUTSIDE Layout so the
            marketing Lenis smooth-scroll (which hijacks the mouse wheel and scrolls the
            window instead of the editor/wizard's own overflow containers) is not active
            here. THIS is what broke wheel-scrolling in the builder. */}
        <Route path="/builder/*" element={<BuilderRoute />} />
        {/* Operator console — outside the customer Layout (its own chrome) */}
        <Route path="/admin" element={<ProtectedRoute><Admin /></ProtectedRoute>} />
        {/* Catch-all: an unknown hash previously mounted nothing (blank screen).
            Send it home instead of showing an empty page. */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
      </AuthModalProvider>
    </AuthProvider>
  );
}
