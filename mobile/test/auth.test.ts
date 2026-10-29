import { signInErrorText } from '@web/lib/accountErrors';
import { GOOGLE_SIGN_IN_IN_APP, signInFailureText, signInFormProblem } from '../src/lib/auth';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

describe('sign-in words', () => {
  it('a wrong password says what the website says (shared accountErrors), without the Google button hint', () => {
    const web = signInErrorText('Invalid login credentials').text;
    const text = signInFailureText({ message: 'Invalid login credentials' });
    expect(GOOGLE_SIGN_IN_IN_APP).toBe(false);
    expect(text).toBe('Wrong email or password. Check the email for a typo.');
    // The app's words are the website's, minus the sentence about a Google button the app does not have yet.
    expect(web.startsWith(text)).toBe(true);
    expect(web).toMatch(/Sign in with Google/);
    expect(text).not.toMatch(/Google/);
  });

  it('no connection says so in plain words', () => {
    expect(signInFailureText(new TypeError('Network request failed'))).toBe(
      'Could not reach Megy Prints. Check that the phone is online, then try again.',
    );
  });

  it('an email waiting for its link says to open it', () => {
    expect(signInFailureText({ message: 'Email not confirmed' })).toBe('Open the link we emailed you to finish making your account.');
  });

  it('checks the boxes before asking the server', () => {
    expect(signInFormProblem('', 'x')).toBe('Type your email.');
    expect(signInFormProblem('not-an-email', 'x')).toMatch(/^Check your email/);
    expect(signInFormProblem('ana@example.com', '')).toBe('Type your password.');
    expect(signInFormProblem(' ana@example.com ', 'secret')).toBeNull();
  });
});
