// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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
import { getPendingPrintJob, setPendingPrintJob, readOrderHandoff, type PrintJob } from '../lib/printQueue';
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
/** What a tap led to: where the app went, the print job checkout will read,
 *  and what the preview said. */
function outcome() {
  const job = getPendingPrintJob();
  return {
    path: where,
    job: job ? { pages: job.pages.length, photos: job.photos.length, albumId: job.albumId } : null,
    alert: document.querySelector('[role="alert"]')?.textContent ?? null,
  };
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

describe('Step 7 (Preview & Order): "Place Order →" orders', () => {
  it('is on Megy\'s card as the filled button', async () => {
    await openPreview(builderOn(40));
    const b = megyButton('Place Order →');
    expect(b).not.toBeNull();
    expect(b!.className).toContain('bg-peach');
  });

  it('a 40-photo album: the tap goes to checkout with THIS album\'s print job', async () => {
    await openPreview(builderOn(40));
    await tap(megyButton('Place Order →'));
    expect(outcome()).toEqual({ path: '/order', job: { pages: 40, photos: 40, albumId: 'album-1' }, alert: null });
    // A guest: checkout is told this album never reached the account.
    expect(readOrderHandoff()).toEqual({ albumId: 'album-1', saved: false });
  });

  it('signed in: the album is saved first, then checkout — once per tap', async () => {
    const ctx = builderOn(40, { id: 'u1' });
    await openPreview(ctx);
    await tap(megyButton('Place Order →'));
    expect(ctx.manualSave).toHaveBeenCalledTimes(1);
    expect(where).toBe('/order');
    expect(readOrderHandoff()).toEqual({ albumId: 'album-1', saved: true });
  });

  it('a 12-photo album (an old draft): the tap answers why not yet, and checkout stays shut', async () => {
    await openPreview(builderOn(12));
    await tap(megyButton('Place Order →'));
    expect(outcome()).toEqual({
      path: '/builder', job: null,
      alert: expect.stringContaining('Your album has 12 photos. Albums need at least 40 to print, so add 28 more before you order.'),
    });
    expect(document.querySelector('[data-testid="order-too-few-edit"]')?.textContent).toBe('Back to my pages');
  });

  for (const photos of [40, 12]) {
    it(`does exactly what the preview's own Order does (${photos} photos)`, async () => {
      await openPreview(builderOn(photos));
      await tap(document.querySelector('[data-testid="preview-order"]'));
      const byOrderButton = outcome();
      await act(async () => { root.unmount(); });
      root = createRoot(host);
      setPendingPrintJob(null as unknown as PrintJob);
      where = '';
      await openPreview(builderOn(photos));
      await tap(megyButton('Place Order →'));
      expect(outcome()).toEqual(byOrderButton);
    });
  }

  it('the request is taken once: back to the pages and into the preview again never orders', async () => {
    // A save that fails keeps the customer on the preview, with the reason.
    const ctx = builderOn(40, { id: 'u1' }, false);
    await openPreview(ctx);
    await tap(megyButton('Place Order →'));
    expect(ctx.manualSave).toHaveBeenCalledTimes(1);
    expect(where).toBe('/builder');
    expect(document.querySelector('[data-testid="order-save-error"]')?.textContent).toContain("couldn't save your album");
    // Edit pages, then Preview again: a new preview mounts.
    const settle = async () => {
      await act(async () => { root.render(app()); });
      for (let i = 0; i < 20 && (document.querySelector('[data-testid="preview-order"]') != null) !== (ctx.phase === 'preview'); i++) {
        await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
      }
    };
    ctx.phase = 'edit';
    await settle();
    expect(document.querySelector('[data-testid="preview-order"]')).toBeNull();
    ctx.phase = 'preview';
    await settle();
    expect(document.querySelector('[data-testid="preview-order"]')).not.toBeNull();
    expect(ctx.manualSave).toHaveBeenCalledTimes(1);
    expect(where).toBe('/builder');
  });

  it('on the phone Megy folds up after the tap, so the answer underneath shows', async () => {
    Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true, writable: true });
    Object.defineProperty(window, 'innerHeight', { value: 844, configurable: true, writable: true });
    const ctx = builderOn(40, { id: 'u1' }, false);
    await openPreview(ctx);
    await tap(document.querySelector('[aria-label="Open Megy"]'));
    expect(document.querySelector('[aria-label="Open Megy"]')).toBeNull();
    await tap(megyButton('Place Order →'));
    expect(ctx.manualSave).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[aria-label="Open Megy"]')).not.toBeNull();
    expect(document.querySelector('[data-testid="order-save-error"]')).not.toBeNull();
  });

  it('every Step 7 button does something', async () => {
    const ctx = builderOn(40);
    await openPreview(ctx);
    await tap(megyButton('Preview Full Album'));
    expect(ctx.dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'preview_album' }));
    await tap(megyButton('← Edit pages'));
    expect(ctx.setWizardStep).toHaveBeenLastCalledWith('review_pages');
    await tap(megyButton('Save to Cloud'));
    expect(ctx.manualSave).toHaveBeenCalled();
  });

  it('Megy never sends the customer to /order itself: the preview\'s Order is the one door', () => {
    const megy = readFileSync(resolve(__dirname, 'MegyAssistant.tsx'), 'utf8');
    expect(megy).not.toMatch(/['"`]\/order/);
    expect(megy).not.toMatch(/setPendingPrintJob/);
  });
});
