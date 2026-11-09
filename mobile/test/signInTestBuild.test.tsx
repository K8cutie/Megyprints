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
import { Platform } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import SignIn from '../src/app/sign-in';
import { GOOGLE_IN_PLAY_APP, GOOGLE_IN_PLAY_APP_SHORT } from '../src/lib/account/googleHere';
import { APPLE_DID_NOT_WORK } from '../src/lib/appleSignIn';

const REPO = path.resolve(__dirname, '..', '..');
/* eslint-disable @typescript-eslint/no-require-imports */
const appConfig = require('../app.config.js') as (arg: { config: Record<string, unknown> }, env?: Record<string, string>) => { android: { package: string } };
const appJson = require('../app.json') as { expo: Record<string, unknown> };
/* eslint-enable @typescript-eslint/no-require-imports */

const mockKind = { value: 'dev' as 'dev' | 'play' };
jest.mock('../src/lib/buildKind', () => ({ buildKind: () => mockKind.value }));
const mockRouter = { back: jest.fn(), replace: jest.fn(), push: jest.fn(), canGoBack: () => true };
// Read when called: the screen is imported (and these made) before the consts above run.
jest.mock('expo-router', () => ({
  get router() { return mockRouter; },
  useLocalSearchParams: () => ({}),
  useIsFocused: () => true,
}));
jest.mock('../src/lib/auth', () => ({ useAuth: () => ({ signIn: jest.fn(), session: null }) }));
const mockAuth = {
  signInWithOAuth: jest.fn(async () => ({ data: { url: 'https://supabase.example/google' }, error: null as { message: string } | null })),
  signInWithIdToken: jest.fn(async () => ({ error: null as { message: string } | null })),
};
jest.mock('../src/lib/supabase', () => ({
  supabaseConfigured: true,
  supabase: {
    auth: {
      resetPasswordForEmail: async () => ({ data: {}, error: null }),
      signInWithOAuth: (...a: unknown[]) => (mockAuth.signInWithOAuth as (...x: unknown[]) => unknown)(...a),
      signInWithIdToken: (...a: unknown[]) => (mockAuth.signInWithIdToken as (...x: unknown[]) => unknown)(...a),
    },
  },
}));
const mockBrowser = {
  openAuthSessionAsync: jest.fn(async () => ({ type: 'cancel' }) as { type: string; url?: string }),
};
jest.mock('expo-web-browser', () => ({
  openBrowserAsync: async () => ({ type: 'opened' }),
  openAuthSessionAsync: (...a: unknown[]) => (mockBrowser.openAuthSessionAsync as (...x: unknown[]) => unknown)(...a),
}));
jest.mock('expo-crypto', () => ({
  getRandomBytes: (n: number) => new Uint8Array(n).fill(171),
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digestStringAsync: async (_a: string, t: string) => `sha256(${t})`,
}));
const mockApple = { available: true, signIn: jest.fn(async (_o: unknown) => ({ identityToken: 'apple-token' }) as { identityToken: string | null }) };
jest.mock('expo-apple-authentication', () => {
  const { Pressable, Text } = jest.requireActual('react-native');
  return {
    isAvailableAsync: async () => mockApple.available,
    signInAsync: (o: unknown) => mockApple.signIn(o),
    AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
    AppleAuthenticationButtonType: { SIGN_IN: 0 },
    AppleAuthenticationButtonStyle: { WHITE_OUTLINE: 1 },
    AppleAuthenticationButton: ({ onPress, testID }: { onPress: () => void; testID?: string }) => (
      <Pressable onPress={onPress} testID={testID}><Text>Sign in with Apple</Text></Pressable>
    ),
  };
});
jest.mock('@react-native-async-storage/async-storage', () => jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));

/** These cases are Android's (jest runs as iOS): the Play app and the test app. */
const asAndroid = () => {
  beforeEach(() => { jest.replaceProperty(Platform, 'OS', 'android'); });
  afterEach(() => { jest.restoreAllMocks(); });
};

describe('the test app', () => {
  asAndroid();
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
  asAndroid();
  beforeEach(() => { mockKind.value = 'play'; });

  it('the Google button, as before; no line about it; no Apple button on Android', async () => {
    await render(<SignIn />);
    expect(screen.getByTestId('sign-in-google')).toHaveTextContent('Sign in with Google');
    expect(screen.queryByTestId('google-play-only')).toBeNull();
    expect(screen.queryByTestId('sign-in-apple')).toBeNull();
  });
});

/* iPhone (jest runs as iOS): Google in Apple's sign-in window, so the test
   app has it too; and Sign in with Apple (Apple's rule 4.8). */
describe('iPhone', () => {
  beforeEach(() => {
    mockKind.value = 'dev';
    mockApple.available = true;
    mockRouter.push.mockClear();
    mockRouter.replace.mockClear();
    mockBrowser.openAuthSessionAsync.mockReset();
    mockAuth.signInWithIdToken.mockReset().mockResolvedValue({ error: null });
    mockApple.signIn.mockReset().mockResolvedValue({ identityToken: 'apple-token' });
  });

  it('the test app has the Google button and the Apple button', async () => {
    await render(<SignIn />);
    expect(screen.getByTestId('sign-in-google')).toBeOnTheScreen();
    expect(screen.queryByTestId('google-play-only')).toBeNull();
    await waitFor(() => expect(screen.getByTestId('sign-in-apple')).toBeOnTheScreen());
  });

  it('Google opens in Apple\'s sign-in window; its answer goes to the auth-return screen', async () => {
    mockBrowser.openAuthSessionAsync.mockResolvedValue({ type: 'success', url: 'megyprints://auth?access_token=a&refresh_token=r&n=abc' });
    await render(<SignIn />);
    await fireEvent.press(screen.getByTestId('sign-in-google'));
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalled());
    expect(mockBrowser.openAuthSessionAsync).toHaveBeenCalledWith('https://supabase.example/google', 'megyprints://auth');
    expect(mockRouter.push).toHaveBeenCalledWith('/auth-return?access_token=a&refresh_token=r&n=abc');
  });

  it('Google\'s window closed: nothing happens', async () => {
    mockBrowser.openAuthSessionAsync.mockResolvedValue({ type: 'cancel' });
    await render(<SignIn />);
    await fireEvent.press(screen.getByTestId('sign-in-google'));
    await waitFor(() => expect(mockBrowser.openAuthSessionAsync).toHaveBeenCalled());
    expect(mockRouter.push).not.toHaveBeenCalled();
    expect(screen.queryByTestId('sign-in-error')).toBeNull();
  });

  it('Sign in with Apple: Apple gets the hashed one-time code, Supabase the code itself; signed in, on to My albums', async () => {
    await render(<SignIn />);
    await waitFor(() => expect(screen.getByTestId('sign-in-apple')).toBeOnTheScreen());
    await fireEvent.press(screen.getByTestId('sign-in-apple'));
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/albums'));
    const asked = mockApple.signIn.mock.calls[0][0] as { nonce: string };
    const sent = mockAuth.signInWithIdToken.mock.calls[0] as unknown as [{ provider: string; token: string; nonce: string }];
    expect(sent[0].provider).toBe('apple');
    expect(sent[0].token).toBe('apple-token');
    expect(asked.nonce).toBe(`sha256(${sent[0].nonce})`);
  });

  it('Apple\'s sheet closed: no message; Supabase refused: the plain line', async () => {
    mockApple.signIn.mockRejectedValueOnce(Object.assign(new Error('closed'), { code: 'ERR_REQUEST_CANCELED' }));
    await render(<SignIn />);
    await waitFor(() => expect(screen.getByTestId('sign-in-apple')).toBeOnTheScreen());
    await fireEvent.press(screen.getByTestId('sign-in-apple'));
    await waitFor(() => expect(mockApple.signIn).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId('sign-in-error')).toBeNull();
    mockAuth.signInWithIdToken.mockResolvedValueOnce({ error: { message: 'Provider is not enabled' } });
    await fireEvent.press(screen.getByTestId('sign-in-apple'));
    await waitFor(() => expect(screen.getByTestId('sign-in-error')).toHaveTextContent(APPLE_DID_NOT_WORK));
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it('a phone without Sign in with Apple: no Apple button', async () => {
    mockApple.available = false;
    await render(<SignIn />);
    await waitFor(() => expect(screen.getByTestId('sign-in-google')).toBeOnTheScreen());
    expect(screen.queryByTestId('sign-in-apple')).toBeNull();
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

  it('on an iPhone the page hands the answer to megyprints://auth, the scheme the app\'s Apple window waits for', () => {
    const page = fs.readFileSync(path.join(REPO, 'public/auth-native.js'), 'utf8');
    expect(page).toContain("'megyprints://auth?' + p.toString()");
    expect(page).toMatch(/iPhone\|iPad\|iPod/);
  });
});
