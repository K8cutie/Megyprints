// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/* ══════════════════════════════════════════════════════════════════════════
   THE COACH MARK POINTS AT THE TOOL THAT OPENED (owner, 2026-10-29: the
   daily test "becomes a tutorial of sorts", "make it look like its a
   tutorial"). Today's task in the album opens its tool by itself (#229);
   the lesson's coach mark (Megy, a speech bubble, an arrow, a soft ring) is
   on THAT control, not near it: the real pages screen (MobileReview), the
   real layout picker, text editor, Filter sheet and photo picker, and
   Preview's open-book button. Android app only, while testing.
   ══════════════════════════════════════════════════════════════════════════ */

const h = vi.hoisted(() => ({ native: true, testing: true, ctx: null as unknown }));
vi.mock('../../lib/nativeShell', () => ({ isNativeShell: () => h.native }));
vi.mock('../../lib/testingPhase', async (importOriginal) => {
  const real = await importOriginal<Record<string, unknown>>();
  return { ...real, get TESTING_PHASE() { return h.testing; } };
});
vi.mock('./BuilderContext', () => ({ useBuilderContext: () => h.ctx }));
vi.mock('./CoverEditor', () => ({ default: () => null }));
vi.mock('../../hooks/use-mobile', () => ({ useIsMobile: () => true, useIsPortrait: () => true }));

import MobileReview from './MobileReview';
import LayoutPicker from './LayoutPicker';
import DailyTestBar from './DailyTestBar';
import BuilderPreview from './BuilderPreview';
import { snapPages, coachStepsFor } from './dailyAlbumTask';
import { attachRun } from '../../lib/dailyTestRun';
import { ALBUM_TIPS, coachSelector, coachText } from '../../lib/lessonTips';
import { samplePhotoName } from '../../lib/samplePhotos';
import type { AlbumTaskId, DailyTestRequest } from '../../lib/dailyTest';
import type { AlbumPage } from './types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const GIF = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
const MADE = new Date(2026, 9, 29, 15, 22).getTime();
const TEST: DailyTestRequest = { day: 20755, name: 'Oct 29', before: 'titleFont', answer: '"Caveat", cursive', album: 'layout' };
const photos = Array.from({ length: 40 }, (_, i) => ({ id: `p${i}`, previewUrl: GIF, name: samplePhotoName(i + 1), type: 'image/jpeg', size: 1, width: 1200, height: 1200 }));
const album = () => Array.from({ length: 40 }, (_, i) => ({
  id: `page-${i}`, layout: 'single', size: '8x8', templateId: i === 4 ? 't6x4-07' : 't88-solo-square', slotFills: [i],
  photos: [], textElements: [], background: { type: 'solid', solid: '#FFFFFF' }, madeAt: MADE,
})) as unknown as AlbumPage[];

let host: HTMLDivElement;
let root: Root;
const $ = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
/** The coach mark, and the control it points at. */
const coach = () => {
  const mark = $('coach-mark');
  return { mark, target: mark ? document.querySelector<HTMLElement>(mark.dataset.coachTarget!) : null };
};
const settle = async () => { for (let i = 0; i < 6; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };

/** The pages screen as the builder shows it on a phone: the lesson strip on
 *  top, the pages, and the layout picker (it lives beside them). */
function Pages() {
  const [pages] = useState(album);
  const [idx, setIdx] = useState(4);
  const [pickerOpen, setPickerOpen] = useState(false);
  const actions = {
    albumPages: pages, currentPageIndex: idx, currentPage: pages[idx], uploadedPhotos: photos, albumSize: '8x8',
    previewSeen: false, canAddMemoryQr: false, editScope: 'pages', phase: 'edit',
    layoutPickerOpen: pickerOpen, setLayoutPickerOpen: setPickerOpen,
    availableTemplatesForCurrentPage: () => [], layoutChangeLoses: () => ({ photos: 0, captions: 0 }), applyPageLayout: vi.fn(),
    goToPage: setIdx, dispatch: vi.fn(async () => ({ success: true })), setPhase: vi.fn(), setWizardStep: vi.fn(),
    setSlotMask: vi.fn(), setSlotLook: vi.fn(), fillSlot: vi.fn(), clearSlot: vi.fn(), setBoxText: vi.fn(), setSlotText: vi.fn(),
    updateTextElement: vi.fn(), setQrFill: vi.fn(), setTextSlotPhoto: vi.fn(), setTextSlotQr: vi.fn(), setTextSlotOrnament: vi.fn(),
    setOrnamentFill: vi.fn(), setPageColor: vi.fn(), applyPageColorToAllPages: vi.fn(), resetStudioPage: vi.fn(),
    removeSticker: vi.fn(), updateStickerGeom: vi.fn(() => []), setMemoryQrCorner: vi.fn(), applyMemoryQr: vi.fn(),
  };
  return createElement('div', null,
    createElement(DailyTestBar, { actions: actions as never }),
    createElement(MobileReview, { actions: actions as never, onDone: vi.fn() }),
    createElement(LayoutPicker, { actions: actions as never }));
}

/** Today's lesson made this album; its task in the album is `task`, on page 5. */
const lessonAlbum = (task: AlbumTaskId) =>
  attachRun({ ...TEST, album: task }, MADE, task, { page: task === 'openBook' ? 1 : 4, slot: task === 'layout' ? null : 0 }, snapPages(album()));

beforeEach(() => {
  h.native = true; h.testing = true;
  localStorage.clear();
  Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true, writable: true });
  Object.defineProperty(window, 'innerHeight', { value: 844, configurable: true, writable: true });
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
  h.ctx = {
    setBoxText: vi.fn(), updateTextElement: vi.fn(), setQrFill: vi.fn(), coverDesign: undefined, coverFront: undefined,
    finishBoxesWithQuotes: vi.fn(async () => ({ filled: 0, remaining: 0, heldBack: 0, noLine: 0 })), getAlbumId: () => 'album-1', deletePages: () => 0,
  };
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => { root.unmount(); }); host.remove(); });

describe('on the pages screen: the coach mark is on the tool that opened by itself', () => {
  it('a new layout: the layout picker', async () => {
    lessonAlbum('layout');
    await act(async () => { root.render(createElement(Pages)); });
    await settle();
    const picker = document.querySelector<HTMLElement>('[role="dialog"][aria-labelledby="layout-picker-title"]');
    expect(picker).not.toBeNull(); // opened by itself (#229)
    const { mark, target } = coach();
    expect(mark!.dataset.coachTarget).toBe(coachSelector('layout-picker'));
    expect(target).toBe(picker);
    expect(text($('coach-mark-text'))).toBe("This is where you change a page's layout. Pick any new one.");
  });

  it('words in a box: the text box, with the keyboard on it', async () => {
    lessonAlbum('caption');
    await act(async () => { root.render(createElement(Pages)); });
    await settle();
    const { mark, target } = coach();
    expect(mark!.dataset.coachTarget).toBe(coachSelector('text-box'));
    expect(target!.tagName).toBe('TEXTAREA');
    expect(document.activeElement).toBe(target); // the editor that opened, typing into it
    expect(text($('coach-mark-text'))).toBe('This box is for your own words. Type any word, then tap Done.');
  });

  it('a photo filter: the Filter sheet of the photo it opened on', async () => {
    lessonAlbum('look');
    await act(async () => { root.render(createElement(Pages)); });
    await settle();
    const { mark, target } = coach();
    expect(mark!.dataset.coachTarget).toBe(coachSelector('filter-sheet'));
    expect(target!.closest('[data-testid="studio-sheet-look"]')).not.toBeNull();
    expect(target!.querySelectorAll('[data-testid^="look-"]').length).toBeGreaterThan(1);
    expect(text($('coach-mark-text'))).toBe('Filters change how a photo looks. Tap any one.');
  });

  it('swap a photo: the photo picker', async () => {
    lessonAlbum('swap');
    await act(async () => { root.render(createElement(Pages)); });
    await settle();
    const { mark, target } = coach();
    expect(mark!.dataset.coachTarget).toBe(coachSelector('photo-picker'));
    expect(target!.querySelectorAll('[data-testid="picker-photo"]')).toHaveLength(40);
    expect(text($('coach-mark-text'))).toBe('You can swap any photo for another. Tap a photo to put it here.');
  });

  it('it never takes a tap: everything in it lets taps through to the tool', async () => {
    lessonAlbum('swap');
    await act(async () => { root.render(createElement(Pages)); });
    await settle();
    expect($('coach-mark')!.className).toContain('pointer-events-none');
    expect($('coach-mark')!.querySelectorAll('button, a, input')).toHaveLength(0);
    // Megy beside the words, the ring and the arrow.
    expect($('coach-mark-bubble')!.querySelector('img')).not.toBeNull();
    expect($('coach-mark-ring')).not.toBeNull();
    expect($('coach-mark-arrow')).not.toBeNull();
  });
});

describe('in Preview: the open book', () => {
  it("the coach mark is on Preview's glowing \"See it as an open book\" button", async () => {
    lessonAlbum('openBook');
    const actions = { albumPages: album(), phase: 'preview', goToPage: vi.fn(), dispatch: vi.fn(async () => ({ success: true })), setPhase: vi.fn(), setWizardStep: vi.fn() };
    await act(async () => {
      root.render(createElement('div', null,
        createElement(DailyTestBar, { actions: actions as never }),
        createElement(BuilderPreview, { pages: album(), currentIndex: 10, photos, albumSize: '8x8', onBack: vi.fn(), onOrder: vi.fn(), onGoToPage: vi.fn(), turnAnimation: false } as never)));
    });
    await settle();
    const { mark, target } = coach();
    expect(mark!.dataset.coachTarget).toBe(coachSelector('open-book'));
    expect(target).toBe($('preview-open-book'));
    expect(target!.dataset.glow).toBe('true');
    expect(text($('coach-mark-text'))).toBe('See two pages side by side, like a real book. Tap See it as an open book.');
    // No button on the strip in Preview: the open book's own button is the way.
    expect($('daily-test-show')).toBeNull();
  });
});

describe('where the coach mark points, for each task', () => {
  it('first the tool that opened, then the strip\'s button that opens it again', () => {
    for (const task of ['layout', 'caption', 'look', 'swap'] as const) {
      const steps = coachStepsFor(task, 'Show me');
      expect(steps[0]).toEqual({ target: coachSelector(ALBUM_TIPS[task].control), text: coachText(ALBUM_TIPS[task]) });
      expect(steps[1]).toEqual({ target: coachSelector('lesson-show'), text: 'Tap **Show me** to try it.' });
    }
    // The open book in Preview: its own button, nothing else.
    expect(coachStepsFor('openBook', null)).toEqual([{ target: coachSelector('open-book'), text: coachText(ALBUM_TIPS.openBook) }]);
  });

  it('the website, or TESTING_PHASE off: no coach mark, no strip', async () => {
    for (const [native, testing] of [[false, true], [true, false]] as const) {
      h.native = native; h.testing = testing;
      localStorage.clear();
      lessonAlbum('layout');
      await act(async () => { root.unmount(); });
      root = createRoot(host);
      await act(async () => { root.render(createElement(Pages)); });
      await settle();
      expect($('coach-mark')).toBeNull();
      expect($('daily-test-bar')).toBeNull();
    }
  });
});
