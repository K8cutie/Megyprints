import { describe, it, expect } from 'vitest';
import { isExpiredEmailLink, sendLinkErrorText, newPasswordErrorText, NEW_PASSWORD_MIN } from './passwordReset';

describe('isExpiredEmailLink', () => {
  it('spots the hash Supabase sends back for a used or old email link', () => {
    expect(isExpiredEmailLink('#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired')).toBe(true);
  });

  it('ignores a working reset link, a normal route and other errors', () => {
    expect(isExpiredEmailLink('#access_token=abc&refresh_token=def&type=recovery')).toBe(false);
    expect(isExpiredEmailLink('#/builder')).toBe(false);
    expect(isExpiredEmailLink('')).toBe(false);
    // A cancelled Google sign-in is not an expired reset link.
    expect(isExpiredEmailLink('#error=access_denied&error_description=User+cancelled')).toBe(false);
  });
});

describe('sendLinkErrorText', () => {
  it('says plainly when the project cannot email customers yet (no SMTP)', () => {
    expect(sendLinkErrorText({ code: 'email_address_not_authorized', status: 400 })).toMatch(/Contact page/);
  });

  it('asks them to wait when Supabase rate-limits', () => {
    expect(sendLinkErrorText({ code: 'over_email_send_rate_limit', status: 429 })).toMatch(/wait/);
    expect(sendLinkErrorText({ status: 429 })).toMatch(/wait/);
  });

  it('falls back to an internet message for anything else', () => {
    expect(sendLinkErrorText({})).toMatch(/internet/);
  });
});

describe('newPasswordErrorText', () => {
  it('asks for a different password when it matches the old one', () => {
    expect(newPasswordErrorText({ code: 'same_password', status: 422 })).toEqual({ text: expect.stringMatching(/old password/), expired: false });
  });

  it('marks a lost reset sign-in as expired so the screen offers a new link', () => {
    expect(newPasswordErrorText({ name: 'AuthSessionMissingError', message: 'Auth session missing!' }).expired).toBe(true);
    expect(newPasswordErrorText({ code: 'session_not_found', status: 403 }).expired).toBe(true);
  });

  it('keeps the sign-up rule for new passwords', () => {
    expect(NEW_PASSWORD_MIN).toBe(8);
  });
});
