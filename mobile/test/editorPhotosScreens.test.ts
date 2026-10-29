/* ══════════════════════════════════════════════════════════════════════════
   THE PHOTOS PART'S SCREENS, rendered (test-renderer) on an album made
   through the app's steps, and used the way a finger uses them:
     • the move-and-zoom overlay sits exactly on the selected photo, takes a
       touch only where that photo is on top, and a drag through its own
       touch handlers stores the move (setSlotOffset) and shows the photo
       where it was left until the page is drawn again; a plain tap on it is
       the page's own tap;
     • "Add a photo": a photo tapped fills the frame and closes the sheet;
       "Upload more photos" goes to the phone's photos and opens the sheet
       again on the way back;
     • Mask, Filter, Pages (the 40-page floor said, not offered), and the
       lines over the page (swap waiting, the studio line, blank pages).
   (The layout sheet's pictures are drawn by the page renderer, which needs
   the phone's Skia: its logic is tested in editorPhotos.test.ts, its
   pictures on the phone.)
   ══════════════════════════════════════════════════════════════════════════ */
import { act, createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'test-renderer';
import { SCENARIOS } from '../../tools/parity/scenarios';
import { targetStyle } from '../src/editor/PageStage';
import { editThePages } from '../src/editor/scope';
import { pagePictureShown } from '../src/builder/pageShown';
import type { EditorContext } from '../src/editor/registry';
import { cancelSwap, pendingSwap, startSwap } from '../src/editor/photos/actions';
import { FramingOverlay } from '../src/editor/photos/FramingOverlay';
import { frameCell } from '../src/editor/photos/framing';
import { panRoom } from '@web/pages/builder/slotPhotoFit';
import { resetIntake, takeIntake, intakeLeaving } from '../src/editor/photos/intake';
import { FilterSheet, MaskSheet, PagesSheet, PickPhotoSheet } from '../src/editor/photos/sheets';
import { BlankPagesBanner, MissingPhotosBanner, StudioBanner, SwapBanner } from '../src/editor/photos/banners';
import * as words from '../src/editor/photos/words';
import '../src/editor/parts';
import { builder, ctxOn, firstPhoto, madeAlbum, settle, tapOn, useEditorBench } from './editorHarness';

const mockPush = jest.fn();
jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual('react');
  return { router: { push: (...a: unknown[]) => mockPush(...a) }, useFocusEffect: (fn: () => void | (() => void)) => useEffect(fn, [fn]) };
});

useEditorBench();
let view: Root | null = null;
afterEach(async () => {
  await act(async () => { view?.unmount(); });
  view = null;
  cancelSwap();
  resetIntake();
  mockPush.mockReset();
});

async function show(el: ReactElement) {
  if (!view) view = createRoot();
  await act(async () => { view!.render(el); });
  return view;
}
const byId = (id: string) => view!.container.queryAll((n) => n.props.testID === id);
const one = (id: string) => {
  const found = byId(id);
  expect(found).toHaveLength(1);
  return found[0];
};
/** A finger's tap on a Pressable (its host view's click, as an accessibility tap). */
async function press(id: string) {
  const n = one(id);
  await act(async () => { n.props.onClick({ nativeEvent: {}, currentTarget: 1, target: 1, stopPropagation() {} }); });
}
const texts = () => JSON.stringify(view!.container.toJSON());

/* A responder event, as React Native hands one to a view's touch handlers. */
let clock = 1000;
function touchEvent(points: { x: number; y: number }[], local: { x: number; y: number }, start = points) {
  clock += 16;
  const touchBank = points.map((p, i) => ({
    touchActive: true, startPageX: start[i]?.x ?? p.x, startPageY: start[i]?.y ?? p.y, startTimeStamp: 1000,
    currentPageX: p.x, currentPageY: p.y, currentTimeStamp: clock, previousPageX: p.x, previousPageY: p.y, previousTimeStamp: clock - 16,
  }));
  return {
    nativeEvent: { locationX: local.x, locationY: local.y, pageX: points[0].x, pageY: points[0].y, touches: points.map((p) => ({ pageX: p.x, pageY: p.y })), changedTouches: [] },
    touchHistory: { numberActiveTouches: points.length, indexOfSingleActiveTouch: 0, mostRecentTimeStamp: clock, touchBank },
  };
}

/** Screen px per page px (an 8x8 page shown 360 px wide). */
const K = 0.15;

describe('the move-and-zoom overlay', () => {
  it('sits on the selected photo; a drag through its own touch handlers stores the move and the photo stays where it was left until the page is drawn', async () => {
    const platform = await madeAlbum(SCENARIOS[0]);
    await act(async () => { editThePages(builder()); builder().goToPage(3); });
    const t = firstPhoto(platform);
    await tapOn(platform, t);
    await act(async () => { builder().setSlotScale(t.index, 2); });
    const ctx: EditorContext = ctxOn(platform);
    await show(createElement(FramingOverlay, { ctx, scale: K, width: 360, height: 360 }));
    const overlay = one('photos-framing');
    const style = Object.assign({}, ...[overlay.props.style].flat(3).filter(Boolean));
    expect(style).toMatchObject(targetStyle(ctx.selected!, K));
    const before = builder().albumPages[3].slotOffsetsX?.[t.index] ?? 0;
    const mid = { x: (t.box.w * K) / 2, y: (t.box.h * K) / 2 };
    const at = (dx: number) => touchEvent([{ x: 200 + dx, y: 300 }], { x: mid.x + dx, y: mid.y }, [{ x: 200, y: 300 }]);
    expect(overlay.props.onStartShouldSetResponder(at(0))).toBe(true);
    await act(async () => { overlay.props.onResponderGrant(at(0)); });
    await act(async () => { overlay.props.onResponderMove(at(12)); });
    await act(async () => { overlay.props.onResponderMove(at(24)); });
    // While the finger moves, the photo is drawn here (the page picture is not drawn yet).
    expect(texts()).toContain('"contentFit":"fill"');
    expect(builder().albumPages[3].slotOffsetsX?.[t.index] ?? 0).toBe(before); // stored when the finger is up
    await act(async () => { overlay.props.onResponderRelease(at(24)); });
    const cell = frameCell(ctx.page, t.index, builder().albumSize, 3)!;
    expect(builder().albumPages[3].slotOffsetsX?.[t.index]).toBeCloseTo(before + 24 / K / cell.k.x, 6);
    // Still shown until the changed page's picture is on show, then gone.
    expect(texts()).toContain('"contentFit":"fill"');
    await act(async () => { pagePictureShown(ctx.page); }); // the old page: not yet
    await act(async () => { await new Promise((r) => setTimeout(r, 250)); });
    expect(texts()).toContain('"contentFit":"fill"');
    await act(async () => { pagePictureShown(builder().albumPages[3]); });
    await act(async () => { await new Promise((r) => setTimeout(r, 250)); });
    expect(texts()).not.toContain('"contentFit":"fill"');
  });

  it('a plain tap on it is the page\'s own tap (here: it calls off the swap the photo was waiting for)', async () => {
    const platform = await madeAlbum(SCENARIOS[0]);
    await act(async () => { editThePages(builder()); builder().goToPage(4); });
    const t = firstPhoto(platform);
    await tapOn(platform, t);
    const ctx = ctxOn(platform);
    startSwap(ctx.selected!, ctx);
    expect(pendingSwap()).not.toBeNull();
    await show(createElement(FramingOverlay, { ctx, scale: K, width: 360, height: 360 }));
    const overlay = one('photos-framing');
    const e = touchEvent([{ x: 50, y: 50 }], { x: 20, y: 20 });
    expect(overlay.props.onStartShouldSetResponder(e)).toBe(true);
    await act(async () => { overlay.props.onResponderGrant(e); });
    await act(async () => { overlay.props.onResponderRelease(e); });
    expect(pendingSwap()).toBeNull();
  });

  it("a sideways swipe on a photo that can't move that way turns the page", async () => {
    const platform = await madeAlbum(SCENARIOS[0]);
    await act(async () => { editThePages(builder()); });
    // A page whose photo has no room sideways (a tall photo in a frame its width).
    const p = builder().albumPages.findIndex((pg, i) => {
      if (i < 1 || i > 30) return false;
      const f = (pg.slotFills ?? []).findIndex((x) => x != null);
      if (f < 0) return false;
      const photo = builder().uploadedPhotos[pg.slotFills![f]!];
      const cell = frameCell(pg, f, builder().albumSize, i)!;
      return !!cell && panRoom({ w: photo.width, h: photo.height }, { w: cell.box.w, h: cell.box.h }, pg.slotScales?.[f]).x === 0;
    });
    expect(p).toBeGreaterThan(0);
    await act(async () => { builder().goToPage(p); });
    const t = firstPhoto(platform);
    await tapOn(platform, t);
    const ctx = ctxOn(platform);
    await show(createElement(FramingOverlay, { ctx, scale: K, width: 360, height: 360 }));
    const overlay = one('photos-framing');
    const at = (dx: number) => touchEvent([{ x: 250 + dx, y: 300 }], { x: 40 + Math.max(0, dx), y: 40 }, [{ x: 250, y: 300 }]);
    const pagesBefore = builder().albumPages;
    expect(overlay.props.onStartShouldSetResponder(at(0))).toBe(true);
    await act(async () => { overlay.props.onResponderGrant(at(0)); });
    await act(async () => { overlay.props.onResponderMove(at(-40)); });
    await act(async () => { overlay.props.onResponderMove(at(-90)); });
    await act(async () => { overlay.props.onResponderRelease(at(-90)); });
    expect(builder().albumPages).toBe(pagesBefore); // nothing stored
    expect(builder().currentPageIndex).toBe(p + 1); // right to left: the next page
  });

  it('nothing selected, or words selected: no overlay', async () => {
    const platform = await madeAlbum(SCENARIOS[0]);
    await act(async () => { editThePages(builder()); builder().goToPage(4); });
    await show(createElement(FramingOverlay, { ctx: ctxOn(platform), scale: K, width: 360, height: 360 }));
    expect(byId('photos-framing')).toHaveLength(0);
  });
});

describe('the sheets', () => {
  it('"Add a photo": a photo tapped fills the frame and the sheet closes; "Upload more photos" goes to the phone\'s photos and comes back to the sheet', async () => {
    const platform = await madeAlbum(SCENARIOS[0]);
    await act(async () => { editThePages(builder()); builder().goToPage(3); });
    const t = firstPhoto(platform);
    await act(async () => { builder().clearSlot(t.index); });
    const close = jest.fn();
    await show(createElement(PickPhotoSheet, { ctx: ctxOn(platform), params: { kind: 'slot', index: t.index }, close }));
    expect(texts()).toContain(words.ADD_A_PHOTO);
    expect(texts()).toContain(words.UPLOAD_MORE);
    await settle();
    await press(`photos-pick-${t.photoIndex}`);
    expect(builder().albumPages[3].slotFills?.[t.index]).toBe(t.photoIndex);
    expect(close).toHaveBeenCalledTimes(1);
    await press('photos-pick-upload');
    expect(close).toHaveBeenCalledTimes(2);
    expect(mockPush).toHaveBeenCalledWith('/pick-photos');
    intakeLeaving(() => new Set());
    expect(takeIntake()?.reopen).toEqual({ id: 'photos:pick', params: { kind: 'slot', index: t.index } });
  });

  it('Mask and Filter tick the photo\'s own and change it; Pages says the 40-page floor instead of offering a delete', async () => {
    const platform = await madeAlbum(SCENARIOS[0]);
    await act(async () => { editThePages(builder()); builder().goToPage(6); });
    const t = firstPhoto(platform);
    const close = jest.fn();
    await show(createElement(MaskSheet, { ctx: ctxOn(platform), params: { slot: t.index }, close }));
    expect(texts()).toContain('✓ None');
    await press('photos-mask-heart');
    expect(builder().albumPages[6].slotMasks?.[t.index]).toBe('heart');
    await show(createElement(FilterSheet, { ctx: ctxOn(platform), params: { slot: t.index }, close }));
    expect(texts()).toContain(`✓ ${words.ORIGINAL}`);
    await press('photos-filter-sepia');
    expect(builder().albumPages[6].slotLooks?.[t.index]).toBe('sepia');
    expect(close).toHaveBeenCalledTimes(2);
    await show(createElement(PagesSheet, { ctx: ctxOn(platform), params: undefined, close }));
    expect(byId('photos-page-delete')).toHaveLength(0);
    expect(texts()).toContain(words.CANT_DELETE_PAGE);
    const opened: string[] = [];
    const ctx = { ...ctxOn(platform), openSheet: (id: string) => { opened.push(id); } };
    await show(createElement(PagesSheet, { ctx, params: undefined, close }));
    await press('photos-page-add');
    expect(builder().albumPages.length).toBe(41);
    expect(opened).toEqual(['photos:layout']); // the new page's layouts come next
    await show(createElement(PagesSheet, { ctx: ctxOn(platform), params: undefined, close }));
    await press('photos-page-delete');
    expect(builder().albumPages.length).toBe(40);
  });
});

describe('the lines over the page', () => {
  it('a swap waiting (with Cancel), "This page is yours · Megy, fix this page", and the blank pages reminder', async () => {
    const platform = await madeAlbum(SCENARIOS[0]);
    await act(async () => { editThePages(builder()); builder().goToPage(6); });
    const t = firstPhoto(platform);
    await show(createElement(SwapBanner, { ctx: ctxOn(platform) }));
    expect(byId('photos-swap-banner')).toHaveLength(0);
    await act(async () => { startSwap(t, ctxOn(platform)); });
    expect(texts()).toContain(words.SWAP_LINE);
    await press('photos-swap-cancel');
    expect(pendingSwap()).toBeNull();
    expect(byId('photos-swap-banner')).toHaveLength(0);

    await show(createElement(StudioBanner, { ctx: ctxOn(platform) }));
    expect(byId('photos-studio-banner')).toHaveLength(0);
    await act(async () => { builder().setSlotMask(t.index, 'circle'); });
    await show(createElement(StudioBanner, { ctx: ctxOn(platform) }));
    expect(texts()).toContain(words.STUDIO_YOURS);
    await press('photos-studio-fix');
    expect(builder().albumPages[6].studio).toBe(false);

    await show(createElement(BlankPagesBanner, { ctx: ctxOn(platform) }));
    expect(byId('photos-blank-banner')).toHaveLength(0);
    await act(async () => { builder().addPage(); });
    await act(async () => { builder().addPage(); });
    await act(async () => { builder().goToPage(2); });
    await show(createElement(BlankPagesBanner, { ctx: ctxOn(platform) }));
    expect(texts()).toContain('2 pages are blank');
    expect(texts()).toContain('Delete 2 blank pages');
    await press('photos-blank-edit');
    expect(builder().currentPageIndex).toBe(7);
    await show(createElement(BlankPagesBanner, { ctx: ctxOn(platform) }));
    await press('photos-blank-delete');
    expect(builder().albumPages.length).toBe(40);
  });
  it("photos missing on this phone: which pages, and \"Add the photos\" opens the phone's photos here (the trip that puts them back)", async () => {
    const platform = await madeAlbum(SCENARIOS[0]);
    await act(async () => { editThePages(builder()); });
    await show(createElement(MissingPhotosBanner, { ctx: ctxOn(platform) }));
    expect(byId('edit-missing-photos')).toHaveLength(0); // every photo is here

    // The album opened on another phone: the first placed photo's file isn't here.
    const b = builder();
    const placed = b.albumPages.flatMap((p) => p.slotFills ?? []).find((f): f is number => typeof f === 'number' && f >= 0)!;
    const away = { ...b, uploadedPhotos: b.uploadedPhotos.map((p, i) => (i === placed ? { ...p, previewUrl: '' } : p)) };
    await show(createElement(MissingPhotosBanner, { ctx: { ...ctxOn(platform), builder: away } }));
    expect(texts()).toMatch(/1 photo on pages? [0-9, and]+ isn't on this phone any more/);
    expect(texts()).toContain(words.ADD_THE_PHOTOS);
    await press('edit-missing-add');
    expect(mockPush).toHaveBeenCalledWith('/pick-photos');
    // The trip is the photos part's: on the way back the picked photos go in (intake.ts).
    intakeLeaving(() => new Set());
    expect(takeIntake()).toMatchObject({ reopen: null });
  });
});
