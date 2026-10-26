import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { generateAlbum, chosenAlbumPages as estimate, OPENING_FULL_PAGES } from './generateAlbum';
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
  // Round 2 (2026-10-05) let the chosen 4 repeat its layout (62 → 60 pages).
  // Round 3 (2026-10-06) still found 59: the plan made one page in four a 3-up
  // "to breathe", 2 leftover squares went on singles, and six video-memory
  // pages sat in a row on pages 1-7. Now each shape's photos get their own
  // plan at 4: the 176 squares are 44 pages of 4, the 13 portraits 4+3+3+3,
  // and the 7 video-memory singles are spread through the album.
  // 2026-10-21 (owner): pages 1-3 are always full-page photos, on top of the
  // 7 — three squares leave the 4-ups (55 → 58 pages, 10 singles).
  it('58 pages on every seed: 42 of 4, 6 of 3, the 3 opening + 7 video-memory singles and nothing else (it was 72-75, then 62, then 59, then 55 before the opening pages)', () => {
    for (const seed of SEEDS) {
      const pages = gen(seed, roll(0, 196), 4);
      const counts = pages.map(onPage);
      expect(pages.length, `seed ${seed}: pages`).toBe(58);
      expect(counts.filter((c) => c === 4).length, `seed ${seed}: pages of 4`).toBe(42);
      expect(counts.filter((c) => c === 3).length, `seed ${seed}: pages of 3`).toBe(6);
      expect(counts.filter((c) => c === 1).length, `seed ${seed}: single pages`).toBe(OPENING_FULL_PAGES + 7);
      expect(counts.filter((c) => c === 0), `seed ${seed}: blank`).toHaveLength(0);
      expect(new Set(pages.flatMap((p) => (p.slotFills ?? []).filter((f) => f != null))).size, `seed ${seed}`).toBe(196);
    }
  });
  it('the video-memory pages are spread through the album, never bunched (it was pages 1-7, six in a row)', () => {
    for (const seed of SEEDS) {
      const singles = gen(seed, roll(0, 196), 4).map((p, i) => (onPage(p) === 1 ? i : -1)).filter((i) => i >= 0);
      // Pages 1-3 are the opening full pages, together on purpose.
      expect(singles.slice(0, OPENING_FULL_PAGES), `seed ${seed}: the opening`).toEqual([0, 1, 2]);
      const at = singles.slice(OPENING_FULL_PAGES);
      const gaps = at.map((x, i) => x - (i === 0 ? OPENING_FULL_PAGES - 1 : at[i - 1]));
      expect(Math.min(...gaps), `seed ${seed}: singles at pages ${singles.map((i) => i + 1).join(', ')}`).toBeGreaterThanOrEqual(5);
    }
  });
  it('more photos, same rule: 260 at 4 a page make 74 pages (10 singles + 64 of 3-4; it was 82, 36 of them 4-ups)', () => {
    const big = [...Array(260)].map((_, i) => roll(0, 196)[i % 196]).map((p, i) => ({ ...p, id: `big-${i}` }));
    for (const seed of SEEDS.slice(0, 4)) {
      const pages = gen(seed, big, 4);
      expect(pages.length, `seed ${seed}`).toBe(74);
      expect(pages.filter((p) => onPage(p) === 4).length, `seed ${seed}: pages of 4`).toBeGreaterThanOrEqual(58);
    }
  });
  it('130 photos at 4: the 10 full pages + 31 of 3-4 = 41 pages, as the upload step says — never the leftover singles of old', () => {
    // 130 = 10 + 30 × 4 exactly, and the 13 portraits can't share a page with
    // the squares, so one page more than 40. (It was 40 before the opening
    // pages; the 41-42 of old were leftover SINGLES.)
    for (const seed of SEEDS) {
      const pages = gen(seed, roll(66, 196), 4);
      expect(pages.length, `seed ${seed}: what the upload step says`).toBe(estimate(roll(66, 196), '8x8', 4)!.pages);
      expect(pages.length, `seed ${seed}`).toBe(41);
      expect(pages.filter((p) => onPage(p) === 1).length, `seed ${seed}: singles`).toBe(OPENING_FULL_PAGES + 7);
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
  it('too few photos for 4 a page: why, and how many 4 per page needs (the 3 opening + 7 video-memory singles count)', async () => {
    const { photosPerPageNote } = await import('./generateAlbum');
    const photos = roll(70, 120); // 50 squares
    expect(photosPerPageNote(photos, '8x8', 4)).toBe('With 50 photos, most pages get fewer than 4 so all 40 pages are filled. 4 per page needs about 130 photos.');
    expect(photosPerPageNote(roll(66, 186), '8x8', 4)).toBe('With 120 photos, some pages get fewer than 4 so all 40 pages are filled. 4 per page needs about 130 photos.');
    expect(photosPerPageNote(roll(70, 118), '8x8', 3)).toBe('With 48 photos, most pages get fewer than 3 so all 40 pages are filled. 3 per page needs about 100 photos.');
    expect(photosPerPageNote(photos, '8x8', 1)).toBeNull(); // 1 a page is always met
    expect(photosPerPageNote(photos, '8x8', undefined)).toBeNull(); // Surprise
    expect(photosPerPageNote(roll(70, 100), '8x8', 4)).toBeNull(); // under 40 the 40-photo gate speaks instead
  });
});

describe('the upload step says what "4 · Collage" costs BEFORE Generate (round 3, the Hoarder: no page or price estimate)', () => {
  it('196 photos at 4 a page: about 58 pages, 18 extra, and the pesos they add (whole sheets: 15 of 4 pages, 5 more than 40 pages take)', async () => {
    const { photosPerPageNote, chosenAlbumPages } = await import('./generateAlbum');
    const { extraPagesCharge } = await import('../../lib/pricing');
    const schedule = { min_pages: 40, sheet_rate: 106, disabled_sizes: [], sizes: { '8x8': { pps: 4, soft_rate: 600, hard_rate: 1400 } } } as unknown as Parameters<typeof extraPagesCharge>[0];
    expect(photosPerPageNote(roll(0, 196), '8x8', 4, (pages) => extraPagesCharge(schedule, '8x8', 'soft', pages).amount)).toBe(
      '4 per page makes your album: about 58 pages, 18 more than the 40 included, which adds ₱530. That counts 10 full-page photos, where your video memories go.');
    expect(chosenAlbumPages(roll(0, 196), '8x8', 4)).toEqual({ pages: 58, fullPages: 10 });
    // the price schedule not loaded yet: the pages, without pesos
    expect(photosPerPageNote(roll(0, 196), '8x8', 4, null)).toBe(
      '4 per page makes your album: about 58 pages, 18 more than the 40 included. That counts 10 full-page photos, where your video memories go.');
  });
});

describe('the upload step says when the photos\' SHAPES can\'t take the chosen photos-per-page (round 2, the Indecisive one)', () => {
  it('50 squares at "2 per page" on an 8×8: why, how many pages, the way out — and the album really is that size', async () => {
    const { perPageShapeNote } = await import('./generateAlbum');
    const photos = roll(70, 120); // the tester's 50, all square
    expect(perPageShapeNote(photos, '8x8', 2)).toBe(
      "Your square photos can't go 2 to a page on an 8×8 (its 2-photo layouts take portrait or landscape photos), so they go one to a page: about 50 pages, 10 more than the 40 included. Pick Surprise and Megy mixes in bigger layouts for fewer pages.");
    expect(perPageShapeNote(photos, '8x8', 2, () => 318)).toContain('about 50 pages, 10 more than the 40 included, which adds ₱318.');
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
  it('the upload card shows the note, with what the extra pages add on the live schedule (source guard)', () => {
    const src = readFileSync(resolve(__dirname, '../../assistant/MegyAssistant.tsx'), 'utf8');
    expect(src).toMatch(/const note = photosPerPageNote\(livePhotos, builder\.albumSize, builder\.photosPerPage,\s+schedule \? \(pages\) => extraPagesCharge\(schedule, builder\.albumSize, 'soft', pages\)\.amount : null\);/);
  });
});
