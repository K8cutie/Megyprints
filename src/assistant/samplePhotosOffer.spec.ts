// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

/* ══════════════════════════════════════════════════════════════════════════
   SAMPLE PHOTOS ON THE PHOTO STEP (owner, 2026-10-28: "some testers arent a
   picture bunch so they have less than 40 pics and is incapable"). The real
   Builder + Megy over a stub builder, on Step 3 with too few photos: in the
   Android app the card offers "Add 25 sample photos" under its own button,
   and the tap adds the samples the way picked photos are added.
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
import { ALBUM_THEME_KEY } from '../lib/albumTheme';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const GIF = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';

function photoStep(names: string[]) {
  const uploadedPhotos = names.map((name, i) => ({ id: `p${i}`, previewUrl: GIF, name, type: 'image/jpeg', size: 1000 + i, width: 1600, height: 1200 }));
  const albumPages = Array.from({ length: 40 }, (_, i) => ({
    id: `page-${i}`, layout: 'single', templateId: 't88-solo', slotFills: [], photos: [], textElements: [],
    background: { type: 'solid', solid: '#FFFFFF' },
  }));
  const ctx = {
    phase: 'edit', wizardStep: 'upload_photos', albumTitle: 'Cruz Family', albumSize: '8x8',
    selectedTemplate: 'classic', photosPerPage: undefined, uploadedPhotos, albumPages,
    currentPageIndex: 0, currentPage: albumPages[0], selectedTextId: null, selectedPhotoId: null,
    user: null, coverDesign: undefined, coverFront: undefined,
    photoCheck: { ready: true, progress: { done: names.length, total: names.length }, suggestion: { blurry: [], repeats: [], keeperOf: {} } },
    getAlbumId: () => 'album-1', getCloudConflict: () => null,
    manualSave: vi.fn(async () => true),
    dispatch: vi.fn(async (intent: { type: string; payload?: { files?: File[] } }) => ({
      intentType: intent.type, success: true,
      message: intent.type === 'add_photos' ? `${intent.payload?.files?.length} photos added` : '',
    })),
    resizeAsk: null, setResizeAsk: vi.fn(),
    setPhase: vi.fn((p: string) => { ctx.phase = p; }), setWizardStep: vi.fn((w: string) => { ctx.wizardStep = w; }),
    setAlbumTitle: vi.fn(), goToPage: vi.fn(),
    getPageSnapshot: () => undefined, saveDraftNow: vi.fn(), reset: vi.fn(), loadAlbum: vi.fn(),
    setBoxText: vi.fn(), updateTextElement: vi.fn(), setQrFill: vi.fn(),
    finishBoxesWithQuotes: vi.fn(async () => ({ filled: 0, remaining: 0 })), setLayoutPickerOpen: vi.fn(),
  };
  return ctx;
}

let host: HTMLDivElement;
let root: Root;
let ctx: ReturnType<typeof photoStep>;
let fetched: string[];
let fetchFails: boolean;
const render = async () => {
  await act(async () => {
    root.render(createElement(MemoryRouter, { initialEntries: ['/builder'] },
      createElement(Routes, null, createElement(Route, { path: '/builder', element: createElement(Builder) }))));
  });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
};
async function open(names: string[]) {
  vi.spyOn(performance, 'now').mockImplementation(() => Date.now());
  localStorage.clear(); sessionStorage.clear();
  localStorage.setItem(ALBUM_THEME_KEY, 'Family');
  Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true, writable: true });
  Object.defineProperty(window, 'innerHeight', { value: 844, configurable: true, writable: true });
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia;
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
  localStorage.setItem(WIZARD_STORAGE_KEY, JSON.stringify({
    step: 'upload_photos', completed: ['welcome', 'pick_theme', 'pick_size'], skipped: [], isFirstTime: false, dismissed: false,
  }));
  ctx = photoStep(names);
  h.ctx = ctx;
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
  await render();
}
const own = (n: number) => Array.from({ length: n }, (_, i) => `IMG_${1000 + i}.jpg`);
const offer = () => document.querySelector('[data-testid="sample-photos"]');
const offerButton = () => document.querySelector('[data-testid="sample-photos-add"]') as HTMLButtonElement | null;
const button = (label: string) => [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === label) ?? null;
const addCalls = () => (ctx.dispatch.mock.calls as unknown as Array<[{ type: string; payload?: { files?: File[] } }]>)
  .filter(([i]) => i.type === 'add_photos');
async function tapOffer() {
  await act(async () => { offerButton()!.click(); });
  for (let i = 0; i < 5; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
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

describe('the photo step in the Android app, short of 40 photos', () => {
  it('offers the samples under the card\'s own button, which stays "Add 25 more photos"', async () => {
    await open(own(15));
    expect(offer()?.textContent).toContain('Testing the app with fewer than 40 photos? Fill the album with our sample photos.');
    expect(offerButton()?.textContent).toBe('Add 25 sample photos');
    // Their own photos come first: the filled button is still the picker.
    expect(button('Add 25 more photos')).not.toBeNull();
    // Below the card's buttons, after the pick-many hint.
    const kids = [...offer()!.parentElement!.children];
    expect(kids.indexOf(offer()!)).toBe(kids.indexOf(document.querySelector('[data-testid="pick-many-hint"]')!) + 1);
  });

  it('one tap adds 25 samples the way picked photos are added, and Megy says so', async () => {
    await open(own(15));
    await tapOffer();
    expect(addCalls()).toHaveLength(1);
    const files = addCalls()[0][0].payload!.files!;
    expect(files).toHaveLength(25);
    expect(new Set(files.map((f) => f.name)).size).toBe(25);
    for (const f of files) {
      expect(f.name).toMatch(/^megy-sample-\d{2}\.jpg$/);
      expect(f.type).toBe('image/jpeg');
    }
    expect(fetched).toHaveLength(25);
    expect(fetched.every((u) => /^\/sample-photos\/megy-sample-\d{2}\.jpg$/.test(u))).toBe(true);
    expect(document.querySelector('[data-testid="megy-toast"]')?.textContent).toBe('25 photos added');
  });

  it('with no photos at all: "Add 40 sample photos" makes a whole album', async () => {
    await open([]);
    expect(offerButton()?.textContent).toBe('Add 40 sample photos');
  });

  it('never adds a sample that is already in the album', async () => {
    await open([...own(10), 'megy-sample-01.jpg', 'megy-sample-02.jpg', 'megy-sample-03.jpg', 'megy-sample-04.jpg', 'megy-sample-05.jpg']);
    expect(offerButton()?.textContent).toBe('Add 25 sample photos');
    await tapOffer();
    const names = addCalls()[0][0].payload!.files!.map((f) => f.name);
    expect(names).toHaveLength(25);
    for (const n of ['megy-sample-01.jpg', 'megy-sample-02.jpg', 'megy-sample-03.jpg', 'megy-sample-04.jpg', 'megy-sample-05.jpg']) expect(names).not.toContain(n);
  });

  it('no internet: says so, adds nothing, and the button works again', async () => {
    await open(own(15));
    fetchFails = true;
    await tapOffer();
    expect(addCalls()).toHaveLength(0);
    expect(document.querySelector('[data-testid="sample-photos-failed"]')?.textContent)
      .toBe("Couldn't get the sample photos. Check your internet, then tap again.");
    expect(offerButton()?.textContent).toBe('Add 25 sample photos');
    fetchFails = false;
    await tapOffer();
    expect(addCalls()).toHaveLength(1);
    expect(document.querySelector('[data-testid="sample-photos-failed"]')).toBeNull();
  });
});

describe('where the offer does not show', () => {
  it('with 40 photos going in: the album can be made, no samples offered', async () => {
    await open(own(40));
    expect(offer()).toBeNull();
  });

  it('on the website (a phone browser): never, testers use the app', async () => {
    h.native = false;
    await open(own(15));
    expect(offer()).toBeNull();
    expect(button('Add 25 more photos')).not.toBeNull();
  });
});
