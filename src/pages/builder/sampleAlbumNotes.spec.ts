// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/* ══════════════════════════════════════════════════════════════════════════
   A SAMPLE ALBUM TELLS THE TESTER WHAT TO DO (owner, 2026-10-28: "page 1
   says welcome to the megyprints app test go scroll until you reach the last
   page of the album and select preview then the last page of the album shows
   your done with todays test take a screenshot and send it as proof").
   Page 1 in the pages: "Welcome to the Megy Prints app test!". Done — Preview
   my album opens Preview on the LAST page (not the cover, 40 taps away),
   which says "You're done with today's test!" beside the stamp's time, with
   no order card popping over it. Only a sample album, only in the app.

   Since Today's test (2026-10-29: the pool, and "Also let them spend a
   minute on the app"): "You're done" only once both of today's tasks are
   done AND a minute in the app has passed, with a line that names both. A
   sample album that didn't come from Today's test says how to do it.
   ══════════════════════════════════════════════════════════════════════════ */

const h = vi.hoisted(() => ({ ctx: null as unknown, mobile: true, native: true }));
vi.mock('../../lib/nativeShell', () => ({ isNativeShell: () => h.native }));
vi.mock('./BuilderContext', () => ({ useBuilderContext: () => h.ctx }));
vi.mock('./CoverEditor', () => ({ default: () => null }));
vi.mock('../../hooks/use-mobile', () => ({ useIsMobile: () => h.mobile, useIsPortrait: () => h.mobile }));

import BuilderPreview, { PageView } from './BuilderPreview';
import { ActionEngine } from '../../assistant/actionEngine';
import type { BuilderActions } from './useBuilderState';
import type { AlbumPage } from './types';
import { samplePhotoName, SAMPLE_WELCOME_NOTE, SAMPLE_WELCOME_BACK_NOTE, sampleWelcomeNote, SAMPLE_DONE_NOTE, SAMPLE_NOT_DONE_NOTE, isSampleAlbum, showSampleAlbumNotes } from '../../lib/samplePhotos';
import { attachRun, readRun, RUN_KEY, type DailyTestRun } from '../../lib/dailyTestRun';
import type { DailyTestRequest } from '../../lib/dailyTest';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const GIF = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
const MADE = new Date(2026, 9, 28, 14, 5).getTime();
const photo = (name: string, i: number) => ({ id: `p${i}`, previewUrl: GIF, name, type: 'image/jpeg', size: 1, width: 1200, height: 1200 });
const samples = Array.from({ length: 40 }, (_, i) => photo(samplePhotoName(i + 1), i));
const mixed = [...samples.slice(0, 39), photo('IMG_2001.jpg', 39)];
const album = (n = 40) => Array.from({ length: n }, (_, i) => ({
  id: `page-${i}`, layout: 'single', size: '8x8', templateId: 't88-solo-square', slotFills: [i],
  photos: [], textElements: [], background: { type: 'solid', solid: '#FFFFFF' }, madeAt: MADE,
})) as unknown as AlbumPage[];
const coverFront = {
  id: 'cover-front', layout: 'freeform', size: '8x8', templateId: 'cover-plain', slotFills: [], photos: [], textElements: [],
  background: { type: 'solid', solid: '#1F2A44' },
} as unknown as AlbumPage;

let host: HTMLDivElement;
let root: Root;
let clock = 0;
// Today's test, done on this album (its pages carry MADE): the task in the
// album and the minute, or not yet.
const TEST: DailyTestRequest = { day: 20755, name: 'Oct 28', before: 'titleFont', answer: '"Caveat", cursive', album: 'layout' };
const testRun = (over: Partial<DailyTestRun> = {}, task: DailyTestRun['task'] = 'layout') => {
  attachRun({ ...TEST, album: task! }, MADE, task!, { page: task === 'openBook' ? 1 : 4, slot: null }, []);
  localStorage.setItem(RUN_KEY, JSON.stringify({ ...JSON.parse(localStorage.getItem(RUN_KEY)!), ...over }));
};
const DONE = { albumDone: 'new layout on page 5', fgMs: 60_000 };

beforeEach(() => {
  localStorage.clear();
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
  h.mobile = true; h.native = true;
  clock = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => (clock += 10_000));
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.restoreAllMocks(); });

h.ctx = {
  setBoxText: vi.fn(), updateTextElement: vi.fn(), setQrFill: vi.fn(), coverDesign: undefined, coverFront,
  finishBoxesWithQuotes: vi.fn(async () => ({ filled: 0, remaining: 0, heldBack: 0, noLine: 0 })), getAlbumId: () => 'album-1',
  deletePages: () => 0,
};
function Preview({ photos, start }: { photos: typeof samples; start: number }) {
  const [index, setIndex] = useState(start);
  return createElement(BuilderPreview, {
    pages: album(), currentIndex: index, photos, albumSize: '8x8', onBack: vi.fn(), onOrder: vi.fn(), onGoToPage: setIndex, turnAnimation: false,
  } as never);
}
const q = (id: string) => host.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const all = (id: string) => [...host.querySelectorAll<HTMLElement>(`[data-testid="${id}"]`)];
const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const preview = (photos: typeof samples, start = 39) => act(() => { root.render(createElement(Preview, { photos, start })); });

describe('which albums', () => {
  it('a sample album: every photo is a sample', () => {
    expect(isSampleAlbum(samples)).toBe(true);
    expect(isSampleAlbum(mixed)).toBe(false);
    expect(isSampleAlbum([])).toBe(false);
  });
  it('in the app, while the testing switch is on', () => {
    expect(showSampleAlbumNotes(true, samples)).toBe(true);
    expect(showSampleAlbumNotes(false, samples)).toBe(false);
    expect(showSampleAlbumNotes(true, samples, false)).toBe(false);
    expect(showSampleAlbumNotes(true, mixed)).toBe(false);
  });
  it("in the owner's words, with the buttons named as they read", () => {
    expect(SAMPLE_WELCOME_NOTE).toEqual({
      title: 'Welcome to the Megy Prints app!',
      body: 'Tap **Next page** until you reach the last page, then tap **Done — Preview my album**.',
    });
    // 2026-10-29, the daily lesson: "You finished today's lesson!"; the proof sentence stays.
    expect(SAMPLE_DONE_NOTE).toEqual({ title: "You finished today's lesson!", body: 'Take a screenshot and send it as proof.' });
    // The buttons it names are the real ones.
    const bar = readFileSync(resolve(__dirname, 'PageTurnBar.tsx'), 'utf8');
    expect(bar).toContain('Done — Preview my album');
    expect(bar).toMatch(/Next page/);
  });
});

describe('the card on a page', () => {
  it('a bold first line, then what to do with the buttons in bold; taps go through it; not in the album', async () => {
    await act(async () => { root.render(createElement(PageView, { page: album()[0], photos: samples, singleW: 340, H: 340, pageIndex: 0, testerNote: SAMPLE_WELCOME_NOTE })); });
    const note = q('tester-page-note')!;
    expect(text(q('tester-page-note-title'))).toBe('Welcome to the Megy Prints app!');
    expect(text(q('tester-page-note-body'))).toBe('Tap Next page until you reach the last page, then tap Done — Preview my album.');
    expect([...q('tester-page-note-body')!.querySelectorAll('strong')].map((s) => s.textContent)).toEqual(['Next page', 'Done — Preview my album']);
    expect(note.style.pointerEvents).toBe('none');
    // Low on the page, above the stamp: faces are mostly higher up.
    expect(note.style.bottom).not.toBe('');
    expect(note.style.top).toBe('');
  });

  it('page 1 in the pages (phone and computer) asks for the welcome card, only on page 1', () => {
    const src = (f: string) => readFileSync(resolve(__dirname, f), 'utf8');
    // Not on the album Today's test made: the bar at the top says what to do there (DailyTestBar).
    expect(src('MobileReview.tsx')).toMatch(/<PageView [^>]*testerNote=\{sampleNotes && idx === 0 && !testRun \? sampleWelcomeNote\(actions\.previewSeen\) : null\}/);
    expect(src('BuilderEdit.tsx')).toMatch(/\{sampleNotes && !testRun && actions\.currentPageIndex === 0 && <TesterPageNote note=\{sampleWelcomeNote\(actions\.previewSeen\)\}/);
  });

  // Today's test (2026-10-29) opens the album on "You're done": once it has
  // been previewed, page 1 no longer says to page through to the end.
  it("once previewed, page 1 only says the way back to \"You finished today's lesson!\"", () => {
    expect(sampleWelcomeNote(false)).toBe(SAMPLE_WELCOME_NOTE);
    expect(sampleWelcomeNote(true)).toBe(SAMPLE_WELCOME_BACK_NOTE);
    expect(SAMPLE_WELCOME_BACK_NOTE).toEqual({ title: 'Welcome to the Megy Prints app!', body: "Tap **Back to preview** to see **You finished today's lesson!** again." });
    // The button it names is the real one, on every page but the last once previewed.
    expect(readFileSync(resolve(__dirname, 'PageTurnBar.tsx'), 'utf8')).toContain('Back to preview');
  });
});

for (const mobile of [true, false]) {
  describe(`Preview of a sample album ${mobile ? 'on a phone' : 'on a computer (open book)'}`, () => {
    beforeEach(() => { h.mobile = mobile; });

    it("today's test done (both tasks and the minute): the last page says you're done, names both tasks, beside the stamp's time, and no order card pops over it", () => {
      testRun(DONE);
      preview(samples);
      const notes = all('tester-page-note');
      expect(notes).toHaveLength(1);
      expect(text(notes[0].querySelector('[data-testid="tester-page-note-title"]'))).toBe("You finished today's lesson!");
      expect(text(notes[0].querySelector('[data-testid="tester-page-note-body"]'))).toBe('Take a screenshot and send it as proof.');
      expect(text(notes[0].querySelector('[data-testid="tester-page-note-proof-text"]'))).toBe('Today you tried: title font Caveat · new layout on page 5');
      // The stamp's two lines, on the same page.
      expect(all('tester-page-stamp').map((s) => [...s.children].map((c) => c.textContent))).toContainEqual(['For Testing purposes', 'Oct 28, 2026, 2:05 PM']);
      expect(q('end-prompt')).toBeNull();
      // Order is still there, in the top bar.
      expect(q('preview-order')).not.toBeNull();
    });

    it('no card on the other pages', () => {
      testRun(DONE);
      preview(samples, 10);
      expect(all('tester-page-note')).toHaveLength(0);
    });

    it("not yet: the task in the album not done, or the minute not up: no \"You're done\" (the bar at the top says what's left)", () => {
      for (const over of [{ fgMs: 90_000 }, { albumDone: 'new layout on page 5', fgMs: 59_999 }]) {
        testRun(over);
        preview(samples);
        expect(all('tester-page-note'), JSON.stringify(over)).toHaveLength(0);
        expect(q('end-prompt')).toBeNull();
      }
    });

    it("a sample album that didn't come from Today's lesson: \"Today's lesson isn't done yet\", and how to do it", () => {
      preview(samples);
      const notes = all('tester-page-note');
      expect(notes).toHaveLength(1);
      expect(text(notes[0].querySelector('[data-testid="tester-page-note-title"]'))).toBe("Today's lesson isn't done yet");
      expect(text(notes[0].querySelector('[data-testid="tester-page-note-body"]'))).toBe('Go to Home and tap Start the User tutorial.');
      expect(SAMPLE_NOT_DONE_NOTE.body).toBe('Go to Home and tap **Start the User tutorial**.');
      // Today's test done on ANOTHER album: still this one's not done.
      localStorage.clear();
      attachRun(TEST, MADE + 1, 'layout', { page: 4, slot: null }, []);
      localStorage.setItem(RUN_KEY, JSON.stringify({ ...readRun(), ...DONE }));
      preview(samples);
      expect(text(all('tester-page-note')[0]?.querySelector('[data-testid="tester-page-note-title"]') ?? null)).toBe("Today's lesson isn't done yet");
    });

    it('an album with a photo of their own: no card, and the order card at the end as always', () => {
      preview(mixed);
      expect(all('tester-page-note')).toHaveLength(0);
      expect(q('end-prompt')).not.toBeNull();
    });

    it('on the website: no card, the order card as always', () => {
      h.native = false;
      preview(samples);
      expect(all('tester-page-note')).toHaveLength(0);
      expect(q('end-prompt')).not.toBeNull();
    });
  });
}

describe('Done — Preview my album (preview_album)', () => {
  const engine = (photos: typeof samples) => {
    const goToPage = vi.fn();
    const builder = { uploadedPhotos: photos, albumPages: album(), goToPage, setPhase: vi.fn() } as unknown as BuilderActions;
    return { run: () => new ActionEngine(builder).execute({ type: 'preview_album', rawMessage: 'preview album' } as never), goToPage };
  };

  it('a sample album in the app: opens on its last page', async () => {
    const e = engine(samples);
    await e.run();
    expect(e.goToPage).toHaveBeenCalledWith(39);
  });

  it('any other album, or the website: opens at the start, as always', async () => {
    const e = engine(mixed);
    await e.run();
    expect(e.goToPage).toHaveBeenCalledWith(0);
    h.native = false;
    const w = engine(samples);
    await w.run();
    expect(w.goToPage).toHaveBeenCalledWith(0);
  });
});

/* Today's task in the album may be the open book (Preview's own button). */
describe('the open book as today\'s task (phone, upright)', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('its button glows; seeing the album as an open book for a moment does the task', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    testRun({}, 'openBook');
    preview(samples, 10);
    const toggle = q('preview-open-book')!;
    expect(toggle.dataset.glow).toBe('true');
    expect(toggle.className).toContain('ring-peach');
    await act(async () => { vi.advanceTimersByTime(5000); });
    expect(readRun()!.albumDone).toBeUndefined(); // one page at a time: not yet
    await act(async () => { toggle.click(); });
    await act(async () => { vi.advanceTimersByTime(1000); });
    expect(readRun()!.albumDone).toBeUndefined();
    await act(async () => { vi.advanceTimersByTime(600); });
    expect(readRun()!.albumDone).toBe('open book view');
    expect(q('preview-open-book')!.dataset.glow).toBeUndefined();
  });

  // Found on the walk: Preview's first draw, before it knows it is on an
  // upright phone, showed the open book for an instant and did the task.
  it('the open book for an instant (Preview\'s first draw) doesn\'t count; a tablet that shows it does', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    testRun({}, 'openBook');
    h.mobile = false; // the first draw: not known yet to be a phone → the open book
    preview(samples, 10);
    h.mobile = true; // then upright: one page at a time
    preview(samples, 10);
    await act(async () => { vi.advanceTimersByTime(5000); });
    expect(readRun()!.albumDone).toBeUndefined();
    // A tablet (or a phone turned sideways) that keeps showing the open book.
    h.mobile = false;
    preview(samples, 10);
    await act(async () => { vi.advanceTimersByTime(1600); });
    expect(readRun()!.albumDone).toBe('open book view');
  });

  it('another task, or none: the button as always', () => {
    testRun({}, 'layout');
    preview(samples, 10);
    expect(q('preview-open-book')!.dataset.glow).toBeUndefined();
    expect(q('preview-open-book')!.className).not.toContain('ring-peach');
  });
});
