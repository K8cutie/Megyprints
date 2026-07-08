import { useEffect } from 'react';
import { Routes, Route, Outlet } from 'react-router-dom';
import { AuthProvider } from './lib/authContext';
import { AuthModalProvider } from './components/AuthModalProvider';
import { BuilderProvider } from './pages/builder/BuilderContext';
import Layout from './components/Layout';
import Home from './pages/Home';
import Builder from './pages/Builder';
import Templates from './pages/Templates';
import Contact from './pages/Contact';
import Privacy from './pages/Privacy';
import Order from './pages/Order';
import Profile from './pages/Profile';
import MyMemories from './pages/MyMemories';
import Admin from './pages/Admin';
import ProtectedRoute from './components/ProtectedRoute';
import BuilderErrorBoundary from './pages/builder/BuilderErrorBoundary';
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
      <Routes>
        <Route element={<Layout><Outlet /></Layout>}>
          <Route path="/" element={<Home />} />
          <Route path="/templates" element={<Templates />} />
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
        <Route
          path="/builder/*"
          element={
            <BuilderErrorBoundary onReset={() => window.location.reload()}>
              <BuilderProvider>
                <Builder />
              </BuilderProvider>
            </BuilderErrorBoundary>
          }
        />
        {/* Operator console — outside the customer Layout (its own chrome) */}
        <Route path="/admin" element={<ProtectedRoute><Admin /></ProtectedRoute>} />
      </Routes>
      </AuthModalProvider>
    </AuthProvider>
  );
}
