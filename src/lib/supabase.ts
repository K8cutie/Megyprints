import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

export type Database = any;

/** True only when real Supabase credentials are present. When false, the app
 *  runs in local-only mode (the album builder works; login/cloud-save are
 *  disabled) rather than white-screening at startup. Guards in authContext /
 *  album sync should check this before making network calls. */
export const supabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

// Fall back to a syntactically-valid placeholder so createClient never throws
// "supabaseUrl is required." and crash the WHOLE app when env vars are missing
// or a build forgot them. With a real URL this is a no-op.
export const supabase = createClient<Database>(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'public-anon-placeholder',
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
  },
);
