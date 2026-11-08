/* ══════════════════════════════════════════════════════════════════════════
   WHY THIS TEST: signing in from checkout must come back to the order. It
   went to My albums, and checkout, opened again, still said "You must be
   signed in" (review of the checkout screens). Opened from anywhere else,
   sign-in still opens My albums, as in Phase 1.
   ══════════════════════════════════════════════════════════════════════════ */
import { Platform } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import SignIn from '../src/app/sign-in';

const mockRouter = { back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) };
const mockParams: { then?: string } = {};
const mockSignIn = jest.fn(async () => ({ ok: true as const }));

// Google's answer comes back only to the Play app (lib/account/googleHere.ts).
jest.mock('../src/lib/buildKind', () => ({ buildKind: () => 'play' }));
jest.mock('expo-router', () => ({
  router: { back: () => mockRouter.back(), replace: (h: unknown) => mockRouter.replace(h), canGoBack: () => mockRouter.canGoBack() },
  useLocalSearchParams: () => mockParams,
  useIsFocused: () => mockFocused.value,
}));
const mockFocused = { value: true };
const mockSession: { value: unknown } = { value: null };
jest.mock('../src/lib/auth', () => ({ useAuth: () => ({ signIn: mockSignIn, session: mockSession.value }) }));
const mockGoogle = { oauth: [] as unknown[], opened: [] as string[] };
jest.mock('../src/lib/supabase', () => ({
  supabaseConfigured: true,
  supabase: { auth: { signInWithOAuth: async (a: unknown) => { mockGoogle.oauth.push(a); return { data: { url: 'https://example.supabase.co/auth/v1/authorize?provider=google' }, error: null }; } } },
}));
jest.mock('expo-web-browser', () => ({ openBrowserAsync: async (u: string) => { mockGoogle.opened.push(u); return { type: 'opened' }; } }));
jest.mock('expo-crypto', () => ({ getRandomBytes: (n: number) => new Uint8Array(n).fill(171) }));
jest.mock('@react-native-async-storage/async-storage', () => jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));

beforeEach(() => {
  mockRouter.back.mockClear();
  mockRouter.replace.mockClear();
  mockRouter.canGoBack.mockImplementation(() => true);
  delete mockParams.then;
  mockSession.value = null;
  mockFocused.value = true;
  mockGoogle.oauth = [];
  mockGoogle.opened = [];
});

async function signInNow() {
  await render(<SignIn />);
  await fireEvent.changeText(screen.getByTestId('email'), 'tester@example.com');
  await fireEvent.changeText(screen.getByTestId('password'), 'not-a-real-password');
  await fireEvent.press(screen.getByTestId('sign-in'));
}

describe('where sign-in goes after it works', () => {
  it('from checkout (then=back): back to the order', async () => {
    mockParams.then = 'back';
    await signInNow();
    expect(mockSignIn).toHaveBeenCalled();
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it('from the start screen: My albums, as before', async () => {
    await signInNow();
    expect(mockRouter.replace).toHaveBeenCalledWith('/albums');
    expect(mockRouter.back).not.toHaveBeenCalled();
  });

  it('then=back with nothing to go back to: My albums', async () => {
    mockParams.then = 'back';
    mockRouter.canGoBack.mockImplementation(() => false);
    await signInNow();
    expect(mockRouter.replace).toHaveBeenCalledWith('/albums');
    expect(mockRouter.back).not.toHaveBeenCalled();
  });
});

describe('Sign in with Google (lib/googleSignIn.ts)', () => {
  // Android's way: a Chrome tab, back through the link (jest runs as iOS;
  // iPhone's way, Apple's sign-in window, is in signInTestBuild.test.tsx).
  beforeEach(() => { jest.replaceProperty(Platform, 'OS', 'android'); });
  afterEach(() => { jest.restoreAllMocks(); });

  it('the website\'s button and words; it opens Google in a tab with a new one-time code', async () => {
    await render(<SignIn />);
    expect(screen.getByText('Signed up with a Gmail? Sign in with Google using that same Gmail. Your albums will be there.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('sign-in-google'));
    expect(screen.getByTestId('sign-in-google')).toHaveTextContent('Sign in with Google');
    expect(mockGoogle.opened).toEqual(['https://example.supabase.co/auth/v1/authorize?provider=google']);
    const nonce = 'ab'.repeat(16);
    expect(mockGoogle.oauth).toEqual([{ provider: 'google', options: { redirectTo: `https://megyprints.vercel.app/auth-native.html?n=${nonce}`, skipBrowserRedirect: true } }]);
  });

  it('back from Google signed in: on from the sign-in screen as after a password (then=back: back to the order)', async () => {
    mockParams.then = 'back';
    const view = await render(<SignIn />);
    await fireEvent.press(screen.getByTestId('sign-in-google'));
    mockSession.value = { user: { id: 'user-1' } };
    await view.rerender(<SignIn />);
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
  });

  it('signed in while the auth-return screen is still in front: nothing moves until sign-in is in front again, then once', async () => {
    const view = await render(<SignIn />);
    await fireEvent.press(screen.getByTestId('sign-in-google'));
    mockFocused.value = false; // auth-return on top
    mockSession.value = { user: { id: 'user-1' } };
    await view.rerender(<SignIn />);
    expect(mockRouter.replace).not.toHaveBeenCalled();
    expect(mockRouter.back).not.toHaveBeenCalled();
    mockFocused.value = true; // auth-return closed itself
    await view.rerender(<SignIn />);
    await view.rerender(<SignIn />);
    expect(mockRouter.replace).toHaveBeenCalledTimes(1);
    expect(mockRouter.replace).toHaveBeenCalledWith('/albums');
  });

  it('Google tab closed without signing in, then a password: it goes on once, not twice', async () => {
    mockParams.then = 'back';
    const view = await render(<SignIn />);
    await fireEvent.press(screen.getByTestId('sign-in-google'));
    await fireEvent.changeText(screen.getByTestId('email'), 'tester@example.com');
    await fireEvent.changeText(screen.getByTestId('password'), 'not-a-real-password');
    await fireEvent.press(screen.getByTestId('sign-in'));
    mockSession.value = { user: { id: 'user-1' } };
    await view.rerender(<SignIn />);
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
  });

  it('a session already there when the screen opens (signed in elsewhere): it does not jump away by itself', async () => {
    mockSession.value = { user: { id: 'user-1' } };
    await render(<SignIn />);
    expect(mockRouter.back).not.toHaveBeenCalled();
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });
});
