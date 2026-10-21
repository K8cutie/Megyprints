import { describe, it, expect } from 'vitest';
import { generateAlbum, dealAlbumBoxes, canTakeMemoryQr, layoutHoldsMemory, memorySingleTemplate, MIN_MEMORY_PAGES, OPENING_FULL_PAGES, type BoxContentOptions } from './generateAlbum';
import { getTemplateById } from './pageTemplates';
import { MIN_ALBUM_PAGES } from './densities';
import type { AlbumPage, AlbumSizePreset, UploadedPhoto } from './types';
import { seedMathRandom, mulberry32 } from '../../test/seededRandom';

seedMathRandom(); // same albums every run (generateAlbum deals with Math.random)

/* ══════════════════════════════════════════════════════════════════════════
   THE ALBUM OPENS ON THREE FULL PAGES (owner, 2026-10-21): "make the first 3
   pages always 1 page full bleed". Pages 1, 2 and 3 are each one photo over
   the whole page. Which photos: the EARLIEST that fit a full page, so the
   album still opens in the order the photos were taken and no heads or feet
   are cut — a portrait on a square album keeps its normal place. They are
   EXTRA: the 7 video-memory full pages are still spread through the album.
   ══════════════════════════════════════════════════════════════════════════ */

const SIZES: AlbumSizePreset[] = ['6x6', '8x8', '9x9', '6x4', '8x6', '6x8', '11.5x8', '8.5x11'];
const PAGE_ASPECT: Record<string, number> = {
  '6x4': 6 / 4, '8x6': 8 / 6, '6x8': 6 / 8, '6x6': 1, '8x8': 1, '9x9': 1, '11.5x8': 11.5 / 8, '8.5x11': 8.5 / 11,
};
const SHAPE = { L: [4032, 3024], P: [3024, 4032], S: [3000, 3000] } as const;
type Shape = keyof typeof SHAPE;

/** The spec's own statement of the crop rule. A photo FITS a full page when
 *  the page takes at most 12% off its top + bottom or 34% off its sides. A
 *  short album may also take up to 25% off the top + bottom. Never a
 *  portrait on a landscape page or a landscape on a portrait page. */
const cut = (p: UploadedPhoto, size: string) => {
  const a = p.width / p.height, g = PAGE_ASPECT[size];
  return { crop: 1 - Math.min(a, g) / Math.max(a, g), vertical: a < g };
};
const fits = (p: UploadedPhoto, size: string) => {
  const { crop, vertical } = cut(p, size);
  return vertical ? crop <= 0.12 + 1e-9 : crop <= 0.34 + 1e-9;
};
const crosses = (p: UploadedPhoto, size: string) => {
  const o = (x: number) => (x > 1.05 ? 'L' : x < 0.95 ? 'P' : 'S');
  const po = o(p.width / p.height), pg = o(PAGE_ASPECT[size]);
  return (po === 'L' && pg === 'P') || (po === 'P' && pg === 'L');
};
const allowed = (p: UploadedPhoto, size: string) => {
  if (fits(p, size)) return true;
  if (crosses(p, size)) return false;
  const { crop, vertical } = cut(p, size);
  return vertical ? crop <= 0.25 + 1e-9 : crop <= 0.34 + 1e-9;
};

/** A phone roll, a minute between shots, photo index = time order. */
function roll(n: number, mix: Record<Shape, number>, seed = n): UploadedPhoto[] {
  const rnd = mulberry32(seed * 7919);
  const t0 = Date.UTC(2026, 9, 21, 9);
  return Array.from({ length: n }, (_, i) => {
    let r = rnd();
    let shape: Shape = 'L';
    for (const s of Object.keys(mix) as Shape[]) { if (r < mix[s]) { shape = s; break; } r -= mix[s]; }
    const [width, height] = SHAPE[shape];
    return { id: `ph-${i}`, previewUrl: '', name: `ph-${i}.jpg`, type: 'image/jpeg', size: 1, width, height, capturedAt: t0 + i * 60_000 };
  });
}
const MIXES: Record<string, Record<Shape, number>> = {
  phone: { P: 0.6, L: 0.35, S: 0.05 },
  landscape: { P: 0.1, L: 0.85, S: 0.05 },
  portrait: { P: 0.9, L: 0.08, S: 0.02 },
};
const BOX: BoxContentOptions = { quotePool: Array.from({ length: 400 }, (_, i) => `Line ${i}`), quoteFontFamily: 'Playfair Display', quoteColor: '#2D2D2D' };

const tpl = (p: AlbumPage) => (p.templateId ? getTemplateById(p.templateId) : undefined);
const fills = (p: AlbumPage) => [...(p.slotFills ?? []), ...(p.textSlotFills ?? [])].filter((f): f is number => f != null);
/** One photo over the whole page, no box. */
const isFullPage = (p: AlbumPage | undefined) => {
  const t = p && tpl(p);
  return !!t && layoutHoldsMemory(t) && (p!.slotFills ?? []).filter((f) => f != null).length === 1;
};
/** What pages 1–3 must hold: the earliest photos that fit (enough of them),
 *  else the earliest a full page may take at all. */
const expectedOpening = (photos: UploadedPhoto[], size: string) => {
  const idx = photos.map((_, i) => i);
  const picks = idx.filter((i) => fits(photos[i], size)).slice(0, OPENING_FULL_PAGES);
  for (const i of idx) if (picks.length < OPENING_FULL_PAGES && !picks.includes(i) && allowed(photos[i], size)) picks.push(i);
  return picks.sort((a, b) => a - b);
};

describe('pages 1, 2 and 3 are full-page photos', () => {
  expect(OPENING_FULL_PAGES).toBe(3);

  for (const size of SIZES) {
    it(`${size}: every album opens on the earliest photos that fit a full page`, () => {
      expect(memorySingleTemplate(size), `${size} has a full-page layout`).toBeDefined();
      for (const n of [40, 60, 100, 200]) for (const [mixName, mix] of Object.entries(MIXES)) for (const density of [undefined, 2, 3]) {
        const at = `${size}/${mixName}${n}/${density ?? 'auto'}`;
        const photos = roll(n, mix);
        const pages = generateAlbum(photos, size, density);
        // All three whenever the roll has three photos a full page may take
        // (a mostly-portrait roll on a landscape album may not: a portrait is
        // never stretched across a landscape page).
        const want = expectedOpening(photos, size);
        if (mixName !== 'portrait' || PAGE_ASPECT[size] <= 1) expect(want.length, `${at}: the roll has 3 photos a full page may take`).toBe(OPENING_FULL_PAGES);
        for (let i = 0; i < want.length; i++) {
          expect(isFullPage(pages[i]), `${at}: page ${i + 1} is one photo over the whole page`).toBe(true);
        }
        expect(pages.slice(0, want.length).map((p) => fills(p)[0]), `${at}: the earliest photos that fit, in time order`).toEqual(want);
      }
    });
  }

  it('a portrait never opens a square album when there are landscapes to take: heads and feet stay', () => {
    // Portraits first, then landscapes: the opening skips the portraits.
    const photos = [...roll(10, { P: 1, L: 0, S: 0 }, 1), ...roll(50, { P: 0.5, L: 0.5, S: 0 }, 2)]
      .map((p, i) => ({ ...p, id: `ph-${i}`, capturedAt: i * 60_000 }));
    for (const size of ['6x6', '8x8', '9x9'] as AlbumSizePreset[]) {
      const pages = generateAlbum(photos, size);
      for (let i = 0; i < OPENING_FULL_PAGES; i++) {
        const p = photos[fills(pages[i])[0]];
        expect(p.width >= p.height, `${size} page ${i + 1} holds a landscape or square`).toBe(true);
      }
      // The skipped portraits keep their place at the start of the rest.
      expect(fills(pages[OPENING_FULL_PAGES]), `${size}: page 4 starts with the first photo taken`).toContain(0);
    }
  });

  it('an album short of photos that fit takes the earliest a full page may take, never one whose face the crop cuts', () => {
    // An all-portrait roll on a square album: no portrait fits (25% off the
    // top + bottom), so the opening takes the earliest allowed — skipping
    // the ones whose known face sits in the cut band.
    const photos = roll(60, { P: 1, L: 0, S: 0 }, 3);
    const faceCenters = { 0: { x: 0.5, y: 0.05 }, 1: { x: 0.5, y: 0.5 }, 2: { x: 0.5, y: 0.95 }, 3: { x: 0.5, y: 0.4 }, 4: { x: 0.5, y: 0.6 } };
    const pages = generateAlbum(photos, '8x8', undefined, undefined, { faceCenters });
    expect(pages.slice(0, OPENING_FULL_PAGES).map((p) => fills(p)[0])).toEqual([1, 3, 4]);
  });

  it('never across orientation: an all-portrait roll on a landscape album opens on its normal pages', () => {
    // (11.5x8 is left out: its deck has no portrait single that keeps the
    // photo's shape, so its own layout stretches portraits — a separate fix.)
    for (const size of ['8x6', '6x4'] as AlbumSizePreset[]) {
      const photos = roll(60, { P: 1, L: 0, S: 0 }, 4);
      const pages = generateAlbum(photos, size);
      for (const p of pages) if (isFullPage(p)) expect(crosses(photos[fills(p)[0]], size), `${size}: a portrait on a full landscape page`).toBe(false);
      expect(isFullPage(pages[0]), `${size}: page 1 is a normal page`).toBe(false);
    }
  });
});

describe('the opening pages are extra', () => {
  for (const size of SIZES) {
    it(`${size}: the 7 video-memory pages are still there, after page 3, and no photo is lost`, () => {
      for (const n of [40, 60, 100, 200]) for (const [mixName, mix] of Object.entries(MIXES)) {
        const at = `${size}/${mixName}${n}`;
        const photos = roll(n, mix);
        const pages = generateAlbum(photos, size);
        dealAlbumBoxes(pages, BOX);
        const allowedCount = photos.filter((p) => allowed(p, size)).length;
        const full = pages.map((p, i) => (canTakeMemoryQr(p) ? i : -1)).filter((i) => i >= 0);
        expect(full.length, `${at}: 3 opening + 7 memory full pages`).toBeGreaterThanOrEqual(Math.min(OPENING_FULL_PAGES + MIN_MEMORY_PAGES, allowedCount));
        const opening = Math.min(OPENING_FULL_PAGES, expectedOpening(photos, size).length);
        expect(full.slice(0, opening), `${at}: the opening pages`).toEqual([0, 1, 2].slice(0, opening));
        // Every photo exactly once.
        const placed = pages.flatMap(fills).sort((a, b) => a - b);
        expect(placed, `${at}: every photo once`).toEqual(photos.map((_, i) => i));
        // Still 40 pages for 40 photos, and never a blank page once the roll can fill 40.
        expect(pages.length, `${at}: at least 40 pages`).toBeGreaterThanOrEqual(MIN_ALBUM_PAGES);
        expect(pages.filter((p) => fills(p).length === 0).length, `${at}: no blank pages`).toBe(0);
      }
    });
  }

  it('page 4 is not a fourth full page in a row (pages 3 and 4 face each other)', () => {
    // The six sizes with their own layouts. (On 11.5x8 and 8.5x11 every
    // box-free single is the same full page, and those decks already let two
    // sit side by side — see dealSingle's breakCadenceForAdjacency.)
    for (const size of ['6x6', '8x8', '9x9', '6x4', '8x6', '6x8'] as AlbumSizePreset[]) {
      let fourth = 0, albums = 0;
      for (const n of [40, 60, 100, 200]) for (const [, mix] of Object.entries(MIXES)) for (let s = 0; s < 5; s++) {
        const pages = generateAlbum(roll(n, mix, n * 10 + s), size);
        albums++;
        if (isFullPage(pages[OPENING_FULL_PAGES])) fourth++;
      }
      // Only where the deck has no other look for that photo.
      expect(fourth / albums, `${size}: ${fourth} of ${albums} albums`).toBeLessThanOrEqual(0.05);
    }
  });
});
