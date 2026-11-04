/* ══════════════════════════════════════════════════════════════════════════
   THE PREVIEW SCREEN, UPRIGHT AND ON ITS SIDE (src/app/preview.tsx).

   Rendered on the real shared builder of an album made through the app's
   steps (test/editorHarness.ts), with the phone's screen set to a size
   (Dimensions.set, as the phone does when it turns) and its safe area (a
   camera notch, the navigation bar). What is proven is what the customer
   sees, short of drawing (the page pictures need the phone's Skia) and the
   real turning (the phone's sensor, checked on the phone):
     • on top, the Preview lets the phone turn it; left, upright again;
     • upright: the book is as big as the screen allows (previewLayout.ts),
       the line under it, the buttons and "or turn your phone sideways";
     • on its side: the open book fills the screen inside the safe area, no
       header, no status bar, the turn buttons beside (or under) it; Next,
       Previous and a swipe turn the pages; back upright, the same page;
     • the page pictures are asked for at one size both ways up;
     • it looks like a real book: the cover board and the page edges around
       the pages, the spine, and a page turn that bends and throws a shadow.
   ══════════════════════════════════════════════════════════════════════════ */
import { createElement, type ComponentType, type ReactElement } from 'react';
import { Animated, Dimensions, ScrollView, type GestureResponderEvent } from 'react-native';
import { SafeAreaInsetsContext, type EdgeInsets } from 'react-native-safe-area-context';
import { createRoot, type Root, type TestInstance } from 'test-renderer';
import { ALBUM_SIZES } from '@web/pages/builder/types';
import { SCENARIOS } from '../../tools/parity/scenarios';
import { act, builder, madeAlbum, settle, useEditorBench } from './editorHarness';

const mockNav = { push: jest.fn(), replace: jest.fn(), dismissAll: jest.fn() };
const mockSeen = {
  focused: true,
  /** Run useFocusEffect as the screen comes on top (off: most tests press at once). */
  focusRuns: false,
  header: [] as { headerShown?: boolean }[],
  /** The status bars on screen (React Native keeps a stack: the latest one mounted wins). */
  statusBars: new Set<{ hidden?: boolean }>(),
  orientation: [] as number[],
  pictureWidths: [] as number[],
  /** Signed in or not. */
  session: null as { user: { id: string } } | null,
  /** What saving the album to the account answers (Order this album). */
  save: jest.fn(async () => true),
  conflict: null as { updatedAt: string } | null,
};

jest.mock('expo-router', () => ({
  router: {
    push: (r: string) => mockNav.push(r), replace: (r: string) => mockNav.replace(r),
    dismissAll: () => mockNav.dismissAll(), canDismiss: () => true,
  },
  Stack: { Screen: ({ options }: { options: { headerShown?: boolean } }) => { mockSeen.header.push(options); return null; } },
  useIsFocused: () => mockSeen.focused,
  useFocusEffect: (fn: () => void) => { if (mockSeen.focusRuns) jest.requireActual<typeof import('react')>('react').useEffect(() => fn(), []); },
}));
jest.mock('expo-status-bar', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    StatusBar: ({ hidden }: { hidden?: boolean }) => {
      React.useEffect(() => {
        const entry = { hidden };
        mockSeen.statusBars.add(entry);
        return () => { mockSeen.statusBars.delete(entry); };
      }, [hidden]);
      return null;
    },
  };
});
jest.mock('expo-screen-orientation', () => ({
  OrientationLock: { DEFAULT: 0, ALL: 1, PORTRAIT: 2, PORTRAIT_UP: 3 },
  lockAsync: async (lock: number) => { mockSeen.orientation.push(lock); },
}));
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('../src/builder/BuilderProvider', () => ({
  useBuilder: () => {
    const b = jest.requireActual('./editorHarness').builder();
    // The real builder, but saving to the account answers what the test says.
    const builder = new Proxy(b, {
      get: (t, k) => (k === 'manualSave' ? mockSeen.save : k === 'getCloudConflict' ? () => mockSeen.conflict : t[k]),
    });
    return { builder, platform: { deviceStore: { getItem: () => null, setItem: () => {} }, textMeasurer: () => null }, text: null };
  },
}));
jest.mock('../src/lib/auth', () => ({ useAuth: () => ({ session: mockSeen.session }) }));
jest.mock('../src/lib/draftStore', () => ({ useDraft: () => ({ clear: () => {} }) }));
jest.mock('../src/builder/usePagePicture', () => ({
  usePagePicture: (_text: unknown, req: { width: number; pageIndex: number; coverMode?: boolean } | null) => {
    if (req) mockSeen.pictureWidths.push(req.width);
    return { uri: req ? `file:///cache/megy-pages/${req.coverMode ? 'cover' : `p${req.pageIndex}`}-${req.width}.jpg` : null, notDrawn: [], missing: 0, error: null };
  },
  preparePagePicture: async () => {},
  forgetPhotoPictures: () => {},
  PRIORITY: { editing: 3, shown: 2, thumbnail: 1, ahead: 0 },
}));

// After the mocks: the screen and the layout it must follow.
import Preview from '../src/app/preview';
import { BOOK_DRESS_X, sidewaysBook, uprightBook, UPRIGHT_EDGE } from '../src/builder/previewLayout';
import { edgeThickness } from '../src/builder/bookLook';
import { UPRIGHT_AFTER_MS } from '../src/lib/screenTurning';
import { ARRIVING_MS } from '../src/lib/useOncePerVisit';
const pastUprightWait = () => act(async () => { await new Promise((r) => setTimeout(r, UPRIGHT_AFTER_MS + 30)); });

const DEFAULT = 0;
const PORTRAIT_UP = 3;
const RATIO = 2.625;
const UPRIGHT = { width: 412, height: 915 };
const TURNED = { width: 915, height: 412 };
/** Turned: a camera notch on the left, three-button navigation on the right. */
const TURNED_INSETS: EdgeInsets = { top: 0, right: 48, bottom: 0, left: 32 };
const UPRIGHT_INSETS: EdgeInsets = { top: 32, right: 0, bottom: 24, left: 0 };

useEditorBench();

let screen: Root | null = null;
let insets: EdgeInsets = UPRIGHT_INSETS;
let tick = 0;

function setScreen(size: { width: number; height: number }, safe: EdgeInsets) {
  insets = safe;
  const dims = { ...size, scale: RATIO, fontScale: 1 };
  Dimensions.set({ window: dims, screen: dims });
}
const view = (): ReactElement => createElement(SafeAreaInsetsContext.Provider, { value: insets },
  createElement(Preview as ComponentType<{ t: number }>, { t: ++tick }));
/** The screen drawn again (a builder change re-renders it on the phone; here it is asked for). */
const refresh = async () => { await act(async () => { screen!.render(view()); }); await settle(); };
async function open() {
  screen = createRoot();
  await act(async () => { screen!.render(view()); });
  await settle();
}
async function turn(size: { width: number; height: number }, safe: EdgeInsets) {
  await act(async () => { setScreen(size, safe); });
  await refresh();
}

const all = (id: string) => screen!.container.queryAll((n) => n.props.testID === id);
/** In the page-turn layer (the leaf in flight, drawn over the book for the turn's length). */
const inTurnLayer = (n: TestInstance): boolean => {
  for (let p = n.parent; p; p = p.parent) if (p.props.testID === 'preview-page-turn') return true;
  return false;
};
/** A face on the book itself (not the turning leaf over it). */
const onBook = (id: string) => all(id).filter((n) => !inTurnLayer(n));
const one = (id: string): TestInstance => {
  const found = all(id);
  expect(found).toHaveLength(1);
  return found[0];
};
const flat = (style: unknown): Record<string, number | string> => {
  const list = Array.isArray(style) ? style.flat(Infinity) : [style];
  return Object.assign({}, ...list.filter(Boolean));
};
const textIn = (i: TestInstance | string): string => (typeof i === 'string' ? i : i.children.map(textIn).join(''));
const textOf = (id: string) => textIn(one(id));
/** A finger's press on a Pressable (its own handler: Pressability's click). */
const press = async (id: string) => {
  await act(async () => { one(id).props.onClick({ currentTarget: null, target: null, nativeEvent: {}, stopPropagation() {} }); });
  await refresh();
};
const lastHeader = () => mockSeen.header[mockSeen.header.length - 1];
const statusBarHidden = () => [...mockSeen.statusBars].some((b) => b.hidden);
const aspect = () => {
  const s = ALBUM_SIZES.find((a) => a.preset === builder().albumSize)!;
  return s.width / s.height;
};
const textOnScreen = (s: string) => textIn(screen!.container).includes(s);

/** Holds every animation a tap or a finger starts (the page turn, the book's
 *  slide), until `land()` lets them all finish together. What shows during a
 *  turn is then checked without racing the clock: a busy CI machine can play
 *  a whole 0.8 s turn before the next line runs (CI run 41628874847). */
let heldSpy: jest.SpyInstance | null = null;
function holdTurns(): () => Promise<void> {
  const held: { value: Animated.Value; to: number; done?: (r: { finished: boolean }) => void }[] = [];
  heldSpy = jest.spyOn(Animated, 'timing').mockImplementation((value, config) => ({
    start: (done?: (r: { finished: boolean }) => void) => { held.push({ value: value as Animated.Value, to: Number(config.toValue), done }); },
    stop: () => {},
    reset: () => {},
  }) as unknown as Animated.CompositeAnimation);
  return async () => {
    heldSpy?.mockRestore();
    heldSpy = null;
    await act(async () => { for (const h of held.splice(0)) { h.value.setValue(h.to); h.done?.({ finished: true }); } });
    await refresh();
  };
}

beforeEach(() => {
  mockSeen.focused = true;
  mockSeen.header = [];
  mockSeen.statusBars.clear();
  mockSeen.orientation = [];
  mockSeen.pictureWidths = [];
  mockSeen.session = null;
  mockSeen.save = jest.fn(async () => true);
  mockSeen.conflict = null;
  setScreen(UPRIGHT, UPRIGHT_INSETS);
});
afterEach(async () => {
  heldSpy?.mockRestore();
  heldSpy = null;
  if (screen) await act(async () => { screen!.unmount(); });
  screen = null;
  jest.clearAllMocks();
});

describe('the Preview turns with the phone, and only while it is on top', () => {
  it('on top: the phone may turn it; another screen over it, or closed: upright', async () => {
    await madeAlbum(SCENARIOS[0]);
    await open();
    await settle();
    expect(mockSeen.orientation).toEqual([DEFAULT]);
    mockSeen.focused = false;
    await refresh();
    // Upright comes back a moment after it is left (screenTurning.ts
    // UPRIGHT_AFTER_MS: Edit pages, opening over it, may turn too).
    await pastUprightWait();
    expect(mockSeen.orientation).toEqual([DEFAULT, PORTRAIT_UP]);
    mockSeen.focused = true;
    await refresh();
    await act(async () => { screen!.unmount(); });
    screen = null;
    await settle();
    await pastUprightWait();
    expect(mockSeen.orientation).toEqual([DEFAULT, PORTRAIT_UP, DEFAULT, PORTRAIT_UP]);
  });
});

describe('upright: the book as big as the screen allows', () => {
  it('a page as wide as the screen, the header and the status bar shown, the turn bar under it', async () => {
    await madeAlbum(SCENARIOS[0]);
    await open();
    expect(one('preview-scroll')).toBeTruthy();
    expect(all('preview-sideways')).toHaveLength(0);
    // The space between the header and the turn bar, as the phone measures it.
    await act(async () => { one('preview-scroll').props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 412, height: 700 } } }); });
    await refresh();
    const want = uprightBook({ screenW: 412, viewH: 700, aspect: aspect(), shows: 'closed' });
    expect(want.pageW).toBe(412 - 2 * UPRIGHT_EDGE - 2 * BOOK_DRESS_X);
    const book = flat(one('preview-book').props.style);
    expect(book.width).toBe(want.pageW);
    expect(book.height).toBe(want.pageH);
    expect(lastHeader().headerShown).toBe(true);
    expect(statusBarHidden()).toBe(false);
    expect(textOf('preview-caption')).toBe('Front cover');
    expect(all('preview-next')).toHaveLength(1);
  });

  it('opened: one page, the open-book button, and "or turn your phone sideways"', async () => {
    await madeAlbum(SCENARIOS[0]);
    await open();
    await press('preview-next');
    expect(textOf('preview-caption')).toBe(`Page 1 of ${builder().albumPages.length}`);
    expect(all('preview-open-book')).toHaveLength(1);
    expect(textOnScreen('or turn your phone sideways')).toBe(true);
    expect(onBook('preview-page-1')).toHaveLength(1);
  });

  it('a double tap on "Make my album" opens it on the cover: the Preview just on top ignores "Next page" for a moment (round 3)', async () => {
    await madeAlbum(SCENARIOS[0]);
    mockSeen.focusRuns = true;
    let clock = Date.now();
    const spy = jest.spyOn(Date, 'now').mockImplementation(() => clock);
    try {
      await open();
      // The second tap of the double tap lands on "Next page ›", in the same spot.
      await press('preview-next');
      expect(textOf('preview-caption')).toBe('Front cover');
      clock += ARRIVING_MS;
      await press('preview-next');
      expect(textOf('preview-caption')).toBe(`Page 1 of ${builder().albumPages.length}`);
    } finally {
      spy.mockRestore();
      mockSeen.focusRuns = false;
    }
  });
});

describe('on its side: the open book fills the screen', () => {
  it('no header, no status bar, the cover in the middle of the book\'s place, the turn buttons inside the safe area', async () => {
    await madeAlbum(SCENARIOS[0]);
    await open();
    await turn(TURNED, TURNED_INSETS);
    expect(all('preview-scroll')).toHaveLength(0);
    expect(one('preview-sideways')).toBeTruthy();
    expect(lastHeader().headerShown).toBe(false);
    expect(statusBarHidden()).toBe(true);
    const want = sidewaysBook({ screenW: 915, screenH: 412, insets: TURNED_INSETS, aspect: aspect() });
    // The closed book: one page, where the layout puts it.
    const place = flat(one('preview-book-place').props.style);
    expect([place.left, place.top]).toEqual([want.closed.x, want.closed.y]);
    const book = flat(one('preview-book').props.style);
    expect([book.width, book.height]).toEqual([want.pageW, want.pageH]);
    expect(onBook('preview-cover')).toHaveLength(1);
    // Forward only (nothing before the cover), in its place.
    expect(all('preview-prev')).toHaveLength(0);
    const fwd = flat(one('preview-next').props.style);
    expect([fwd.left, fwd.top, fwd.width, fwd.height]).toEqual([want.forward.x, want.forward.y, want.forward.w, want.forward.h]);
    expect(one('preview-next').props.accessibilityLabel).toBe('Next pages');
    expect(textOf('preview-counter')).toBe('Cover');
    // On the cover: "Edit cover", in its place.
    const edit = flat(one('preview-edit-cover').props.style);
    expect([edit.left, edit.top, edit.width, edit.height]).toEqual([want.edit.x, want.edit.y, want.edit.w, want.edit.h]);
    expect(textOf('preview-edit-cover')).toBe('Edit\ncover');
  });

  it('"Edit pages" on its side too: it opens the editor on the pages shown (owner\'s phone test)', async () => {
    await madeAlbum(SCENARIOS[0]);
    await open();
    await turn(TURNED, TURNED_INSETS);
    const want = sidewaysBook({ screenW: 915, screenH: 412, insets: TURNED_INSETS, aspect: aspect() });
    await press('preview-next');
    await press('preview-next');
    expect(all('preview-edit-cover')).toHaveLength(0);
    const edit = flat(one('preview-edit-pages').props.style);
    expect([edit.left, edit.top, edit.width, edit.height]).toEqual([want.edit.x, want.edit.y, want.edit.w, want.edit.h]);
    expect(one('preview-edit-pages').props.accessibilityLabel).toBe('Edit pages');
    mockNav.push.mockClear();
    await press('preview-edit-pages');
    expect(mockNav.push).toHaveBeenCalledWith('/edit-pages');
    expect([1, 2]).toContain(builder().currentPageIndex);
  });

  it('Next opens the book: two facing pages, filling the room; Next and Previous turn them', async () => {
    await madeAlbum(SCENARIOS[0]);
    const total = builder().albumPages.length;
    await open();
    await turn(TURNED, TURNED_INSETS);
    const want = sidewaysBook({ screenW: 915, screenH: 412, insets: TURNED_INSETS, aspect: aspect() });
    await press('preview-next');
    // (inside of the front cover | page 1), as it prints.
    expect(onBook('preview-inside-front')).toHaveLength(1);
    expect(onBook('preview-page-1')).toHaveLength(1);
    expect(textOf('preview-counter')).toBe(`1 / ${total}`);
    const place = flat(one('preview-book-place').props.style);
    expect([place.left, place.top]).toEqual([want.spread.x, want.spread.y]);
    const book = flat(one('preview-book').props.style);
    expect([book.width, book.height]).toEqual([want.spread.w, want.spread.h]);
    await press('preview-next');
    expect(textOf('preview-counter')).toBe(`2-3 / ${total}`);
    expect(onBook('preview-page-2')).toHaveLength(1);
    expect(onBook('preview-page-3')).toHaveLength(1);
    const back = flat(one('preview-prev').props.style);
    expect([back.left, back.top]).toEqual([want.back.x, want.back.y]);
    expect(one('preview-prev').props.accessibilityLabel).toBe('Previous pages');
    await press('preview-prev');
    expect(textOf('preview-counter')).toBe(`1 / ${total}`);
  });

  it('opening the cover: the book slides from the cover\'s place, the left side empty until the cover lands', async () => {
    await madeAlbum(SCENARIOS[0]);
    await open();
    await turn(TURNED, TURNED_INSETS);
    const want = sidewaysBook({ screenW: 915, screenH: 412, insets: TURNED_INSETS, aspect: aspect() });
    // The tap: the turn has started, the leaf in flight over the book (held
    // there while it is checked).
    const land = holdTurns();
    await act(async () => { one('preview-next').props.onClick({ currentTarget: null, target: null, nativeEvent: {}, stopPropagation() {} }); });
    expect(all('preview-page-turn')).toHaveLength(1);
    expect(flat(one('preview-left-side').props.style).opacity).toBe(0);
    // It starts where the closed cover was: the open book's right page on the cover.
    const place = flat(one('preview-book-place').props.style);
    const slid = (place.transform as unknown as { translateX: number }[])[0].translateX;
    expect(Number(place.left) + slid + want.pageW).toBe(want.closed.x);
    // Once it has landed: the open book in its own place, both sides showing
    // (drawn again here to read the slide's value; the phone moves it itself).
    await land();
    await refresh();
    expect(all('preview-page-turn')).toHaveLength(0);
    expect(flat(one('preview-left-side').props.style).opacity).toBeUndefined();
    const after = flat(one('preview-book-place').props.style);
    expect((after.transform as unknown as { translateX: number }[])[0].translateX).toBe(0);
    expect(after.left).toBe(want.spread.x);
  });

  it('a swipe turns the page, right to left forward, like a book', async () => {
    await madeAlbum(SCENARIOS[0]);
    const total = builder().albumPages.length;
    await open();
    await turn(TURNED, TURNED_INSETS);
    await press('preview-next');
    await swipe(-200);
    expect(textOf('preview-counter')).toBe(`2-3 / ${total}`);
    await swipe(-200);
    expect(textOf('preview-counter')).toBe(`4-5 / ${total}`);
    await swipe(200);
    expect(textOf('preview-counter')).toBe(`2-3 / ${total}`);
  });

  it('turned back upright: the header again, the status bar, one page, the page the book was open at', async () => {
    await madeAlbum(SCENARIOS[0]);
    await open();
    await turn(TURNED, TURNED_INSETS);
    await press('preview-next');
    await press('preview-next');
    await turn(UPRIGHT, UPRIGHT_INSETS);
    expect(all('preview-sideways')).toHaveLength(0);
    expect(lastHeader().headerShown).toBe(true);
    expect(statusBarHidden()).toBe(false);
    expect(textOf('preview-caption')).toBe(`Page 2 of ${builder().albumPages.length}`);
  });

  it('a wide album: the buttons under the book', async () => {
    await madeAlbum(SCENARIOS[2]); // 8×6
    await open();
    await turn(TURNED, TURNED_INSETS);
    await press('preview-next');
    const want = sidewaysBook({ screenW: 915, screenH: 412, insets: TURNED_INSETS, aspect: aspect() });
    expect(want.controls).toBe('below');
    const fwd = flat(one('preview-next').props.style);
    expect([fwd.left, fwd.top]).toEqual([want.forward.x, want.forward.y]);
    const book = flat(one('preview-book').props.style);
    expect(book.width).toBe(want.spread.w);
  });

});

describe('it looks like a real book (owner, 2026-11-03; src/builder/bookLook.tsx)', () => {
  const bookOnly = (id: string) => onBook(id);
  const width = (id: string) => Number(flat(one(id).props.style).width);

  it('the closed book: just its cover, no board, no page edges', async () => {
    await madeAlbum(SCENARIOS[0]);
    await open();
    expect(onBook('preview-cover')).toHaveLength(1);
    expect(all('preview-board')).toHaveLength(0);
    expect(all('preview-spine-shade')).toHaveLength(0);
  });

  it('one page: the cover board around it, the spine on its bound side, the pages beyond it as page edges', async () => {
    await madeAlbum(SCENARIOS[0]);
    const total = builder().albumPages.length;
    await open();
    await press('preview-next');
    const page = Number(flat(one('preview-book').props.style).width);
    // Page 1 is a right-hand page: bound on the left.
    expect(width('preview-board')).toBe(page + 2 * BOOK_DRESS_X);
    expect(bookOnly('preview-hinge-left')).toHaveLength(1);
    expect(all('preview-edges-left')).toHaveLength(0);
    expect(width('preview-edges-right')).toBe(edgeThickness((total - 1) / total));
    expect(all('preview-edges-under')).toHaveLength(1);
    expect(all('preview-spine-shade')).toHaveLength(1);
    // Page 2: a left-hand page, bound on the right.
    await press('preview-next');
    expect(bookOnly('preview-hinge-right')).toHaveLength(1);
    expect(width('preview-edges-left')).toBe(edgeThickness(1 / total));
    expect(all('preview-edges-right')).toHaveLength(0);
  });

  it('the open book on its side: the pages read on the left, the pages to come on the right, the board under both', async () => {
    await madeAlbum(SCENARIOS[0]);
    const total = builder().albumPages.length;
    await open();
    await turn(TURNED, TURNED_INSETS);
    await press('preview-next');
    await press('preview-next');
    expect(textOf('preview-counter')).toBe(`2-3 / ${total}`);
    const want = sidewaysBook({ screenW: 915, screenH: 412, insets: TURNED_INSETS, aspect: aspect() });
    expect(width('preview-board')).toBe(want.spread.w + 2 * BOOK_DRESS_X);
    expect(width('preview-edges-left')).toBe(edgeThickness(2 / total));
    expect(width('preview-edges-right')).toBe(edgeThickness((total - 3) / total));
    expect(all('preview-hinge-left')).toHaveLength(0);
    expect(all('preview-spine-shade')).toHaveLength(1);
  });

  it('a page turn: the leaf bends like paper and throws a moving shadow on the pages under it', async () => {
    await madeAlbum(SCENARIOS[0]);
    await open();
    await turn(TURNED, TURNED_INSETS);
    await press('preview-next');
    await refresh();
    await refresh();
    // The turn held mid-way (it plays for 0.8 s on the phone; a slow test run could miss it).
    const land = holdTurns();
    await act(async () => { one('preview-next').props.onClick({ currentTarget: null, target: null, nativeEvent: {}, stopPropagation() {} }); });
    expect(all('preview-page-turn')).toHaveLength(1);
    expect(all('preview-turn-bend')).toHaveLength(1);
    expect(all('preview-turn-cast-right')).toHaveLength(1);
    expect(all('preview-turn-cast-left')).toHaveLength(1);
    await land();
    expect(all('preview-page-turn')).toHaveLength(0);
  });
});

describe('a finger turns the page (owner, 2026-11-03; src/builder/pageDrag.ts)', () => {
  /** The bend's opacity on the turning leaf: how far it stands up (0 flat, 1 upright). */
  const lifted = () => Number(flat(one('preview-turn-bend').props.style).opacity);
  /** The book open at pages 2-3 on its side, every turn landed; then every
   *  animation held until `land()` (holdTurns). */
  async function openAtTwo(): Promise<() => Promise<void>> {
    await madeAlbum(SCENARIOS[0]);
    await open();
    await turn(TURNED, TURNED_INSETS);
    for (let k = 0; k < 2; k++) {
      const land = holdTurns();
      await press('preview-next');
      await land();
    }
    expect(all('preview-page-turn')).toHaveLength(0);
    return holdTurns();
  }

  it('the page follows the finger: it lifts as the finger crosses the book', async () => {
    const landed = await openAtTwo();
    const total = builder().albumPages.length;
    expect(textOf('preview-counter')).toBe(`2-3 / ${total}`);
    const up = await finger([-20, -100], { lift: false });
    // The turn has begun: the book is where it goes, the leaf in the finger.
    expect(all('preview-page-turn')).toHaveLength(1);
    expect(textOf('preview-counter')).toBe(`4-5 / ${total}`);
    const early = lifted();
    expect(early).toBeGreaterThan(0);
    await act(async () => { one('preview-book').props.onResponderMove({ nativeEvent: { touches: [{}], changedTouches: [{}], identifier: 0, locationX: 150, locationY: 200, pageX: 150, pageY: 200, target: 0, timestamp: 2000 }, touchHistory: { numberActiveTouches: 1, indexOfSingleActiveTouch: 0, mostRecentTimeStamp: 2000, touchBank: [{ touchActive: true, startPageX: 450, startPageY: 200, startTimeStamp: 1000, currentPageX: 150, currentPageY: 200, currentTimeStamp: 2000, previousPageX: 350, previousPageY: 200, previousTimeStamp: 1600 }] } }); });
    expect(lifted()).toBeGreaterThan(early);
    await up();
    await landed();
    expect(all('preview-page-turn')).toHaveLength(0);
    expect(textOf('preview-counter')).toBe(`4-5 / ${total}`);
  });

  it('let go after a swipe: the page turns over', async () => {
    const landed = await openAtTwo();
    const total = builder().albumPages.length;
    await finger([-30, -90]);
    await landed();
    expect(all('preview-page-turn')).toHaveLength(0);
    expect(textOf('preview-counter')).toBe(`4-5 / ${total}`);
  });

  it('let go after a little move: the page goes back down, the book where it was', async () => {
    const landed = await openAtTwo();
    const total = builder().albumPages.length;
    await finger([-15, -30]);
    await landed();
    expect(all('preview-page-turn')).toHaveLength(0);
    expect(textOf('preview-counter')).toBe(`2-3 / ${total}`);
  });

  it('back the other way: a finger moving right turns back', async () => {
    const landed = await openAtTwo();
    const total = builder().albumPages.length;
    await finger([30, 90]);
    await landed();
    // The first spread: the inside of the cover and page 1.
    expect(textOf('preview-counter')).toBe(`1 / ${total}`);
  });

  it('a button while a let-go page is going back: the book is put back first', async () => {
    const landed = await openAtTwo();
    const total = builder().albumPages.length;
    await finger([-15, -30]);
    await press('preview-next');
    await landed();
    expect(textOf('preview-counter')).toBe(`4-5 / ${total}`);
  });
});

describe('"Order this album" at the album\'s end (Phase 5, step 2: lib/checkout/orderStart.ts)', () => {
  /** To the last page, upright. */
  async function toTheEnd() {
    await press('preview-next');
    await act(async () => { builder().goToPage(builder().albumPages.length - 1); });
    await refresh();
    // Signed in, a newly made album is saved once by the whole app
    // (accountSave.ts useAccountSave): only the saves "Order this album"
    // makes count here.
    mockSeen.save.mockClear();
  }
  /** Taps Order; a warning (an empty caption box in a made album) is answered "Order anyway". */
  async function order() {
    await press('preview-order');
    if (all('preview-order-anyway').length) await press('preview-order-anyway');
  }

  it('the last page: "Order this album" (the website\'s turn bar), filled, where Next was', async () => {
    await madeAlbum(SCENARIOS[0]);
    await open();
    await toTheEnd();
    expect(all('preview-next')).toHaveLength(0);
    expect(textOf('preview-order')).toBe('Order this album');
    // The old "comes in a later version" line is gone.
    expect(textOnScreen('Ordering from the app comes in a later version')).toBe(false);
  });

  it('signed in: the album is saved to the account, then checkout opens on it', async () => {
    await madeAlbum(SCENARIOS[0]);
    mockSeen.session = { user: { id: 'user-1' } };
    await open();
    await toTheEnd();
    await order();
    expect(mockSeen.save).toHaveBeenCalledTimes(1);
    expect(mockNav.push).toHaveBeenCalledWith({ pathname: '/order', params: { albumId: builder().getAlbumId() } });
  });

  it('the save fails: the website\'s words, and checkout does not open', async () => {
    await madeAlbum(SCENARIOS[0]);
    mockSeen.session = { user: { id: 'user-1' } };
    mockSeen.save = jest.fn(async () => false);
    await open();
    await toTheEnd();
    await order();
    expect(textOf('preview-order-error')).toBe("We couldn't save your album to your account, so it can't be ordered yet. Check your connection and tap Order again.");
    expect(mockNav.push).not.toHaveBeenCalledWith(expect.objectContaining({ pathname: '/order' }));
    // Changed on another device too: which to keep is asked first.
    mockSeen.conflict = { updatedAt: '2026-11-02T00:00:00Z' };
    await order();
    expect(textOf('preview-order-error')).toMatch(/^This album was also changed on another device\./);
  });

  it('not signed in: checkout opens on the album and asks to sign in there (nothing to save to)', async () => {
    await madeAlbum(SCENARIOS[0]);
    await open();
    await toTheEnd();
    await order();
    expect(mockSeen.save).not.toHaveBeenCalled();
    expect(mockNav.push).toHaveBeenCalledWith({ pathname: '/order', params: { albumId: builder().getAlbumId() } });
  });

  it('fewer than 40 photos: said, with the way back to the pages; checkout does not open', async () => {
    await madeAlbum(SCENARIOS[0]);
    mockSeen.session = { user: { id: 'user-1' } };
    // One photo taken off a page: 39 left.
    const i = builder().albumPages.findIndex((p) => (p.slotFills ?? []).some((f) => typeof f === 'number'));
    const slot = (builder().albumPages[i].slotFills ?? []).findIndex((f) => typeof f === 'number');
    await act(async () => { builder().goToPage(i); });
    await act(async () => { builder().clearSlot(slot); });
    await act(async () => { builder().goToPage(0); });
    await open();
    await toTheEnd();
    await press('preview-order');
    expect(textOf('preview-order-ask')).toMatch(/^Your album has 39 photos/);
    expect(mockSeen.save).not.toHaveBeenCalled();
    await press('preview-order-back-to-pages');
    expect(mockNav.push).toHaveBeenCalledWith('/edit-pages');
  });

  it('the answer to "Order this album" is scrolled into view (it came below the buttons: the tap looked dead, round 3)', async () => {
    await madeAlbum(SCENARIOS[0]);
    mockSeen.session = { user: { id: 'user-1' } };
    const i = builder().albumPages.findIndex((p) => (p.slotFills ?? []).some((f) => typeof f === 'number'));
    const slot = (builder().albumPages[i].slotFills ?? []).findIndex((f) => typeof f === 'number');
    await act(async () => { builder().goToPage(i); });
    await act(async () => { builder().clearSlot(slot); });
    await act(async () => { builder().goToPage(0); });
    await open();
    await toTheEnd();
    const toEnd = (ScrollView as unknown as { prototype: { scrollToEnd: jest.Mock } }).prototype.scrollToEnd;
    toEnd.mockClear();
    await press('preview-order');
    expect(textOf('preview-order-ask')).toMatch(/^Your album has 39 photos/);
    expect(toEnd).toHaveBeenCalled();
  });

  it('on its side, the last pages: a round "Order" button where › was', async () => {
    await madeAlbum(SCENARIOS[0]);
    mockSeen.session = { user: { id: 'user-1' } };
    await open();
    await turn(TURNED, TURNED_INSETS);
    await press('preview-next');
    await act(async () => { builder().goToPage(builder().albumPages.length - 1); });
    await refresh();
    const want = sidewaysBook({ screenW: 915, screenH: 412, insets: TURNED_INSETS, aspect: aspect() });
    const fwd = flat(one('preview-order').props.style);
    expect([fwd.left, fwd.top]).toEqual([want.forward.x, want.forward.y]);
    expect(one('preview-order').props.accessibilityLabel).toBe('Order this album');
    expect(all('preview-next')).toHaveLength(0);
    await order();
    expect(mockNav.push).toHaveBeenCalledWith({ pathname: '/order', params: { albumId: builder().getAlbumId() } });
  });
});

describe('one picture size both ways up', () => {
  it('turning the phone asks for no new page picture', async () => {
    await madeAlbum(SCENARIOS[0]);
    await open();
    await press('preview-next');
    const upright = new Set(mockSeen.pictureWidths);
    await turn(TURNED, TURNED_INSETS);
    await press('preview-next');
    const both = new Set(mockSeen.pictureWidths);
    expect(upright.size).toBe(1);
    expect([...both]).toEqual([...upright]);
  });
});

/** A finger moving `dx` points across the open book, through the book's own
 *  touch handlers in the order the phone calls them (the move that claims
 *  the touch, then the rest of the move, then the finger lifted). */
/** A finger on the book moving through `steps` (points from where it went
 *  down), slowly (`dt` ms between moves), then lifted unless `lift` is false.
 *  Returns the book's handlers to lift it later. */
async function finger(steps: number[], { dt = 200, lift = true } = {}) {
  const h = one('preview-book').props;
  const x0 = 450;
  const y = 200;
  let t = 1000;
  let prev = x0;
  const ev = (cur: number) => ({
    nativeEvent: { touches: [{}], changedTouches: [{}], identifier: 0, locationX: cur, locationY: y, pageX: cur, pageY: y, target: 0, timestamp: t },
    touchHistory: {
      numberActiveTouches: 1, indexOfSingleActiveTouch: 0, mostRecentTimeStamp: t,
      touchBank: [{
        touchActive: true, startPageX: x0, startPageY: y, startTimeStamp: 1000,
        currentPageX: cur, currentPageY: y, currentTimeStamp: t, previousPageX: prev, previousPageY: y, previousTimeStamp: t - dt,
      }],
    },
  }) as unknown as GestureResponderEvent;
  await act(async () => {
    h.onStartShouldSetResponderCapture(ev(x0));
    t += dt;
    const first = ev(x0 + steps[0]);
    h.onMoveShouldSetResponderCapture(first);
    expect(h.onMoveShouldSetResponder(first)).toBe(true);
    h.onResponderGrant(first);
  });
  for (const dx of steps) {
    await act(async () => { t += dt; h.onResponderMove(ev(x0 + dx)); prev = x0 + dx; });
  }
  const last = x0 + steps[steps.length - 1];
  const up = async () => { await act(async () => { t += dt; h.onResponderRelease(ev(last)); }); };
  if (lift) await up();
  return up;
}

async function swipe(dx: number) {
  const h = one('preview-book').props;
  const x0 = 450;
  const y = 200;
  let t = 1000;
  const ev = (prev: number, cur: number) => ({
    nativeEvent: { touches: [{}], changedTouches: [{}], identifier: 0, locationX: cur, locationY: y, pageX: cur, pageY: y, target: 0, timestamp: t },
    touchHistory: {
      numberActiveTouches: 1, indexOfSingleActiveTouch: 0, mostRecentTimeStamp: t,
      touchBank: [{
        touchActive: true, startPageX: x0, startPageY: y, startTimeStamp: 1000,
        currentPageX: cur, currentPageY: y, currentTimeStamp: t, previousPageX: prev, previousPageY: y, previousTimeStamp: t - 16,
      }],
    },
  }) as unknown as GestureResponderEvent;
  const half = x0 + dx / 2;
  await act(async () => {
    h.onStartShouldSetResponderCapture(ev(x0, x0));
    t += 16;
    const first = ev(x0, half);
    h.onMoveShouldSetResponderCapture(first);
    expect(h.onMoveShouldSetResponder(first)).toBe(true);
    h.onResponderGrant(first);
    t += 16;
    h.onResponderMove(ev(half, x0 + dx));
    h.onResponderRelease(ev(half, x0 + dx));
  });
  await refresh();
}
