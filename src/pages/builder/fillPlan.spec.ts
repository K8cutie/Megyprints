import { describe, it, expect } from 'vitest';
import { generateAlbum, planPageCounts } from './generateAlbum';
import { MIN_ALBUM_PAGES } from './densities';
import type { AlbumSizePreset, UploadedPhoto } from './types';

/* ══════════════════════════════════════════════════════════════════════════
   FILL MODE KEEPS ITS RHYTHM (owner, 2026-09-12).
   "When single photos fill the rest, the randomness disappears in the latter
   pages." Fill mode used to drop the WHOLE album to one density (60 photos →
   sixty single pages). Now the per-page counts are planned across the album:
   sum exact, page count on the minimum or a little above, counts varied,
   never denser than the cap. These lock the planner and the albums it deals.
   ══════════════════════════════════════════════════════════════════════════ */

const longestRun = (xs: number[]) => { let best = 0, cur = 0, prev = -1; for (const x of xs) { cur = x === prev ? cur + 1 : 1; prev = x; best = Math.max(best, cur); } return best; };
/** The longest run an EVEN spread can avoid: when one count holds `major` of
 *  `n` pages, the others can only break it every ceil(major / (n − major))
 *  pages. Anything under that plus slack is "varied"; a true collapse (all
 *  one count) is what these specs catch. */
const runBound = (xs: number[], slack: number) => {
  const freq: Record<number, number> = {}; xs.forEach((x) => { freq[x] = (freq[x] ?? 0) + 1; });
  const major = Math.max(...Object.values(freq));
  const rest = xs.length - major;
  return rest === 0 ? Infinity : Math.max(3, Math.ceil(major / rest)) + slack;
};

describe('planPageCounts', () => {
  it('sum is exact, pages ≥ minimum, counts within [1, cap], no run longer than 3', () => {
    for (let run = 0; run < 3; run++) {
      for (const cap of [2, 3, 4]) {
        for (let n = 41; n <= 240; n += 7) {
          const plan = planPageCounts(n, MIN_ALBUM_PAGES, cap);
          const sum = plan.reduce((a, b) => a + b, 0);
          expect(sum, `n=${n} cap=${cap} sum`).toBe(n);
          expect(plan.length, `n=${n} cap=${cap} pages`).toBeGreaterThanOrEqual(MIN_ALBUM_PAGES);
          expect(Math.max(...plan), `n=${n} cap=${cap} max`).toBeLessThanOrEqual(cap);
          expect(Math.min(...plan), `n=${n} cap=${cap} min`).toBeGreaterThanOrEqual(1);
          if (n > MIN_ALBUM_PAGES + 4) expect(longestRun(plan), `n=${n} cap=${cap} run ${JSON.stringify(plan)}`).toBeLessThanOrEqual(runBound(plan, 1));
        }
      }
    }
  });
  it('fewer photos than pages → one per page (the blanks are unavoidable)', () => {
    expect(planPageCounts(24, 40, 4)).toEqual(new Array(24).fill(1));
    expect(planPageCounts(0, 40, 4)).toEqual([]);
  });
  it('a 60-photo album is a 1-and-2 mix over 40 pages, not sixty singles', () => {
    const plan = planPageCounts(60, 40, 3);
    expect(plan.length).toBe(40);
    expect(new Set(plan).size).toBeGreaterThanOrEqual(2);
    expect(plan.filter((c) => c === 1).length).toBeGreaterThan(5);
    expect(plan.filter((c) => c >= 2).length).toBeGreaterThan(5);
  });
});

const sq = (n: number): UploadedPhoto[] => Array.from({ length: n }, (_, i) => ({ id: `q${i}`, previewUrl: '', name: `q${i}.jpg`, type: 'image/jpeg', size: 1, width: 3000, height: 3000, capturedAt: i }));
const mixed = (n: number): UploadedPhoto[] => Array.from({ length: n }, (_, i) => { const p = i % 5 >= 3; return { id: `p${i}`, previewUrl: '', name: `p${i}.jpg`, type: 'image/jpeg', size: 1, width: p ? 3024 : 4032, height: p ? 4032 : 3024, capturedAt: i }; });
const counts = (pages: ReturnType<typeof generateAlbum>) => pages.map((p) => (p.slotFills ?? []).filter((f) => f != null).length);

describe('generated albums in fill mode keep changing count', () => {
  for (const size of ['6x6', '8x8', '9x9', '8x6', '6x8'] as AlbumSizePreset[]) {
    it(`${size} AUTO with 60 / 90 / 110 photos: ≥ 40 pages, no blanks, at least two counts, no run over 4`, () => {
      for (const n of [60, 90, 110]) {
        for (const photos of [sq(n), mixed(n)]) {
          const c = counts(generateAlbum(photos, size));
          expect(c.length, `${size}/${n}: pages`).toBeGreaterThanOrEqual(MIN_ALBUM_PAGES);
          expect(c.filter((x) => x === 0).length, `${size}/${n}: blanks`).toBe(0);
          expect(c.reduce((a, b) => a + b, 0), `${size}/${n}: placed`).toBe(n);
          expect(new Set(c).size, `${size}/${n}: distinct counts`).toBeGreaterThanOrEqual(2);
          // Two pages of slack over the even-spread bound: a ratio queue can run
          // short and hand a planned count to the next page. The failure this
          // catches is the old collapse — forty identical pages.
          expect(longestRun(c), `${size}/${n}: longest run ${JSON.stringify(c)}`).toBeLessThanOrEqual(runBound(c, 2));
          expect(longestRun(c), `${size}/${n}: collapsed`).toBeLessThan(c.length / 2);
        }
      }
    });
  }
  it('8x8 "Collage" (4/page) with 60 and 100 photos: varied, never denser than 4, no blanks', () => {
    for (const n of [60, 100]) {
      const c = counts(generateAlbum(sq(n), '8x8', 4));
      expect(c.length).toBeGreaterThanOrEqual(MIN_ALBUM_PAGES);
      expect(c.filter((x) => x === 0).length).toBe(0);
      expect(Math.max(...c)).toBeLessThanOrEqual(4);
      expect(new Set(c).size).toBeGreaterThanOrEqual(2);
      expect(longestRun(c)).toBeLessThanOrEqual(runBound(c, 2));
    }
  });
});
