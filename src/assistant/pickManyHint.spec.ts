// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

/* ══════════════════════════════════════════════════════════════════════════
   HOW TO PICK MANY PHOTOS IN THE ANDROID APP (tester, 2026-10-27: "I can't
   send more than 1 photo"). The app's Files picker takes one photo per tap;
   many takes a press and hold, or ⋮ → Select all. Megy's photo step says so
   right under its buttons, in the app only (a phone browser's photo picker
   picks many with taps). The real Builder + MegyAssistant over a stub
   builder, walked back from Review to the photo step the customer's way.
   ══════════════════════════════════════════════════════════════════════════ */

const h = vi.hoisted(() => ({ ctx: null as unknown, native: true }));
vi.mock('../lib/nativeAuth', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()), isNativeShell: () => h.native,
}));
vi.mock('../pages/builder/BuilderContext', () => ({ useBuilderContext: () => h.ctx }));
vi.mock('../pages/builder/BuilderEdit', () => ({ default: () => null }));
vi.mock('../pages/builder/MobileReview', () => ({ default: () => null }));
// The cover step, as far as this walk needs it: its ← Back.
vi.mock('../pages/builder/CoverEditor', async () => {
  const { createElement: el } = await import('react');
  return { default: ({ onBack }: { onBack?: () => void }) => el('button', { onClick: onBack }, '← Back') };
});
vi.mock('../pages/builder/LayoutPicker', () => ({ default: () => null }));
vi.mock('../pages/builder/BuilderBackGuard', () => ({ default: () => null }));
vi.mock('../components/SoftAuthGate', () => ({ default: () => null }));
vi.mock('../lib/storeSettings', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()), loadStoreSettings: async () => {},
}));
vi.mock('../pages/builder/albumSizeOptions', async () => {
  const { ALBUM_SIZES } = await import('../pages/builder/types');
  return { isSizeOfferable: () => true, offerableAlbumSizes: () => ALBUM_SIZES };
});

import Builder from '../pages/Builder';
import { WIZARD_STORAGE_KEY } from './wizard';
import { ALBUM_THEME_KEY } from '../lib/albumTheme';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const GIF = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';

function madeAlbum() {
  const uploadedPhotos = Array.from({ length: 48 }, (_, i) => ({ id: `p${i}`, previewUrl: GIF, name: `p${i}.jpg`, type: 'image/jpeg', size: 1000, width: 1600, height: 1200 }));
  const albumPages = Array.from({ length: 40 }, (_, i) => ({
    id: `page-${i}`, layout: 'single', templateId: 't88-solo', slotFills: [i], photos: [], textElements: [],
    background: { type: 'solid', solid: '#FFFFFF' },
  }));
  const ctx = {
    phase: 'edit', wizardStep: 'review_pages', albumTitle: 'Batangas Trip', albumSize: '8x8',
    selectedTemplate: 'classic', photosPerPage: undefined, uploadedPhotos, albumPages,
    currentPageIndex: 0, currentPage: albumPages[0], selectedTextId: null, selectedPhotoId: null,
    user: null, coverDesign: undefined, coverFront: undefined,
    photoCheck: { ready: true, progress: { done: 48, total: 48 }, suggestion: { blurry: [], repeats: [], keeperOf: {} } },
    getAlbumId: () => 'album-1', getCloudConflict: () => null,
    manualSave: vi.fn(async () => true),
    dispatch: vi.fn(async (intent: { type: string }) => ({ intentType: intent.type, success: true, message: '' })),
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
// Only ever forward: the double-tap guard remembers the last tap across tests.
let clock = 0;
const render = async () => {
  await act(async () => {
    root.render(createElement(MemoryRouter, { initialEntries: ['/builder'] },
      createElement(Routes, null, createElement(Route, { path: '/builder', element: createElement(Builder) }))));
  });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
};
const tap = async (el: Element | null) => {
  expect(el, 'button').not.toBeNull();
  clock += 5000;
  await act(async () => { (el as HTMLElement).click(); });
};
const photoStep = () => document.querySelector('[data-testid="photos-ready"]');
const hint = () => document.querySelector('[data-testid="pick-many-hint"]');

/** Open a made album (Review), then go back the customer's way until the
 *  photo step: ← Previous / the cover's ← Back, whichever order the steps are in. */
async function openPhotoStep() {
  clock += 1_000_000;
  vi.spyOn(performance, 'now').mockImplementation(() => (clock += 1000));
  localStorage.clear(); sessionStorage.clear();
  localStorage.setItem(ALBUM_THEME_KEY, 'Family trip');
  Object.defineProperty(window, 'innerWidth', { value: 412, configurable: true, writable: true });
  Object.defineProperty(window, 'innerHeight', { value: 915, configurable: true, writable: true });
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia;
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
  localStorage.setItem(WIZARD_STORAGE_KEY, JSON.stringify({
    step: 'review_pages', completed: ['welcome', 'pick_theme', 'pick_size', 'design_cover', 'upload_photos'], skipped: [], isFirstTime: false, dismissed: false,
  }));
  h.ctx = madeAlbum();
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
  await render();
  for (let i = 0; i < 4 && !photoStep(); i++) {
    await tap([...document.querySelectorAll('button')].find((b) => ['← Previous', '← Back'].includes(b.textContent?.trim() ?? '')) ?? null);
    await render();
  }
  expect(photoStep(), 'the photo step').not.toBeNull();
}

beforeEach(() => { h.native = true; });
afterEach(async () => { await act(async () => { root.unmount(); }); host.remove(); vi.restoreAllMocks(); });

describe("Megy's photo step: how to pick many photos", () => {
  it('in the Android app: says press and hold, or ⋮ → Select all, right under the photo buttons', async () => {
    await openPhotoStep();
    expect(hint()?.textContent).toBe('To pick many photos at once: press and hold the first photo, then tap the others. Or open a folder, tap ⋮ and choose Select all.');
    // Under the card's buttons, above Previous / Next and the small tips.
    const card = hint()!.parentElement!;
    const kids = [...card.children];
    const buttons = kids.findIndex((k) => k.classList.contains('flex-col') && k.querySelector('button'));
    expect(buttons).toBeGreaterThanOrEqual(0);
    expect(kids.indexOf(hint()!)).toBe(buttons + 1);
  });

  it('in a phone browser: no hint (its photo picker picks many with taps)', async () => {
    h.native = false;
    await openPhotoStep();
    expect(hint()).toBeNull();
  });

  it('only on the photo step: on to Review, and it is gone', async () => {
    await openPhotoStep();
    expect(document.querySelectorAll('[data-testid="pick-many-hint"]')).toHaveLength(1);
    // A made album: "Keep my pages →" goes on to its pages without remaking them.
    await tap([...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Keep my pages →') ?? null);
    await render();
    expect(photoStep()).toBeNull();
    expect(hint()).toBeNull();
  });
});
