/* ══════════════════════════════════════════════════════════════════════════
   THE PRIVACY POLICY AND THE TERMS OF SERVICE IN THE APP (src/lib/legal.ts).

   Google Play's User Data policy: the privacy policy linked in Play Console
   AND inside the app. 1.x had it (it shows the website's footer); 2.0 had
   no link to it anywhere, nor to the Terms, nor the website's "you agree to
   the Terms and you're 18 or older" line (owner, 2026-11-03: "the privacy
   clause and all other applicable clauses pls add it to 2.0"). Now:
     • the start screen, under everything: Privacy Policy, Terms of Service;
     • the start screen's menu: the same two, small, under its places (it
       closes first, as for its other places);
     • Sign in: the agree line (Sign in with Google makes new accounts);
     • Place order: the agree line (test/checkoutWalk.test.tsx);
     • My profile: the two links (test/profileWalk.test.tsx).
   Each opens the website's own page in the browser.
   ══════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Linking } from 'react-native';
import Start from '../src/app/index';
import SignIn from '../src/app/sign-in';
import { agreeWords, MIN_AGE, PRIVACY_LABEL, PRIVACY_PAGE, TERMS_LABEL, TERMS_PAGE } from '../src/lib/legal';

const REPO = path.resolve(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(REPO, rel), 'utf8');

const mockAuth: { session: unknown } = { session: null };
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  useIsFocused: () => true,
  useLocalSearchParams: () => ({}),
}));
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('../src/lib/auth', () => ({ useAuth: () => ({ loading: false, session: mockAuth.session, signIn: jest.fn(), signOut: jest.fn() }) }));
jest.mock('../src/lib/buildKind', () => ({ buildKind: () => 'play' }));
jest.mock('../src/lib/supabase', () => ({ supabaseConfigured: true, supabase: { auth: {} } }));
jest.mock('../src/builder/BuilderProvider', () => ({
  useBuilder: () => ({ builder: { uploadedPhotos: [], reset: jest.fn() }, platform: { deviceStore: {} } }),
}));
jest.mock('../src/builder/albumFlow', () => ({ albumInProgress: () => false, resumeRoute: () => '/', startNewNote: () => '' }));
jest.mock('../src/lib/draftStore', () => ({ useDraft: () => ({ draft: { photos: [] }, clear: jest.fn() }) }));
jest.mock('../modules/photo-files', () => ({ releasePickedFiles: jest.fn(async () => 0) }));
jest.mock('expo-web-browser', () => ({ openBrowserAsync: async () => ({ type: 'opened' }) }));
jest.mock('expo-crypto', () => ({ getRandomBytes: (n: number) => new Uint8Array(n).fill(171) }));
jest.mock('@react-native-async-storage/async-storage', () => jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));

let openUrl: jest.SpyInstance;
beforeEach(() => { openUrl = jest.spyOn(Linking, 'openURL').mockResolvedValue(true as never); });
afterEach(() => openUrl.mockRestore());

describe('the pages and the words', () => {
  it('the website\'s Privacy Policy and Terms of Service pages', () => {
    expect(PRIVACY_PAGE).toBe('https://megyprints.vercel.app/#/privacy');
    expect(TERMS_PAGE).toBe('https://megyprints.vercel.app/#/terms');
    // The privacy page and its footer link are in this branch's copy of the
    // website (#218). The Terms page (#233, Oct 31) is on main and live;
    // this branch's ../src is from Oct 28, before it.
    expect(read('src/App.tsx')).toContain('<Route path="/privacy" element={<Privacy />} />');
    expect(read('src/components/Footer.tsx')).toContain(PRIVACY_LABEL);
    expect(TERMS_LABEL).toBe('Terms of Service');
  });

  it('the website\'s agree line, word for word (TermsAgreeLine.tsx)', () => {
    const line = (by: string) => { const w = agreeWords(by); return `${w.before}${w.link}${w.after}`; };
    expect(MIN_AGE).toBe(18);
    expect(line('placing an order')).toBe("By placing an order you agree to our Terms of Service and confirm you're 18 or older.");
    expect(line('signing in')).toBe("By signing in you agree to our Terms of Service and confirm you're 18 or older.");
  });
});

describe('the start screen', () => {
  it.each([
    ['signed out', null],
    ['signed in', { user: { id: 'u1', email: 'maria@example.test' } }],
  ])('%s: Privacy Policy and Terms of Service under everything open the website\'s pages', async (_n, session) => {
    mockAuth.session = session;
    await render(<Start />);
    expect(screen.getByTestId('home-legal-privacy')).toHaveTextContent(PRIVACY_LABEL);
    expect(screen.getByTestId('home-legal-terms')).toHaveTextContent(TERMS_LABEL);
    await fireEvent.press(screen.getByTestId('home-legal-privacy'));
    expect(openUrl).toHaveBeenLastCalledWith(PRIVACY_PAGE);
    await fireEvent.press(screen.getByTestId('home-legal-terms'));
    expect(openUrl).toHaveBeenLastCalledWith(TERMS_PAGE);
  });

  it.each([
    ['Privacy Policy', 'menu-legal-privacy', PRIVACY_PAGE],
    ['Terms of Service', 'menu-legal-terms', TERMS_PAGE],
  ])('the menu: %s closes the menu and opens the page', async (_n, id, page) => {
    mockAuth.session = null;
    await render(<Start />);
    await fireEvent.press(screen.getByTestId('home-menu'));
    expect(screen.getByTestId('home-menu-page')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId(id));
    expect(openUrl).toHaveBeenCalledWith(page);
    expect(screen.queryByTestId('home-menu-page')).toBeNull();
  });
});

describe('Sign in', () => {
  it('says what signing in agrees to, and the line opens the Terms', async () => {
    mockAuth.session = null;
    await render(<SignIn />);
    expect(screen.getByTestId('sign-in-agree')).toHaveTextContent("By signing in you agree to our Terms of Service and confirm you're 18 or older.");
    await fireEvent.press(screen.getByTestId('sign-in-agree'));
    expect(openUrl).toHaveBeenCalledWith(TERMS_PAGE);
  });
});
