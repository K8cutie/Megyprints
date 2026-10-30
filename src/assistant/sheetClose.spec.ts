// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

/* ══════════════════════════════════════════════════════════════════════════
   MEGY'S PANEL ON A PHONE CLOSES (tester, 2026-10-30, the Android app):
   "Hi this overlay is not closing even tho clicking on close cross make it
   blank but not completely closes and i can't drag it up to close it even".
   The panel hangs from the top of the screen. Its ✕ only hid the step card
   (the desktop side panel's "Hide the steps"), so the panel stayed open,
   blank and white; its handle only answered a tap, never a drag; Back went
   past it; and once open it stayed open into Preview, where its card turned
   into "Step 7: Preview & Order" over the last page.

   Now, on a phone: the ✕ closes the whole panel back to the small Megy
   button; a drag of the handle (up toward the top it hangs from, or down)
   closes it, with a finger too; Back closes it first and the screen stays;
   it folds up when the screen turns to Preview; and in the app's daily test
   "You're done" never opens under it. The desktop side panel's ✕ still
   hides the steps. These walk the REAL Builder and Megy's panel.
   ══════════════════════════════════════════════════════════════════════════ */

const h = vi.hoisted(() => ({ ctx: null as unknown, native: false }));
vi.mock('../pages/builder/BuilderContext', () => ({ useBuilderContext: () => h.ctx }));
// The screens around the panel play no part here.
vi.mock('../pages/builder/BuilderEdit', () => ({ default: () => null }));
vi.mock('../pages/builder/MobileReview', () => ({ default: () => null }));
vi.mock('../pages/builder/CoverEditor', () => ({ default: () => null }));
vi.mock('../pages/builder/LayoutPicker', () => ({ default: () => null }));
vi.mock('../components/SoftAuthGate', () => ({ default: () => null }));
vi.mock('../lib/nativeShell', () => ({ isNativeShell: () => h.native }));

import Builder from '../pages/Builder';
import { WIZARD_STORAGE_KEY, WIZARD_ORDER, type WizardStep } from './wizard';
import { ALBUM_THEME_KEY } from '../lib/albumTheme';
import { attachRun, RUN_KEY } from '../lib/dailyTestRun';
import { snapPages } from '../pages/builder/dailyAlbumTask';
import type { DailyTestRequest } from '../lib/dailyTest';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });

const GIF = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
const MADE = new Date(2026, 9, 30, 1, 0).getTime();

/** A made 8×8 album of 40 pages, one photo a page (made at MADE). */
function album() {
  const uploadedPhotos = Array.from({ length: 40 }, (_, i) => ({
    id: `p${i}`, previewUrl: GIF, name: `p${i}.jpg`, type: 'image/jpeg', size: 1000, width: 1200, height: 1200,
  }));
  const albumPages = Array.from({ length: 40 }, (_, i) => ({
    id: `page-${i}`, layout: 'single', templateId: 't88-solo-square', slotFills: [i], photos: [], textElements: [],
    background: { type: 'solid', solid: '#FFFFFF' }, madeAt: MADE,
  }));
  return { uploadedPhotos, albumPages };
}

function builderOn(phase: 'edit' | 'preview') {
  const { uploadedPhotos, albumPages } = album();
  return {
    phase, wizardStep: (phase === 'preview' ? 'finalize' : 'review_pages') as WizardStep, albumTitle: 'Oct 30', albumSize: '8x8',
    selectedTemplate: 'classic', photosPerPage: 1, uploadedPhotos, albumPages,
    currentPageIndex: 39, currentPage: albumPages[39], selectedTextId: null, selectedPhotoId: null,
    user: null, coverDesign: undefined, coverFront: undefined, photoCheck: undefined,
    getAlbumId: () => 'album-1', getCloudConflict: () => null,
    manualSave: vi.fn(async () => true),
    dispatch: vi.fn<(intent: { type: string; payload?: unknown; rawMessage?: string }) => Promise<{ success: boolean; message: string }>>(async () => ({ success: true, message: '' })),
    setPhase: vi.fn(), setWizardStep: vi.fn(), setAlbumTitle: vi.fn(), goToPage: vi.fn(),
    getPageSnapshot: () => undefined, saveDraftNow: vi.fn(), reset: vi.fn(), loadAlbum: vi.fn(),
    setBoxText: vi.fn(), updateTextElement: vi.fn(), setQrFill: vi.fn(),
    finishBoxesWithQuotes: vi.fn(async () => ({ filled: 0, remaining: 0 })),
    setLayoutPickerOpen: vi.fn(),
  };
}
type Ctx = ReturnType<typeof builderOn>;

let host: HTMLDivElement;
let root: Root;
const app = () => createElement(MemoryRouter, { initialEntries: ['/builder'] },
  createElement(Routes, null,
    createElement(Route, { path: '/builder', element: createElement(Builder) }),
    createElement(Route, { path: '/', element: createElement('p', null, 'home') })));

const settle = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
async function open(ctx: Ctx, { dismissed = false } = {}) {
  h.ctx = ctx;
  const step = ctx.wizardStep;
  localStorage.setItem(WIZARD_STORAGE_KEY, JSON.stringify({
    step, completed: WIZARD_ORDER.slice(0, WIZARD_ORDER.indexOf(step)), skipped: [], isFirstTime: false, dismissed,
  }));
  await act(async () => { root.render(app()); });
  await settle();
}
const rerender = async () => { await act(async () => { root.render(app()); }); await settle(); };
const megyButton = () => document.querySelector('button[aria-label="Open Megy"]') as HTMLButtonElement | null;
/** Open: the small Megy button gave way to the panel, whose handle says "Collapse Megy". */
const isOpen = () => !megyButton() && !!document.querySelector('button[aria-label="Collapse Megy"]');
/** The panel's grab handle (full width; not the desktop rail's own "Expand Megy" arrow). */
const handleEl = () => document.querySelector('button.w-full[aria-label="Collapse Megy"], button.w-full[aria-label="Expand Megy"]') as HTMLElement | null;
const button = (label: string) => [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === label) ?? null;
async function tap(el: Element | null) {
  expect(el).not.toBeNull();
  await act(async () => { (el as HTMLElement).click(); });
  await settle();
}
/** A finger on the handle: down, a few moves, up (jsdom has no PointerEvent: a MouseEvent with the pointer's fields). */
async function drag(dy: number, pointerType = 'touch') {
  const handle = handleEl() as HTMLElement;
  expect(handle).not.toBeNull();
  const ev = (type: string, y: number) => {
    const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: 195, clientY: y });
    Object.defineProperty(e, 'pointerId', { value: 7 });
    Object.defineProperty(e, 'pointerType', { value: pointerType });
    return e;
  };
  const y0 = 690;
  await act(async () => { handle.dispatchEvent(ev('pointerdown', y0)); });
  for (let i = 1; i <= 4; i++) await act(async () => { handle.dispatchEvent(ev('pointermove', y0 + (dy * i) / 4)); });
  await act(async () => { handle.dispatchEvent(ev('pointerup', y0 + dy)); });
  const openAfterDrag = isOpen();
  // A mouse sends a click after the drag: it must not open the panel again.
  if (pointerType === 'mouse') await act(async () => { handle.click(); });
  await settle();
  return openAfterDrag;
}
const back = async () => { await act(async () => { window.dispatchEvent(new PopStateEvent('popstate')); }); await settle(); };

function phoneSize() {
  Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true, writable: true });
  Object.defineProperty(window, 'innerHeight', { value: 844, configurable: true, writable: true });
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem(ALBUM_THEME_KEY, 'Birthday');
  h.native = false;
  phoneSize();
  window.matchMedia = ((q: string) => ({ matches: /max-width/.test(q), media: q, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia;
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => { root.unmount(); });
  host.remove();
  vi.useRealTimers();
});

describe("Megy's panel on a phone: the ✕", () => {
  it('closes the WHOLE panel back to the small Megy button, not just the card', async () => {
    await open(builderOn('preview'));
    expect(isOpen()).toBe(false);
    await tap(megyButton());
    expect(isOpen()).toBe(true);
    expect(megyButton()).toBeNull();
    expect(button('Place Order →')).not.toBeNull(); // Step 7's card
    await tap(document.querySelector('button[aria-label="Close Megy"]'));
    expect(isOpen()).toBe(false);
    expect(megyButton()).not.toBeNull();
    // Never blank: the steps were not hidden, so she opens on her card again.
    expect(document.querySelector('[data-testid="megy-show-steps"]')).toBeNull();
    await tap(megyButton());
    expect(isOpen()).toBe(true);
    expect(button('Place Order →')).not.toBeNull();
  });

  it('a journey saved with the steps hidden (the old ✕) still opens on her card, never a blank panel', async () => {
    await open(builderOn('preview'), { dismissed: true });
    await tap(megyButton());
    expect(isOpen()).toBe(true);
    expect(button('Place Order →')).not.toBeNull();
    expect(document.querySelector('[data-testid="megy-show-steps"]')).toBeNull();
  });

  it('the phone ✕ is phone-only; the desktop side panel keeps its own "Hide the steps" ✕', async () => {
    await open(builderOn('preview'));
    const phoneX = document.querySelector('button[aria-label="Close Megy"]') as HTMLElement;
    const deskX = document.querySelector('button[aria-label="Hide the steps"]') as HTMLElement;
    expect(phoneX.className).toMatch(/(^|\s)lg:hidden(\s|$)/);
    expect(deskX.className).toMatch(/(^|\s)hidden(\s|$)/);
    expect(deskX.className).toMatch(/(^|\s)lg:inline-flex(\s|$)/);
  });
});

describe("Megy's panel on a phone: the drag handle", () => {
  for (const [dy, way] of [[-260, 'up (toward the top it hangs from)'], [120, 'down']] as const) {
    it(`a finger dragging it ${way} closes the panel`, async () => {
      await open(builderOn('preview'));
      await tap(megyButton());
      expect(isOpen()).toBe(true);
      await drag(dy);
      expect(isOpen()).toBe(false);
      expect(megyButton()).not.toBeNull();
    });
  }

  it('a mouse drag closes it too, and the click after the drag does not open it again', async () => {
    await open(builderOn('preview'));
    await tap(megyButton());
    expect(await drag(-200, 'mouse')).toBe(false); // closed by the drag itself
    expect(isOpen()).toBe(false); // and the click after it did not open it again
  });

  it('a short wobble is a tap: the tap still closes it', async () => {
    await open(builderOn('preview'));
    await tap(megyButton());
    await drag(-10);
    expect(isOpen()).toBe(true); // not a drag
    await tap(handleEl());
    expect(isOpen()).toBe(false);
  });

  it('works with touch: the handle takes the gesture itself (touch-action: none), so the page does not scroll instead', async () => {
    await open(builderOn('preview'));
    const handle = handleEl() as HTMLElement;
    expect(handle.className).toMatch(/(^|\s)touch-none(\s|$)/);
  });
});

describe("Megy's panel on a phone: Back", () => {
  it('Back closes the open panel first and stays on Preview; the next Back goes to the pages, as before', async () => {
    const ctx = builderOn('preview');
    await open(ctx);
    await tap(megyButton());
    await back();
    expect(isOpen()).toBe(false);
    expect(ctx.setWizardStep).not.toHaveBeenCalledWith('review_pages');
    expect(ctx.setPhase).not.toHaveBeenCalledWith('edit');
    expect(document.body.textContent).not.toContain('Leave the builder?');
    await back();
    expect(ctx.setWizardStep).toHaveBeenCalledWith('review_pages');
    expect(ctx.setPhase).toHaveBeenCalledWith('edit');
  });

  it('on the pages, Back closes the panel instead of asking "Leave the builder?"', async () => {
    await open(builderOn('edit'));
    await tap(megyButton());
    await back();
    expect(isOpen()).toBe(false);
    expect(document.body.textContent).not.toContain('Leave the builder?');
    await back();
    expect(document.body.textContent).toContain('Leave the builder?');
  });
});

describe('Megy never stays open over Preview', () => {
  it('open on the pages, then the screen turns to Preview (her "Preview the album →", the done page): she folds up', async () => {
    const ctx = builderOn('edit');
    await open(ctx);
    await tap(megyButton());
    expect(isOpen()).toBe(true);
    ctx.phase = 'preview';
    await rerender();
    expect(isOpen()).toBe(false);
    expect(megyButton()).not.toBeNull();
  });

  it('Step 7\'s "Preview Full Album" and "← Edit pages" fold her up, so the screen they open shows', async () => {
    const ctx = builderOn('preview');
    await open(ctx);
    for (const label of ['Preview Full Album', '← Edit pages']) {
      await tap(megyButton());
      expect(isOpen()).toBe(true);
      await tap(button(label));
      expect(isOpen()).toBe(false);
    }
  });
});

describe("the app's daily test: \"You're done\" never opens under Megy's panel", () => {
  const TEST: DailyTestRequest = { day: 20756, name: 'Oct 30', before: 'occasion', answer: 'Baby', album: 'caption' };

  it('Megy left open on the pages while the minute runs: "You\'re done" opens Preview and she folds up, nothing over it', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'performance', 'Date'] });
    h.native = true; // the Android app, while testing
    const ctx = builderOn('edit');
    attachRun(TEST, MADE, 'caption', { page: 6, slot: 0 }, snapPages(ctx.albumPages));
    localStorage.setItem(RUN_KEY, JSON.stringify({ ...JSON.parse(localStorage.getItem(RUN_KEY)!), albumDone: 'words on page 7', fgMs: 50_000 }));
    // "You're done" is Preview on the last page (DailyTestBar): the builder's phase turns to Preview.
    ctx.dispatch.mockImplementation(async (i: { type: string }) => {
      if (i.type === 'preview_album') ctx.phase = 'preview';
      return { success: true, message: '' };
    });
    const previews = () => ctx.dispatch.mock.calls.filter(([i]) => i.type === 'preview_album').length;
    const run = async (ms: number) => { for (let t = 0; t < ms; t += 250) await act(async () => { vi.advanceTimersByTime(250); }); };
    h.ctx = ctx;
    localStorage.setItem(WIZARD_STORAGE_KEY, JSON.stringify({ step: 'review_pages', completed: WIZARD_ORDER.slice(0, 5), skipped: [], isFirstTime: false, dismissed: false }));
    await act(async () => { root.render(app()); });
    await run(500);
    expect(document.querySelector('[data-testid="daily-test-countdown"]')).not.toBeNull();
    await act(async () => { megyButton()!.click(); });
    await run(500);
    expect(isOpen()).toBe(true);
    await run(15_000); // past the minute
    expect(previews()).toBe(1);
    await act(async () => { root.render(app()); }); // the builder re-renders on Preview
    await run(500);
    expect(ctx.phase).toBe('preview');
    expect(isOpen()).toBe(false);
    expect(megyButton()).not.toBeNull();
    expect(document.querySelector('button[aria-label="Collapse Megy"]')).toBeNull();
  });
});
