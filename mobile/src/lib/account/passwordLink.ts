/* ══════════════════════════════════════════════════════════════════════════
   CHANGE PASSWORD, THE WEBSITE'S WAY: an emailed link (src/lib/
   passwordRecovery.ts sendResetLink, and src/lib/nativeAuth.ts
   emailLinkReturnUrl for the Android app).

   1. "Email me a link" → resetPasswordForEmail(the account's email), with
      the website as the place the link comes back to: the phone's app has
      no web page for it, so, as in the 1.x Android app, the link opens the
      website, which shows "Make a new password" (NewPasswordModal).
   2. The person makes the new password there, and uses it next time they
      sign in on the app.
   The words are the website's (LoginModal's "Forgot your password?" and
   "Check your email", and the shared passwordReset.ts for a failure).
   Used by Change password (Profile) and "Forgot password?" (sign-in).
   ══════════════════════════════════════════════════════════════════════════ */
import type { SupabaseClient } from '@supabase/supabase-js';
import { sendLinkErrorText } from '@web/lib/passwordReset';
import { siteFile } from '../checkout/site';

/** Where the emailed link brings the person: the website's front page (the
 *  website's emailLinkReturnUrl() in the Android app). */
export function passwordLinkReturn(): string {
  return siteFile('');
}

export const CHANGE_TITLE = 'Change your password';
export const CHANGE_SUB = 'We will email you a link to make a new one.';
export const EMAIL_LABEL = 'The email you signed up with';
export const SEND = 'Email me a link';
export const SENDING = 'Sending...';
export const SENT_TITLE = 'Check your email';
export const SENT_SUB = 'The link to make a new password is on its way.';
export const sentTo = (email: string): string => `We sent a link to ${email.trim()}. Open it to make a new password.`;
export const SENT_HELP = 'Not there after a few minutes? Look in Spam. Check that this is the email you signed up with.';
/** The app's: where the link goes, and what to do after. */
export const OPENS_WEBSITE = 'The link opens the Megy Prints website. Make your new password there. Next time you sign in on this app, use the new password.';
export const DONE = 'Done';

/* "Forgot password?" on the sign-in screen (LoginModal's forgot view). */
export const FORGOT_LINK = 'Forgot password?';
export const FORGOT_TITLE = 'Forgot your password?';
export const BACK_TO_SIGN_IN = 'Back to sign in';
export const EMAIL_REQUIRED = 'Email is required';
export const EMAIL_INVALID = 'Please enter a valid email';

/** LoginModal's check before "Email me a link": null when it looks like an
 *  email, else the website's words. */
export function emailProblem(email: string): string | null {
  if (/^\S+@\S+\.\S+$/.test(email.trim())) return null;
  return email.trim() ? EMAIL_INVALID : EMAIL_REQUIRED;
}

/** Emails the link. Null when it was sent, else the website's words for why not. */
export async function sendPasswordLink(client: Pick<SupabaseClient, 'auth'>, email: string): Promise<string | null> {
  try {
    const { error } = await client.auth.resetPasswordForEmail(email.trim(), { redirectTo: passwordLinkReturn() });
    return error ? sendLinkErrorText(error) : null;
  } catch {
    return sendLinkErrorText({});
  }
}
