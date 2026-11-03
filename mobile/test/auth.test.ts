import { signInErrorText } from '@web/lib/accountErrors';
import { GOOGLE_SIGN_IN_IN_APP, signInFailureText, signInFormProblem } from '../src/lib/auth';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

describe('sign-in words', () => {
  it('a wrong password says what the website says (shared accountErrors), word for word now that Google sign-in is in the app', () => {
    const web = signInErrorText('Invalid login credentials').text;
    const text = signInFailureText({ message: 'Invalid login credentials' });
    expect(GOOGLE_SIGN_IN_IN_APP).toBe(true);
    expect(text).toBe(web);
    expect(text).toMatch(/Sign in with Google/);
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
