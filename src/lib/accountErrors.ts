/* ══════════════════════════════════════════════════════════════════════════
   "This email already has an account": the words for sign-up, sign-in and a
   refused Google sign-in, kept apart from Supabase so they can be tested.

   One person, one account (owner 2026-10-24, after a customer made a second
   account under a mistyped email and her albums and orders seemed gone):
     • the same email, any capitals: Supabase refuses it (user_already_exists
       while auto-confirm is on; with "Confirm email" on it answers with a
       user that has no identities instead, see authContext.signup);
     • the same Gmail with dots moved or googlemail.com: 0054's
       hook_one_account_per_gmail refuses it, for email AND Google, saying
       "This Gmail already has an account as <the spelling to sign in with>".
   Every refusal points the person at Sign in, with that email filled in.
   ══════════════════════════════════════════════════════════════════════════ */
import type { AuthErrorLike } from './passwordReset';

/** 0054's hook message. The spelling to sign in with comes after "as ". */
const GMAIL_TAKEN = /already has an account as (\S+@\S+)$/;

/** Sign-up was refused because the email already has an account. */
export interface HasAccount {
  /** The email to sign in with (the one on the account). */
  signInAs: string;
  text: string;
}

/** Was this sign-up refusal "you already have an account"? `typed` is the
 *  email the person typed, which is the account's own for an exact repeat. */
export function hasAccountProblem(err: AuthErrorLike, typed: string): HasAccount | null {
  const gmail = err.message?.trim().match(GMAIL_TAKEN);
  if (gmail) {
    return {
      signInAs: gmail[1],
      text: `This Gmail already has an account: ${gmail[1]}. Gmail counts the dots as the same email. Sign in with it.`,
    };
  }
  if (err.code === 'user_already_exists' || /user already registered/i.test(err.message ?? '')) {
    return { signInAs: typed.trim(), text: 'This email already has an account. Sign in with it.' };
  }
  return null;
}

/** Plain words for a failed email sign-in. `unconfirmed` = the account is
 *  waiting for its emailed link (only when "Confirm email" is on). */
export function signInErrorText(message: string): { text: string; unconfirmed: boolean } {
  if (/invalid login credentials/i.test(message)) {
    return {
      text: 'Wrong email or password. Check the email for a typo. Made your account with Google? Use Sign in with Google.',
      unconfirmed: false,
    };
  }
  if (/email not confirmed/i.test(message)) {
    return { text: 'Open the link we emailed you to finish making your account.', unconfirmed: true };
  }
  return { text: message, unconfirmed: false };
}

/** What came back when Google sign-in did not finish (read from the return
 *  URL: Supabase puts error + error_description in the query and the #hash). */
export interface AuthNotice {
  text: string;
  /** Fill the sign-in email with this. */
  email?: string;
}

/** The notice for a Google sign-in that came back with an error, or null.
 *  An expired email link (otp_expired) is NOT this: recoveryState.ts opens
 *  "Forgot your password?" for that. */
export function oauthReturnNotice(search: string, hash: string): AuthNotice | null {
  const q = new URLSearchParams(search.replace(/^\?/, ''));
  const h = new URLSearchParams(hash.replace(/^#\/?/, ''));
  const get = (k: string) => h.get(k) ?? q.get(k);
  if (!get('error') && !get('error_description')) return null;
  if (get('error_code') === 'otp_expired') return null;
  return googleRefusedNotice(get('error_description') ?? '');
}

/** Words for a Google sign-in that Supabase refused, from its description. */
export function googleRefusedNotice(description: string): AuthNotice {
  const gmail = description.trim().match(GMAIL_TAKEN);
  if (gmail) {
    return {
      text: `This Gmail already has an account: ${gmail[1]}. Sign in with that email and your password. Forgot it? Tap Forgot password.`,
      email: gmail[1],
    };
  }
  return { text: "Google sign-in didn't finish. Try again, or sign in with your email." };
}
