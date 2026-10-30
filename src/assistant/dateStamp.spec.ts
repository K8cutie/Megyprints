// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

/* ══════════════════════════════════════════════════════════════════════════
   STEP 6's "ADD DATE STAMP" DOES SOMETHING. Megy's Step 6 (Add Text &
   Captions) showed "Add Text to This Page", "Add Date Stamp" and "Skip to
   Finalize →", but the panel only handled the first and the last: tapping
   "Add Date Stamp" did nothing. A button that does nothing reads as "stuck"
   to these testers (PR #54, #55). Now it puts the day this page's photos were
   taken (their EXIF capture time) on the page, and when they carry no date
   Megy says so and what to do instead.
   ══════════════════════════════════════════════════════════════════════════ */

const h = vi.hoisted(() => ({ ctx: null as unknown }));
vi.mock('../pages/builder/BuilderContext', () => ({ useBuilderContext: () => h.ctx }));
// The screens around Megy's panel play no part here.
vi.mock('../pages/builder/BuilderEdit', () => ({ default: () => null }));
vi.mock('../pages/builder/MobileReview', () => ({ default: () => null }));
vi.mock('../pages/builder/CoverEditor', () => ({ default: () => null }));
vi.mock('../pages/builder/LayoutPicker', () => ({ default: () => null }));
vi.mock('../pages/builder/BuilderBackGuard', () => ({ default: () => null }));
vi.mock('../components/SoftAuthGate', () => ({ default: () => null }));

import Builder from '../pages/Builder';
import { WIZARD_STORAGE_KEY, WIZARD_ORDER } from './wizard';
import { ALBUM_THEME_KEY } from '../lib/albumTheme';
import { formatDateStamp, pagePhotoTimes, dateStampForPage, dateStampFor, placeDateStamp, NO_PHOTO_DATE } from './dateStamp';
import { getTemplatesForAlbum, getTemplateById, qrBadgeTemplate, QR_CORNERS } from '../pages/builder/pageTemplates';
import { marginForTemplate } from '../pages/builder/binding';
import { getCanvasDimensions } from '../pages/builder/layouts';
import { ALBUM_INCHES } from '../pages/builder/templateKit';
import { ALBUM_SIZES, type AlbumSizePreset, type PageTemplate } from '../pages/builder/types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** A local wall-clock time, the way exifr reads EXIF DateTimeOriginal. */
const at = (y: number, m: number, d: number, hh = 12, mm = 0) => new Date(y, m - 1, d, hh, mm).getTime();

describe('formatDateStamp: the day (or days) the photos were taken', () => {
  it('one photo: its day', () => {
    expect(formatDateStamp([at(2026, 10, 12, 14, 30)])).toBe('October 12, 2026');
  });
  it('several shots the same day: one date', () => {
    expect(formatDateStamp([at(2026, 10, 12, 9), at(2026, 10, 12, 23, 59), at(2026, 10, 12, 0, 1)])).toBe('October 12, 2026');
  });
  it('days in one month: a range', () => {
    expect(formatDateStamp([at(2026, 10, 14), at(2026, 10, 12), at(2026, 10, 13)])).toBe('October 12–14, 2026');
  });
  it('across months', () => {
    expect(formatDateStamp([at(2026, 10, 2), at(2026, 9, 30)])).toBe('September 30 – October 2, 2026');
  });
  it('across years', () => {
    expect(formatDateStamp([at(2026, 1, 1), at(2025, 12, 31)])).toBe('December 31, 2025 – January 1, 2026');
  });
  it('no usable time: no date', () => {
    expect(formatDateStamp([])).toBeNull();
    expect(formatDateStamp([null, undefined, Number.NaN])).toBeNull();
  });
});

describe('pagePhotoTimes: the photos on THIS page', () => {
  const photos = [
    { capturedAt: at(2026, 10, 12) },
    { capturedAt: null },
    { capturedAt: at(2026, 10, 13) },
    {},
    { capturedAt: at(2026, 10, 20) },
  ];
  it('reads the photo slots and free-placed photos, skipping empty slots, unknown photos and undated ones', () => {
    const page = { slotFills: [0, null, 1, 99], photos: [{ photoIndex: 2 }, { photoIndex: 3 }] };
    expect(pagePhotoTimes(page, photos).sort()).toEqual([at(2026, 10, 12), at(2026, 10, 13)].sort());
  });
  it('a photo in two places counts once', () => {
    expect(pagePhotoTimes({ slotFills: [0, 0], photos: [{ photoIndex: 0 }] }, photos)).toEqual([at(2026, 10, 12)]);
  });
  it('no page, or a page with no photos: nothing', () => {
    expect(pagePhotoTimes(undefined, photos)).toEqual([]);
    expect(pagePhotoTimes({ slotFills: [], photos: [] }, photos)).toEqual([]);
    expect(dateStampForPage({ slotFills: [1, 3] }, photos)).toBeNull();
  });
  it('dateStampForPage: only this page\'s photos, never the album\'s', () => {
    expect(dateStampForPage({ slotFills: [4] }, photos)).toBe('October 20, 2026');
  });
});

/* ── Where it goes: a photo corner, never on a frame, a caption box or the trim ── */

type R = { x: number; y: number; w: number; h: number };
const inside = (a: R, b: R) => a.x >= b.x - 0.5 && a.y >= b.y - 0.5 && a.x + a.w <= b.x + b.w + 0.5 && a.y + a.h <= b.y + b.h + 0.5;
const hits = (a: R, b: R) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** A page on `t` with every photo frame filled, and where things land on it. */
function stampOn(t: PageTemplate, size: AlbumSizePreset, pageIndex: number, text = 'September 30 – October 2, 2026') {
  const slotFills = t.slots.map((s, i) => (s.kind === 'qr' || s.kind === 'ornament' ? null : i));
  const margin = marginForTemplate(t, t.margin, size, pageIndex);
  const canvas = getCanvasDimensions(size);
  const inches = ALBUM_INCHES[size];
  const placed = placeDateStamp({ text, page: { slotFills, textElements: [] }, template: t, margin, canvas, inches });
  const W = canvas.width, H = canvas.height;
  const sx = W * margin.left, sy = H * margin.top, sw = W * (1 - margin.left - margin.right), sh = H * (1 - margin.top - margin.bottom);
  const px = (b: { x: number; y: number; width: number; height: number }): R => ({ x: sx + b.x * sw, y: sy + b.y * sh, w: b.width * sw, h: b.height * sh });
  const spot = placed ? { x: placed.x, y: placed.y, w: placed.width, h: placed.fontSize * 1.25 } : null;
  return { placed, spot, slots: t.slots.map(px), textBoxes: (t.textSlots ?? []).map(px), canvas, pxPerIn: W / inches.w, slotFills };
}

/** What every placed stamp must be true of. */
function checkStamp(t: PageTemplate, size: AlbumSizePreset, pageIndex: number) {
  const { placed, spot, slots, textBoxes, canvas, pxPerIn, slotFills } = stampOn(t, size, pageIndex);
  if (!placed || !spot) return false;
  const where = `${t.id} ${size} page ${pageIndex + 1}`;
  const home = slots.findIndex((r, i) => slotFills[i] != null && inside(spot, r));
  expect(home, `${where}: on a photo`).toBeGreaterThanOrEqual(0);
  expect(slots.some((r, i) => i !== home && hits(spot, r)), `${where}: on another frame`).toBe(false);
  expect(textBoxes.some((r) => hits(spot, r)), `${where}: on a caption box`).toBe(false);
  const edge = 0.25 * pxPerIn - 0.5;
  expect(spot.x >= edge && spot.y >= edge && spot.x + spot.w <= canvas.width - edge && spot.y + spot.h <= canvas.height - edge, `${where}: inside the trim`).toBe(true);
  expect(placed.fontSize, `${where}: at least 8 pt`).toBeGreaterThanOrEqual((8 / 72) * pxPerIn - 0.05);
  expect(placed.fontSize, `${where}: at most 11 pt`).toBeLessThanOrEqual((11 / 72) * pxPerIn + 0.05);
  expect(placed).toEqual(expect.objectContaining({ color: '#FFFFFF', shadow: true }));
  return true;
}

describe('placeDateStamp: a corner of the biggest plain photo', () => {
  it('one photo on the page: its bottom-right corner, right-aligned, white with a shadow', () => {
    const t = getTemplateById('t88-solo-square')!;
    const { placed, spot, slots } = stampOn(t, '8x8', 1, 'October 12, 2026');
    expect(placed).toEqual(expect.objectContaining({ alignment: 'right', color: '#FFFFFF', shadow: true }));
    const photo = slots[0];
    expect(spot!.x + spot!.w).toBeGreaterThan(photo.x + photo.w * 0.8);
    expect(spot!.y + spot!.h).toBeGreaterThan(photo.y + photo.h * 0.85);
  });

  const sizes = ALBUM_SIZES.map((s) => s.preset as AlbumSizePreset);
  for (const size of sizes) {
    it(`${size}: on every layout, left and right page, it sits on a photo and touches nothing else`, () => {
      let placed = 0, total = 0;
      for (const t of getTemplatesForAlbum(size)) {
        for (const pageIndex of [0, 1]) {
          total++;
          if (checkStamp(t, size, pageIndex)) placed++;
        }
      }
      expect(total).toBeGreaterThan(0);
      // Nearly every layout has a free photo corner; the rest fall back to Add Text's place.
      expect(placed / total, `${size}: ${placed} of ${total} placed`).toBeGreaterThan(0.9);
    });
  }

  it('a video memory page: the stamp keeps off the QR, whichever corner it is in', () => {
    for (const size of sizes) {
      for (const corner of QR_CORNERS) {
        const t = qrBadgeTemplate(size, corner);
        if (!t) continue;
        for (const pageIndex of [0, 1]) {
          expect(checkStamp(t, size, pageIndex), `${t.id} page ${pageIndex + 1}`).toBe(true);
        }
      }
    }
  });

  it('a corner already taken by text is skipped', () => {
    const t = getTemplateById('t88-solo-square')!;
    const first = stampOn(t, '8x8', 1, 'October 12, 2026').placed!;
    const margin = marginForTemplate(t, t.margin, '8x8', 1);
    const again = placeDateStamp({
      text: 'October 12, 2026',
      page: { slotFills: [0], textElements: [{ text: 'October 12, 2026', x: first.x, y: first.y, width: first.width, fontSize: first.fontSize }] },
      template: t, margin, canvas: getCanvasDimensions('8x8'), inches: ALBUM_INCHES['8x8'],
    })!;
    expect(again.alignment).toBe('left'); // bottom-left, the next corner
    expect(again.y).toBe(first.y);
  });

  it('circles, hearts and masked photos have no corner: nothing is placed (Add Text\'s place instead)', () => {
    const t = getTemplateById('t88-solo-square')!;
    const circle = { ...t, slots: t.slots.map((s) => ({ ...s, shape: 'circle' as const })) };
    const margin = marginForTemplate(t, t.margin, '8x8', 1);
    const base = { text: 'October 12, 2026', template: circle, margin, canvas: getCanvasDimensions('8x8'), inches: ALBUM_INCHES['8x8'] };
    expect(placeDateStamp({ ...base, page: { slotFills: [0] } })).toBeNull();
    expect(placeDateStamp({ ...base, template: t, page: { slotFills: [0], slotMasks: ['heart'] } })).toBeNull();
    expect(placeDateStamp({ ...base, template: t, page: { slotFills: [null] } })).toBeNull();
  });

  it('dateStampFor: the page on screen, with its own template and size', () => {
    const photos = [{ capturedAt: at(2026, 10, 12) }];
    const page = { templateId: 't88-solo-square', size: '8x8', slotFills: [0], photos: [], textElements: [] };
    const s = dateStampFor(page, 1, '8x8', photos)!;
    expect(s.text).toBe('October 12, 2026');
    expect(s.style).toEqual(expect.objectContaining({ alignment: 'right', color: '#FFFFFF', shadow: true }));
    expect(dateStampFor(page, 1, '8x8', [{ capturedAt: null }])).toBeNull();
    expect(dateStampFor({ ...page, templateId: 'no-such-layout' }, 1, '8x8', photos)).toEqual({ text: 'October 12, 2026', style: null });
  });
});

/* ── The real tap, on Megy's panel ── */

const GIF = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';

/** An 8×8 album of 40 one-photo pages on Step 6. Page 1's photo was taken
 *  on `firstPhotoTaken` (null = no EXIF date, e.g. a screenshot). */
function builderOnStep6(firstPhotoTaken: number | null) {
  const uploadedPhotos = Array.from({ length: 40 }, (_, i) => ({
    id: `p${i}`, previewUrl: GIF, name: `p${i}.jpg`, type: 'image/jpeg', size: 1000, width: 1200, height: 1200,
    capturedAt: i === 0 ? firstPhotoTaken : at(2026, 11, 1),
  }));
  const albumPages = Array.from({ length: 40 }, (_, i) => ({
    id: `page-${i}`, layout: 'single', templateId: 't88-solo-square',
    slotFills: [i], photos: [], textElements: [],
    background: { type: 'solid', solid: '#FFFFFF' },
  }));
  return {
    phase: 'edit', wizardStep: 'add_text', albumTitle: "Maria's Debut", albumSize: '8x8',
    selectedTemplate: 'classic', photosPerPage: 1, uploadedPhotos, albumPages,
    currentPageIndex: 0, currentPage: albumPages[0], selectedTextId: null, selectedPhotoId: null,
    user: null, coverDesign: undefined, coverFront: undefined, photoCheck: undefined,
    getAlbumId: () => 'album-1',
    getCloudConflict: () => null,
    manualSave: vi.fn(async () => true),
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
const app = () => createElement(MemoryRouter, { initialEntries: ['/builder'] },
  createElement(Routes, null, createElement(Route, { path: '/builder', element: createElement(Builder) })));

async function openStep6(ctx: ReturnType<typeof builderOnStep6>) {
  h.ctx = ctx;
  // The journey as Step 6 finds it: every step before it done.
  const i = WIZARD_ORDER.indexOf('add_text');
  localStorage.setItem(WIZARD_STORAGE_KEY, JSON.stringify({
    step: 'add_text', completed: WIZARD_ORDER.slice(0, i), skipped: [], isFirstTime: false, dismissed: false,
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
const toast = () => document.querySelector('[data-testid="megy-toast"]')?.textContent ?? null;
type Intent = { type: string; payload?: { text?: string } };
const addTextCalls = (ctx: ReturnType<typeof builderOnStep6>) =>
  (ctx.dispatch.mock.calls as unknown as [Intent][]).map((c) => c[0]).filter((i) => i.type === 'add_text');

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem(ALBUM_THEME_KEY, 'Wedding');
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

describe('Step 6 (Add Text & Captions): "Add Date Stamp"', () => {
  it('puts the day this page\'s photos were taken on the page, and says so', async () => {
    const ctx = builderOnStep6(at(2026, 10, 12, 14, 30));
    await openStep6(ctx);
    await tap(megyButton('Add Date Stamp'));
    expect(addTextCalls(ctx)).toEqual([expect.objectContaining({
      type: 'add_text',
      payload: {
        text: 'October 12, 2026',
        // In the photo's corner, not the middle of the page.
        placed: expect.objectContaining({ alignment: 'right', color: '#FFFFFF', shadow: true }),
      },
    })]);
    expect(toast()).toBe('Added the date: October 12, 2026');
  });

  it('a second tap on the same page doesn\'t stack another date on it', async () => {
    const ctx = builderOnStep6(at(2026, 10, 12));
    const withDate = { ...ctx.albumPages[0], textElements: [{ id: 't1', text: 'October 12, 2026', x: 500, y: 700 }] };
    (ctx as { currentPage: unknown }).currentPage = withDate;
    await openStep6(ctx);
    await tap(megyButton('Add Date Stamp'));
    expect(addTextCalls(ctx)).toEqual([]);
    expect(toast()).toBe('This page already has its date: October 12, 2026');
  });

  it('photos with no date (a screenshot, a photo sent through chat): Megy says what to do, and adds nothing', async () => {
    const ctx = builderOnStep6(null);
    await openStep6(ctx);
    await tap(megyButton('Add Date Stamp'));
    expect(addTextCalls(ctx)).toEqual([]);
    expect(toast()).toBe(NO_PHOTO_DATE);
    expect(NO_PHOTO_DATE).toMatch(/Add Text to This Page/);
  });

  it('when the page can\'t take it, Megy passes on the reason', async () => {
    const ctx = builderOnStep6(at(2026, 10, 12));
    ctx.dispatch = vi.fn(async () => ({ success: false, message: "That's too long to fit on the page, even in small letters. Try a shorter line." }));
    await openStep6(ctx);
    await tap(megyButton('Add Date Stamp'));
    expect(toast()).toBe("That's too long to fit on the page, even in small letters. Try a shorter line.");
  });

  describe('on the phone', () => {
    beforeEach(() => {
      Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true, writable: true });
      Object.defineProperty(window, 'innerHeight', { value: 844, configurable: true, writable: true });
    });
    it('Megy folds up after the stamp, so the page with its date shows', async () => {
      const ctx = builderOnStep6(at(2026, 10, 12));
      await openStep6(ctx);
      await tap(document.querySelector('[aria-label="Open Megy"]'));
      expect(document.querySelector('[aria-label="Open Megy"]')).toBeNull();
      await tap(megyButton('Add Date Stamp'));
      expect(addTextCalls(ctx)).toHaveLength(1);
      expect(document.querySelector('[aria-label="Open Megy"]')).not.toBeNull();
      expect(toast()).toBe('Added the date: October 12, 2026');
    });
    it('no date: Megy stays open, because what it says is the answer', async () => {
      const ctx = builderOnStep6(null);
      await openStep6(ctx);
      await tap(document.querySelector('[aria-label="Open Megy"]'));
      await tap(megyButton('Add Date Stamp'));
      expect(document.querySelector('[aria-label="Open Megy"]')).toBeNull();
      expect(toast()).toBe(NO_PHOTO_DATE);
    });
  });

  it('every Step 6 button does something', async () => {
    const ctx = builderOnStep6(at(2026, 10, 12));
    await openStep6(ctx);
    await tap(megyButton('Add Text to This Page'));
    expect(addTextCalls(ctx)).toEqual([expect.objectContaining({ type: 'add_text' })]);
    expect(addTextCalls(ctx)[0].payload?.text).toBeUndefined();
    await tap(megyButton('Add Date Stamp'));
    expect(addTextCalls(ctx)).toHaveLength(2);
    await tap(megyButton('Skip to Finalize →'));
    expect(ctx.setWizardStep).toHaveBeenLastCalledWith('finalize');
  });
});
