// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/* ══════════════════════════════════════════════════════════════════════════
   PHOTOS, THEN THE COVER, THEN THE PAGES (tester, 2026-10-27: "why can I only
   submit one photo?" — the cover's one-photo picker came first). The real
   Builder + Megy over a stub builder: the photos step's filled button goes to
   the cover without making anything; the cover's makes the album and opens
   the pages; a made album is never made again from the cover.
   ══════════════════════════════════════════════════════════════════════════ */

const h = vi.hoisted(() => ({ ctx: null as unknown }));
vi.mock('../pages/builder/BuilderContext', () => ({ useBuilderContext: () => h.ctx }));
vi.mock('../pages/builder/BuilderEdit', () => ({ default: () => null }));
vi.mock('../pages/builder/MobileReview', () => ({ default: () => null }));
// The cover step, as far as this walk needs it: its ← Back and filled button.
vi.mock('../pages/builder/CoverEditor', async () => {
  const { createElement: el } = await import('react');
  return {
    default: ({ onBack, onNext, nextLabel, error }: { onBack?: () => void; onNext?: () => void; nextLabel?: string; error?: string | null }) =>
      el('div', { 'data-testid': 'cover-step' },
        error ? el('p', { 'data-testid': 'cover-step-error' }, error) : null,
        el('button', { onClick: onBack }, '← Back'),
        el('button', { onClick: onNext, 'data-testid': 'cover-step-next' }, nextLabel)),
  };
});
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

function album({ photos, made }: { photos: number; made: boolean }) {
  const uploadedPhotos = Array.from({ length: photos }, (_, i) => ({ id: `p${i}`, previewUrl: GIF, name: `p${i}.jpg`, type: 'image/jpeg', size: 1000, width: 1600, height: 1200 }));
  const albumPages = Array.from({ length: 40 }, (_, i) => ({
    id: `page-${i}`, layout: 'single', templateId: 't88-solo', slotFills: made ? [i] : [], photos: [], textElements: [],
    background: { type: 'solid', solid: '#FFFFFF' },
  }));
  const ctx = {
    phase: 'edit', wizardStep: 'upload_photos', albumTitle: 'Cruz Family', albumSize: '8x8',
    selectedTemplate: 'classic', photosPerPage: undefined, uploadedPhotos, albumPages,
    currentPageIndex: 0, currentPage: albumPages[0], selectedTextId: null, selectedPhotoId: null,
    user: null, coverDesign: undefined, coverFront: undefined,
    photoCheck: { ready: true, progress: { done: photos, total: photos }, suggestion: { blurry: [], repeats: [], keeperOf: {} } },
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
let ctx: ReturnType<typeof album>;
const render = async () => {
  await act(async () => {
    root.render(createElement(MemoryRouter, { initialEntries: ['/builder'] },
      createElement(Routes, null, createElement(Route, { path: '/builder', element: createElement(Builder) }))));
  });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
};
async function open(step: 'upload_photos' | 'design_cover', a: { photos: number; made: boolean }) {
  vi.spyOn(performance, 'now').mockImplementation(() => Date.now());
  localStorage.clear(); sessionStorage.clear();
  localStorage.setItem(ALBUM_THEME_KEY, 'Family');
  Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true, writable: true });
  Object.defineProperty(window, 'innerHeight', { value: 844, configurable: true, writable: true });
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia;
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
  const completed = ['welcome', 'pick_theme', 'pick_size', ...(step === 'design_cover' ? ['upload_photos'] : [])];
  localStorage.setItem(WIZARD_STORAGE_KEY, JSON.stringify({ step, completed, skipped: [], isFirstTime: false, dismissed: false }));
  ctx = album(a);
  ctx.phase = step === 'design_cover' ? 'cover' : 'edit';
  ctx.wizardStep = step;
  h.ctx = ctx;
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
  await render();
}
afterEach(async () => {
  if (host) { await act(async () => { root.unmount(); }); host.remove(); }
  vi.restoreAllMocks();
});
beforeEach(() => { host = undefined as unknown as HTMLDivElement; });

const button = (label: string) => [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === label) ?? null;
const tap = async (el: Element | null) => {
  expect(el).not.toBeNull();
  await act(async () => { (el as HTMLButtonElement).click(); });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  await render();
};
const made = () => (ctx.dispatch.mock.calls as unknown as Array<[{ type: string }]>).filter(([i]) => i.type === 'generate_album').length;
const guide = () => document.querySelector('[aria-label="Megy\'s guide"]')?.textContent ?? '';

describe('the size page\'s "Start Creating" (the guided card closed) goes to the photos, not the cover', () => {
  it('Builder wires it to the photos step', () => {
    const src = readFileSync(resolve(__dirname, '../pages/Builder.tsx'), 'utf8');
    expect(src).toMatch(/onNext=\{\(\) => \{ actions\.setWizardStep\('upload_photos'\); actions\.setPhase\('edit'\); \}\}\s+albumTitle=/);
    expect(src).not.toMatch(/onNext=\{\(\) => \{ actions\.setWizardStep\('design_cover'\)/);
  });
});

describe('the photos step (Step 3) comes first', () => {
  it('45 photos in: "Next: pick your cover →" opens the cover and makes nothing yet', async () => {
    await open('upload_photos', { photos: 45, made: false });
    expect(guide()).toContain('Step 3 of 4');
    expect(button('Generate Album →')).toBeNull();
    await tap(button('Next: pick your cover →'));
    expect(ctx.wizardStep).toBe('design_cover');
    expect(ctx.phase).toBe('cover');
    expect(document.querySelector('[data-testid="cover-step"]')).not.toBeNull();
    expect(made()).toBe(0);
  });
});

describe('the cover (Step 4) makes the album', () => {
  it('"Make my album →" makes it and opens the pages', async () => {
    await open('design_cover', { photos: 45, made: false });
    const next = document.querySelector('[data-testid="cover-step-next"]');
    expect(next?.textContent).toBe('Make my album →');
    await tap(next);
    expect(made()).toBe(1);
    expect(ctx.wizardStep).toBe('review_pages');
    expect(ctx.phase).toBe('edit');
  });

  it('a made album: "Continue to my pages →" opens the pages and makes nothing again', async () => {
    await open('design_cover', { photos: 45, made: true });
    // A made album opens on its pages (#39); ← Previous there is the cover.
    expect(ctx.wizardStep).toBe('review_pages');
    await tap(button('← Previous'));
    expect(ctx.wizardStep).toBe('design_cover');
    const next = document.querySelector('[data-testid="cover-step-next"]');
    expect(next?.textContent).toBe('Continue to my pages →');
    await tap(next);
    expect(made()).toBe(0);
    expect(ctx.wizardStep).toBe('review_pages');
  });

  it('short of 40 photos (a journey saved on the cover before this change): "Next: add your photos →" goes to the photos', async () => {
    await open('design_cover', { photos: 3, made: false });
    const next = document.querySelector('[data-testid="cover-step-next"]');
    expect(next?.textContent).toBe('Next: add your photos →');
    await tap(next);
    expect(made()).toBe(0);
    expect(ctx.wizardStep).toBe('upload_photos');
  });

  it('making it fails: back on the cover, saying why (it landed on empty pages with no word)', async () => {
    await open('design_cover', { photos: 45, made: false });
    const why = 'Something went wrong making your album. Try again.';
    ctx.dispatch.mockImplementation(async (intent: { type: string }) => (
      intent.type === 'generate_album' ? { intentType: intent.type, success: false, message: why } : { intentType: intent.type, success: true, message: '' }));
    await tap(document.querySelector('[data-testid="cover-step-next"]'));
    await render();
    expect(made()).toBe(1);
    expect(ctx.wizardStep).toBe('design_cover');
    expect(ctx.phase).toBe('cover');
    expect(document.querySelector('[data-testid="cover-step-error"]')?.textContent).toBe(why);
  });

  it('an album opened on the cover (Your Projects, a resume) and not made yet shows the cover, not empty pages', async () => {
    await open('design_cover', { photos: 45, made: false });
    expect(ctx.phase).toBe('cover');
    // loadAlbum opens every album on the pages screen.
    ctx.phase = 'edit';
    await render();
    await render();
    expect(ctx.phase).toBe('cover');
    expect(document.querySelector('[data-testid="cover-step"]')).not.toBeNull();
    expect(ctx.wizardStep).toBe('design_cover');
  });

  it('← Back goes to the photos', async () => {
    await open('design_cover', { photos: 45, made: false });
    await tap(button('← Back'));
    expect(ctx.wizardStep).toBe('upload_photos');
    expect(ctx.phase).toBe('edit');
    expect(button('Next: pick your cover →')).not.toBeNull();
  });
});
