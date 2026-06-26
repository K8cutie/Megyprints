import { useEffect } from 'react';
import { Routes, Route, Outlet } from 'react-router-dom';
import { AuthProvider } from './lib/authContext';
import { BuilderProvider } from './pages/builder/BuilderContext';
import Layout from './components/Layout';
import Home from './pages/Home';
import Builder from './pages/Builder';
import Templates from './pages/Templates';
import Contact from './pages/Contact';
import Order from './pages/Order';
import Profile from './pages/Profile';
import Admin from './pages/Admin';
import ProtectedRoute from './components/ProtectedRoute';
import BuilderErrorBoundary from './pages/builder/BuilderErrorBoundary';
import InstallPrompt from './components/InstallPrompt';
import { loadTemplateSettings } from './lib/templateSettings';

export default function App() {
  // Load operator template overrides once, then apply them to generation.
  useEffect(() => { void loadTemplateSettings(); }, []);

  return (
    <AuthProvider>
      <InstallPrompt />
      <Routes>
        <Route element={<Layout><Outlet /></Layout>}>
          <Route path="/" element={<Home />} />
          <Route path="/templates" element={<Templates />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/order" element={<Order />} />
          <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
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
        </Route>
        {/* Operator console — outside the customer Layout (its own chrome) */}
        <Route path="/admin" element={<ProtectedRoute><Admin /></ProtectedRoute>} />
      </Routes>
    </AuthProvider>
  );
}
