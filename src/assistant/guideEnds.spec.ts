// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/* ══════════════════════════════════════════════════════════════════════════
   MEGY'S GUIDE ENDS AT "MAKE MY ALBUM" (owner, 2026-10-30, "lets go with your
   recommendation"). Her old Steps 5–7 (Review, Text, Preview & Order) repeated
   the screen's own buttons, Step 6 never showed (the count jumped from 5 of 7
   to 7 of 7), Step 7 said "I'll save everything to the cloud" (photos stay on
   the phone until the order) and Step 7 caused a tester bug. Now:
   - the guide is 4 steps, "Step 1 of 4" … "Step 4 of 4", ending on the cover,
     where "Make my album →" makes the album;
   - after that her card is one short "Your album is made" note, with no
     number and no buttons of its own;
   - on a phone the chat sits behind a small "Ask Megy" link under her card:
     no open text box by default; tapping it opens the input as before;
   - a computer keeps its chat button in her header, as before, and gets the
     page's own "Change layout" (the old Step 5 card was its only door);
   - the app's daily lesson still opens on its done page.
   These walk the REAL Builder and Megy's panel over a stub builder.
   ══════════════════════════════════════════════════════════════════════════ */

const h = vi.hoisted(() => ({ ctx: null as unknown, native: false }));
vi.mock('../pages/builder/BuilderContext', () => ({ useBuilderContext: () => h.ctx }));
vi.mock('../pages/builder/BuilderEdit', () => ({ default: () => null }));
vi.mock('../pages/builder/MobileReview', () => ({ default: () => null }));
// The cover step, as far as this walk needs it: its ← Back and filled button.
vi.mock('../pages/builder/CoverEditor', async () => {
  const { createElement: el } = await import('react');
  return {
    default: ({ onBack, onNext, nextLabel }: { onBack?: () => void; onNext?: () => void; nextLabel?: string }) =>
      el('div', { 'data-testid': 'cover-step' },
        el('button', { onClick: onBack }, '← Back'),
        el('button', { onClick: onNext, 'data-testid': 'cover-step-next' }, nextLabel)),
  };
});
vi.mock('../pages/builder/LayoutPicker', () => ({ default: () => null }));
vi.mock('../components/SoftAuthGate', () => ({ default: () => null }));
vi.mock('../lib/nativeShell', () => ({ isNativeShell: () => h.native }));
vi.mock('../lib/storeSettings', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()), loadStoreSettings: async () => {},
}));

import Builder from '../pages/Builder';
import {
  WizardEngine, WIZARD_ORDER, GUIDE_STEPS, GUIDE_DONE_LABEL, ALBUM_MADE_TITLE, MAKE_ALBUM, isAfterGuide,
  WIZARD_STORAGE_KEY, type WizardStep,
} from './wizard';
import { ActionEngine } from './actionEngine';
import { ALBUM_THEME_KEY } from '../lib/albumTheme';
import { samplePhotoName } from '../lib/samplePhotos';
import { attachRun, RUN_KEY } from '../lib/dailyTestRun';
import { snapPages } from '../pages/builder/dailyAlbumTask';
import type { DailyTestRequest } from '../lib/dailyTest';
import type { BuilderActions } from '../pages/builder/useBuilderState';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });

const GIF = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
const MADE = new Date(2026, 9, 30, 1, 0).getTime();
/** Words only the old Steps 5–7 said. */
const OLD_STEPS = ['Step 5', 'Step 6', 'Step 7', ' of 7', 'Review Each Page', 'All Pages Reviewed', 'Add Text & Captions', 'Preview & Order',
  'Place Order →', 'Save to Cloud', 'Preview Full Album', 'Skip to Finalize', 'save everything to the cloud', 'Restart Wizard'];

/* ── The engine ── */

const stub = (over: Record<string, unknown> = {}) => ({
  albumTitle: 'Cruz Family', phase: 'setup', albumPages: [], uploadedPhotos: [], albumSize: '8x8',
  currentPageIndex: 0, currentPage: null, ...over,
} as unknown as BuilderActions);
const forty = Array.from({ length: 40 }, (_, i) => ({ id: `p${i}` }));
const builtPages = Array.from({ length: 40 }, (_, i) => ({ slotFills: [i], photos: [], textElements: [] }));

describe('the guide is 4 steps and ends at Make my album', () => {
  beforeEach(() => { localStorage.clear(); localStorage.setItem(ALBUM_THEME_KEY, 'Family'); });

  it('name + occasion, size, photos, cover: "Step 1 of 4" … "Step 4 of 4", each matching its card', () => {
    expect(GUIDE_STEPS).toEqual(['pick_theme', 'pick_size', 'upload_photos', 'design_cover']);
    expect(WIZARD_ORDER).not.toContain('add_text' as WizardStep);
    const w = new WizardEngine(stub({ uploadedPhotos: forty }), false);
    GUIDE_STEPS.forEach((step, i) => {
      w.state.step = step;
      expect(w.getProgress().label).toBe(`Step ${i + 1} of 4`);
      expect(w.getMessage().title.startsWith(`Step ${i + 1}:`), step).toBe(true);
    });
  });

  it('Step 4 is the last step: the cover, whose filled button makes the album', () => {
    const w = new WizardEngine(stub({ uploadedPhotos: forty }), false);
    w.state.step = 'design_cover';
    expect(w.getProgress()).toMatchObject({ current: 4, total: 4, percent: 100 });
    expect(w.getMessage().body).toContain(`**${MAKE_ALBUM.replace(' →', '')}**`);
    expect(w.showsNext()).toBe(false); // the cover's own "Make my album →" is the way on
  });

  it('after it (the pages, Preview) the count says it is done: never a Step 5, 6 or 7', () => {
    for (const phase of ['edit', 'preview']) {
      const w = new WizardEngine(stub({ phase, albumPages: builtPages, uploadedPhotos: forty }), false);
      w.reconcileForward();
      expect(isAfterGuide(w.state.step)).toBe(true);
      expect(w.getProgress()).toEqual({ current: 4, total: 4, percent: 100, label: GUIDE_DONE_LABEL });
      const m = w.getMessage();
      expect(m.title).toBe(ALBUM_MADE_TITLE);
      expect(m.actions).toEqual([]); // the screen's own buttons do it
      for (const old of OLD_STEPS) expect(`${m.title} ${m.body} ${m.tips.join(' ')}`, `${phase}: ${old}`).not.toContain(old);
      // One page count everywhere (2026-10-04): Megy says none of her own.
      expect(m.body).not.toMatch(/page \d+ of \d+/);
    }
  });
});

/* ── The real Builder and Megy's panel ── */

function builder({ photos = 45, made = false, sample = false } = {}) {
  const name = (i: number) => (sample ? samplePhotoName(i + 1) : `p${i}.jpg`);
  const uploadedPhotos = Array.from({ length: photos }, (_, i) => ({ id: `p${i}`, previewUrl: GIF, name: name(i), type: 'image/jpeg', size: 1000, width: 1200, height: 1200 }));
  const pages = (filled: boolean) => Array.from({ length: 40 }, (_, i) => ({
    id: `page-${i}`, layout: 'single', templateId: 't88-solo-square', slotFills: filled ? [i] : [], photos: [], textElements: [],
    background: { type: 'solid', solid: '#FFFFFF' }, madeAt: filled ? MADE : undefined,
  }));
  const ctx = {
    phase: 'edit', wizardStep: 'upload_photos' as string, albumTitle: 'Cruz Family', albumSize: '8x8',
    selectedTemplate: 'classic', photosPerPage: undefined as number | undefined, uploadedPhotos, albumPages: pages(made),
    currentPageIndex: 0, selectedTextId: null, selectedPhotoId: null,
    get currentPage() { return ctx.albumPages[ctx.currentPageIndex]; },
    user: null, coverDesign: undefined, coverFront: undefined,
    photoCheck: { ready: true, progress: { done: photos, total: photos }, suggestion: { blurry: [], repeats: [], keeperOf: {} } },
    getAlbumId: () => 'album-1', getCloudConflict: () => null,
    manualSave: vi.fn(async () => true),
    dispatch: vi.fn(async (intent: { type: string; payload?: unknown; rawMessage?: string }): Promise<{ intentType: string; success: boolean; message: string }> => {
      // "Make my album →": the album is made.
      if (intent.type === 'generate_album') { ctx.albumPages = pages(true); return { intentType: intent.type, success: true, message: 'Album generated!' }; }
      // Preview, as the real engine opens it (a sample album in the app: its last page).
      if (intent.type === 'preview_album') return new ActionEngine(ctx as unknown as BuilderActions).execute(intent as never);
      return { intentType: intent.type, success: true, message: '' };
    }),
    resizeAsk: null, setResizeAsk: vi.fn(),
    setPhase: vi.fn((p: string) => { ctx.phase = p; }), setWizardStep: vi.fn((w: string) => { ctx.wizardStep = w; }),
    setAlbumTitle: vi.fn(), goToPage: vi.fn((i: number) => { ctx.currentPageIndex = i; }),
    getPageSnapshot: () => undefined, saveDraftNow: vi.fn(), reset: vi.fn(), loadAlbum: vi.fn(),
    setBoxText: vi.fn(), updateTextElement: vi.fn(), setQrFill: vi.fn(),
    finishBoxesWithQuotes: vi.fn(async () => ({ filled: 0, remaining: 0 })), setLayoutPickerOpen: vi.fn(),
  };
  return ctx;
}
type Ctx = ReturnType<typeof builder>;

let host: HTMLDivElement;
let root: Root;
let ctx: Ctx;
const app = () => createElement(MemoryRouter, { initialEntries: ['/builder'] },
  createElement(Routes, null, createElement(Route, { path: '/builder', element: createElement(Builder) })));
const render = async () => {
  await act(async () => { root.render(app()); });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
};
function size(w: number, hgt: number) {
  Object.defineProperty(window, 'innerWidth', { value: w, configurable: true, writable: true });
  Object.defineProperty(window, 'innerHeight', { value: hgt, configurable: true, writable: true });
}
async function open(c: Ctx, step: WizardStep) {
  ctx = c;
  ctx.wizardStep = step;
  h.ctx = ctx;
  localStorage.setItem(WIZARD_STORAGE_KEY, JSON.stringify({ step, completed: WIZARD_ORDER.slice(0, WIZARD_ORDER.indexOf(step)), skipped: [], isFirstTime: false, dismissed: false }));
  await render();
  await render();
}
const button = (label: string) => [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === label) ?? null;
const tap = async (el: Element | null) => {
  expect(el).not.toBeNull();
  await act(async () => { (el as HTMLElement).click(); });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  await render();
};
const megyButton = () => document.querySelector('button[aria-label="Open Megy"]');
const card = () => document.querySelector('[data-testid="megy-card"]');
const chatInput = () => document.querySelector('input[placeholder="Ask Megy..."]') as HTMLInputElement | null;
const askLink = () => document.querySelector('[data-testid="ask-megy-link"]');
const centerGuide = () => document.querySelector('[aria-label="Megy\'s guide"]')?.textContent ?? '';
const progressLabel = () => card()?.parentElement?.querySelector('span')?.textContent ?? '';
async function say(text: string) {
  const input = chatInput()!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
  for (let i = 0; i < 4; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}

beforeEach(() => {
  vi.spyOn(performance, 'now').mockImplementation(() => Date.now());
  localStorage.clear(); sessionStorage.clear();
  localStorage.setItem(ALBUM_THEME_KEY, 'Family');
  h.native = false;
  size(390, 844);
  window.matchMedia = ((q: string) => ({ matches: /max-width/.test(q), media: q, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia;
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
});
afterEach(async () => {
  await act(async () => { root.unmount(); });
  host.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('a phone: Steps 3 and 4, then Make my album, and no Step 5–7 after it', () => {
  it('"Step 3 of 4" → the cover, "Step 4 of 4" → Make my album → the pages: her card is "Your album is made", no number, only ← Previous', async () => {
    await open(builder(), 'upload_photos');
    expect(centerGuide()).toContain('Step 3 of 4');
    await tap(button('Next: pick your cover →'));
    expect(ctx.phase).toBe('cover');
    // Megy on the cover (she hangs from the top): Step 4 of 4, the last.
    await tap(megyButton());
    expect(card()?.getAttribute('data-step')).toBe('design_cover');
    expect(progressLabel()).toBe('Step 4 of 4');
    await tap(document.querySelector('button[aria-label="Close Megy"]'));
    const next = document.querySelector('[data-testid="cover-step-next"]');
    expect(next?.textContent).toBe('Make my album →');
    await tap(next);
    expect(ctx.dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'generate_album' }));
    expect(ctx.wizardStep).toBe('review_pages');
    expect(ctx.phase).toBe('edit');
    await render();
    // The pages, then Megy.
    await tap(megyButton());
    expect(card()?.getAttribute('data-step')).toBe('review_pages');
    expect(progressLabel()).toBe('All 4 steps done');
    expect(card()?.textContent).toContain('You finished all 4 steps');
    expect([...card()!.querySelectorAll('button')].map((b) => b.textContent?.trim())).toEqual(['← Previous']);
    for (const old of OLD_STEPS) expect(document.body.textContent, old).not.toContain(old);
  });

  it('Preview: her card is the same short note with no buttons; no Step 7 on top of the last page', async () => {
    const c = builder({ made: true });
    c.phase = 'preview';
    c.currentPageIndex = 39;
    await open(c, 'finalize');
    await tap(megyButton());
    expect(card()?.getAttribute('data-step')).toBe('finalize');
    expect(progressLabel()).toBe('All 4 steps done');
    expect(card()!.querySelectorAll('button')).toHaveLength(0);
    for (const old of OLD_STEPS) expect(document.body.textContent, old).not.toContain(old);
    // Preview's own buttons are the way on.
    expect(document.querySelector('[data-testid="preview-order"]')).not.toBeNull();
    expect(document.querySelector('[data-testid="preview-edit-pages"]')).not.toBeNull();
  });

  it('← Previous on the made album still goes back to the steps (the cover, Step 4)', async () => {
    await open(builder({ made: true }), 'review_pages');
    await tap(megyButton());
    await tap(button('← Previous'));
    expect(ctx.wizardStep).toBe('design_cover');
    expect(ctx.phase).toBe('cover');
  });

  it('"Start a new album" replaces "Restart Wizard — start over" and still starts a new album', async () => {
    await open(builder({ made: true }), 'review_pages');
    await tap(megyButton());
    expect(button('Restart Wizard — start over')).toBeNull();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await tap(document.querySelector('[data-testid="megy-new-album"]'));
    expect(confirm).toHaveBeenCalledWith('Start a new album? This album and its photos will be cleared.');
    expect(ctx.reset).toHaveBeenCalledTimes(1);
    expect(ctx.wizardStep).toBe('welcome');
  });
});

describe('a phone: the chat is behind an "Ask Megy" link', () => {
  it('no open text box by default; "Ask Megy" under her card opens the input, as before; it answers', async () => {
    await open(builder({ made: true }), 'review_pages');
    await tap(megyButton());
    expect(chatInput()).toBeNull();
    const link = askLink()!;
    expect(link.textContent?.trim()).toBe('Ask Megy');
    // Right under her card, and a phone's only: a computer keeps its header button.
    expect(card()!.parentElement!.nextElementSibling!.contains(link)).toBe(true);
    expect(link.parentElement!.className).toMatch(/(^|\s)lg:hidden(\s|$)/);
    const headerChat = document.querySelector('button[aria-label="Quick chat"]')!;
    expect(headerChat.className).toMatch(/(^|\s)hidden(\s|$)/);
    expect(headerChat.className).toMatch(/(^|\s)lg:inline-flex(\s|$)/);
    // A quiet link, not a filled button (the way on is on the screen).
    expect(link.className).not.toMatch(/bg-peach/);
    await tap(link);
    expect(chatInput()).not.toBeNull();
    expect(document.activeElement).toBe(chatInput());
    expect(askLink()).toBeNull(); // the open chat has its own close arrow
    await say('go to page 5');
    expect(ctx.dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'go_to_page' }));
  });

  it('closed with ✕ and opened again: her card, and the chat box closed again behind its link', async () => {
    await open(builder({ made: true }), 'review_pages');
    await tap(megyButton());
    await tap(askLink());
    expect(chatInput()).not.toBeNull();
    await tap(document.querySelector('button[aria-label="Close Megy"]'));
    await tap(megyButton());
    expect(card()).not.toBeNull();
    expect(chatInput()).toBeNull();
    expect(askLink()).not.toBeNull();
  });

  it('the chat\'s own close arrow brings the link back', async () => {
    await open(builder({ made: true }), 'review_pages');
    await tap(megyButton());
    await tap(askLink());
    await tap(document.querySelector('button[aria-label="Close chat"]'));
    expect(chatInput()).toBeNull();
    expect(askLink()).not.toBeNull();
  });
});

describe('a computer: the chat is unchanged; Change layout is on the page', () => {
  beforeEach(() => { size(1280, 800); });

  it('the header\'s chat button opens the chat in the side panel, as before; no fold-up there', async () => {
    await open(builder({ made: true }), 'review_pages');
    expect(megyButton()).toBeNull(); // the side panel, not the phone's pull-down
    expect(card()?.getAttribute('data-step')).toBe('review_pages');
    expect(chatInput()).toBeNull();
    await tap(document.querySelector('button[aria-label="Quick chat"]'));
    expect(chatInput()).not.toBeNull();
    expect(document.activeElement).toBe(chatInput());
    await say('go to page 5');
    expect(ctx.dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'go_to_page' }));
    expect(chatInput()).not.toBeNull(); // still open
  });

  it('the pages have their own "Change layout" (the old Step 5 card was its only door on a computer)', () => {
    const src = readFileSync(resolve(__dirname, '../pages/builder/BuilderEdit.tsx'), 'utf8');
    expect(src).toMatch(/\{!isPageEmpty && \(\s*<button type="button" onClick=\{\(\) => actions\.setLayoutPickerOpen\(true\)\} data-testid="desk-change-layout"[\s\S]{0,400}?<LayoutGrid size=\{12\} \/> Change layout/);
    // And Megy's panel no longer opens it (nothing of hers is left that would).
    expect(readFileSync(resolve(__dirname, 'MegyAssistant.tsx'), 'utf8')).not.toMatch(/setLayoutPickerOpen\(true\)/);
  });
});

describe("the app's daily lesson still opens on its done page", () => {
  const TEST: DailyTestRequest = { day: 20756, name: 'Oct 30', before: 'occasion', answer: 'Baby', album: 'caption' };

  it('task done + the minute up: Preview opens on the LAST page ("You finished today\'s lesson!"), Megy folded, no Step 7', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'performance', 'Date'] });
    h.native = true; // the Android app, while testing
    const c = builder({ photos: 40, made: true, sample: true });
    c.currentPageIndex = 6;
    attachRun(TEST, MADE, 'caption', { page: 6, slot: 0 }, snapPages(c.albumPages));
    localStorage.setItem(RUN_KEY, JSON.stringify({ ...JSON.parse(localStorage.getItem(RUN_KEY)!), albumDone: 'words on page 7', fgMs: 55_000 }));
    ctx = c; h.ctx = c; c.wizardStep = 'review_pages';
    localStorage.setItem(WIZARD_STORAGE_KEY, JSON.stringify({ step: 'review_pages', completed: WIZARD_ORDER.slice(0, 5), skipped: [], isFirstTime: false, dismissed: false }));
    const run = async (ms: number) => { for (let t = 0; t < ms; t += 250) await act(async () => { vi.advanceTimersByTime(250); }); };
    await act(async () => { root.render(app()); });
    await run(500);
    expect(document.querySelector('[data-testid="daily-test-countdown"]')).not.toBeNull();
    await run(10_000); // past the minute
    const previews = c.dispatch.mock.calls.filter(([i]) => i.type === 'preview_album');
    expect(previews).toHaveLength(1);
    expect(previews[0][0].payload).toBeUndefined(); // the real engine's own Preview, not "stay"
    expect(c.phase).toBe('preview');
    expect(c.currentPageIndex).toBe(39); // the done page: the last one
    await act(async () => { root.render(app()); });
    await run(500);
    expect(megyButton()).not.toBeNull(); // folded, nothing over it
    await act(async () => { (megyButton() as HTMLElement).click(); });
    await run(500);
    expect(card()?.getAttribute('data-step')).toBe('finalize');
    expect(card()!.querySelectorAll('button')).toHaveLength(0);
    for (const old of OLD_STEPS) expect(document.body.textContent, old).not.toContain(old);
  });
});
