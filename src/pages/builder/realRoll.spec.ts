import { describe, it, expect, vi } from 'vitest';
import { generateAlbum } from './generateAlbum';
import type { AlbumPage, UploadedPhoto } from './types';
import { seedMathRandom, mulberry32 } from '../../test/seededRandom';

seedMathRandom(); // registers the seeding hooks; each album below re-seeds explicitly

/* ══════════════════════════════════════════════════════════════════════════
   A REAL ROLL (1-star testers, 2026-10-04). The owner's 196 holiday photos as
   the app measured them — 1440×1440 squares and 1440×1875 portraits, in their
   order (only the shapes; no names, no dates). Earlier sweeps used made-up
   camera shapes and passed, while this roll:
     • left pages 39-40 BLANK with 42 photos on an 8×8 (the Guest) — a page
       took MORE photos than planned and the album ran out early;
     • made 73 pages, 28 of them single, from 196 photos at "4 per page" (the
       Hoarder) — the one square 4-up couldn't repeat, so every other page
       broke to a SINGLE.
   ══════════════════════════════════════════════════════════════════════════ */

const SHAPES = 'S'.repeat(178) + 'P'.repeat(13) + 'S'.repeat(5);
const roll = (from: number, to: number): UploadedPhoto[] => [...SHAPES.slice(from, to)].map((s, i) => ({
  id: `hk-${from + i}`, previewUrl: '', name: `hk-${from + i}.jpg`, type: 'image/jpeg', size: 1,
  width: 1440, height: s === 'S' ? 1440 : 1875,
}));
const onPage = (p: AlbumPage) => (p.slotFills ?? []).filter((f) => f != null).length;
const gen = (seed: number, photos: UploadedPhoto[], ppp?: number) => {
  const spy = vi.spyOn(Math, 'random').mockImplementation(mulberry32(seed));
  try { return generateAlbum(photos, '8x8', ppp); } finally { spy.mockRestore(); }
};
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

describe('the Guest: 42 real photos on an 8×8, Surprise', () => {
  it('40 pages, NONE blank, every photo placed — on every seed', () => {
    expect(SHAPES.slice(140, 182)).toBe('S'.repeat(38) + 'P'.repeat(4)); // the tester's 42
    for (const seed of SEEDS) {
      const pages = gen(seed, roll(140, 182));
      expect(pages.length, `seed ${seed}`).toBe(40);
      expect(pages.filter((p) => onPage(p) === 0), `seed ${seed}: blank pages`).toHaveLength(0);
      expect(new Set(pages.flatMap((p) => (p.slotFills ?? []).filter((f) => f != null))).size, `seed ${seed}`).toBe(42);
    }
  });
});

describe('the Hoarder: all 196 at "4 · Collage"', () => {
  it('close to 4 a page: ≤ 64 pages (it was 72-75) and ≤ 9 singles (7 are the video-memory pages) — every photo placed', () => {
    for (const seed of SEEDS) {
      const pages = gen(seed, roll(0, 196), 4);
      const singles = pages.filter((p) => onPage(p) === 1).length;
      expect(pages.length, `seed ${seed}: pages`).toBeLessThanOrEqual(64);
      expect(singles, `seed ${seed}: single pages`).toBeLessThanOrEqual(9);
      expect(pages.filter((p) => onPage(p) === 0), `seed ${seed}: blank`).toHaveLength(0);
      expect(new Set(pages.flatMap((p) => (p.slotFills ?? []).filter((f) => f != null))).size, `seed ${seed}`).toBe(196);
    }
  });
});

describe('every slice of the roll from 40 to 196 photos fills all 40 pages', () => {
  it('no blank page at any size of album, at Surprise and at each photos-per-page', () => {
    for (const n of [40, 42, 45, 50, 60, 80, 100, 120, 150, 196]) {
      for (const ppp of [undefined, 1, 2, 3, 4]) {
        const pages = gen(3, roll(196 - n, 196), ppp);
        expect(pages.filter((p) => onPage(p) === 0), `${n} photos at ${ppp ?? 'Surprise'}`).toHaveLength(0);
        expect(pages.length, `${n} photos at ${ppp ?? 'Surprise'}`).toBeGreaterThanOrEqual(40);
      }
    }
  });
});

describe('the upload card says when photos-per-page will be lowered', () => {
  it('50 photos at 4 per page: why, and how many 4 per page needs', async () => {
    const { perPageNote } = await import('./densities');
    expect(perPageNote(50, 4)).toBe('With 50 photos, most pages get fewer than 4 so all 40 pages are filled. 4 per page needs about 160 photos.');
    expect(perPageNote(50, 2)).toBe('With 50 photos, most pages get fewer than 2 so all 40 pages are filled. 2 per page needs about 80 photos.');
    expect(perPageNote(196, 4)).toBeNull(); // enough
    expect(perPageNote(50, 1)).toBeNull(); // 1 a page is always met
    expect(perPageNote(50, undefined)).toBeNull(); // Surprise
    expect(perPageNote(30, 4)).toBeNull(); // under 40 the 40-photo gate speaks instead
  });
});
