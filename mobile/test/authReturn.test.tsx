/* ══════════════════════════════════════════════════════════════════════════
   BACK FROM GOOGLE (src/app/auth-return.tsx): the screen the way back opens
   (+native-intent.tsx). With the one-time code this phone started, the
   session is set and the person goes back to where they signed in from;
   refused or cancelled, the website's words and the way back to sign in; a
   link this phone didn't start goes to the start screen, nothing signed in.
   ══════════════════════════════════════════════════════════════════════════ */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { googleRefusedNotice } from '@web/lib/accountErrors';
import AuthReturn from '../src/app/auth-return';
import { NONCE_KEY } from '../src/lib/googleNonce';

const mockRouter = { back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) };
const mockParams: Record<string, string> = {};
const mockSessions: unknown[] = [];
jest.mock('expo-router', () => ({
  router: { back: () => mockRouter.back(), replace: (h: unknown) => mockRouter.replace(h), canGoBack: () => mockRouter.canGoBack() },
  useLocalSearchParams: () => mockParams,
}));
jest.mock('../src/lib/supabase', () => ({
  supabase: { auth: { setSession: async (a: unknown) => { mockSessions.push(a); return { error: null }; } } },
}));
jest.mock('@react-native-async-storage/async-storage', () => jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));

beforeEach(async () => {
  for (const k of Object.keys(mockParams)) delete mockParams[k];
  mockSessions.length = 0;
  mockRouter.back.mockClear();
  mockRouter.replace.mockClear();
  mockRouter.canGoBack.mockImplementation(() => true);
  await AsyncStorage.clear();
});

describe('back from Google', () => {
  it('signed in: the session set, back to the sign-in screen (which goes on from there)', async () => {
    await AsyncStorage.setItem(NONCE_KEY, 'abc');
    Object.assign(mockParams, { n: 'abc', access_token: 'A', refresh_token: 'R' });
    await render(<AuthReturn />);
    await screen.findByTestId('auth-return');
    expect(mockSessions).toEqual([{ access_token: 'A', refresh_token: 'R' }]);
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
    expect(await AsyncStorage.getItem(NONCE_KEY)).toBeNull();
  });

  it("refused: the website's words, and the way back to sign in", async () => {
    await AsyncStorage.setItem(NONCE_KEY, 'abc');
    Object.assign(mockParams, { n: 'abc', error: 'access_denied', error_description: '' });
    await render(<AuthReturn />);
    expect(await screen.findByText(googleRefusedNotice('').text)).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('auth-return-back'));
    expect(mockRouter.back).toHaveBeenCalled();
    expect(mockSessions).toHaveLength(0);
  });

  it('a link this phone did not start: the start screen, nothing signed in', async () => {
    Object.assign(mockParams, { n: 'zzz', access_token: 'A', refresh_token: 'R' });
    await render(<AuthReturn />);
    await screen.findByTestId('auth-return');
    expect(mockSessions).toHaveLength(0);
    expect(mockRouter.replace).toHaveBeenCalledWith('/');
  });
});
