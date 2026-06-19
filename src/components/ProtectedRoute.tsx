import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../lib/authContext';

/**
 * ProtectedRoute — gates a route behind authentication.
 * While the session is still resolving it shows a loader (prevents a flash of
 * protected content); once resolved, logged-out visitors are redirected home.
 */
export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <span className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-[#E8A598] border-t-transparent" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
