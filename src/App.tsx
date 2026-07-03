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

  return (
    <AuthProvider>
      <AuthModalProvider>
      <InstallPrompt />
      <Routes>
        <Route element={<Layout><Outlet /></Layout>}>
          <Route path="/" element={<Home />} />
          <Route path="/templates" element={<Templates />} />
          <Route path="/contact" element={<Contact />} />
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
