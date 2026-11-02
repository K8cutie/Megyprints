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
     • the page pictures are asked for at one size both ways up.
   ══════════════════════════════════════════════════════════════════════════ */
import { createElement, type ComponentType, type ReactElement } from 'react';
import { Dimensions, type GestureResponderEvent } from 'react-native';
import { SafeAreaInsetsContext, type EdgeInsets } from 'react-native-safe-area-context';
import { createRoot, type Root, type TestInstance } from 'test-renderer';
import { ALBUM_SIZES } from '@web/pages/builder/types';
import { SCENARIOS } from '../../tools/parity/scenarios';
import { act, builder, madeAlbum, settle, useEditorBench } from './editorHarness';

const mockNav = { push: jest.fn(), replace: jest.fn(), dismissAll: jest.fn() };
const mockSeen = {
  focused: true,
  header: [] as { headerShown?: boolean }[],
  /** The status bars on screen (React Native keeps a stack: the latest one mounted wins). */
  statusBars: new Set<{ hidden?: boolean }>(),
  orientation: [] as number[],
  pictureWidths: [] as number[],
};

jest.mock('expo-router', () => ({
  router: {
    push: (r: string) => mockNav.push(r), replace: (r: string) => mockNav.replace(r),
    dismissAll: () => mockNav.dismissAll(), canDismiss: () => true,
  },
  Stack: { Screen: ({ options }: { options: { headerShown?: boolean } }) => { mockSeen.header.push(options); return null; } },
  useIsFocused: () => mockSeen.focused,
  useFocusEffect: () => {},
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
  useBuilder: () => ({ builder: jest.requireActual('./editorHarness').builder(), platform: { deviceStore: { getItem: () => null, setItem: () => {} } }, text: null }),
}));
jest.mock('../src/lib/auth', () => ({ useAuth: () => ({ session: null }) }));
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
import { sidewaysBook, uprightBook, UPRIGHT_EDGE } from '../src/builder/previewLayout';

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

beforeEach(() => {
  mockSeen.focused = true;
  mockSeen.header = [];
  mockSeen.statusBars.clear();
  mockSeen.orientation = [];
  mockSeen.pictureWidths = [];
  setScreen(UPRIGHT, UPRIGHT_INSETS);
});
afterEach(async () => {
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
    expect(mockSeen.orientation).toEqual([DEFAULT, PORTRAIT_UP]);
    mockSeen.focused = true;
    await refresh();
    await act(async () => { screen!.unmount(); });
    screen = null;
    await settle();
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
    expect(want.pageW).toBe(412 - 2 * UPRIGHT_EDGE);
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
    // The tap alone (here the turn's animation ends at once once time runs):
    // the turn has started, the leaf in flight over the book.
    await act(async () => { one('preview-next').props.onClick({ currentTarget: null, target: null, nativeEvent: {}, stopPropagation() {} }); });
    expect(all('preview-page-turn')).toHaveLength(1);
    expect(flat(one('preview-left-side').props.style).opacity).toBe(0);
    // It starts where the closed cover was: the open book's right page on the cover.
    const place = flat(one('preview-book-place').props.style);
    const slid = (place.transform as unknown as { translateX: number }[])[0].translateX;
    expect(Number(place.left) + slid + want.pageW).toBe(want.closed.x);
    // Once it has landed: the open book in its own place, both sides showing
    // (drawn again here to read the slide's value; the phone moves it itself).
    await refresh();
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

  it('the album\'s last pages: "Done" in the forward button\'s place', async () => {
    await madeAlbum(SCENARIOS[0]);
    const total = builder().albumPages.length;
    await open();
    await turn(TURNED, TURNED_INSETS);
    await press('preview-next');
    await act(async () => { builder().goToPage(total - 1); });
    await refresh();
    expect(all('preview-next')).toHaveLength(0);
    const want = sidewaysBook({ screenW: 915, screenH: 412, insets: TURNED_INSETS, aspect: aspect() });
    const done = flat(one('preview-done').props.style);
    expect([done.left, done.top]).toEqual([want.forward.x, want.forward.y]);
    expect(one('preview-done').props.accessibilityLabel).toBe('Done');
    await press('preview-done');
    expect(mockNav.dismissAll).toHaveBeenCalled();
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
