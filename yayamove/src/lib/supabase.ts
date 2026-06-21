import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Megyprints audit lesson: NEVER fall back to `?? ''` silently. A missing config
 * shipped to prod means auth/save/load fail invisibly. Here we surface it loudly:
 *   - a console error,
 *   - `isSupabaseConfigured = false` so the UI shows a visible "demo mode" banner,
 *   - `supabase` is null so any accidental data call throws instead of no-op.
 *
 * The anon key is public-by-design (it ships in the bundle); Row-Level Security
 * is the real lock — see supabase/migrations/0002_rls_lockdown.sql.
 */
const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

export const isSupabaseConfigured = Boolean(
  url && anonKey && !url.includes("YOUR-PROJECT") && !anonKey.includes("YOUR-"),
);

if (!isSupabaseConfigured) {
  // Loud, but non-fatal in dev so the design is still viewable in demo mode.
  console.error(
    "%c[Yayamove] Supabase is NOT configured.",
    "color:#ef4444;font-weight:bold",
    "\nCopy .env.example → .env and set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.",
    "\nRunning in DEMO MODE with sample data — auth and saving are disabled.",
  );
}

export const supabase: SupabaseClient<Database> | null = isSupabaseConfigured
  ? createClient<Database>(url!, anonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

/** Use where a configured client is required; throws a clear error otherwise. */
export function requireSupabase(): SupabaseClient<Database> {
  if (!supabase) {
    throw new Error(
      "Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.",
    );
  }
  return supabase;
}
