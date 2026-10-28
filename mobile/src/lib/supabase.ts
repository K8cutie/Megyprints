/* ══════════════════════════════════════════════════════════════════════════
   The app's connection to the same Supabase project as the website.

   The website reads VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (public:
   they ship inside the website's own code). The app reads the same two
   values as EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY, from
   mobile/.env.local (not in git; mobile/.env.example shows the names). Expo
   puts them into the app's code when Metro builds it.

   The sign-in is kept on the phone in AsyncStorage, so the app opens signed
   in next time, the way the website remembers you in the browser.
   ══════════════════════════════════════════════════════════════════════════ */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

/** False when this build was made without the server address: the app then
 *  says so on the sign-in screen instead of failing with a network error. */
export const supabaseConfigured = Boolean(url && anonKey);

/** The server this build talks to, for the start screen ('lvbs….supabase.co'). */
export const supabaseHost = (() => {
  try {
    return url ? new URL(url).host : '';
  } catch {
    return '';
  }
})();

export const supabase: SupabaseClient = createClient(
  url || 'https://placeholder.supabase.co',
  anonKey || 'public-anon-placeholder',
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      // No web page to read a sign-in link from: the app signs in itself.
      detectSessionInUrl: false,
    },
  },
);
