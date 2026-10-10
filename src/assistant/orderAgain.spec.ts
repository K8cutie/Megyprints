// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/* ══════════════════════════════════════════════════════════════════════════
   "ORDER THIS ALBUM AGAIN" ORDERS IT, AND EACH ALBUM KEEPS ITS OWN STEP
   (1-star testers round 3, the Returning Customer; confirmed by the checker):
   - Your orders → "Order this album again" opened the editor on page 1 of a
     paid album (a trash icon on the photo, no order button on screen);
   - Megy's step was one for every album: after starting another album, the
     paid one was back at "Review each page" (39 Next page taps to order),
     and the new, unreviewed one was offered "Place Order";
   - "I want to order another copy of this album" and "place order" in chat
     were "I'm not sure what you mean";
   - and back on checkout for the same album, the last order's thank-you came
     back instead of a new checkout.
   ══════════════════════════════════════════════════════════════════════════ */

const h = vi.hoisted(() => ({ ctx: null as unknown }));
vi.mock('../pages/builder/BuilderContext', () => ({ useBuilderContext: () => h.ctx }));
vi.mock('../pages/builder/BuilderEdit', () => ({ default: () => null }));
vi.mock('../pages/builder/MobileReview', () => ({ default: () => null }));
vi.mock('../pages/builder/CoverEditor', () => ({ default: () => null }));
vi.mock('../pages/builder/LayoutPicker', () => ({ default: () => null }));
vi.mock('../pages/builder/BuilderBackGuard', () => ({ default: () => null }));
vi.mock('../components/SoftAuthGate', () => ({ default: () => null }));

import Builder from '../pages/Builder';
import { getPendingPrintJob, setPendingPrintJob, noteOrderHandoff, readOrderHandoff, takeFreshHandoff, type PrintJob } from '../lib/printQueue';
import { WIZARD_STORAGE_KEY, WIZARD_ORDER, WIZARD_BY_ALBUM_KEY, readWizardForAlbum, saveWizardForAlbum, wizardForAlbum } from './wizard';
import { parseIntent } from './intentParser';
import { ALBUM_THEME_KEY } from '../lib/albumTheme';
import type { BuilderActions } from '../pages/builder/useBuilderState';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const GIF = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';

function albumWith(photoCount: number) {
  const uploadedPhotos = Array.from({ length: photoCount }, (_, i) => ({ id: `p${i}`, previewUrl: GIF, name: `p${i}.jpg`, type: 'image/jpeg', size: 1000, width: 1200, height: 1200 }));
  const albumPages = Array.from({ length: 40 }, (_, i) => ({
    id: `page-${i}`, layout: 'single', templateId: 't88-solo-square', slotFills: [i < photoCount ? i : null], photos: [], textElements: [],
    background: { type: 'solid', solid: '#FFFFFF' },
  }));
  return { uploadedPhotos, albumPages };
}
function builderOn(phase: 'edit' | 'preview', photoCount = 40, user: { id: string } | null = { id: 'u1' }) {
  const { uploadedPhotos, albumPages } = albumWith(photoCount);
  const ctx = {
    phase, wizardStep: phase === 'preview' ? 'finalize' : 'review_pages', albumTitle: 'Hong Kong Trip Day 1', albumSize: '8x8',
    selectedTemplate: 'classic', photosPerPage: 1, uploadedPhotos, albumPages,
    currentPageIndex: 0, currentPage: albumPages[0], selectedTextId: null, selectedPhotoId: null,
    user, coverDesign: undefined, coverFront: undefined, photoCheck: undefined,
    getAlbumId: () => 'album-1', getCloudConflict: () => null,
    manualSave: vi.fn(async () => true),
    dispatch: vi.fn(async () => ({ success: true, message: '' })),
    setPhase: vi.fn((p: string) => { ctx.phase = p as typeof phase; }), setWizardStep: vi.fn(), setAlbumTitle: vi.fn(), goToPage: vi.fn(),
    getPageSnapshot: () => undefined, saveDraftNow: vi.fn(), reset: vi.fn(), loadAlbum: vi.fn(async () => {}),
    setBoxText: vi.fn(), updateTextElement: vi.fn(), setQrFill: vi.fn(),
    finishBoxesWithQuotes: vi.fn(async () => ({ filled: 0, remaining: 0 })), requoteForOccasion: vi.fn(async () => ({ changed: 0, cleared: 0 })),
    setLayoutPickerOpen: vi.fn(),
  };
  return ctx;
}

let host: HTMLDivElement;
let root: Root;
let where = '';
function Where() {
  const loc = useLocation();
  useEffect(() => { where = loc.pathname + loc.search; });
  return null;
}
const app = (entry: string) => createElement(MemoryRouter, { initialEntries: [entry] },
  createElement(Routes, null,
    createElement(Route, { path: '/builder', element: createElement(Builder) }),
    createElement(Route, { path: '/order', element: createElement('p', null, 'checkout') })),
  createElement(Where));
async function open(ctx: ReturnType<typeof builderOn>, entry = '/builder', step = 'review_pages') {
  h.ctx = ctx;
  localStorage.setItem(WIZARD_STORAGE_KEY, JSON.stringify({ step, completed: WIZARD_ORDER.slice(0, WIZARD_ORDER.indexOf(step as never)), skipped: [], isFirstTime: false, dismissed: false }));
  await act(async () => { root.render(app(entry)); });
  for (let i = 0; i < 4; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}
const button = (label: string) => [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === label || b.title === label) ?? null;

beforeEach(() => {
  localStorage.clear(); sessionStorage.clear();
  localStorage.setItem(ALBUM_THEME_KEY, 'Vacation');
  setPendingPrintJob(null as unknown as PrintJob);
  where = '';
  Object.defineProperty(window, 'innerWidth', { value: 1366, configurable: true, writable: true });
  Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true, writable: true });
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia;
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => { root.unmount(); }); host.remove(); });

describe('"Order this album again" (Your orders) orders it', () => {
  it('the album opens and goes through the Order door to checkout, with THIS album\'s print job; the flag comes off the address', async () => {
    const ctx = builderOn('edit');
    await open(ctx, '/builder?album=album-1&order=again');
    expect(ctx.loadAlbum).toHaveBeenCalledWith('album-1');
    expect(ctx.manualSave).toHaveBeenCalledTimes(1); // the album is saved first, as the Order button does
    expect(where).toBe('/order');
    expect(getPendingPrintJob()).toMatchObject({ albumId: 'album-1' });
    expect(readOrderHandoff()).toEqual({ albumId: 'album-1', saved: true, fresh: true });
  });
  it('without the flag, opening an album only opens it', async () => {
    const ctx = builderOn('edit');
    await open(ctx, '/builder?album=album-1');
    expect(ctx.loadAlbum).toHaveBeenCalledWith('album-1');
    expect(where).toBe('/builder?album=album-1');
  });
  it('Your orders links there (source guard)', () => {
    const src = readFileSync(resolve(__dirname, '../pages/MyOrders.tsx'), 'utf8');
    expect(src).toContain('to={`/builder?album=${order.album_id}&order=again`}');
  });
});

describe('checkout opened by the Order door is a new checkout; a reload is a reload', () => {
  it('the fresh mark is read once', () => {
    noteOrderHandoff({ albumId: 'album-1', saved: true, fresh: true });
    expect(takeFreshHandoff()).toBe(true);
    expect(takeFreshHandoff()).toBe(false);
    expect(readOrderHandoff()).toEqual({ albumId: 'album-1', saved: true });
  });
  it('a finished checkout (the last order\'s thank-you) is not brought back on a fresh arrival (source guard)', () => {
    const src = readFileSync(resolve(__dirname, '../pages/Order.tsx'), 'utf8');
    expect(src).toMatch(/restoredRef\.current = true;\s*\/\/[^\n]*\n\s*\/\/[^\n]*\n\s*const fresh = takeFreshHandoff\(\);/);
    expect(src).toContain("if (o && fresh && o.stage === 'tracking') return;");
  });
});

describe('Megy hears "place order"', () => {
  it.each([
    'I want to order another copy of this album', 'place order', 'Place my order', 'order this album again', 'reorder', 'checkout',
  ])('"%s" → place_order', (text) => { expect(parseIntent(text).intent.type).toBe('place_order'); });
  it('"change the order of the pages" is not a purchase', () => {
    expect(parseIntent('change the order of the pages').intent.type).not.toBe('place_order');
  });
  it('typed in chat on a made album: the Order door, to checkout', async () => {
    // (On the preview: in jsdom the screen change's exit animation never ends,
    // so a test can't wait for the preview to mount; the Chrome walk types it
    // on the pages.)
    const ctx = builderOn('preview');
    await open(ctx, '/builder', 'finalize');
    await act(async () => { (button('Quick chat') as HTMLButtonElement).click(); });
    const input = document.querySelector('input[placeholder="Ask Megy..."]') as HTMLInputElement;
    await act(async () => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      set.call(input, 'I want to order another copy of this album');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
    for (let i = 0; i < 4; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(ctx.dispatch).not.toHaveBeenCalled(); // not "I'm not sure what you mean"
    expect(where).toBe('/order');
    expect(getPendingPrintJob()).toMatchObject({ albumId: 'album-1' });
  });
});

describe('each album keeps its own step', () => {
  const builderFor = (made: boolean) => ({ ...albumWith(made ? 40 : 0), albumTitle: 'Macau', phase: 'edit' } as unknown as BuilderActions);
  it('saved per album, the newest few only', () => {
    for (let i = 0; i < 25; i++) saveWizardForAlbum(`album-${i}`, JSON.stringify({ step: 'finalize' }));
    expect(readWizardForAlbum('album-24')).toContain('finalize');
    expect(readWizardForAlbum('album-0')).toBeNull();
    expect(Object.keys(JSON.parse(localStorage.getItem(WIZARD_BY_ALBUM_KEY)!))).toHaveLength(20);
  });
  it('the paid album comes back at its own step (Preview & Order), not the other album\'s Review', () => {
    saveWizardForAlbum('hk', JSON.stringify({ step: 'finalize', completed: WIZARD_ORDER.slice(0, -1), skipped: [], isFirstTime: false }));
    expect(wizardForAlbum(builderFor(true), 'hk')!.state.step).toBe('finalize');
  });
  it('a made album with no step of its own starts at Review, never at another album\'s Place Order', () => {
    expect(wizardForAlbum(builderFor(true), 'macau')!.state.step).toBe('review_pages');
  });
  it('a new, empty album keeps the journey in progress (its Step 1)', () => {
    expect(wizardForAlbum(builderFor(false), 'new-album')).toBeNull();
  });
  it('Megy switches to the album on screen (source guard)', () => {
    const src = readFileSync(resolve(__dirname, 'MegyAssistant.tsx'), 'utf8');
    expect(src).toMatch(/saveWizardForAlbum\(journeyAlbumRef\.current, saved\);/);
    expect(src).toMatch(/const next = wizardForAlbum\(builder, id\);\s*if \(!next\) return false;\s*wizardRef\.current = next;/);
    expect(src).toMatch(/if \(switchJourney\(albumOnScreen\)\) setWizardStep\(wizardRef\.current\.state\.step\);/);
  });
});
