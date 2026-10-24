import { describe, it, expect } from 'vitest';
import { hasAccountProblem, signInErrorText, oauthReturnNotice, googleRefusedNotice } from './accountErrors';

// What 0054's hook sends back (proven against local Supabase auth v2.197.0).
const HOOK = 'This Gmail already has an account as marian.reyes@gmail.com';

describe('hasAccountProblem', () => {
  it('turns Supabase\'s "User already registered" into Sign in with the typed email', () => {
    const p = hasAccountProblem({ code: 'user_already_exists', status: 422, message: 'User already registered' }, ' Marian@Yahoo.com ');
    expect(p).toEqual({ signInAs: 'Marian@Yahoo.com', text: 'This email already has an account. Sign in with it.' });
    // The stand-in error authContext throws when "Confirm email" is on.
    expect(hasAccountProblem({ message: 'User already registered' }, 'a@b.co')?.signInAs).toBe('a@b.co');
  });

  it('signs in with the spelling the Gmail account has, not the one typed', () => {
    const p = hasAccountProblem({ status: 422, code: 'unknown', message: HOOK }, 'marianreyes@gmail.com');
    expect(p?.signInAs).toBe('marian.reyes@gmail.com');
    expect(p?.text).toMatch(/marian\.reyes@gmail\.com/);
    expect(p?.text).toMatch(/Sign in/);
  });

  it('leaves every other sign-up error alone', () => {
    expect(hasAccountProblem({ code: 'weak_password', message: 'Password should be at least 6 characters.' }, 'a@b.co')).toBeNull();
    expect(hasAccountProblem({ status: 429, message: 'email rate limit exceeded' }, 'a@b.co')).toBeNull();
    expect(hasAccountProblem({}, 'a@b.co')).toBeNull();
  });
});

describe('signInErrorText', () => {
  it('says to check the email for a typo on a wrong email or password', () => {
    const r = signInErrorText('Invalid login credentials');
    expect(r.text).toMatch(/typo/);
    expect(r.unconfirmed).toBe(false);
  });

  it('offers the emailed link for an account still waiting for it', () => {
    expect(signInErrorText('Email not confirmed')).toEqual({ text: expect.stringMatching(/link/), unconfirmed: true });
  });

  it('passes anything else through', () => {
    expect(signInErrorText('OAuth sign in failed. Please try again.').text).toBe('OAuth sign in failed. Please try again.');
  });
});

describe('oauthReturnNotice', () => {
  it('reads a refused Google sign-in from the return URL (query and #hash)', () => {
    const q = '?error=server_error&error_description=' + encodeURIComponent(HOOK);
    const h = '#error=server_error&error_description=' + encodeURIComponent(HOOK);
    for (const n of [oauthReturnNotice(q, h), oauthReturnNotice('', h), oauthReturnNotice(q, '')]) {
      expect(n?.email).toBe('marian.reyes@gmail.com');
      expect(n?.text).toMatch(/Forgot password/);
    }
  });

  it('gives plain words for any other Google error, e.g. cancelled', () => {
    const n = oauthReturnNotice('', '#error=access_denied&error_description=User+cancelled');
    expect(n).toEqual({ text: expect.stringMatching(/didn't finish/) });
  });

  it('ignores a normal page, a sign-in that worked, and an expired email link', () => {
    expect(oauthReturnNotice('', '#/builder')).toBeNull();
    expect(oauthReturnNotice('', '')).toBeNull();
    expect(oauthReturnNotice('', '#access_token=abc&refresh_token=def&token_type=bearer')).toBeNull();
    // recoveryState.ts handles this one ("Forgot your password?").
    expect(oauthReturnNotice('', '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired')).toBeNull();
  });
});

describe('googleRefusedNotice', () => {
  it('fills the sign-in email only when the hook named the account', () => {
    expect(googleRefusedNotice(HOOK).email).toBe('marian.reyes@gmail.com');
    expect(googleRefusedNotice('').email).toBeUndefined();
  });
});
