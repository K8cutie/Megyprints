/* ══════════════════════════════════════════════════════════════════════════
   The second half of "Forgot password": the person opened the emailed link.

   supabase-js reads the link's tokens from the #hash while it starts up and
   fires PASSWORD_RECOVERY once. That can happen before React has mounted the
   AuthProvider, and a listener added later only hears INITIAL_SESSION, so the
   "Make a new password" screen never opened. This module listens from the
   moment it's imported (before any render) and keeps the answer in
   recoveryState.ts for the screens. See passwordReset.ts for the whole flow.
   ══════════════════════════════════════════════════════════════════════════ */
import { supabase } from './supabase';
import { isNativeShell } from './nativeAuth';
import { setRecoveryState } from './recoveryState';

supabase.auth.onAuthStateChange((event) => {
  if (event === 'PASSWORD_RECOVERY') setRecoveryState('ready');
});

/** Where the emailed link brings the person back. The site root: Supabase
 *  always allows its own Site URL host. In the Android shell the origin is the
 *  app's own (https://localhost), which the email can't open, so send them to
 *  the website; they make the new password there and sign in on the app. */
function resetReturnUrl(): string {
  return isNativeShell() ? 'https://megyprints.vercel.app/' : `${window.location.origin}/`;
}

/** Email a reset link. Supabase answers the same whether or not the email has
 *  an account, so this never tells a stranger who has signed up. */
export async function sendResetLink(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: resetReturnUrl(),
  });
  return error;
}

export async function saveNewPassword(password: string) {
  const { error } = await supabase.auth.updateUser({ password });
  return error;
}
