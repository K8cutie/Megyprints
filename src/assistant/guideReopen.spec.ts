// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';

/* ══════════════════════════════════════════════════════════════════════════
   STEP 7's "PLACE ORDER →" ORDERS. On Preview & Order Megy's card shows
   "Preview Full Album", "← Edit pages", "Save to Cloud" and "Place Order →".
   "Place Order →" is drawn as THE filled button (isPrimaryAction: →), but the
   panel only handled the other three, so the tap did nothing. A forward
   button must never be a dead tap: testers get stuck (PR #54).
   It must order through the ONE order entry, BuilderPreview.handleOrder
   (the 40-photo check, the print job checkout reads, then Builder.handleOrder's save
   and /order), never straight to /order. So these walk the REAL Builder,
   Megy's panel and the preview, and hold the tap to the Order button's own
   outcome on the same album.
   ══════════════════════════════════════════════════════════════════════════ */

const h = vi.hoisted(() => ({ ctx: null as unknown }));
vi.mock('../pages/builder/BuilderContext', () => ({ useBuilderContext: () => h.ctx }));
// The screens around the preview (Fabric canvas, cover editor, phone review)
// play no part in ordering.
vi.mock('../pages/builder/BuilderEdit', () => ({ default: () => null }));
vi.mock('../pages/builder/MobileReview', () => ({ default: () => null }));
vi.mock('../pages/builder/CoverEditor', () => ({ default: () => null }));
vi.mock('../pages/builder/LayoutPicker', () => ({ default: () => null }));
vi.mock('../pages/builder/BuilderBackGuard', () => ({ default: () => null }));
vi.mock('../components/SoftAuthGate', () => ({ default: () => null }));

import Builder from '../pages/Builder';
import { setPendingPrintJob, type PrintJob } from '../lib/printQueue';
import { WIZARD_STORAGE_KEY, WIZARD_ORDER } from './wizard';
import { ALBUM_THEME_KEY } from '../lib/albumTheme';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const GIF = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';

/** A generated 8×8 album of 40 pages with `photoCount` photos, one a page;
 *  the rest of the pages are empty (an old draft can be that short). */
function albumWith(photoCount: number) {
  const uploadedPhotos = Array.from({ length: photoCount }, (_, i) => ({
    id: `p${i}`, previewUrl: GIF, name: `p${i}.jpg`, type: 'image/jpeg', size: 1000, width: 1200, height: 1200,
  }));
  const albumPages = Array.from({ length: 40 }, (_, i) => ({
    id: `page-${i}`, layout: 'single', templateId: 't88-solo-square',
    slotFills: [i < photoCount ? i : null], photos: [], textElements: [],
    background: { type: 'solid', solid: '#FFFFFF' },
  }));
  return { uploadedPhotos, albumPages };
}

/** The builder on Preview & Order, as the context hands it to every screen. */
function builderOn(photoCount: number, user: { id: string } | null = null, saved = true) {
  const { uploadedPhotos, albumPages } = albumWith(photoCount);
  return {
    phase: 'preview', wizardStep: 'finalize', albumTitle: "Maria's Debut", albumSize: '8x8',
    selectedTemplate: 'classic', photosPerPage: 1, uploadedPhotos, albumPages,
    currentPageIndex: 0, currentPage: albumPages[0], selectedTextId: null, selectedPhotoId: null,
    user, coverDesign: undefined, coverFront: undefined, photoCheck: undefined,
    getAlbumId: () => 'album-1',
    manualSave: vi.fn(async () => saved),
    dispatch: vi.fn(async () => ({ success: true, message: '' })),
    setPhase: vi.fn(), setWizardStep: vi.fn(), setAlbumTitle: vi.fn(), goToPage: vi.fn(),
    getPageSnapshot: () => undefined, saveDraftNow: vi.fn(), reset: vi.fn(), loadAlbum: vi.fn(),
    setBoxText: vi.fn(), updateTextElement: vi.fn(), setQrFill: vi.fn(),
    finishBoxesWithQuotes: vi.fn(async () => ({ filled: 0, remaining: 0 })),
    setLayoutPickerOpen: vi.fn(),
  };
}

let host: HTMLDivElement;
let root: Root;
let where = '';
function Where() {
  const loc = useLocation();
  useEffect(() => { where = loc.pathname; });
  return null;
}
const app = () => createElement(MemoryRouter, { initialEntries: ['/builder'] },
  createElement(Routes, null,
    createElement(Route, { path: '/builder', element: createElement(Builder) }),
    createElement(Route, { path: '/order', element: createElement('p', null, 'checkout') })),
  createElement(Where));

async function openPreview(ctx: ReturnType<typeof builderOn>) {
  h.ctx = ctx;
  // The journey as Step 7 leaves it: every step before it done.
  localStorage.setItem(WIZARD_STORAGE_KEY, JSON.stringify({
    step: 'finalize', completed: WIZARD_ORDER.slice(0, -1), skipped: [], isFirstTime: false, dismissed: false,
  }));
  await act(async () => { root.render(app()); });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}
const megyButton = (label: string) =>
  [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === label) ?? null;
async function tap(button: Element | null) {
  expect(button).not.toBeNull();
  await act(async () => { (button as HTMLButtonElement).click(); });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem(ALBUM_THEME_KEY, 'Wedding');
  setPendingPrintJob(null as unknown as PrintJob);
  where = '';
  Object.defineProperty(window, 'innerWidth', { value: 1366, configurable: true, writable: true });
  Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true, writable: true });
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia;
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => { root.unmount(); });
  host.remove();
});

describe("Megy's steps after ✕", () => {
  it('closing them leaves a way back; one tap brings Step 7 and its buttons back', async () => {
    await openPreview(builderOn(40));
    expect(megyButton('Place Order →')).not.toBeNull();
    await tap(document.querySelector('button[aria-label="Hide the steps"]'));
    expect(megyButton('Place Order →')).toBeNull();
    const back = document.querySelector('[data-testid="megy-show-steps"]');
    expect(back?.textContent).toBe('Show the steps again (Step 7 of 7)');
    await tap(back);
    expect(megyButton('Place Order →')).not.toBeNull();
    expect(document.querySelector('[data-testid="megy-show-steps"]')).toBeNull();
    expect(where).toBe('/builder'); // hiding and showing the steps never leaves the album
  });

  it('still closed after a reload — and the way back is still there', async () => {
    await openPreview(builderOn(40));
    await tap(document.querySelector('button[aria-label="Hide the steps"]'));
    await act(async () => { root.unmount(); });
    root = createRoot(host);
    await act(async () => { root.render(app()); });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(megyButton('Place Order →')).toBeNull();
    expect(document.querySelector('[data-testid="megy-show-steps"]')).not.toBeNull();
  });
});
