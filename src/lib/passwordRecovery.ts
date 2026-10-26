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
import { emailLinkReturnUrl } from './nativeAuth';
import { setRecoveryState } from './recoveryState';

supabase.auth.onAuthStateChange((event) => {
  if (event === 'PASSWORD_RECOVERY') setRecoveryState('ready');
});

/** Email a reset link. Supabase answers the same whether or not the email has
 *  an account, so this never tells a stranger who has signed up. */
export async function sendResetLink(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: emailLinkReturnUrl(),
  });
  return error;
}

/** Send the "finish making your account" link again. Only used once
 *  "Confirm email" is on (the sign-in box offers it for "Email not confirmed"). */
export async function resendSignupLink(email: string) {
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email: email.trim(),
    options: { emailRedirectTo: emailLinkReturnUrl() },
  });
  return error;
}

export async function saveNewPassword(password: string) {
  const { error } = await supabase.auth.updateUser({ password });
  return error;
}
