import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  generateAlbum, isFullPagePhoto, memoryFaceCandidates, FULL_PAGE_SHARE, MIN_MEMORY_PAGES, OPENING_FULL_PAGES,
  type GenerateOptions,
} from './generateAlbum';
import type { AlbumPage, AlbumSizePreset, UploadedPhoto } from './types';
import { seedMathRandom, mulberry32 } from '../../test/seededRandom';

seedMathRandom(); // each album below re-seeds explicitly

/* ══════════════════════════════════════════════════════════════════════════
   HALF THE PAGES ARE FULL PAGES (owner, 2026-10-26: "in a 40 page output the
   occurrence of full bleed should be 50%", then "this needs to be tested
   thoroughly"). The agreed rules, each tested below:
     • on Surprise about half the pages are one photo over the whole page;
     • a chosen photos-per-page album is exactly what it was;
     • never more pages than the album had without them;
     • only photos that fit a full page, or whose known face the crop keeps —
       never a cut head — and an album short of those simply has fewer;
     • spread through the album, not bunched.
   ══════════════════════════════════════════════════════════════════════════ */

const SIZES: AlbumSizePreset[] = ['8x8', '6x6', '8x6', '6x8', '6x4'];
type Shape = [number, number];
const L: Shape = [4032, 3024], P: Shape = [3024, 4032], S: Shape = [1440, 1440];
/** A phone roll: 3 landscapes to 2 portraits, a minute apart. */
const phone = (i: number) => (i % 5 < 3 ? L : P);
const squares = (i: number) => (i % 14 === 13 ? [1440, 1875] as Shape : S);
const portraits = (i: number) => (i % 5 === 0 ? L : P);
const roll = (n: number, shape: (i: number) => Shape, extra: (i: number) => Partial<UploadedPhoto> = () => ({})): UploadedPhoto[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `p${i}`, previewUrl: '', name: `p${i}.jpg`, type: 'image/jpeg', size: 1,
    width: shape(i)[0], height: shape(i)[1], capturedAt: 1_700_000_000_000 + i * 60_000, ...extra(i),
  }));
const gen = (seed: number, photos: UploadedPhoto[], size: AlbumSizePreset, ppp?: number, options?: GenerateOptions) => {
  const spy = vi.spyOn(Math, 'random').mockImplementation(mulberry32(seed));
  try { return generateAlbum(photos, size, ppp, undefined, options); } finally { spy.mockRestore(); }
};
const before = (seed: number, photos: UploadedPhoto[], size: AlbumSizePreset, ppp?: number, options?: GenerateOptions) =>
  gen(seed, photos, size, ppp, { ...options, fullPageShare: 0 });
const fullCount = (pages: AlbumPage[]) => pages.filter(isFullPagePhoto).length;
const photosOn = (p: AlbumPage) => (p.slotFills ?? []).filter((f): f is number => f != null);
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

describe('half of a 40-page Surprise album is full pages', () => {
  it('is the agreed share', () => {
    expect(FULL_PAGE_SHARE).toBe(0.5);
  });

  // Where an everyday phone roll has the photos for it, on every seed. With
  // 60-70 photos a page can be one short: each photo shape's pages round up on
  // their own, and the 20th full page would make a 41st page (traced: 60 on
  // an 8×8, seed 1, made 41 pages on every deal with 20).
  const cases: [AlbumSizePreset, number, number][] = [
    ['8x8', 40, 0], ['8x8', 50, 0], ['8x8', 60, 1], ['6x6', 40, 0], ['6x6', 50, 0],
    ['8x6', 40, 0], ['6x8', 70, 1],
  ];
  it.each(cases)('%s, %i phone photos: half the pages, at most %i short (it was 10 to 17 of 40)', (size, n, short) => {
    for (const seed of SEEDS) {
      const pages = gen(seed, roll(n, phone), size);
      const was = before(seed, roll(n, phone), size);
      expect(pages.length, `seed ${seed}`).toBeLessThanOrEqual(was.length);
      expect(fullCount(pages), `seed ${seed}: ${fullCount(pages)} of ${pages.length}`).toBeGreaterThanOrEqual(Math.ceil(pages.length * FULL_PAGE_SHARE) - short);
      expect(fullCount(was), `seed ${seed}`).toBeLessThan(fullCount(pages));
    }
  }, 30_000);

  it('Surprise Me (a reshuffle) gets them too', () => {
    for (const seed of SEEDS) {
      const pages = gen(seed, roll(50, phone), '8x8', undefined, { randomize: true });
      expect(fullCount(pages), `seed ${seed}`).toBeGreaterThanOrEqual(Math.ceil(pages.length * FULL_PAGE_SHARE));
    }
  }, 30_000);

  it('with the share at 0 the album is as it was: the 3 opening pages and the 7 video-memory pages', () => {
    for (const size of ['8x8', '6x6'] as AlbumSizePreset[]) {
      expect(fullCount(before(1, roll(40, phone), size)), size).toBe(OPENING_FULL_PAGES + MIN_MEMORY_PAGES);
    }
  });
});

describe('what never changes', () => {
  it('never more pages than without them; every photo placed once; no blank page', () => {
    for (const size of SIZES) for (const shape of [phone, squares, portraits]) for (const n of [40, 50, 60, 70, 80, 100, 130]) {
      for (const seed of [1, 2, 3]) {
        const photos = roll(n, shape);
        const pages = gen(seed, photos, size);
        const at = `${size} ${shape.name} ${n} seed ${seed}`;
        expect(pages.length, at).toBeLessThanOrEqual(before(seed, photos, size).length);
        expect(pages.length, at).toBeGreaterThanOrEqual(40);
        expect(pages.flatMap(photosOn).sort((a, b) => a - b), `${at}: placed once`).toEqual(photos.map((_, i) => i));
        expect(pages.filter((p) => photosOn(p).length === 0), `${at}: blank`).toEqual([]);
      }
    }
  }, 60_000);

  it('a chosen photos-per-page album is exactly what it was', () => {
    for (const size of SIZES) for (const ppp of [1, 2, 3, 4]) for (const n of [40, 70, 130]) {
      const photos = roll(n, phone);
      expect(gen(2, photos, size, ppp), `${size} ${ppp} per page, ${n} photos`).toEqual(before(2, photos, size, ppp));
    }
  }, 60_000);

  it('the pages 1-3 are still the opening full pages', () => {
    for (const size of SIZES) for (const seed of [1, 2, 3]) {
      const pages = gen(seed, roll(50, phone), size);
      expect(pages.slice(0, OPENING_FULL_PAGES).every(isFullPagePhoto), `${size} seed ${seed}`).toBe(true);
    }
  });
});

describe('only photos that fit a full page — never a cut head', () => {
  // 8×8 pages are square: a portrait loses a quarter top and bottom, so none
  // of these 50 portraits FITS. The video-memory pages may still take the
  // least-bad of them, as before; the extra full pages may not.
  const allPortraits = (extra?: (i: number) => Partial<UploadedPhoto>) => roll(50, () => P, extra);

  it('with no faces known: no extra full pages at all', () => {
    for (const seed of [1, 2, 3]) {
      expect(fullCount(gen(seed, allPortraits(), '8x8')), `seed ${seed}`).toBe(fullCount(before(seed, allPortraits(), '8x8')));
    }
  });

  it('with faces known: the extras take the photos whose face the crop keeps, and never one it would cut', () => {
    // Even photos: the face in the middle (kept). Odd: the face near the top (cut).
    const faceCenters: Record<number, { x: number; y: number }> = {};
    for (let i = 0; i < 50; i++) faceCenters[i] = { x: 0.5, y: i % 2 === 0 ? 0.5 : 0.08 };
    for (const seed of [1, 2, 3]) {
      const pages = gen(seed, allPortraits(), '8x8', undefined, { faceCenters });
      const was = before(seed, allPortraits(), '8x8', undefined, { faceCenters });
      expect(fullCount(pages), `seed ${seed}`).toBeGreaterThan(fullCount(was));
      const cut = pages.filter(isFullPagePhoto).map((p) => photosOn(p)[0]).filter((i) => i % 2 === 1);
      expect(cut, `seed ${seed}: full pages with a cut head`).toEqual([]);
    }
  });

  it('the wrong shape for the size: as many as fit, no more (square photos can\'t fill a 6×4)', () => {
    for (const seed of [1, 2]) {
      expect(fullCount(gen(seed, roll(50, () => S), '6x4')), `seed ${seed}`).toBe(fullCount(before(seed, roll(50, () => S), '6x4')));
    }
  });

  it('asks for the faces whenever fewer photos fit than the full pages wanted', () => {
    // 12 landscapes fit an 8×8 page; 30 portraits don't.
    const photos = roll(42, (i) => (i < 12 ? L : P));
    expect(memoryFaceCandidates(photos, '8x8')).toEqual([]); // enough for the 10 of before
    const asked = memoryFaceCandidates(photos, '8x8', undefined, Math.ceil(40 * FULL_PAGE_SHARE));
    expect(asked.length).toBeGreaterThan(0);
    expect(asked.every((i) => i >= 12)).toBe(true); // only the portraits a crop would need
  });

  it('the builder asks for faces for half a 40-page album on Surprise', () => {
    const src = readFileSync(resolve(__dirname, 'useBuilderState.ts'), 'utf8');
    expect(src).toMatch(/memoryFaceCandidates\(pool, size, undefined,\s*photosPerPage == null \? Math\.ceil\(MIN_ALBUM_PAGES \* FULL_PAGE_SHARE\) : undefined\)/);
  });
});

describe('spread through the album', () => {
  it('after the opening pages, never more than two full pages in a row, and every quarter has its share', () => {
    for (const [size, n] of [['8x8', 40], ['8x8', 50], ['6x6', 50], ['8x8', 60], ['8x6', 40], ['6x8', 70]] as [AlbumSizePreset, number][]) {
      for (const seed of SEEDS) {
        const pages = gen(seed, roll(n, phone), size);
        const full = pages.map(isFullPagePhoto);
        let run = 0, longest = 0;
        full.forEach((f, i) => { if (i < OPENING_FULL_PAGES) return; run = f ? run + 1 : 0; longest = Math.max(longest, run); });
        const at = `${size} ${n} seed ${seed}: ${full.map((f) => (f ? 'F' : '.')).join('')}`;
        expect(longest, at).toBeLessThanOrEqual(2);
        for (let q = 0; q < 4; q++) {
          const part = full.slice(Math.floor((q * pages.length) / 4), Math.floor(((q + 1) * pages.length) / 4));
          expect(part.filter(Boolean).length, `${at}: quarter ${q + 1}`).toBeGreaterThanOrEqual(3);
        }
      }
    }
  }, 30_000);
});
