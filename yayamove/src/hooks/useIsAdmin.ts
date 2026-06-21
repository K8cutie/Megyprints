import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./useAuth";

/**
 * Whether the current user is an admin. In live mode this calls the
 * `is_admin()` SECURITY DEFINER function (the source of truth — RLS uses the same
 * function). In demo mode (no Supabase) we allow access so the admin UI is
 * viewable with sample data.
 */
export function useIsAdmin() {
  const { user, configured } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    if (!configured) {
      setIsAdmin(true); // demo mode
      setLoading(false);
      return;
    }
    if (!user || !supabase) {
      setIsAdmin(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    // `is_admin` isn't in the hand-written Functions type; cast the call.
    (supabase.rpc as unknown as (fn: string) => Promise<{ data: boolean | null }>)("is_admin")
      .then(({ data }) => active && setIsAdmin(Boolean(data)))
      .catch(() => active && setIsAdmin(false))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [user, configured]);

  return { isAdmin, loading };
}
