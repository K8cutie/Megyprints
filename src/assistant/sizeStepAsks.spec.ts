// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

/* ══════════════════════════════════════════════════════════════════════════
   MEGY'S SIZE STEP ON A MADE ALBUM WITH VIDEO MEMORIES (2026-10-08).
   A size whose pages can't hold some memories asks first (ResizeAlbumAsk,
   from the change_size the tap dispatches). The card used to move on and
   say "Size set" the moment a size was tapped, so with the question open the
   customer was already on the cover step, told the size was set when it
   wasn't. Now the card stays on the size until it is set; a size Megy can't
   make says why instead. These render the real Builder + MegyAssistant over
   a stub builder whose dispatch answers like the action engine.
   ══════════════════════════════════════════════════════════════════════════ */

const h = vi.hoisted(() => ({ ctx: null as unknown }));
vi.mock('../pages/builder/BuilderContext', () => ({ useBuilderContext: () => h.ctx }));
vi.mock('../pages/builder/BuilderEdit', () => ({ default: () => null }));
vi.mock('../pages/builder/MobileReview', () => ({ default: () => null }));
// The cover step, as far as this walk needs it: its ← Back (to the size).
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
import type { ExecutedAction } from './types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const GIF = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
const ASKED: ExecutedAction = { intentType: 'change_size', success: false, asked: true, message: "2 of your 3 video memories can't come along." };

function madeAlbumAtSizeStep(answer: ExecutedAction) {
  const uploadedPhotos = Array.from({ length: 48 }, (_, i) => ({ id: `p${i}`, previewUrl: GIF, name: `p${i}.jpg`, type: 'image/jpeg', size: 1000, width: 1600, height: 1200 }));
  const albumPages = Array.from({ length: 40 }, (_, i) => ({
    id: `page-${i}`, layout: 'single', templateId: i === 4 ? 'qr-badge-8x8-tl' : 't88-solo', slotFills: i === 4 ? [i, null] : [i], photos: [], textElements: [],
    background: { type: 'solid', solid: '#FFFFFF' },
    ...(i === 4 ? { qrFills: [null, { kind: 'clip', code: 'code4' }] } : {}),
  }));
  const ctx = {
    phase: 'edit', wizardStep: 'review_pages', albumTitle: 'Batangas Trip', albumSize: '8x8',
    selectedTemplate: 'classic', photosPerPage: undefined, uploadedPhotos, albumPages,
    currentPageIndex: 0, currentPage: albumPages[0], selectedTextId: null, selectedPhotoId: null,
    user: null, coverDesign: undefined, coverFront: undefined,
    photoCheck: { ready: true, progress: { done: 48, total: 48 }, suggestion: { blurry: [], repeats: [], keeperOf: {} } },
    getAlbumId: () => 'album-1', getCloudConflict: () => null,
    manualSave: vi.fn(async () => true),
    dispatch: vi.fn(async (intent: { type: string; payload?: Record<string, unknown> }) => {
      if (intent.type !== 'change_size') return { intentType: intent.type, success: true, message: '' };
      if (intent.payload?.confirmedLost) return { intentType: 'change_size', success: true, message: 'Album size changed to 6×8.' };
      if (answer.asked) ctx.resizeAsk = { size: intent.payload?.size, memories: 3, lost: 2, lostCodes: ['code4', 'code9'] };
      return answer;
    }),
    resizeAsk: null as null | Record<string, unknown>,
    setResizeAsk: vi.fn((v: null) => { ctx.resizeAsk = v; }),
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
let ctx: ReturnType<typeof madeAlbumAtSizeStep>;
// Only ever forward: the double-tap guard remembers the last pick across
// tests, as a page does (settleGuard).
let clock = 0;
const render = async () => {
  await act(async () => {
    root.render(createElement(MemoryRouter, { initialEntries: ['/builder'] },
      createElement(Routes, null, createElement(Route, { path: '/builder', element: createElement(Builder) }))));
  });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
};
async function open(answer: ExecutedAction) {
  clock += 1_000_000;
  vi.spyOn(performance, 'now').mockImplementation(() => (clock += 1000));
  localStorage.clear(); sessionStorage.clear();
  localStorage.setItem(ALBUM_THEME_KEY, 'Family trip');
  Object.defineProperty(window, 'innerWidth', { value: 412, configurable: true, writable: true });
  Object.defineProperty(window, 'innerHeight', { value: 915, configurable: true, writable: true });
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia;
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
  // A made album opens on Review.
  localStorage.setItem(WIZARD_STORAGE_KEY, JSON.stringify({
    step: 'review_pages', completed: ['welcome', 'pick_theme', 'pick_size', 'design_cover', 'upload_photos'], skipped: [], isFirstTime: false, dismissed: false,
  }));
  ctx = madeAlbumAtSizeStep(answer);
  h.ctx = ctx;
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
  await render();
  // Back to the size the customer's way: ← Previous (Photos), ← Previous
  // (Cover), the cover's ← Back.
  for (const label of ['← Previous', '← Previous', '← Back']) {
    await tap([...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === label) ?? null);
    await render();
  }
}
beforeEach(() => { host = undefined as unknown as HTMLDivElement; });
afterEach(async () => { await act(async () => { root.unmount(); }); host.remove(); vi.restoreAllMocks(); });

const guide = () => document.querySelector('[aria-label="Megy\'s guide"]');
// (The heading types itself out; the step count is there at once.)
const onSizeStep = () => !!guide()?.textContent?.includes('Step 2 of 7');
const sizeOnCard = (label: string) => [...(guide()?.querySelectorAll('button') ?? [])].find((b) => b.textContent?.startsWith(label)) ?? null;
const tap = async (el: Element | null) => {
  expect(el).not.toBeNull();
  await act(async () => { (el as HTMLButtonElement).click(); });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
};
const toast = () => document.querySelector('[data-testid="megy-toast"]')?.textContent ?? null;
const sizeCalls = () => (ctx.dispatch.mock.calls as unknown as Array<[{ type: string; payload?: Record<string, unknown> }]>).filter(([i]) => i.type === 'change_size').map(([i]) => i.payload);

describe('Megy\'s size step, a made album whose memories can\'t all come to the new size', () => {
  it('tapping 6×8 asks, and the card stays on the size: no "Size set", no cover step', async () => {
    await open(ASKED);
    expect(onSizeStep()).toBe(true);
    await tap(sizeOnCard('6×8'));
    expect(sizeCalls()).toEqual([{ size: '6x8' }]);
    await render(); // the builder's resizeAsk is set: the question is on screen
    expect(document.querySelector('[data-testid="resize-ask"]')?.textContent).toContain('Change to 6×8?');
    expect(onSizeStep()).toBe(true);
    expect(toast()).toBeNull();
  });

  it('"Keep 8×8" closes it and changes nothing; the size is still the one to pick', async () => {
    await open(ASKED);
    await tap(sizeOnCard('6×8'));
    await render();
    await tap(document.querySelector('[data-testid="resize-keep"]'));
    expect(ctx.setResizeAsk).toHaveBeenCalledWith(null);
    await render();
    expect(document.querySelector('[data-testid="resize-ask"]')).toBeNull();
    expect(sizeCalls()).toEqual([{ size: '6x8' }]);
    expect(onSizeStep()).toBe(true);
  });

  it('"Change to 6×8 without them" lets exactly those memories go, and the card moves on, saying so', async () => {
    await open(ASKED);
    await tap(sizeOnCard('6×8'));
    await render();
    await tap(document.querySelector('[data-testid="resize-confirm"]'));
    expect(sizeCalls()).toEqual([{ size: '6x8' }, { size: '6x8', confirmedLost: ['code4', 'code9'] }]);
    expect(ctx.setResizeAsk).toHaveBeenCalledWith(null);
    // The first cut changed the size from Builder and left the card on Step 2.
    expect(onSizeStep()).toBe(false);
    expect(ctx.setWizardStep).toHaveBeenLastCalledWith('design_cover');
  });
});

describe('Megy\'s size step otherwise', () => {
  it('a size that is set moves the card on, to the cover', async () => {
    await open({ intentType: 'change_size', success: true, message: 'Album size changed to 6×6.' });
    await tap(sizeOnCard('6×6'));
    expect(sizeCalls()).toEqual([{ size: '6x6' }]);
    expect(onSizeStep()).toBe(false);
    expect(ctx.setWizardStep).toHaveBeenLastCalledWith('design_cover');
  });
  it('a size Megy can\'t make says why and stays (it said "Size set" and moved on)', async () => {
    const no = { intentType: 'change_size' as const, success: false, message: 'Albums need at least 40 photos. Add 3 more to make your album.' };
    await open(no);
    await tap(sizeOnCard('6×6'));
    expect(onSizeStep()).toBe(true);
    expect(toast()).toBe(no.message);
  });
});
