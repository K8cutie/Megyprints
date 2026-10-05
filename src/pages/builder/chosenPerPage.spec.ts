import { describe, it, expect, vi } from 'vitest';
import { generateAlbum, chosenAlbumPages } from './generateAlbum';
import { DENSITY_BY_SIZE, MIN_ALBUM_PAGES } from './densities';
import type { AlbumPage, AlbumSizePreset, UploadedPhoto } from './types';
import { seedMathRandom, mulberry32 } from '../../test/seededRandom';

seedMathRandom(); // registers the seeding hooks; each album below re-seeds explicitly

/* ══════════════════════════════════════════════════════════════════════════
   WHAT THE UPLOAD STEP SAYS IS WHAT GETS MADE (1-star testers round 3, the
   Hoarder): "4 · Collage" on 196 photos made 59 pages and ₱513 of extra
   pages, with no estimate before Generate. The upload step now says the page
   count first, so it has to be the album's page count: on every size, at
   every photos-per-page, for a phone roll of mixed shapes taken over several
   days (moments), and no page ever holds more than was chosen (outside fill
   mode a chosen 4 used to deal 5-ups on the big sizes).
   ══════════════════════════════════════════════════════════════════════════ */

const SHAPE = { L: [4032, 3024], P: [3024, 4032], S: [1440, 1440], W: [1920, 1080] } as const;
/** A phone roll: mostly landscape and portrait, some square, a few wide; a
 *  new moment (a 5-hour gap) every 20-40 shots. Same roll every run. */
function phoneRoll(n: number): UploadedPhoto[] {
  const rnd = mulberry32(n * 7919);
  let t = Date.UTC(2026, 3, 1, 8);
  let nextGap = 20 + Math.floor(rnd() * 20);
  return Array.from({ length: n }, (_, i) => {
    const r = rnd();
    const [width, height] = SHAPE[r < 0.5 ? 'L' : r < 0.85 ? 'P' : r < 0.95 ? 'S' : 'W'];
    if (--nextGap === 0) { t += 5 * 3600_000; nextGap = 20 + Math.floor(rnd() * 20); }
    t += 60_000;
    return { id: `ph-${i}`, previewUrl: '', name: `ph-${i}.jpg`, type: 'image/jpeg', size: 1, width, height, capturedAt: t };
  });
}
const onPage = (p: AlbumPage) => (p.slotFills ?? []).filter((f) => f != null).length;
const gen = (seed: number, photos: UploadedPhoto[], size: AlbumSizePreset, ppp: number) => {
  const spy = vi.spyOn(Math, 'random').mockImplementation(mulberry32(seed));
  try { return generateAlbum(photos, size, ppp); } finally { spy.mockRestore(); }
};

describe('a chosen photos-per-page: the estimate is the album, on every size', () => {
  const sizes = Object.keys(DENSITY_BY_SIZE) as AlbumSizePreset[];
  for (const size of sizes) {
    it(`${size}: every density, 40 to 263 photos — pages = the estimate, none blank, every photo placed, none over the chosen count`, () => {
      for (const n of [40, 61, 97, 140, 199, 263]) {
        const photos = phoneRoll(n);
        for (const ppp of DENSITY_BY_SIZE[size]) {
          const said = chosenAlbumPages(photos, size, ppp)!;
          for (const seed of [1, 2, 3]) {
            const pages = gen(seed, photos, size, ppp);
            const at = `${size}, ${n} photos at ${ppp}, seed ${seed}`;
            expect(pages.length, at).toBe(said.pages);
            expect(pages.length, at).toBeGreaterThanOrEqual(MIN_ALBUM_PAGES);
            expect(pages.filter((p) => onPage(p) === 0), `${at}: blank`).toHaveLength(0);
            expect(new Set(pages.flatMap((p) => (p.slotFills ?? []).filter((f) => f != null))).size, `${at}: placed`).toBe(n);
            expect(Math.max(...pages.map(onPage)), `${at}: most on a page`).toBeLessThanOrEqual(ppp);
          }
        }
      }
    });
  }
});
