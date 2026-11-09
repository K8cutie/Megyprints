/* ══════════════════════════════════════════════════════════════════════════
   THE PRIVACY POLICY AND THE TERMS OF SERVICE IN THE APP (src/lib/legal.ts).

   Google Play's User Data policy: the privacy policy linked in Play Console
   AND inside the app. 1.x had it (it shows the website's footer); 2.0 had
   no link to it anywhere, nor to the Terms, nor the website's "you agree to
   the Terms and you're 18 or older" line (owner, 2026-11-03: "the privacy
   clause and all other applicable clauses pls add it to 2.0"). Links:
     • the start screen, under everything: Privacy Policy, Terms of Service;
     • the start screen's menu: the same two, small, under its places (it
       closes first, as for its other places);
     • Sign in: the agree line (Sign in with Google makes new accounts);
     • Place order: the agree line (test/checkoutWalk.test.tsx);
     • My profile: the two links (test/profileWalk.test.tsx).
   Each opens the app's OWN screen, never the browser (owner, 2026-11-09:
   "i want for TOS and privacy to be part of the native app and not a
   redirect"; in the browser the website offered "Install Megy Prints", a
   second Megy Prints beside the app). The screens show the website's words,
   shared (src/lib/legalPages.ts), every one of them.
   ══════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Linking } from 'react-native';
import { PRIVACY_POLICY, runsText, TERMS_OF_SERVICE, type LegalDocument } from '@web/lib/legalPages';
import Start from '../src/app/index';
import PrivacyScreen from '../src/app/privacy';
import SignIn from '../src/app/sign-in';
import TermsScreen from '../src/app/terms';
import { agreeWords, legalTarget, MIN_AGE, PRIVACY_LABEL, PRIVACY_SCREEN, TERMS_LABEL, TERMS_SCREEN } from '../src/lib/legal';

const REPO = path.resolve(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(REPO, rel), 'utf8');

const mockAuth: { session: unknown } = { session: null };
const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn() };
jest.mock('expo-router', () => ({
  router: {
    push: (...a: unknown[]) => mockRouter.push(...a),
    back: () => mockRouter.back(),
    replace: (...a: unknown[]) => mockRouter.replace(...a),
    canGoBack: () => true,
  },
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
beforeEach(() => {
  openUrl = jest.spyOn(Linking, 'openURL').mockResolvedValue(true as never);
  mockRouter.push.mockReset();
});
afterEach(() => openUrl.mockRestore());

describe('the screens and the words', () => {
  it('the app\'s own Privacy Policy and Terms of Service screens, with their names in the header', () => {
    expect(PRIVACY_SCREEN).toBe('/privacy');
    expect(TERMS_SCREEN).toBe('/terms');
    const layout = read('mobile/src/app/_layout.tsx');
    expect(layout).toContain(`<Stack.Screen name="privacy" options={{ title: '${PRIVACY_LABEL}' }} />`);
    expect(layout).toContain(`<Stack.Screen name="terms" options={{ title: '${TERMS_LABEL}' }} />`);
    expect(PRIVACY_POLICY.title).toBe(PRIVACY_LABEL);
    expect(TERMS_OF_SERVICE.title).toBe(TERMS_LABEL);
  });

  it('the website draws its pages from the same words (one copy), and keeps them for Play Console', () => {
    expect(read('src/pages/Privacy.tsx')).toContain('<LegalDocumentPage doc={PRIVACY_POLICY} />');
    expect(read('src/pages/Terms.tsx')).toContain('<LegalDocumentPage doc={TERMS_OF_SERVICE} />');
    const routes = read('src/App.tsx');
    expect(routes).toContain('<Route path="/privacy" element={<Privacy />} />');
    expect(routes).toContain('<Route path="/terms" element={<Terms />} />');
    for (const f of ['src/components/Footer.tsx', 'src/components/Navbar.tsx']) {
      const src = read(f).replace(/\s+/g, ' ');
      expect(src).toMatch(new RegExp(`<Link to="/privacy"[^>]*> ${PRIVACY_LABEL} </Link>`));
      expect(src).toMatch(new RegExp(`<Link to="/terms"[^>]*> ${TERMS_LABEL} </Link>`));
    }
  });

  it('the website\'s agree line, word for word (TermsAgreeLine.tsx), and its age (src/lib/legal.ts, shared)', () => {
    const line = (by: string) => { const w = agreeWords(by); return `${w.before}${w.link}${w.after}`; };
    const web = read('src/components/TermsAgreeLine.tsx');
    expect(web).toContain('By {by} you agree to our');
    expect(web).toContain(`${TERMS_LABEL}\n      </Link>{' '}\n      and confirm you're {MIN_AGE} or older.`.replace(/\n/g, web.includes('\r\n') ? '\r\n' : '\n'));
    expect(MIN_AGE).toBe(18);
    expect(line('placing an order')).toBe("By placing an order you agree to our Terms of Service and confirm you're 18 or older.");
    expect(line('signing in')).toBe("By signing in you agree to our Terms of Service and confirm you're 18 or older.");
  });
});

describe('the start screen', () => {
  it.each([
    ['signed out', null],
    ['signed in', { user: { id: 'u1', email: 'maria@example.test' } }],
  ])('%s: Privacy Policy and Terms of Service under everything open the app\'s screens', async (_n, session) => {
    mockAuth.session = session;
    await render(<Start />);
    expect(screen.getByTestId('home-legal-privacy')).toHaveTextContent(PRIVACY_LABEL);
    expect(screen.getByTestId('home-legal-terms')).toHaveTextContent(TERMS_LABEL);
    await fireEvent.press(screen.getByTestId('home-legal-privacy'));
    expect(mockRouter.push).toHaveBeenLastCalledWith('/privacy');
    await fireEvent.press(screen.getByTestId('home-legal-terms'));
    expect(mockRouter.push).toHaveBeenLastCalledWith('/terms');
    expect(openUrl).not.toHaveBeenCalled();
  });

  it.each([
    ['Privacy Policy', 'menu-legal-privacy', '/privacy'],
    ['Terms of Service', 'menu-legal-terms', '/terms'],
  ])('the menu: %s closes the menu and opens the screen', async (_n, id, screenPath) => {
    mockAuth.session = null;
    await render(<Start />);
    await fireEvent.press(screen.getByTestId('home-menu'));
    expect(screen.getByTestId('home-menu-page')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId(id));
    expect(mockRouter.push).toHaveBeenCalledWith(screenPath);
    expect(openUrl).not.toHaveBeenCalled();
    expect(screen.queryByTestId('home-menu-page')).toBeNull();
  });
});

describe('Sign in', () => {
  it('says what signing in agrees to, and the line opens the Terms screen', async () => {
    mockAuth.session = null;
    await render(<SignIn />);
    expect(screen.getByTestId('sign-in-agree')).toHaveTextContent("By signing in you agree to our Terms of Service and confirm you're 18 or older.");
    await fireEvent.press(screen.getByTestId('sign-in-agree'));
    expect(mockRouter.push).toHaveBeenCalledWith('/terms');
    expect(openUrl).not.toHaveBeenCalled();
  });
});

/** Every heading, paragraph and list item of a page, as the reader hears it. */
function everyLine(doc: LegalDocument): string[] {
  return doc.sections.flatMap((s) => [s.title, ...s.blocks.flatMap((b) => (b.kind === 'paragraph' ? [runsText(b.runs)] : b.items.map(runsText)))]);
}

describe.each([
  ['Privacy Policy', PrivacyScreen, PRIVACY_POLICY, 'privacy', 'November 2026'],
  ['Terms of Service', TermsScreen, TERMS_OF_SERVICE, 'terms', 'October 2026'],
] as const)('the %s screen', (_name, Screen, doc, id, updated) => {
  it('shows every word of the website\'s page, in its order', async () => {
    await render(<Screen />);
    expect(screen.getByTestId(`${id}-updated`)).toHaveTextContent(`Last updated: ${updated}`);
    const lines = everyLine(doc);
    expect(lines.length).toBeGreaterThan(20);
    const texts = flatTexts();
    let at = -1;
    for (const line of lines) {
      // Shown whole (bold words and links inside it), in the website's order.
      const i = texts.indexOf(line, at + 1);
      expect([line, i > at]).toEqual([line, true]);
      at = i;
    }
  });

  it('no link in it goes to the website\'s Privacy or Terms page: those are the app\'s screens', () => {
    const tos = doc.sections.flatMap((s) => s.blocks.flatMap((b) => (b.kind === 'paragraph' ? [b.runs] : b.items)))
      .flat().flatMap((r) => (typeof r === 'object' && 'link' in r ? [r.link] : []));
    expect(tos.length).toBeGreaterThan(0);
    for (const to of tos) {
      const target = legalTarget(to);
      if ('url' in target) expect(target.url).not.toMatch(/#\/(privacy|terms)/);
      if (to === 'privacy' || to === 'terms') expect(target).toEqual({ screen: `/${to}` });
    }
  });
});

/** The words of the screen's text elements, top to bottom (bold words and
 *  links inside a line are part of its words). */
type Node = { type: string; children: (Node | string)[] | null } | string;
function flatTexts(): string[] {
  const words = (n: Node): string => (typeof n === 'string' ? n : (n.children ?? []).map(words).join(''));
  const out: string[] = [];
  const walk = (n: Node | Node[] | null) => {
    if (!n || typeof n === 'string') return;
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (n.type === 'Text') { out.push(words(n)); return; }
    (n.children ?? []).forEach((c) => walk(c));
  };
  walk(screen.toJSON() as Node | Node[] | null);
  return out;
}

describe('the links inside the words', () => {
  it('Privacy Policy: the email opens the email app, the Terms open the Terms screen, the deletion form opens on the website', async () => {
    await render(<PrivacyScreen />);
    const mails = screen.getAllByTestId('legal-link-email');
    expect(mails.length).toBe(4);
    expect(mails[0]).toHaveTextContent('megyprintsph@gmail.com');
    await fireEvent.press(mails[0]);
    expect(openUrl).toHaveBeenLastCalledWith('mailto:megyprintsph@gmail.com');
    await fireEvent.press(screen.getByTestId('legal-link-terms'));
    expect(mockRouter.push).toHaveBeenLastCalledWith('/terms');
    await fireEvent.press(screen.getByTestId('legal-link-deletion-page'));
    expect(openUrl).toHaveBeenLastCalledWith('https://megyprints.vercel.app/delete-account.html');
    // The parts the website's tests hold it to (src/components/privacyLink.spec.ts).
    expect(screen.getByTestId('privacy-ml-kit')).toHaveTextContent('Google ML Kit finds the faces in your photos on your phone', { exact: false });
    expect(screen.getByTestId('privacy-age')).toHaveTextContent('Megyprints is for people 18 and older', { exact: false });
  });

  it('Terms of Service: Your orders, My Memories and the Privacy Policy open the app\'s screens; the Contact page opens as Message us does', async () => {
    await render(<TermsScreen />);
    expect(screen.getByTestId('terms-age')).toHaveTextContent('To make an account or place an order, you must be 18 years old or older. When you make an account or place an order, you confirm that you are.');
    await fireEvent.press(screen.getByTestId('legal-link-orders'));
    expect(mockRouter.push).toHaveBeenLastCalledWith('/orders');
    await fireEvent.press(screen.getByTestId('legal-link-memories'));
    expect(mockRouter.push).toHaveBeenLastCalledWith('/memories');
    await fireEvent.press(screen.getByTestId('legal-link-privacy'));
    expect(mockRouter.push).toHaveBeenLastCalledWith('/privacy');
    expect(openUrl).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('legal-link-contact'));
    expect(openUrl).toHaveBeenLastCalledWith('https://megyprints.vercel.app/#/contact');
    expect(screen.getAllByTestId('legal-link-email').length).toBe(3);
  });
});
