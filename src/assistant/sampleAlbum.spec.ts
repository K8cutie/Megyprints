// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

/* ══════════════════════════════════════════════════════════════════════════
   "MAKE A SAMPLE ALBUM" ON STEP 1 (owner, 2026-10-28: "Generate a sample
   album feature is added on step 1 using those sample photos"). The real
   Builder + Megy over a stub builder whose photos land the way add_photos
   lands them: one tap names the album (if it has no name), picks the
   occasion (if none), adds 40 sample photos, puts one on the cover, makes the
   album and opens its pages. Android app only.
   ══════════════════════════════════════════════════════════════════════════ */

const h = vi.hoisted(() => ({ ctx: null as unknown, native: true }));
vi.mock('../lib/nativeShell', () => ({ isNativeShell: () => h.native }));
vi.mock('../pages/builder/BuilderContext', () => ({ useBuilderContext: () => h.ctx }));
vi.mock('../pages/builder/BuilderEdit', () => ({ default: () => null }));
vi.mock('../pages/builder/MobileReview', () => ({ default: () => null }));
vi.mock('../pages/builder/CoverEditor', () => ({ default: () => null }));
vi.mock('../pages/builder/LayoutPicker', () => ({ default: () => null }));
vi.mock('../pages/builder/BuilderBackGuard', () => ({ default: () => null }));
vi.mock('../components/SoftAuthGate', () => ({ default: () => null }));
vi.mock('../lib/storeSettings', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()), loadStoreSettings: async () => {},
}));

import Builder from '../pages/Builder';
import { WIZARD_STORAGE_KEY } from './wizard';
import { readAlbumTheme } from '../lib/albumTheme';
import { sampleAlbumPhotos, sampleDayNumber, sampleCoverPhoto, SAMPLE_END_OF_DAY_NAMES } from '../lib/samplePhotos';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const GIF = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';

type Photo = { id: string; previewUrl: string; name: string; type: string; size: number; width: number; height: number };
function stepOne(title: string, photos: Photo[] = []) {
  const albumPages = Array.from({ length: 40 }, (_, i) => ({
    id: `page-${i}`, layout: 'single', templateId: 't88-solo', slotFills: [] as number[], photos: [], textElements: [],
    background: { type: 'solid', solid: '#FFFFFF' },
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
    dispatch: vi.fn(async (intent: { type: string; payload?: { files?: File[] } }) => {
      if (intent.type === 'add_photos') {
        const files = intent.payload?.files ?? [];
        ctx.uploadedPhotos = [...ctx.uploadedPhotos, ...files.map((f, i) => ({ id: `s${i}`, previewUrl: GIF, name: f.name, type: f.type, size: f.size, width: 1600, height: 1200 }))];
        return { intentType: intent.type, success: true, message: `${files.length} photos added` };
      }
      if (intent.type === 'generate_album') {
        ctx.albumPages = ctx.albumPages.map((p, i) => ({ ...p, slotFills: [i] }));
        return { intentType: intent.type, success: true, message: 'Album generated!' };
      }
      return { intentType: intent.type, success: true, message: '' };
    }),
    setCoverToPhoto: vi.fn(),
    putPhotoOnLastPage: vi.fn(),
    resizeAsk: null, setResizeAsk: vi.fn(),
    setPhase: vi.fn((p: string) => { ctx.phase = p; }), setWizardStep: vi.fn((w: string) => { ctx.wizardStep = w; }),
    setAlbumTitle: vi.fn((t: string) => { ctx.albumTitle = t; }), goToPage: vi.fn(),
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
async function open(title = '', photos: Photo[] = [], occasion = '') {
  vi.spyOn(performance, 'now').mockImplementation(() => Date.now());
  localStorage.clear(); sessionStorage.clear();
  if (occasion) localStorage.setItem('megy-album-theme', occasion);
  Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true, writable: true });
  Object.defineProperty(window, 'innerHeight', { value: 844, configurable: true, writable: true });
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia;
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
  localStorage.setItem(WIZARD_STORAGE_KEY, JSON.stringify({ step: 'pick_theme', completed: ['welcome'], skipped: [], isFirstTime: false, dismissed: false }));
  ctx = stepOne(title, photos);
  h.ctx = ctx;
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
  await render();
}
const offer = () => document.querySelector('[data-testid="sample-album"]');
const make = () => document.querySelector('[data-testid="sample-album-make"]') as HTMLButtonElement | null;
const calls = (type: string) => (ctx.dispatch.mock.calls as unknown as Array<[{ type: string; payload?: { files?: File[] } }]>).filter(([i]) => i.type === type);
async function tapMake() {
  await act(async () => { make()!.click(); });
  // The photos land in a later render; the album is made after them.
  for (let i = 0; i < 6; i++) await render();
}

beforeEach(() => {
  h.native = true;
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
});

describe('Step 1 in the Android app: "Make a sample album"', () => {
  it('is offered on Step 1, says what it does, and Next stays the way to use your own photos', async () => {
    await open();
    expect(document.querySelector('[data-step="pick_theme"]')).not.toBeNull();
    expect(offer()?.textContent).toContain('Just testing the app? Megy makes a whole album from 40 sample photos. You can still make one from your own photos after.');
    expect(make()?.textContent).toBe('Make a sample album');
  });

  it("one tap: named \"Sample Album\", occasion Family, today's 40 samples in, a sample on the cover, the album made, today's end-of-day photo on its last page, its pages open", async () => {
    await open();
    await tapMake();
    expect(ctx.setAlbumTitle).toHaveBeenCalledWith('Sample Album');
    expect(readAlbumTheme()).toBe('Family');
    const added = calls('add_photos');
    expect(added).toHaveLength(1);
    const files = added[0][0].payload!.files!;
    expect(files).toHaveLength(40);
    expect(new Set(files.map((f) => f.name)).size).toBe(40);
    expect(files.every((f) => /^megy-sample-\d{2}\.jpg$/.test(f.name))).toBe(true);
    // Today's sample album: a different 40 each day.
    expect(files.map((f) => f.name)).toEqual(sampleAlbumPhotos(sampleDayNumber(new Date())));
    expect(fetched).toHaveLength(40);
    // A sample on the cover (the family in the garden when today has it), then the album is made.
    expect(ctx.setCoverToPhoto).toHaveBeenCalledWith(sampleCoverPhoto(ctx.uploadedPhotos)!.id, { titleColor: '#FFFFFF' });
    // Today's end-of-day photo onto the last page, once the album is made.
    const endOfDay = ctx.uploadedPhotos.find((p) => SAMPLE_END_OF_DAY_NAMES.includes(p.name))!;
    expect(ctx.putPhotoOnLastPage).toHaveBeenCalledWith(endOfDay.id);
    expect(ctx.putPhotoOnLastPage.mock.invocationCallOrder[0]).toBeGreaterThan(ctx.dispatch.mock.invocationCallOrder[ctx.dispatch.mock.calls.findIndex(([i]) => (i as { type: string }).type === 'generate_album')]);
    expect(calls('generate_album')).toHaveLength(1);
    expect(ctx.setCoverToPhoto.mock.invocationCallOrder[0]).toBeLessThan(ctx.dispatch.mock.invocationCallOrder[ctx.dispatch.mock.calls.findIndex(([i]) => (i as { type: string }).type === 'generate_album')]);
    expect(ctx.wizardStep).toBe('review_pages');
    expect(ctx.phase).toBe('edit');
  });

  it('keeps the name and occasion the tester already gave', async () => {
    await open("Lola's 80th", [], 'Birthday');
    await tapMake();
    expect(ctx.setAlbumTitle).not.toHaveBeenCalledWith('Sample Album');
    expect(ctx.albumTitle).toBe("Lola's 80th");
    expect(readAlbumTheme()).toBe('Birthday');
    expect(calls('generate_album')).toHaveLength(1);
  });

  it('no internet: says so, adds nothing, makes nothing, and the button works again', async () => {
    await open();
    fetchFails = true;
    await tapMake();
    expect(calls('add_photos')).toHaveLength(0);
    expect(calls('generate_album')).toHaveLength(0);
    expect(document.querySelector('[data-testid="sample-album-failed"]')?.textContent)
      .toBe("Couldn't make the sample album. Check your internet, then tap again.");
    expect(make()?.textContent).toBe('Make a sample album');
    fetchFails = false;
    await tapMake();
    expect(calls('generate_album')).toHaveLength(1);
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
