import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { Suspense, lazy, useEffect } from "react";
import { Toaster } from "sonner";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { DemoBanner } from "@/components/DemoBanner";
import { CookieConsent } from "@/components/CookieConsent";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AuthProvider } from "@/hooks/useAuth";
import { ChatProvider } from "@/hooks/useChat";

// Landing is eager (first paint); everything else is code-split so the initial
// bundle stays small (cost + performance: less bandwidth, faster TTI).
import Landing from "@/pages/Landing";
const Browse = lazy(() => import("@/pages/Browse"));
const ProviderDetail = lazy(() => import("@/pages/ProviderDetail"));
const Login = lazy(() => import("@/pages/Login"));
const Signup = lazy(() => import("@/pages/Signup"));
const PostJob = lazy(() => import("@/pages/PostJob"));
const ProviderOnboarding = lazy(() => import("@/pages/ProviderOnboarding"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Messages = lazy(() => import("@/pages/Messages"));
const AdminVerification = lazy(() => import("@/pages/AdminVerification"));
const Account = lazy(() => import("@/pages/Account"));
const Privacy = lazy(() => import("@/pages/Privacy"));
const Terms = lazy(() => import("@/pages/Terms"));
const NotFound = lazy(() => import("@/pages/NotFound"));

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => window.scrollTo(0, 0), [pathname]);
  return null;
}

function PageFallback() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="size-8 animate-spin rounded-full border-2 border-brand-200 border-t-brand-600" />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <ChatProvider>
            <ScrollToTop />
            <DemoBanner />
            <div className="flex min-h-screen flex-col">
              <Navbar />
              <main className="flex-1">
                <Suspense fallback={<PageFallback />}>
                  <Routes>
                    <Route path="/" element={<Landing />} />
                    <Route path="/browse" element={<Browse />} />
                    <Route path="/provider/:id" element={<ProviderDetail />} />
                    <Route path="/login" element={<Login />} />
                    <Route path="/signup" element={<Signup />} />
                    <Route path="/become-a-pro" element={<ProviderOnboarding />} />
                    <Route path="/messages" element={<Messages />} />
                    <Route path="/admin/verification" element={<AdminVerification />} />
                    <Route path="/privacy" element={<Privacy />} />
                    <Route path="/terms" element={<Terms />} />
                    <Route
                      path="/account"
                      element={
                        <ProtectedRoute>
                          <Account />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/post-job"
                      element={
                        <ProtectedRoute>
                          <PostJob />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/dashboard"
                      element={
                        <ProtectedRoute>
                          <Dashboard />
                        </ProtectedRoute>
                      }
                    />
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </Suspense>
              </main>
              <Footer />
            </div>
            <CookieConsent />
            <Toaster richColors position="top-center" />
          </ChatProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
