/* ══════════════════════════════════════════════════════════════════════════
   THE START SCREEN LOOKS LIKE THE WEBSITE'S HOME (owner, 2026-11-03, the
   1.x and 2.0 start screens side by side: "1.x looks more 2.0 than 2.0").
   src/app/index.tsx and src/home, held to the website's home
   (src/pages/Home.tsx, src/pages/home/HomeCards.tsx, src/pages/homeCopy.ts):
     • the albums photo behind it all, under the website's veil, slowly
       zooming; "Megy · Prints" and the menu over it;
     • the Albums and Events cards in the website's words, word for word,
       each with its five slides: one every 4 s (Albums half a beat later),
       dots to jump, Pause/Play, "Here's how ›" to the first step;
     • Start Creating starts an album; with one in progress, Continue my
       album and Start a new album, as before; Book your event › opens the
       website's Events page;
     • signed out, Sign in at the top; signed in, the account's places in a
       card and in the menu;
     • the pictures move only while the screen is on top, and hold still
       with "reduce motion" on;
     • the type is the website's: Playfair Display and DM Sans, already in
       the app.
   ══════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo, Animated, Linking, Text } from 'react-native';
import { router } from 'expo-router';
import Start from '../src/app/index';
import { qrCells, SLIDE_MS } from '../src/home/HomeCards';
import { HOME_FACES } from '../src/home/homeFonts';
import { HomeMotionProvider, MOTION_MS, useHomeMotion } from '../src/home/homeMotion';
import { ALBUMS_CARD, EVENT_MIN_GUESTS, EVENTS_CARD, HOME } from '../src/home/homeWords';
import { EVENTS_PAGE } from '../src/lib/events';
import { FONT_ASSETS } from '../src/builder/fontAssets';
import { useFonts } from 'expo-font';

/* The website's own words, loaded as it runs them. By require(), not import:
   homeCopy.ts reaches the website's server client (import.meta.env), which
   the app's typecheck can't read; its stand-in is below. */
/* eslint-disable @typescript-eslint/no-require-imports */
const { ALBUMS_CARD: WEB_ALBUMS, EVENTS_CARD: WEB_EVENTS } = require('@web/pages/homeCopy') as { ALBUMS_CARD: unknown; EVENTS_CARD: unknown };
const { EVENT_MIN_GUESTS: WEB_MIN_GUESTS } = require('@web/lib/eventBookings') as { EVENT_MIN_GUESTS: number };
/* eslint-enable @typescript-eslint/no-require-imports */

jest.mock('../../src/lib/supabase', () => ({ supabase: {} }));
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
// The font files can't load in a test (no asset files): the hook says "in".
jest.mock('expo-font', () => ({ ...jest.requireActual('expo-font'), useFonts: jest.fn(() => [mockState.fontsIn, null]) }));
const mockState: { session: unknown; inProgress: boolean; focused: boolean; fontsIn: boolean } = { session: null, inProgress: false, focused: true, fontsIn: true };
jest.mock('expo-router', () => ({ router: { push: jest.fn() }, useIsFocused: () => mockState.focused }));
jest.mock('../src/lib/auth', () => ({ useAuth: () => ({ loading: false, session: mockState.session, signOut: jest.fn(async () => {}) }) }));
jest.mock('../src/builder/BuilderProvider', () => ({
  useBuilder: () => ({ builder: { uploadedPhotos: [], reset: jest.fn() }, platform: { deviceStore: {} } }),
}));
jest.mock('../src/builder/albumFlow', () => ({ albumInProgress: () => mockState.inProgress, resumeRoute: () => '/photos', startNewNote: () => '' }));
jest.mock('../src/lib/draftStore', () => ({ useDraft: () => ({ draft: { photos: [] }, clear: jest.fn() }) }));
jest.mock('../modules/photo-files', () => ({ releasePickedFiles: jest.fn(async () => 0) }));

const REPO = path.resolve(__dirname, '..', '..');
const read = (f: string) => fs.readFileSync(path.join(REPO, f), 'utf8').replace(/\r\n/g, '\n');
const WEB_CARDS = read('src/pages/home/HomeCards.tsx');
const WEB_HOME = read('src/pages/Home.tsx');
const CSS = read('src/index.css');
const TAILWIND = read('tailwind.config.js');
const CARDS = read('mobile/src/home/HomeCards.tsx');
const SCREEN = read('mobile/src/app/index.tsx');
const flat = (style: unknown): Record<string, unknown> => Object.assign({}, ...[style].flat(Infinity).filter(Boolean) as object[]);
const SIGNED_IN = { user: { id: 'u1', email: 'maria@example.test' } };

let openUrl: jest.SpyInstance;
beforeEach(() => {
  mockState.session = null;
  mockState.inProgress = false;
  mockState.focused = true;
  mockState.fontsIn = true;
  (router.push as jest.Mock).mockClear();
  openUrl = jest.spyOn(Linking, 'openURL').mockResolvedValue(true as never);
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
});
afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); });

describe('the website\'s words, word for word', () => {
  it('the Albums card and the Events card', () => {
    expect(ALBUMS_CARD).toEqual(WEB_ALBUMS);
    expect(EVENTS_CARD).toEqual(WEB_EVENTS);
    expect(EVENT_MIN_GUESTS).toBe(WEB_MIN_GUESTS);
  });
});

describe('the look', () => {
  it('the albums photo behind it all, under the website\'s veil', async () => {
    await render(<Start />);
    // A picture only: a screen reader skips it.
    expect(screen.getByTestId('home-photo', { includeHiddenElements: true })).toBeOnTheScreen();
    expect(screen.queryByTestId('home-photo')).toBeNull();
    expect(WEB_HOME).toContain('src="/hero-albums.jpg"');
    expect(WEB_HOME).toContain('bg-[rgba(45,40,36,0.22)]');
    expect(SCREEN).toContain("veil: { backgroundColor: 'rgba(45, 40, 36, 0.22)' },");
    expect(fs.existsSync(path.join(__dirname, '..', 'assets', 'home', 'hero.jpg'))).toBe(true);
  });

  it('"Megy · Prints" over it, and the menu', async () => {
    await render(<Start />);
    expect(screen.getByLabelText('Megy Prints')).toBeOnTheScreen();
    expect(screen.getByText('Megy')).toBeOnTheScreen();
    expect(screen.getByText('Prints')).toBeOnTheScreen();
    expect(screen.getByTestId('home-menu')).toBeOnTheScreen();
  });

  it('both cards: their labels and headlines', async () => {
    await render(<Start />);
    expect(screen.getByText('MEGYPRINTS ALBUMS')).toBeOnTheScreen();
    expect(screen.getByText(ALBUMS_CARD.title)).toBeOnTheScreen();
    expect(screen.getByText('MEGYPRINTS EVENTS')).toBeOnTheScreen();
    expect(screen.getByText('NEW')).toBeOnTheScreen();
    expect(screen.getByText(EVENTS_CARD.title)).toBeOnTheScreen();
    expect(screen.getByText(EVENTS_CARD.who)).toBeOnTheScreen();
  });

  it('every step on its slide, with the website\'s pictures\' words', async () => {
    await render(<Start />);
    // Every slide is there; a screen reader reads only the one in view.
    const all = { includeHiddenElements: true };
    for (const s of [...ALBUMS_CARD.steps, ...EVENTS_CARD.steps]) expect(screen.getByText(s.desc, all)).toBeOnTheScreen();
    expect(screen.getByText(ALBUMS_CARD.hook)).toBeOnTheScreen();
    expect(screen.queryByText(ALBUMS_CARD.steps[0].desc)).toBeNull();
    for (const w of ['40+', 'To your door', 'On its way', 'TABLE 7', 'QR ready', 'Our album', 'Ana & Ben']) {
      expect(screen.getByText(w, all)).toBeOnTheScreen();
      expect(WEB_CARDS).toContain(w.replace('&', '&amp;'));
    }
    expect(screen.getAllByText('Add a video memory', all).length).toBe(2);
  });

  it('the type is the website\'s, from the fonts already in the app', async () => {
    expect(TAILWIND).toContain(`display: ['"Playfair Display"', 'serif'],`);
    expect(TAILWIND).toContain(`body: ['"DM Sans"', 'sans-serif'],`);
    await render(<Start />);
    const PF = '@expo-google-fonts/playfair-display';
    const DM = '@expo-google-fonts/dm-sans';
    expect(useFonts).toHaveBeenCalledWith({
      [HOME_FACES.display]: FONT_ASSETS[`${PF}/700Bold/PlayfairDisplay_700Bold.ttf`],
      [HOME_FACES.displayItalic]: FONT_ASSETS[`${PF}/700Bold_Italic/PlayfairDisplay_700Bold_Italic.ttf`],
      [HOME_FACES.displayItalicLight]: FONT_ASSETS[`${PF}/400Regular_Italic/PlayfairDisplay_400Regular_Italic.ttf`],
      [HOME_FACES.body]: FONT_ASSETS[`${DM}/400Regular/DMSans_400Regular.ttf`],
      [HOME_FACES.bodyBold]: FONT_ASSETS[`${DM}/700Bold/DMSans_700Bold.ttf`],
    });
    for (const id of Object.values((useFonts as jest.Mock).mock.calls[0][0] as Record<string, unknown>)) expect(id).toBeDefined();
    expect(flat(screen.getByText(ALBUMS_CARD.title).props.style).fontFamily).toBe(HOME_FACES.display);
    expect(flat(screen.getByText('Megy').props.style).fontFamily).toBe(HOME_FACES.displayItalic);
    expect(flat(screen.getByText(ALBUMS_CARD.hook).props.style).fontFamily).toBe(HOME_FACES.body);
    expect(flat(screen.getByText(ALBUMS_CARD.cta).props.style).fontFamily).toBe(HOME_FACES.bodyBold);
    // A face of our own carries no fontWeight (Android would fake a bold).
    expect(flat(screen.getByText(ALBUMS_CARD.title).props.style).fontWeight).toBeUndefined();
  });

  it('until the fonts are in: the phone\'s own, the same sizes, bold where bold', async () => {
    mockState.fontsIn = false;
    await render(<Start />);
    expect(flat(screen.getByText(ALBUMS_CARD.title).props.style)).toMatchObject({ fontFamily: 'serif', fontWeight: '700', fontSize: 22 });
    expect(flat(screen.getByText(ALBUMS_CARD.cta).props.style)).toMatchObject({ fontWeight: '700', fontSize: 16 });
  });

  it('the decorative QR: the website\'s pattern, its three corner squares', () => {
    expect(WEB_CARDS).toContain('const rnd = () => { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648; };');
    const q = qrCells(31);
    expect(q).toHaveLength(21);
    for (const [r, c] of [[0, 0], [0, 14], [14, 0]]) {
      expect(q[r].slice(c, c + 7).every(Boolean)).toBe(true);
      expect(q[r + 3][c + 3]).toBe(true);
      expect(q[r + 1][c + 1]).toBe(false);
    }
    expect(qrCells(31)).toEqual(q);
    expect(qrCells(7)).not.toEqual(q);
  });
});

describe('the slides', () => {
  const now = (card: 'albums' | 'events') => [0, 1, 2, 3, 4].find((k) => screen.getByTestId(`home-${card}-slides-dot-${k}`).props.accessibilityState?.selected);

  it('five each; one every 4 s; the Albums half a beat after the Events', async () => {
    jest.useFakeTimers();
    await render(<Start />);
    expect([now('albums'), now('events')]).toEqual([0, 0]);
    await act(async () => { jest.advanceTimersByTime(SLIDE_MS); });
    expect([now('albums'), now('events')]).toEqual([0, 1]);
    await act(async () => { jest.advanceTimersByTime(SLIDE_MS / 2); });
    expect([now('albums'), now('events')]).toEqual([1, 1]);
    await act(async () => { jest.advanceTimersByTime(SLIDE_MS * 4); });
    expect([now('albums'), now('events')]).toEqual([0, 0]);
    expect(WEB_CARDS).toContain('export const SLIDE_MS = 4000;');
    expect(WEB_CARDS).toContain('startDelayMs={SLIDE_MS / 2}');
  });

  it('a dot jumps there; "Here\'s how ›" goes to step 1; Pause holds them, Play goes on', async () => {
    jest.useFakeTimers();
    await render(<Start />);
    await fireEvent.press(screen.getByTestId('home-albums-slides-dot-3'));
    expect(now('albums')).toBe(3);
    await fireEvent.press(screen.getByTestId('home-events-how'));
    expect(now('events')).toBe(1);
    await fireEvent.press(screen.getByTestId('home-albums-slides-pause'));
    expect(screen.getByTestId('home-albums-slides-pause')).toHaveTextContent(HOME.play);
    expect(screen.getByLabelText(HOME.playSlides(ALBUMS_CARD.label))).toBeOnTheScreen();
    await act(async () => { jest.advanceTimersByTime(SLIDE_MS * 3); });
    expect(now('albums')).toBe(3);
    await fireEvent.press(screen.getByTestId('home-albums-slides-pause'));
    await act(async () => { jest.advanceTimersByTime(SLIDE_MS); });
    expect(now('albums')).toBe(4);
  });

  it('the words wrap inside the slide (beta testers 2026-11-04: lines ran past the card\'s right edge on the phone)', async () => {
    await render(<Start />);
    // The slide area as the phone measures it: 347.43 points (412 dp wide, 32 + 32 of card).
    await fireEvent(screen.getByTestId('home-albums-slides').children[0] as never, 'layout', { nativeEvent: { layout: { width: 347.43, height: 150 } } });
    // Each slide exactly the area's width (rounding it made every slide a
    // little narrower than a page, so the next slide showed a sliver of the last).
    expect(flat(screen.getByTestId('home-albums-slides-slide-1', { includeHiddenElements: true }).props.style).width).toBe(347.43);
    // The words beside a 150-point picture get the rest of the slide, set
    // outright (left to flex on Android, the line was laid out as wide as the slide).
    /** The View the words sit in. */
    const column = (words: string) => {
      let n = screen.getByText(words, { includeHiddenElements: true }).parent;
      while (n && n.type !== 'View') n = n.parent;
      return flat(n!.props.style);
    };
    expect(column(ALBUMS_CARD.steps[0].desc).width).toBeCloseTo(347.43 - 150, 5);
    expect(column(ALBUMS_CARD.hook).width).toBeCloseTo(347.43 - 146, 5);
  });

  it('a finger on them holds the clock; a swipe lands on its slide', async () => {
    jest.useFakeTimers();
    await render(<Start />);
    const track = screen.getByTestId('home-albums-slides-track');
    await fireEvent(track, 'scrollBeginDrag');
    await act(async () => { jest.advanceTimersByTime(SLIDE_MS * 3); });
    expect(now('albums')).toBe(0);
    await fireEvent(screen.getByTestId('home-albums-slides').children[0] as never, 'layout', { nativeEvent: { layout: { width: 300, height: 150 } } });
    await fireEvent(track, 'scrollEndDrag');
    await fireEvent(track, 'momentumScrollEnd', { nativeEvent: { contentOffset: { x: 600, y: 0 } } });
    expect(now('albums')).toBe(2);
  });
});

describe('the buttons', () => {
  it('no album yet: Start Creating, the one filled button, starts one', async () => {
    await render(<Start />);
    expect(screen.getByTestId('make-album')).toHaveTextContent(ALBUMS_CARD.cta);
    expect(flat(screen.getByTestId('make-album').props.style).backgroundColor).toBe('#B85C38');
    await fireEvent.press(screen.getByTestId('make-album'));
    expect(router.push).toHaveBeenCalledWith('/album-name');
    expect(screen.queryByTestId('continue-album')).toBeNull();
  });

  it('an album in progress: Continue my album and Start a new album, in the Albums card', async () => {
    mockState.inProgress = true;
    await render(<Start />);
    expect(screen.queryByTestId('make-album')).toBeNull();
    expect(screen.getByTestId('continue-album')).toHaveTextContent(HOME.continueAlbum);
    expect(screen.getByTestId('new-album')).toHaveTextContent(HOME.newAlbum);
    await fireEvent.press(screen.getByTestId('continue-album'));
    expect(router.push).toHaveBeenCalledWith('/photos');
    expect(CARDS).toContain('<View style={styles.cardButtons}>{children}</View>');
  });

  it('Book your event › opens the website\'s Events page', async () => {
    await render(<Start />);
    expect(screen.getByTestId('go-events')).toHaveTextContent(`${EVENTS_CARD.cta} ›`);
    await fireEvent.press(screen.getByTestId('go-events'));
    expect(openUrl).toHaveBeenCalledWith(EVENTS_PAGE);
  });
});

describe('signed out and signed in', () => {
  it('signed out: Sign in at the top; the menu has Sign in and Events', async () => {
    await render(<Start />);
    await fireEvent.press(screen.getByTestId('go-sign-in'));
    expect(router.push).toHaveBeenCalledWith('/sign-in');
    expect(screen.queryByTestId('home-account-card')).toBeNull();
    await fireEvent.press(screen.getByTestId('home-menu'));
    expect(screen.getByTestId('menu-sign-in')).toHaveTextContent(HOME.signIn);
    expect(screen.getByTestId('menu-events')).toHaveTextContent(EVENTS_CARD.label);
    expect(screen.queryByTestId('menu-orders')).toBeNull();
    await fireEvent.press(screen.getByTestId('menu-events'));
    expect(openUrl).toHaveBeenCalledWith(EVENTS_PAGE);
    expect(screen.queryByTestId('home-menu-page')).toBeNull();
  });

  it('signed in: no Sign in; the account\'s places in their card and in the menu', async () => {
    mockState.session = SIGNED_IN;
    await render(<Start />);
    expect(screen.queryByTestId('go-sign-in')).toBeNull();
    expect(screen.getByText(HOME.signedInAs('maria@example.test'))).toBeOnTheScreen();
    for (const [id, to] of [['see-albums', '/albums'], ['see-orders', '/orders'], ['see-profile', '/profile'], ['see-memories', '/memories']]) {
      await fireEvent.press(screen.getByTestId(id));
      expect(router.push).toHaveBeenLastCalledWith(to);
    }
    await fireEvent.press(screen.getByTestId('home-menu'));
    expect(screen.getAllByText(HOME.signedInAs('maria@example.test')).length).toBe(2);
    for (const id of ['menu-albums', 'menu-orders', 'menu-profile', 'menu-memories', 'menu-events', 'menu-sign-out']) expect(screen.getByTestId(id)).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('menu-orders'));
    expect(router.push).toHaveBeenLastCalledWith('/orders');
    expect(screen.queryByTestId('home-menu-page')).toBeNull();
  });

  it('the menu\'s cross closes it', async () => {
    await render(<Start />);
    await fireEvent.press(screen.getByTestId('home-menu'));
    await fireEvent.press(screen.getByTestId('home-menu-close'));
    expect(screen.queryByTestId('home-menu-page')).toBeNull();
  });
});

describe('the movement', () => {
  function Probe() {
    const m = useHomeMotion();
    return <Text testID="probe">{m.still ? 'still' : 'moving'}</Text>;
  }

  it('the website\'s timings', () => {
    for (const [cls, ms] of [['home-float', MOTION_MS.float], ['home-scan', MOTION_MS.scan], ['home-twinkle', MOTION_MS.twinkle], ['home-fly', MOTION_MS.fly], ['home-rise', MOTION_MS.rise], ['home-pop', MOTION_MS.pop], ['home-drive', MOTION_MS.drive]] as const) {
      expect(CSS).toMatch(new RegExp(`\\.${cls} \\{ animation: \\w+ ${ms / 1000}s `));
    }
    expect(CSS).toContain(`animation: ken-burns ${MOTION_MS.kenBurns / 1000}s ease-in-out infinite alternate;`);
  });

  it('moves only while the screen is on top, and not at all with "reduce motion" on', async () => {
    const loop = jest.spyOn(Animated, 'loop');
    await render(<HomeMotionProvider running still={false}><Probe /></HomeMotionProvider>);
    expect(screen.getByTestId('probe')).toHaveTextContent('moving');
    expect(loop).toHaveBeenCalledTimes(Object.keys(MOTION_MS).length);
    loop.mockClear();
    await render(<HomeMotionProvider running={false} still={false}><Probe /></HomeMotionProvider>);
    expect(loop).not.toHaveBeenCalled();
    await render(<HomeMotionProvider running still><Probe /></HomeMotionProvider>);
    expect(screen.getByTestId('probe')).toHaveTextContent('still');
    expect(loop).not.toHaveBeenCalled();
  });

  it('the start screen hands it the phone\'s "reduce motion" and whether it is on top', () => {
    expect(SCREEN).toContain('<HomeMotionProvider running={focused} still={still}>');
    expect(SCREEN).toContain('const still = useReduceMotion();');
    expect(CARDS).toContain('scroller.current?.scrollTo({ x: i * width, animated: !still });');
  });
});
