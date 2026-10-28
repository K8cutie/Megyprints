/* ══════════════════════════════════════════════════════════════════════════
   PART 3: THE COVER SCREEN ITSELF, tapped (src/editor/cover/CoverScreen.tsx).
   This file belongs to the cover part.

   The screen is rendered on the real shared builder of an album made through
   the app's steps (test/editorHarness.ts), and its buttons are pressed the
   way a finger presses them (the Pressable's own press), so what is proven
   is what a tap does on the phone, short of drawing: the cover picture is
   left out (the page renderer needs the phone's Skia; it is proven on the
   phone by the renderer's own checks) and the navigator is a stand-in.
     • on open the builder edits the cover; on leaving, the pages again, and
       the last words typed reach the cover first;
     • Background: a photo, a colour, "Use <colour> on every page", Zoom and
       Reset (only with a photo), dragging the cover moves the photo;
     • Text: the title (typed, sent once typing pauses), the font list, the
       colours with the "wouldn't show" warning and its fix, alignment,
       Bold / Italic / Shadow, the size; dragging the title moves it;
     • the blank cover warning; the "drawn more simply" line; Done goes back;
       no Undo or Redo anywhere; nothing on a page changes.
   ══════════════════════════════════════════════════════════════════════════ */
import { createElement, type ComponentType } from 'react';
import { createRoot, type Root, type TestInstance } from 'test-renderer';
import type { AppPlatform } from '../src/builder/appPlatform';
import { SCENARIOS } from '../../tools/parity/scenarios';
import { act, builder, madeAlbum, settle, useEditorBench } from './editorHarness';

const mockNav = { back: jest.fn(), push: jest.fn(), replace: jest.fn() };
const mockBench: { platform: AppPlatform | null; notDrawn: string[] } = { platform: null, notDrawn: [] };

jest.mock('expo-router', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    router: { back: () => mockNav.back(), push: (r: string) => mockNav.push(r), replace: (r: string) => mockNav.replace(r), canGoBack: () => true },
    Stack: { Screen: () => null },
    // On the screen's own: focused while it is shown.
    useFocusEffect: (cb: () => void | (() => void)) => { React.useEffect(() => cb(), [cb]); },
  };
});
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('../src/builder/BuilderProvider', () => ({
  useBuilder: () => ({ builder: jest.requireActual('./editorHarness').builder(), platform: mockBench.platform, text: null }),
}));
jest.mock('../src/builder/usePagePicture', () => ({
  usePagePicture: () => ({ uri: 'file:///cache/megy-pages/cover.jpg', notDrawn: mockBench.notDrawn, missing: 0, error: null }),
  forgetPhotoPictures: () => {},
}));

// After the mocks: the screen and its pieces.
import CoverScreen from '../src/editor/cover/CoverScreen';
import { CoverStage } from '../src/editor/cover/CoverStage';
import { Slider } from '../src/editor/cover/Slider';
import { coverCrop, coverTitleOf, titleBoxOf } from '../src/editor/cover/coverEdits';
import * as W from '../src/editor/cover/words';
import { NOT_DRAWN_LINE } from '../src/builder/screenWords';
import { BLANK_COVER_MESSAGE } from '../src/editor/cover/coverChecks';

useEditorBench();

let screen: Root | null = null;
let tick = 0;
/** The screen drawn again with the builder as it is now (each builder change
 *  re-renders the screen on the phone; here it is asked for). */
const refresh = async () => { await act(async () => { screen!.render(createElement(CoverScreen as ComponentType<{ t: number }>, { t: ++tick })); }); };
afterEach(async () => { if (screen) await act(async () => { screen!.unmount(); }); screen = null; jest.clearAllMocks(); });

async function openCover(): Promise<void> {
  mockBench.platform = await madeAlbum(SCENARIOS[0]);
  screen = createRoot();
  await refresh();
  await refresh(); // the scope set on open is seen
}

const all = (pred: (i: TestInstance) => boolean) => screen!.container.queryAll(pred);
const byId = (id: string) => all((i) => i.props.testID === id)[0] ?? null;
const has = (id: string) => byId(id) !== null;
const textOf = (i: TestInstance | string): string => (typeof i === 'string' ? i : i.children.map(textOf).join(''));
const screenText = () => textOf(screen!.container);

/** A finger's press on a Pressable (its own handler: Pressability's click). */
async function press(id: string): Promise<void> {
  const el = byId(id);
  if (!el) throw new Error(`nothing to press: ${id}`);
  await act(async () => { el.props.onClick({ currentTarget: null, target: null, nativeEvent: {}, stopPropagation() {} }); });
  await refresh();
}

/** The props a component was drawn with (found from one of its host views). */
function propsOf<P>(hostId: string, type: unknown): P {
  let f = byId(hostId)?.unstable_fiber ?? null;
  while (f && f.type !== type) f = f.return;
  if (!f) throw new Error(`no ${String(hostId)}`);
  return f.memoizedProps as P;
}

describe('the cover screen', () => {
  it('edits the cover while open, the pages again when left; no Undo or Redo; nothing on a page changes', async () => {
    await openCover();
    const pages = JSON.stringify(builder().albumPages);
    expect(builder().editScope).toBe('coverFront');
    expect(screenText()).toContain(W.ONE_PHOTO);
    expect(screenText()).toContain(W.BACK_NOTE);
    expect(screenText()).not.toMatch(/\b(Undo|Redo)\b/);
    // Typed, and the screen left at once: the words reach the cover first.
    await press('cover-tab-text');
    const input = byId('cover-title')!;
    await act(async () => { input.props.onChangeText('Maria & Jose, Forever'); });
    expect(coverTitleOf(builder().coverFront).text).toBe(SCENARIOS[0].title); // still typing
    await act(async () => { screen!.unmount(); });
    screen = null;
    await settle();
    expect(coverTitleOf(builder().coverFront).text).toBe('Maria & Jose, Forever');
    expect(builder().editScope).toBe('interior');
    expect(JSON.stringify(builder().albumPages)).toBe(pages);
  });

  it('Background: a photo, a colour, every page, Zoom and Reset, dragging the photo', async () => {
    await openCover();
    const pages = JSON.stringify(builder().albumPages);
    const onCover = (builder().coverFront.background as { photoId?: string }).photoId;
    const other = builder().uploadedPhotos.find((p) => p.id !== onCover && has(`cover-photo-${p.id}`))!;
    expect(has('cover-zoom')).toBe(true); // a photo is on: Zoom shows
    await press(`cover-photo-${other.id}`);
    expect(builder().coverFront.background).toMatchObject({ type: 'image', photoId: other.id });

    // Drag on the cover (not on the title): the photo moves in its frame.
    const stage = propsOf<{ onDrag: (w: 'title' | 'photo', p: 'start' | 'move' | 'end', dx: number, dy: number) => void }>('cover-stage', CoverStage);
    await act(async () => { stage.onDrag('photo', 'start', 0, 0); stage.onDrag('photo', 'move', 0.1, 0); stage.onDrag('photo', 'end', 0.2, -0.1); });
    await refresh();
    expect(coverCrop(builder().coverFront)).toMatchObject({ focusX: 0.3, focusY: 0.6 });

    // Zoom, then Reset.
    const zoom = propsOf<{ onDone: (v: number) => void }>('cover-zoom-slider', Slider);
    await act(async () => { zoom.onDone(2.5); });
    await refresh();
    expect(coverCrop(builder().coverFront).zoom).toBe(2.5);
    await press('cover-zoom-reset');
    expect(coverCrop(builder().coverFront)).toEqual({ focusX: 0.5, focusY: 0.5, zoom: 1 });

    // A colour: the photo goes, and so does Zoom; "Use blue on every page" shows.
    expect(has('cover-color-all')).toBe(false);
    await press('cover-color-Blue');
    expect(builder().coverFront.background).toEqual({ type: 'solid', solid: '#1F75FE' });
    expect(has('cover-zoom')).toBe(false);
    expect(textOf(byId('cover-color-name')!)).toBe('Blue');
    expect(JSON.stringify(builder().albumPages)).toBe(pages);
    expect(textOf(byId('cover-color-all')!)).toBe('Use blue on every page');
    await press('cover-color-all');
    expect(builder().albumPages.every((p) => p.background?.type === 'solid' && p.background.solid === '#1F75FE')).toBe(true);
  });

  it('Text: the title, its font, colour (with the warning and its fix), alignment, Bold / Italic / Shadow, size, dragging it', async () => {
    await openCover();
    await press('cover-tab-text');
    const input = byId('cover-title')!;
    await act(async () => { input.props.onChangeText('Our Boracay Trip'); });
    await act(async () => { byId('cover-title')!.props.onBlur(); }); // leaving the box sends it
    await refresh();
    expect(coverTitleOf(builder().coverFront).text).toBe('Our Boracay Trip');

    await press('cover-font');
    expect(has('cover-font-list')).toBe(true);
    await press('cover-font-Playfair');
    expect(coverTitleOf(builder().coverFront).fontFamily).toBe('"Playfair Display", Georgia, serif');
    expect(has('cover-font-list')).toBe(false);
    expect(textOf(byId('cover-font')!)).toContain('Playfair');

    await press('cover-title-color-Gold');
    expect(coverTitleOf(builder().coverFront).color).toBe('#C9A24B');
    expect(textOf(byId('cover-title-color-name')!)).toBe('Gold');

    await press('cover-align-left');
    await press('cover-title-italic');
    await press('cover-title-bold');
    await press('cover-title-shadow');
    expect(coverTitleOf(builder().coverFront)).toMatchObject({ alignment: 'left', italic: true, bold: false, shadow: false });
    expect(byId('cover-title-shadow')!.props.accessibilityState).toMatchObject({ selected: false });

    const size = propsOf<{ onSlide: (v: number) => void; onDone: (v: number) => void }>('cover-title-size-slider', Slider);
    await act(async () => { size.onSlide(60); });
    await refresh();
    expect(textOf(byId('cover-title-size')!)).toBe('60px');
    expect(coverTitleOf(builder().coverFront).fontSize).not.toBe(60); // one change, when the finger lets go
    await act(async () => { size.onDone(60); });
    await refresh();
    expect(coverTitleOf(builder().coverFront).fontSize).toBe(60);

    // Dragging the title: its box follows the finger, kept on the cover.
    const box = titleBoxOf(builder().coverFront)!;
    const stage = propsOf<{ onDrag: (w: 'title' | 'photo', p: 'start' | 'move' | 'end', dx: number, dy: number) => void }>('cover-stage', CoverStage);
    await act(async () => { stage.onDrag('title', 'start', 0, 0); stage.onDrag('title', 'move', 0, -0.2); });
    await refresh();
    const live = propsOf<{ titleRect: { y: number } }>('cover-stage', CoverStage).titleRect;
    expect(live.y).toBeCloseTo(box.baseY - 0.2, 6);
    await act(async () => { stage.onDrag('title', 'end', 0, -9); });
    await refresh();
    expect(coverTitleOf(builder().coverFront).offsetY).toBeCloseTo(-box.baseY, 10); // the top edge
  });

  it('warns about a title colour that wouldn\'t show, and a blank cover; says what is drawn more simply; Done goes back', async () => {
    mockBench.notDrawn = ['font Cinzel'];
    try {
      await openCover();
      expect(textOf(byId('cover-not-drawn')!)).toBe(NOT_DRAWN_LINE);
      await press('cover-color-Yellow');
      await press('cover-tab-text');
      expect(has('cover-title-hard-to-see')).toBe(false);
      await press('cover-title-color-White');
      expect(textOf(byId('cover-title-hard-to-see')!)).toContain(W.TITLE_HARD_TO_SEE);
      expect(textOf(byId('cover-title-use-ink')!)).toBe('Use charcoal');
      await press('cover-title-use-ink');
      expect(coverTitleOf(builder().coverFront).color).toBe('#2D2D2D');
      expect(has('cover-title-hard-to-see')).toBe(false);

      // No title and no photo: the website's blank cover line.
      expect(has('cover-blank')).toBe(false);
      await act(async () => { byId('cover-title')!.props.onChangeText(''); });
      await act(async () => { byId('cover-title')!.props.onBlur(); });
      await refresh();
      expect(textOf(byId('cover-blank')!)).toBe(BLANK_COVER_MESSAGE);

      await press('cover-done');
      expect(mockNav.back).toHaveBeenCalledTimes(1);
    } finally { mockBench.notDrawn = []; }
  });
});
