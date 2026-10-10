// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/* ══════════════════════════════════════════════════════════════════════════
   MAKING A MADE ALBUM AGAIN ASKS FIRST (1-star testers round 3, the Quitter
   and the Commuter; both confirmed by the checkers). Back on Step 4, the big
   filled "Generate Album →" laid every page out again without a word: placed
   video memories, the 3-box layout and the quote typed on page 3 were gone,
   and the video had to be uploaded again. Now "Keep my pages →" is the way
   on, and "Make the album again" asks, saying what it replaces.
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
import { WIZARD_STORAGE_KEY } from './wizard';
import { ALBUM_THEME_KEY } from '../lib/albumTheme';
import { placedMemories, remakeLosesMessage, rebuildQuestion } from './rebuildQuestion';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const GIF = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';

/** A made 9×9 album of 41 pages, with video memories on pages 1 and 3. */
function madeAlbum() {
  const uploadedPhotos = Array.from({ length: 45 }, (_, i) => ({ id: `p${i}`, previewUrl: GIF, name: `p${i}.jpg`, type: 'image/jpeg', size: 1000, width: 1200, height: 1200 }));
  const albumPages = Array.from({ length: 41 }, (_, i) => ({
    id: `page-${i}`, layout: 'single', templateId: 't99-solo', slotFills: [i], photos: [], textElements: [],
    background: { type: 'solid', solid: '#FFFFFF' },
    ...(i === 0 || i === 2 ? { qrFills: [{ kind: 'clip', code: `code${i}` }] } : {}),
  }));
  return { uploadedPhotos, albumPages };
}
function builderAtStep4() {
  const { uploadedPhotos, albumPages } = madeAlbum();
  return {
    phase: 'edit', wizardStep: 'upload_photos', albumTitle: 'Quinn HK Trip R3', albumSize: '9x9',
    selectedTemplate: 'classic', photosPerPage: undefined, uploadedPhotos, albumPages,
    currentPageIndex: 0, currentPage: albumPages[0], selectedTextId: null, selectedPhotoId: null,
    user: { id: 'user-1' }, coverDesign: undefined, coverFront: undefined,
    photoCheck: { ready: true, progress: { done: 45, total: 45 }, suggestion: { blurry: [], repeats: [], keeperOf: {} } },
    getAlbumId: () => 'album-1', getCloudConflict: () => null,
    manualSave: vi.fn(async () => true),
    dispatch: vi.fn(async () => ({ success: true, message: '' })),
    setPhase: vi.fn(), setWizardStep: vi.fn(), setAlbumTitle: vi.fn(), goToPage: vi.fn(),
    getPageSnapshot: () => undefined, saveDraftNow: vi.fn(), reset: vi.fn(), loadAlbum: vi.fn(),
    setBoxText: vi.fn(), updateTextElement: vi.fn(), setQrFill: vi.fn(),
    finishBoxesWithQuotes: vi.fn(async () => ({ filled: 0, remaining: 0 })), setLayoutPickerOpen: vi.fn(),
  };
}

let host: HTMLDivElement;
let root: Root;
let ctx: ReturnType<typeof builderAtStep4>;
// Each tap well after the screen it lands on (the card drops the tail of a
// double tap for 400 ms, settleGuard).
let clock = 0;
beforeEach(async () => {
  clock = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => (clock += 1000));
  localStorage.clear(); sessionStorage.clear();
  localStorage.setItem(ALBUM_THEME_KEY, 'Vacation');
  Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true, writable: true });
  Object.defineProperty(window, 'innerHeight', { value: 844, configurable: true, writable: true });
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia;
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
  // Came back from Review to Step 4 (← Previous): the album is made.
  localStorage.setItem(WIZARD_STORAGE_KEY, JSON.stringify({
    step: 'upload_photos', completed: ['welcome', 'pick_theme', 'pick_size', 'design_cover', 'upload_photos'], skipped: [], isFirstTime: false, dismissed: false,
  }));
  ctx = builderAtStep4();
  h.ctx = ctx;
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
  await act(async () => {
    root.render(createElement(MemoryRouter, { initialEntries: ['/builder'] },
      createElement(Routes, null, createElement(Route, { path: '/builder', element: createElement(Builder) }))));
  });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  // The made album opens on Review; the testers went back with "← Previous".
  const prev = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === '← Previous');
  await act(async () => { prev!.click(); });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
});
afterEach(async () => { await act(async () => { root.unmount(); }); host.remove(); vi.restoreAllMocks(); });

const button = (label: string) => [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === label) ?? null;
const tap = async (el: Element | null) => {
  expect(el).not.toBeNull();
  await act(async () => { (el as HTMLButtonElement).click(); });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
};
const generated = () => (ctx.dispatch.mock.calls as unknown as Array<[{ type: string }]>).filter(([i]) => i.type === 'generate_album').length;

describe('Step 4 with a made album', () => {
  it('"Keep my pages →" is the way on; no "Generate Album →" that rebuilds without a word', () => {
    expect(button('Keep my pages →')).not.toBeNull();
    expect(button('Make the album again')).not.toBeNull();
    expect(button('Generate Album →')).toBeNull();
  });

  it('"Make the album again" asks first, saying the 2 video memories go too', async () => {
    await tap(button('Make the album again'));
    const ask = document.querySelector('[data-testid="remake-ask"]');
    expect(ask).not.toBeNull();
    expect(ask!.textContent).toContain('Make the album again?');
    expect(document.querySelector('[data-testid="remake-ask-loses"]')!.textContent).toBe(remakeLosesMessage(2));
    expect(generated()).toBe(0);
  });

  it('"Keep my pages" in the question rebuilds nothing', async () => {
    await tap(button('Make the album again'));
    await tap(document.querySelector('[data-testid="remake-keep"]'));
    expect(document.querySelector('[data-testid="remake-ask"]')).toBeNull();
    expect(generated()).toBe(0);
  });

  it('"Make it again" does make it again', async () => {
    await tap(button('Make the album again'));
    await tap(document.querySelector('[data-testid="remake-confirm"]'));
    expect(generated()).toBe(1);
  });

  it('"Keep my pages →" on the card carries on to the pages, rebuilding nothing', async () => {
    await tap(button('Keep my pages →'));
    expect(generated()).toBe(0);
    expect(button('Keep my pages →')).toBeNull(); // the card moved on
  });
});

describe('what a remake replaces, said one way everywhere', () => {
  it('counts the video memories placed on the pages', () => {
    expect(placedMemories(madeAlbum().albumPages as never)).toBe(2);
    expect(placedMemories([{ textSlotQr: [null, { kind: 'link' }] }, { qrFills: [null] }] as never)).toBe(1);
  });
  it('names them, or leaves them out when there are none', () => {
    expect(remakeLosesMessage(0)).toBe('Every page is laid out again from your photos. That replaces your layout changes, the text you wrote. Your photos stay.');
    expect(remakeLosesMessage(1)).toContain("and your 1 video memory (you'd add it again)");
    expect(remakeLosesMessage(2)).toContain("and your 2 video memories (you'd add them again)");
  });
  it('Megy\'s chat "generate" question says the memories go too', () => {
    const q = rebuildQuestion({ type: 'generate_album' } as never, { albumPages: madeAlbum().albumPages as never, albumSize: '9x9' });
    expect(q).toContain('your 2 video memories');
  });
  it('the editor\'s "Generate All" on a made album asks too (source guard)', () => {
    const src = readFileSync(resolve(__dirname, '../pages/Builder.tsx'), 'utf8');
    expect(src).toMatch(/if \(albumIsMade\(actions\.albumPages\)\) \{ setRemakeAsk\(true\); return; \}/);
  });
});
