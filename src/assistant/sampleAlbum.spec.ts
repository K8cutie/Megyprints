// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

/* ══════════════════════════════════════════════════════════════════════════
   THE SAMPLE ALBUM, IN THE BUILDER (owner, 2026-10-28: "Generate a sample
   album feature is added on step 1 using those sample photos"; 2026-10-29:
   Step 1 still skipped the daily test, and "Do 10 test pool that shows
   different feature"). The real Builder + Megy over a stub builder whose
   photos land the way add_photos lands them.

   Step 1's "Make a sample album" opens Today's test first, the same screen
   as Home's button: no way to a sample album skips it. The album is made
   with the typed name and today's answer, set where the steps before "Make
   my album" set it, then today's task in the album starts on its page.
   Android app only. The builder never reloads for a new version (only Home
   does).
   ══════════════════════════════════════════════════════════════════════════ */

const h = vi.hoisted(() => ({ ctx: null as unknown, native: true, update: null as unknown as (n: unknown) => Promise<string>, vis: 'visible' as DocumentVisibilityState }));
vi.mock('../lib/nativeShell', () => ({ isNativeShell: () => h.native }));
vi.mock('../pages/builder/BuilderContext', () => ({ useBuilderContext: () => h.ctx }));
vi.mock('../pages/builder/BuilderEdit', () => ({ default: () => null }));
vi.mock('../pages/builder/MobileReview', () => ({ default: () => null }));
vi.mock('../pages/builder/BuilderPreview', () => ({ default: () => null }));
vi.mock('../pages/builder/CoverEditor', () => ({ default: () => null }));
vi.mock('../pages/builder/LayoutPicker', () => ({ default: () => null }));
vi.mock('../pages/builder/BuilderBackGuard', () => ({ default: () => null }));
vi.mock('../components/SoftAuthGate', () => ({ default: () => null }));
vi.mock('../lib/storeSettings', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()), loadStoreSettings: async () => {},
}));
vi.mock('../lib/appVersion', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()), ensureLatestApp: (note: unknown) => h.update(note),
}));

import Builder from '../pages/Builder';
import { WIZARD_STORAGE_KEY } from './wizard';
import { readAlbumTheme } from '../lib/albumTheme';
import { sampleAlbumPhotos, sampleDayNumber, sampleCoverPhoto, sampleAlbumName, requestSampleAlbum, SAMPLE_END_OF_DAY_NAMES } from '../lib/samplePhotos';
import { requestDailyTest, beforeTaskFor, todaysBeforeTask, todaysAlbumTask, dateExample, coverTitleFrom, BEFORE_TASKS, type BeforeTaskId, type AlbumTaskId, ALBUM_TASKS } from '../lib/dailyTest';
import { readRun } from '../lib/dailyTestRun';
import { ActionEngine } from './actionEngine';
import type { BuilderActions } from '../pages/builder/useBuilderState';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => h.vis });
const GIF = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
const MADE = new Date(2026, 9, 29, 15, 22).getTime();

type Photo = { id: string; previewUrl: string; name: string; type: string; size: number; width: number; height: number };
function stepOne(title: string, photos: Photo[] = []) {
  const albumPages = Array.from({ length: 40 }, (_, i) => ({
    id: `page-${i}`, layout: 'single', templateId: 't88-solo', slotFills: [] as number[], photos: [], textElements: [],
    background: { type: 'solid', solid: '#FFFFFF' }, madeAt: undefined as number | undefined,
  }));
  const ctx = {
    phase: 'setup', wizardStep: 'pick_theme', albumTitle: title, albumSize: '8x8',
    selectedTemplate: 'classic', photosPerPage: undefined, uploadedPhotos: photos, albumPages,
    currentPageIndex: 0, currentPage: albumPages[0], selectedTextId: null, selectedPhotoId: null,
    user: null, coverDesign: undefined, coverFront: undefined,
    photoCheck: { ready: true, progress: { done: 0, total: 0 }, suggestion: { blurry: [], repeats: [], keeperOf: {} } },
    getAlbumId: () => 'album-1', getCloudConflict: () => null,
    manualSave: vi.fn(async () => true),
    // Photos land the way add_photos lands them; the album is made from them.
    dispatch: vi.fn(async (intent: { type: string; payload?: { files?: File[]; size?: string } }) => {
      if (intent.type === 'add_photos') {
        const files = intent.payload?.files ?? [];
        ctx.uploadedPhotos = [...ctx.uploadedPhotos, ...files.map((f, i) => ({ id: `s${i}`, previewUrl: GIF, name: f.name, type: f.type, size: f.size, width: 1600, height: 1200 }))];
        return { intentType: intent.type, success: true, message: `${files.length} photos added` };
      }
      if (intent.type === 'change_size') { ctx.albumSize = intent.payload!.size!; return { intentType: intent.type, success: true, message: '' }; }
      if (intent.type === 'generate_album') {
        ctx.albumPages = ctx.albumPages.map((p, i) => ({ ...p, slotFills: [i], madeAt: MADE }));
        return { intentType: intent.type, success: true, message: 'Album generated!' };
      }
      // "Done — Preview my album" as the real engine runs it.
      if (intent.type === 'preview_album') return new ActionEngine(ctx as unknown as BuilderActions).execute(intent as never);
      return { intentType: intent.type, success: true, message: '' };
    }),
    setCoverToPhoto: vi.fn(),
    putPhotoOnLastPage: vi.fn(),
    applyPageColorToAllPages: vi.fn(),
    resizeAsk: null, setResizeAsk: vi.fn(),
    setPhase: vi.fn((p: string) => { ctx.phase = p; }), setWizardStep: vi.fn((w: string) => { ctx.wizardStep = w; }),
    setAlbumTitle: vi.fn((t: string) => { ctx.albumTitle = t; }), goToPage: vi.fn((i: number) => { ctx.currentPageIndex = i; }),
    getPageSnapshot: () => undefined, saveDraftNow: vi.fn(), reset: vi.fn(), loadAlbum: vi.fn(),
    setBoxText: vi.fn(), updateTextElement: vi.fn(), setQrFill: vi.fn(),
    finishBoxesWithQuotes: vi.fn(async () => ({ filled: 0, remaining: 0 })), setLayoutPickerOpen: vi.fn(),
  };
  return ctx;
}

let host: HTMLDivElement;
let root: Root;
let ctx: ReturnType<typeof stepOne>;
let fetched: string[];
let fetchFails: boolean;
const render = async () => {
  await act(async () => {
    root.render(createElement(MemoryRouter, { initialEntries: ['/builder'] },
      createElement(Routes, null, createElement(Route, { path: '/builder', element: createElement(Builder) }))));
  });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
};
async function open(title = '', photos: Photo[] = [], occasion = '', wizard: { step: string; completed: string[] } = { step: 'pick_theme', completed: ['welcome'] }, request = false, before?: () => void) {
  vi.spyOn(performance, 'now').mockImplementation(() => Date.now());
  localStorage.clear(); sessionStorage.clear();
  if (request) requestSampleAlbum();
  before?.();
  if (occasion) localStorage.setItem('megy-album-theme', occasion);
  Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true, writable: true });
  Object.defineProperty(window, 'innerHeight', { value: 844, configurable: true, writable: true });
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia;
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
  localStorage.setItem(WIZARD_STORAGE_KEY, JSON.stringify({ ...wizard, skipped: [], isFirstTime: false, dismissed: false }));
  ctx = stepOne(title, photos);
  h.ctx = ctx;
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
  await render();
}
const $ = (id: string) => document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
const $$ = (id: string) => [...document.querySelectorAll<HTMLElement>(`[data-testid="${id}"]`)];
const offer = () => $('sample-album');
const make = () => $('sample-album-make') as HTMLButtonElement | null;
const calls = (type: string) => (ctx.dispatch.mock.calls as unknown as Array<[{ type: string; payload?: { files?: File[]; size?: string; stay?: boolean } }]>).filter(([i]) => i.type === type);
const order = (fn: { mock: { invocationCallOrder: number[] } }) => fn.mock.invocationCallOrder[0];
const dispatchOrder = (type: string) => ctx.dispatch.mock.invocationCallOrder[(ctx.dispatch.mock.calls as unknown as Array<[{ type: string }]>).findIndex(([i]) => i.type === type)];
const settle = async (n = 8) => { for (let i = 0; i < n; i++) await render(); };
/** Today's test is its own chunk: wait for it to load. */
const testOpened = async () => {
  for (let i = 0; i < 30 && !$('todays-test'); i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  return $('todays-test');
};
/** Do Today's test on its screen: today's date, today's answer, "Make my album". */
async function doTodaysTest() {
  const input = $('todays-test-name') as HTMLInputElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, dateExample(new Date()));
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const t = beforeTaskFor(new Date());
  const option = $$('todays-test-option').find((b) => t.answer == null || b.dataset.value === t.answer)!;
  await act(async () => { option.click(); });
  await act(async () => { $('todays-test-make')!.click(); });
}
const at = (day: Date) => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(day); };
const dayFor = (task: BeforeTaskId) => {
  for (let i = 0; i < 10; i++) { const d = new Date(2026, 9, 29 + i, 15, 20); if (todaysBeforeTask(d) === task) return d; }
  throw new Error(task);
};
const albumDayFor = (task: AlbumTaskId) => {
  for (let i = 0; i < 5; i++) { const d = new Date(2026, 9, 29 + i, 15, 20); if (todaysAlbumTask(d) === task) return d; }
  throw new Error(task);
};

beforeEach(() => {
  h.native = true; h.vis = 'visible';
  h.update = vi.fn(async () => 'latest');
  fetched = [];
  fetchFails = false;
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    fetched.push(url);
    if (fetchFails) throw new TypeError('Failed to fetch');
    return new Response(new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])]), { status: 200 });
  }));
});
afterEach(async () => {
  await act(async () => { root.unmount(); });
  host.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('Step 1 in the Android app: "Start the User tutorial" (was "Make a sample album")', () => {
  it('is offered on Step 1, says what it does, and Next stays the way to use your own photos', async () => {
    await open();
    expect(document.querySelector('[data-step="pick_theme"]')).not.toBeNull();
    // The owner, 2026-10-29: "Can we call it User tutorial instead of sample album".
    expect(offer()?.textContent).toContain('Just testing the app? The User tutorial makes a whole album from 40 sample photos and teaches you the app. You can still make one from your own photos after.');
    expect(make()?.textContent).toBe('Start the User tutorial');
    expect(offer()!.textContent!.toLowerCase()).not.toContain('sample album');
  });

  // Owner, 2026-10-28, of it under the name and occasions: "couldn't be more NOT OBVIOUS".
  it('is the first thing on the card: above the step title and the name box, its button filled, then "or make your own album"', async () => {
    await open();
    const box = offer()!;
    const card = box.closest('.shadow-xl')!;
    const name = card.querySelector('[data-testid="album-name"]')!;
    const title = card.querySelector('h3')!;
    const before = (a: Element, b: Element) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    expect(before(box, title)).toBe(true);
    expect(before(box, name)).toBe(true);
    expect(make()!.className).toContain('bg-peach');
    const or = $('sample-album-or')!;
    expect(or.textContent?.trim()).toBe('or make your own album');
    expect(before(box, or) && before(or, title)).toBe(true);
  });

  // Owner, 2026-10-29: Step 1 still skipped the test.
  it("opens Today's test first, the same screen as Home's button: nothing is fetched or made yet", async () => {
    await open();
    await act(async () => { make()!.click(); });
    expect(await testOpened()).not.toBeNull();
    expect($('todays-test-name')).not.toBeNull();
    expect($('todays-test-task')).not.toBeNull();
    expect(fetched).toHaveLength(0);
    expect(calls('add_photos')).toHaveLength(0);
    expect(calls('generate_album')).toHaveLength(0);
    expect(ctx.setAlbumTitle).not.toHaveBeenCalled();
    // ✕ closes it; nothing made.
    await act(async () => { $('todays-test-close')!.click(); });
    expect($('todays-test')).toBeNull();
    expect(calls('generate_album')).toHaveLength(0);
  });

  it('Today\'s test done: the album is made with the typed name and today\'s answer, today\'s 40, the end-of-day photo last, and today\'s task in the album starts on its page', async () => {
    const day = dayFor('titleFont');
    at(day);
    await open();
    await act(async () => { make()!.click(); });
    await testOpened();
    await doTodaysTest();
    expect($('todays-test')).toBeNull();
    await settle();
    expect(ctx.setAlbumTitle).toHaveBeenCalledWith(dateExample(day));
    expect(ctx.setAlbumTitle).not.toHaveBeenCalledWith(sampleAlbumName(day));
    expect(calls('add_photos')[0][0].payload!.files!.map((f) => f.name)).toEqual(sampleAlbumPhotos(sampleDayNumber(day)));
    const t = beforeTaskFor(day);
    expect(ctx.setCoverToPhoto).toHaveBeenCalledWith(sampleCoverPhoto(ctx.uploadedPhotos)!.id, { titleColor: '#FFFFFF', title: { fontFamily: t.answer } });
    expect(calls('generate_album')).toHaveLength(1);
    const endOfDay = ctx.uploadedPhotos.find((p) => SAMPLE_END_OF_DAY_NAMES.includes(p.name))!;
    expect(ctx.putPhotoOnLastPage).toHaveBeenCalledWith(endOfDay.id);
    // The task in the album, kept with this album; its page opens (the pages, not Preview).
    const run = readRun()!;
    expect(run.madeAt).toBe(MADE);
    expect(run.test).toMatchObject({ name: dateExample(day), before: 'titleFont', answer: t.answer });
    expect(ctx.goToPage).toHaveBeenLastCalledWith(run.target!.page);
    expect(ctx.phase).toBe('edit');
    expect(calls('preview_album')).toHaveLength(0);
  });

  it('no internet: says so, makes nothing; a tap makes it again with the same test (no second Today\'s test)', async () => {
    const day = dayFor('occasion');
    at(day);
    await open();
    fetchFails = true;
    await act(async () => { make()!.click(); });
    await testOpened();
    await doTodaysTest();
    await settle(4);
    expect(calls('add_photos')).toHaveLength(0);
    expect(calls('generate_album')).toHaveLength(0);
    expect($('sample-album-failed')?.textContent).toBe("Couldn't start the User tutorial. Check your internet, then tap again.");
    fetchFails = false;
    await act(async () => { make()!.click(); });
    await settle();
    expect($('todays-test')).toBeNull();
    expect(calls('generate_album')).toHaveLength(1);
    expect(readAlbumTheme()).toBe(beforeTaskFor(day).answer);
    expect(readRun()!.test!.before).toBe('occasion');
  });
});

describe('where "Make a sample album" does not show', () => {
  it('on the website', async () => {
    h.native = false;
    await open();
    expect(document.querySelector('[data-step="pick_theme"]')).not.toBeNull();
    expect(offer()).toBeNull();
  });

  it('once the album has photos of its own (back on Step 1 later)', async () => {
    await open('Our trip', [{ id: 'p0', previewUrl: GIF, name: 'IMG_1.jpg', type: 'image/jpeg', size: 1, width: 1600, height: 1200 }], 'Vacation');
    expect(document.querySelector('[data-step="pick_theme"]')).not.toBeNull();
    expect(offer()).toBeNull();
  });
});

/* "Welcome back" the next day → "Make today's sample album" (ResumePrompt,
   off in the app while testing since #228): a new album opens with the
   request, and the builder makes it at once. */
describe("Welcome back's \"Make today's sample album\"", () => {
  it("a new album opens and is made at once: named for today, today's 40, the end-of-day photo last, its pages open", async () => {
    await open('', [], '', { step: 'welcome', completed: [] }, true);
    await settle(6);
    expect(ctx.setAlbumTitle).toHaveBeenCalledWith(sampleAlbumName(new Date()));
    expect(calls('add_photos')).toHaveLength(1);
    expect(calls('generate_album')).toHaveLength(1);
    expect(ctx.putPhotoOnLastPage).toHaveBeenCalledTimes(1);
    expect(ctx.wizardStep).toBe('review_pages');
    expect(sessionStorage.getItem('megy-make-sample-album')).toBeNull();
    // No test: no task in the album.
    expect(readRun()).toBeNull();
  });

  it('without the request, a new album waits on its first step as always', async () => {
    await open('', [], '', { step: 'welcome', completed: [] });
    expect(calls('add_photos')).toHaveLength(0);
    expect(calls('generate_album')).toHaveLength(0);
  });

  it('the request never touches an album that has photos: nothing added, nothing made', async () => {
    await open('Our trip', [{ id: 'p0', previewUrl: GIF, name: 'IMG_1.jpg', type: 'image/jpeg', size: 1, width: 1600, height: 1200 }], 'Vacation', undefined, true);
    await settle(4);
    expect(calls('add_photos')).toHaveLength(0);
    expect(calls('generate_album')).toHaveLength(0);
    expect(ctx.setAlbumTitle).not.toHaveBeenCalled();
  });
});

/* Home's TODAY'S TEST → the sample album: each of the 10 answers set where
   the steps before "Make my album" set it. */
describe("Today's test → the sample album, made with today's answer", () => {
  const madeWith = async (day: Date, answer?: string) => {
    at(day);
    const t = beforeTaskFor(day);
    await open('', [], '', { step: 'welcome', completed: [] }, true, () => {
      expect(requestDailyTest({ name: dateExample(day), answer: answer ?? t.answer ?? t.options[5].value }, day)).toBe(true);
    });
    await settle();
    return t;
  };

  it('the pool has 10 before-tasks, all checked below', () => {
    expect(BEFORE_TASKS).toEqual(['cover', 'titleFont', 'colour', 'titleAlign', 'size', 'titleColour', 'occasion', 'titleStyle', 'titleSize', 'titleShadow']);
  });

  it('the cover: the photo they chose, the title white over it', async () => {
    const day = dayFor('cover');
    const choice = beforeTaskFor(day).options[5].value;
    await madeWith(day, choice);
    const chosen = ctx.uploadedPhotos.find((p) => p.name === choice)!;
    expect(ctx.setCoverToPhoto).toHaveBeenCalledWith(chosen.id, { titleColor: '#FFFFFF', title: {} });
    expect(ctx.setCoverToPhoto).toHaveBeenCalledTimes(1);
    expect(ctx.applyPageColorToAllPages).not.toHaveBeenCalled();
  });

  it("the colour: today's colour on every page once the pages are made; the cover keeps its photo", async () => {
    const t = await madeWith(dayFor('colour'));
    expect(ctx.applyPageColorToAllPages).toHaveBeenCalledWith(t.answer);
    expect(order(ctx.applyPageColorToAllPages)).toBeGreaterThan(dispatchOrder('generate_album'));
    expect(ctx.setCoverToPhoto).toHaveBeenCalledTimes(2);
    expect(ctx.setCoverToPhoto.mock.invocationCallOrder[1]).toBeGreaterThan(order(ctx.applyPageColorToAllPages));
  });

  for (const task of ['titleFont', 'titleAlign', 'titleColour', 'titleStyle', 'titleSize', 'titleShadow'] as const) {
    it(`the cover title (${task}): set on the cover as the cover step sets it`, async () => {
      const t = await madeWith(dayFor(task));
      const look = coverTitleFrom({ before: task, answer: t.answer! });
      expect(ctx.setCoverToPhoto).toHaveBeenCalledWith(sampleCoverPhoto(ctx.uploadedPhotos)!.id, { titleColor: look.color, title: look.style });
      expect(order(ctx.setCoverToPhoto)).toBeLessThan(dispatchOrder('generate_album'));
    });
  }

  it("the occasion: Step 1's occasion", async () => {
    const t = await madeWith(dayFor('occasion'));
    expect(readAlbumTheme()).toBe(t.answer);
  });

  it('the size: set first, before the photos come in (Step 2 comes before them)', async () => {
    const t = await madeWith(dayFor('size'));
    expect(calls('change_size').map(([i]) => i.payload!.size)).toEqual([t.answer]);
    expect(dispatchOrder('change_size')).toBeLessThan(dispatchOrder('add_photos'));
    expect(ctx.albumSize).toBe(t.answer);
  });

  it('then today\'s task in the album: its page opens, in the pages (the open book: in Preview, past the cover)', async () => {
    for (const task of ALBUM_TASKS) {
      if (task === 'caption') continue; // this stub's pages have no box to type in (its layout instead: dailyAlbumTask.spec)
      await act(async () => { root?.unmount(); });
      host?.remove();
      vi.restoreAllMocks();
      await madeWith(albumDayFor(task));
      const run = readRun()!;
      expect(run.task, task).toBe(task);
      expect(ctx.goToPage).toHaveBeenLastCalledWith(run.target!.page);
      if (task === 'openBook') {
        expect(run.target!.page).toBe(1);
        expect(calls('preview_album').map(([i]) => i.payload)).toEqual([{ stay: true }]);
        expect(ctx.phase).toBe('preview');
        expect(ctx.currentPageIndex).toBe(1);
      } else {
        expect(calls('preview_album')).toHaveLength(0);
        expect(ctx.phase).toBe('edit');
      }
    }
  });
});

describe('the builder never reloads for a new version (only Home does)', () => {
  it('back to the front in the builder: no check, nothing reloads', async () => {
    await open();
    h.vis = 'hidden';
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    h.vis = 'visible';
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(h.update).not.toHaveBeenCalled();
  });
});
