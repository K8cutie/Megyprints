/* ══════════════════════════════════════════════════════════════════════════
   SIGN IN WITH GOOGLE IS ONLY IN THE PLAY APP (src/app/sign-in.tsx).

   Owner, on the first test APK (2026-11-02): "when i press sign in it
   directs me to the webapp version". Google's answer comes back through the
   website's page (public/auth-native.js), and that page hands it ONLY to the
   Play app's package, com.megyprints.app. The test app is another package
   (com.megyprints.app.dev), so Android opened the Play Store for the Play
   app (1.x, which shows the website) and the sign-in was lost.
     • the test app: no Google button; a line says Google is in the Play
       app, and how to sign in here (email and password, or make one);
     • the Play app: the button, as before;
     • the website's page really is pinned to the Play app's package.
   ══════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { fireEvent, render, screen } from '@testing-library/react-native';
import SignIn from '../src/app/sign-in';
import { GOOGLE_IN_PLAY_APP, GOOGLE_IN_PLAY_APP_SHORT } from '../src/lib/account/googleHere';

const REPO = path.resolve(__dirname, '..', '..');
/* eslint-disable @typescript-eslint/no-require-imports */
const appConfig = require('../app.config.js') as (arg: { config: Record<string, unknown> }, env?: Record<string, string>) => { android: { package: string } };
const appJson = require('../app.json') as { expo: Record<string, unknown> };
/* eslint-enable @typescript-eslint/no-require-imports */

const mockKind = { value: 'dev' as 'dev' | 'play' };
jest.mock('../src/lib/buildKind', () => ({ buildKind: () => mockKind.value }));
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => ({}),
  useIsFocused: () => true,
}));
jest.mock('../src/lib/auth', () => ({ useAuth: () => ({ signIn: jest.fn(), session: null }) }));
jest.mock('../src/lib/supabase', () => ({
  supabaseConfigured: true,
  supabase: { auth: { resetPasswordForEmail: async () => ({ data: {}, error: null }) } },
}));
jest.mock('expo-web-browser', () => ({ openBrowserAsync: async () => ({ type: 'opened' }) }));
jest.mock('expo-crypto', () => ({ getRandomBytes: (n: number) => new Uint8Array(n).fill(171) }));
jest.mock('@react-native-async-storage/async-storage', () => jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));

describe('the test app', () => {
  beforeEach(() => { mockKind.value = 'dev'; });

  it('no Google button; the line says where Google is and how to sign in here', async () => {
    await render(<SignIn />);
    expect(screen.queryByTestId('sign-in-google')).toBeNull();
    expect(screen.getByTestId('google-play-only')).toHaveTextContent(GOOGLE_IN_PLAY_APP);
    expect(GOOGLE_IN_PLAY_APP).toBe('Sign in with Google is in the Megy Prints app from the Play Store. In this test app, sign in with your email and password. Signed up with Google and have no password? Tap "Forgot password?" to make one.');
    // Email and password are all there.
    expect(screen.getByTestId('email')).toBeOnTheScreen();
    expect(screen.getByTestId('password')).toBeOnTheScreen();
    expect(screen.getByTestId('forgot-password')).toBeOnTheScreen();
  });

  it('"Forgot your password?": no Google button either, the short line', async () => {
    await render(<SignIn />);
    await fireEvent.press(screen.getByTestId('forgot-password'));
    expect(screen.queryByTestId('sign-in-google')).toBeNull();
    expect(screen.getByTestId('google-play-only')).toHaveTextContent(GOOGLE_IN_PLAY_APP_SHORT);
    expect(GOOGLE_IN_PLAY_APP_SHORT).toBe('Sign in with Google is in the Megy Prints app from the Play Store.');
  });
});

describe('the Play app', () => {
  beforeEach(() => { mockKind.value = 'play'; });

  it('the Google button, as before; no line about it', async () => {
    await render(<SignIn />);
    expect(screen.getByTestId('sign-in-google')).toHaveTextContent('Sign in with Google');
    expect(screen.queryByTestId('google-play-only')).toBeNull();
  });
});

describe('why', () => {
  it('the website\'s page hands Google\'s answer only to the Play app\'s package, not the test app\'s', () => {
    const page = fs.readFileSync(path.join(REPO, 'public/auth-native.js'), 'utf8');
    const play = appConfig({ config: appJson.expo }, { MEGY_PLAY: '1' }).android.package;
    const test = appConfig({ config: appJson.expo }, {}).android.package;
    expect(play).toBe('com.megyprints.app');
    expect(test).not.toBe(play);
    expect(page).toContain(`package=${play};end`);
    expect(page).not.toContain(`package=${test};`);
  });
});
