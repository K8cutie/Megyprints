/* ══════════════════════════════════════════════════════════════════════════
   Forgot password — the checks and the words, kept apart from Supabase so
   they can be tested on their own. The flow itself:
     1. Sign in → "Forgot password?" → email → resetPasswordForEmail.
     2. The emailed link signs the person in and lands on the site with
        type=recovery; supabase-js fires PASSWORD_RECOVERY (passwordRecovery.ts).
     3. "Make a new password" → updateUser({ password }).
   Supabase only emails customers once the project has its own SMTP set up;
   without it every customer gets email_address_not_authorized.
   ══════════════════════════════════════════════════════════════════════════ */

/** New passwords follow the sign-up rule (SignupModal). Sign-in still lets
 *  6 through because older accounts were made with 6. */
export const NEW_PASSWORD_MIN = 8;

/** The part of a Supabase auth error these screens read. */
export interface AuthErrorLike {
  message?: string;
  code?: string;
  status?: number;
  name?: string;
}

/** True when the page opened from an email link that is used up or over an
 *  hour old. Supabase sends those back as
 *  #error=access_denied&error_code=otp_expired&error_description=…
 *  It opens "Forgot your password?". While sign-up is auto-confirmed this
 *  app emails nothing but reset links. If "Confirm email" is turned on, an
 *  expired sign-up link lands here too, and a reset link still gets the
 *  person in: opening it confirms the email. Read it before the router
 *  replaces the hash. */
export function isExpiredEmailLink(hash: string): boolean {
  const params = new URLSearchParams(hash.replace(/^#\/?/, ''));
  return params.get('error_code') === 'otp_expired';
}

/** Words for a failed "Email me a link". */
export function sendLinkErrorText(err: AuthErrorLike): string {
  if (err.code === 'email_address_not_authorized') {
    // The project has no SMTP of its own yet, so Supabase won't email customers.
    return "We can't send emails right now. Send us a message on the Contact page and we will help you sign in.";
  }
  if (err.code === 'over_email_send_rate_limit' || err.code === 'over_request_rate_limit' || err.status === 429) {
    return 'Too many tries. Please wait a few minutes, then try again.';
  }
  if (err.code === 'email_address_invalid' || err.code === 'validation_failed') {
    return 'Please check the email and try again.';
  }
  return "We couldn't send the email. Check your internet and try again.";
}

/** Words for a failed "Save new password". `expired` = the reset sign-in is
 *  gone, so the person needs a new link. */
export function newPasswordErrorText(err: AuthErrorLike): { text: string; expired: boolean } {
  if (err.code === 'same_password') {
    return { text: 'That is your old password. Please type a new one.', expired: false };
  }
  if (err.code === 'weak_password') {
    return { text: 'That password is too easy to guess. Try a longer one.', expired: false };
  }
  if (err.code === 'session_not_found' || err.name === 'AuthSessionMissingError' || err.status === 401) {
    return { text: 'This link has run out. Please ask for a new one.', expired: true };
  }
  return { text: "We couldn't save it. Check your internet and try again.", expired: false };
}
