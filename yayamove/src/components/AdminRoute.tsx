import { Navigate } from "react-router-dom";
import type { ReactNode } from "react";
import { useIsAdmin } from "@/hooks/useIsAdmin";

/** Gate for admin-only routes. Defense-in-depth on top of RLS — the admin
 *  surface should never even render for non-admins. */
export function AdminRoute({ children }: { children: ReactNode }) {
  const { isAdmin, loading } = useIsAdmin();

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="size-8 animate-spin rounded-full border-2 border-brand-200 border-t-brand-600" />
      </div>
    );
  }
  if (!isAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
}
