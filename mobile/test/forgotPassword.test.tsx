/* ══════════════════════════════════════════════════════════════════════════
   FORGOT PASSWORD ON THE SIGN-IN SCREEN (Phase 6: src/app/sign-in.tsx), the
   website's sign-in box (src/pages/auth/LoginModal.tsx: "Forgot password?"
   → "Forgot your password?" → "Check your email"):
     • "Forgot password?" under the password opens "Forgot your password?",
       with the email already typed;
     • the website's checks on the email ("Email is required", "Please enter
       a valid email"), nothing sent;
     • "Email me a link": the website's Supabase call, the link coming back
       to the website (as from the 1.x app), then "Check your email" and
       where the link goes;
     • a failed send: the website's words (passwordReset.ts);
     • "Back to sign in", with the email kept.
   ══════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { sendLinkErrorText } from '@web/lib/passwordReset';
import SignIn from '../src/app/sign-in';
import * as pw from '../src/lib/account/passwordLink';

const REPO = path.resolve(__dirname, '..', '..');
const LOGIN_SRC = fs.readFileSync(path.join(REPO, 'src/pages/auth/LoginModal.tsx'), 'utf8');

// Google's answer comes back only to the Play app (lib/account/googleHere.ts).
jest.mock('../src/lib/buildKind', () => ({ buildKind: () => 'play' }));
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => ({}),
  useIsFocused: () => true,
}));
jest.mock('../src/lib/auth', () => ({ useAuth: () => ({ signIn: jest.fn(), session: null }) }));
const mockReset: { calls: unknown[][]; error: unknown } = { calls: [], error: null };
jest.mock('../src/lib/supabase', () => ({
  supabaseConfigured: true,
  supabase: {
    auth: {
      resetPasswordForEmail: async (...args: unknown[]) => { mockReset.calls.push(args); return { data: {}, error: mockReset.error }; },
      signInWithOAuth: async () => ({ data: { url: 'https://example.supabase.co/auth/v1/authorize' }, error: null }),
    },
  },
}));
jest.mock('expo-web-browser', () => ({ openBrowserAsync: async () => ({ type: 'opened' }) }));
jest.mock('expo-crypto', () => ({ getRandomBytes: (n: number) => new Uint8Array(n).fill(171) }));
jest.mock('@react-native-async-storage/async-storage', () => jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));

beforeEach(() => {
  mockReset.calls = [];
  mockReset.error = null;
});

async function openForgot(typed = '') {
  await render(<SignIn />);
  if (typed) await fireEvent.changeText(screen.getByTestId('email'), typed);
  await fireEvent.press(screen.getByTestId('forgot-password'));
}

describe('Forgot password, the website\'s way', () => {
  it('the words are the website\'s sign-in box', () => {
    for (const w of [pw.FORGOT_LINK, pw.FORGOT_TITLE, pw.CHANGE_SUB, pw.EMAIL_LABEL, pw.BACK_TO_SIGN_IN, pw.EMAIL_REQUIRED, pw.EMAIL_INVALID]) {
      expect(LOGIN_SRC).toContain(w);
    }
    expect(LOGIN_SRC).toContain("forgot: { title: 'Forgot your password?', sub: 'We will email you a link to make a new one.' }");
    expect(LOGIN_SRC).toContain("if (!/^\\S+@\\S+\\.\\S+$/.test(email.trim())) {");
    expect(LOGIN_SRC).toContain("setFieldErrors({ email: email.trim() ? 'Please enter a valid email' : 'Email is required' });");
    expect(pw.emailProblem('')).toBe('Email is required');
    expect(pw.emailProblem('   ')).toBe('Email is required');
    expect(pw.emailProblem('maria@')).toBe('Please enter a valid email');
    expect(pw.emailProblem(' maria@example.test ')).toBeNull();
  });

  it('"Forgot password?" opens "Forgot your password?" with the email already typed', async () => {
    await openForgot('maria@example.test');
    expect(screen.getByText('Forgot your password?')).toBeOnTheScreen();
    expect(screen.getByText('We will email you a link to make a new one.')).toBeOnTheScreen();
    expect(screen.getByText('The email you signed up with')).toBeOnTheScreen();
    expect(screen.getByTestId('forgot-email').props.value).toBe('maria@example.test');
    expect(screen.getByText(pw.OPENS_WEBSITE)).toBeOnTheScreen();
    expect(screen.queryByTestId('password')).toBeNull();
    // A Gmail account needs no email: Google, as in the website's box.
    expect(screen.getByTestId('sign-in-google')).toBeOnTheScreen();
  });

  it('no email, or not an email: the website\'s words, nothing sent', async () => {
    await openForgot();
    await fireEvent.press(screen.getByTestId('send-link'));
    expect(screen.getByTestId('forgot-error')).toHaveTextContent('Email is required');
    await fireEvent.changeText(screen.getByTestId('forgot-email'), 'maria@');
    expect(screen.queryByTestId('forgot-error')).toBeNull(); // typing clears it
    await fireEvent.press(screen.getByTestId('send-link'));
    expect(screen.getByTestId('forgot-error')).toHaveTextContent('Please enter a valid email');
    expect(mockReset.calls).toHaveLength(0);
  });

  it('"Email me a link": the website\'s call, the link back to the website, then "Check your email"', async () => {
    await openForgot(' maria@example.test ');
    await fireEvent.press(screen.getByTestId('send-link'));
    expect(mockReset.calls).toEqual([['maria@example.test', { redirectTo: 'https://megyprints.vercel.app/' }]]);
    expect(await screen.findByText('Check your email')).toBeOnTheScreen();
    expect(screen.getByText('The link to make a new password is on its way.')).toBeOnTheScreen();
    expect(screen.getByText('We sent a link to maria@example.test. Open it to make a new password.')).toBeOnTheScreen();
    expect(screen.getByText(pw.SENT_HELP)).toBeOnTheScreen();
    expect(screen.getByText(pw.OPENS_WEBSITE)).toBeOnTheScreen();
    // Back to sign in, the email kept, ready for the new password.
    await fireEvent.press(screen.getByTestId('back-to-sign-in'));
    expect(screen.getByTestId('email').props.value).toBe(' maria@example.test ');
    expect(screen.getByTestId('password')).toBeOnTheScreen();
  });

  it.each([
    ['too many tries', { message: 'rate', code: 'over_email_send_rate_limit', status: 429 }],
    ['no email set up', { message: 'nope', code: 'email_address_not_authorized' }],
    ['anything else', { message: 'x' }],
  ])('a failed send (%s): the website\'s words, still on "Forgot your password?"', async (_n, error) => {
    mockReset.error = error;
    await openForgot('maria@example.test');
    await fireEvent.press(screen.getByTestId('send-link'));
    expect(await screen.findByTestId('forgot-error')).toHaveTextContent(sendLinkErrorText(error));
    expect(screen.queryByText('Check your email')).toBeNull();
  });

  it('"Back to sign in" from "Forgot your password?"', async () => {
    await openForgot('maria@example.test');
    await fireEvent.changeText(screen.getByTestId('forgot-email'), 'ana@example.test');
    await fireEvent.press(screen.getByTestId('back-to-sign-in'));
    expect(screen.getByTestId('email').props.value).toBe('ana@example.test');
    expect(screen.queryByText('Forgot your password?')).toBeNull();
  });
});
