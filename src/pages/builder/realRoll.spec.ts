import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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
  // Round 2 (2026-10-05): the chosen 4 is honoured — the one square 4-up may
  // repeat and the rhythm rule no longer pushes every other page to a 3-up
  // (it was 62 pages with only 27-28 holding 4). The plan still lets about one
  // page in four breathe below 4, and 7 pages are the video-memory singles; the
  // 13 portraits split 4+4+4+1, so a 10th single can appear.
  it('close to 4 a page: ≤ 61 pages (it was 72-75, then 62), ≥ 34 pages of 4, ≤ 10 singles (7 are the video-memory pages) — every photo placed', () => {
    for (const seed of SEEDS) {
      const pages = gen(seed, roll(0, 196), 4);
      const singles = pages.filter((p) => onPage(p) === 1).length;
      expect(pages.length, `seed ${seed}: pages`).toBeLessThanOrEqual(61);
      expect(pages.filter((p) => onPage(p) === 4).length, `seed ${seed}: pages of 4`).toBeGreaterThanOrEqual(34);
      expect(singles, `seed ${seed}: single pages`).toBeLessThanOrEqual(10);
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

describe('the upload step says when the photos\' SHAPES can\'t take the chosen photos-per-page (round 2, the Indecisive one)', () => {
  it('50 squares at "2 per page" on an 8×8: why, how many pages, the way out — and the album really is that size', async () => {
    const { perPageShapeNote } = await import('./generateAlbum');
    const photos = roll(70, 120); // the tester's 50, all square
    expect(perPageShapeNote(photos, '8x8', 2)).toBe(
      "Your square photos can't go 2 to a page on an 8×8 (its 2-photo layouts take portrait or landscape photos), so they go one to a page: about 50 pages, 10 more than the 40 included. Pick Surprise and Megy mixes in bigger layouts for fewer pages.");
    expect(gen(1, photos, 2)).toHaveLength(50); // what the note says is what happens
    expect(gen(1, photos)).toHaveLength(40); // Surprise fits 40
  });
  it('no note when the shapes fit, for Surprise, or for 1 per page', async () => {
    const { perPageShapeNote } = await import('./generateAlbum');
    const portraits: UploadedPhoto[] = Array.from({ length: 40 }, (_, i) => ({ id: `pt-${i}`, previewUrl: '', name: `pt-${i}.jpg`, type: 'image/jpeg', size: 1, width: 1440, height: 2160 }));
    expect(perPageShapeNote(portraits, '8x8', 2)).toBeNull();
    expect(perPageShapeNote(roll(70, 120), '8x8', undefined)).toBeNull();
    expect(perPageShapeNote(roll(70, 120), '8x8', 1)).toBeNull();
  });
  it('the upload card shows the shape note first (source guard)', () => {
    const src = readFileSync(resolve(__dirname, '../../assistant/MegyAssistant.tsx'), 'utf8');
    expect(src).toMatch(/const note = perPageShapeNote\(livePhotos, builder\.albumSize, builder\.photosPerPage\) \?\? perPageNote\(livePhotos\.length, builder\.photosPerPage\);/);
  });
});
