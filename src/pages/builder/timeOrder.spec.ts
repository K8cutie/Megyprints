import { describe, it, expect, vi } from 'vitest';
import { generateAlbum, chosenAlbumPages, TIME_ORDER_REACH, OPENING_FULL_PAGES } from './generateAlbum';
import { DENSITY_BY_SIZE, MIN_ALBUM_PAGES } from './densities';
import type { AlbumPage, AlbumSizePreset, UploadedPhoto } from './types';
import { seedMathRandom, mulberry32 } from '../../test/seededRandom';

seedMathRandom(); // registers the seeding hooks; each album below re-seeds explicitly

/* ══════════════════════════════════════════════════════════════════════════
   PHOTOS IN THE ORDER THEY WERE TAKEN (owner's brother, 2026-10-20: "trying
   it but it's not working"). The album sorted photos by capture time, then
   dealt each "moment" SHAPE BY SHAPE — every landscape page, then every
   portrait page, round-robin — so a 3-hour party (one moment) came out in
   shape order, not time order. Now every page starts with the earliest photo
   not yet placed, so the pages read forward through the day, and outside a
   chosen photos-per-page a page never reaches more than TIME_ORDER_REACH
   photos ahead to fill its frames.
   ══════════════════════════════════════════════════════════════════════════ */

const SHAPE = { L: [4032, 3024], P: [3024, 4032], S: [1440, 1440], W: [1920, 1080] } as const;

/** A phone roll of one event, a minute between shots: mostly portrait (a
 *  phone held upright), landscapes sprinkled through, a few squares and wides.
 *  Same roll every run. `gaps` adds a 5-hour gap every 20-40 shots (several
 *  moments). */
function roll(n: number, gaps = false): UploadedPhoto[] {
  const rnd = mulberry32(n * 7919 + (gaps ? 1 : 0));
  let t = Date.UTC(2026, 9, 18, 9);
  let nextGap = 20 + Math.floor(rnd() * 20);
  return Array.from({ length: n }, (_, i) => {
    const r = rnd();
    const [width, height] = SHAPE[r < 0.6 ? 'P' : r < 0.88 ? 'L' : r < 0.95 ? 'S' : 'W'];
    if (gaps && --nextGap === 0) { t += 5 * 3600_000; nextGap = 20 + Math.floor(rnd() * 20); }
    t += 60_000;
    return { id: `ph-${i}`, previewUrl: '', name: `ph-${i}.jpg`, type: 'image/jpeg', size: 1, width, height, capturedAt: t };
  });
}
const fills = (p: AlbumPage) => (p.slotFills ?? []).filter((f): f is number => f != null);
const gen = (seed: number, photos: UploadedPhoto[], size: AlbumSizePreset, ppp?: number) => {
  const spy = vi.spyOn(Math, 'random').mockImplementation(mulberry32(seed));
  try { return generateAlbum(photos, size, ppp); } finally { spy.mockRestore(); }
};

/** The pages read forward: each page's EARLIEST photo was taken no earlier
 *  than the page before it started. (Photo index = time: the roll is sorted.)
 *  A full-page single (a video-memory page) is stepped one page later or
 *  earlier so two full pages never face each other, so it may sit one page
 *  from its slot: never earlier than the page two before it, never later
 *  than the page two after. */
function expectForward(album: AlbumPage[], at: string) {
  // Pages 1-3 are the opening full pages: the earliest photos that FIT a full
  // page, in order. The album reads forward from page 4, which starts with
  // the photos the opening skipped (a portrait on a square page).
  const opening = album.slice(0, OPENING_FULL_PAGES).map(fills);
  expect(opening.every((f) => f.length === 1), `${at}: pages 1-3 hold one photo each`).toBe(true);
  expect(opening.flat(), `${at}: the opening pages in time order`).toEqual(opening.flat().sort((a, b) => a - b));
  const pages = album.slice(OPENING_FULL_PAGES);
  const n0 = OPENING_FULL_PAGES; // page numbers in the messages count the opening
  const starts = pages.map((p) => { const f = fills(p); return f.length ? Math.min(...f) : null; });
  let last = -1;
  for (const [i, p] of pages.entries()) {
    const f = fills(p);
    if (!f.length) continue;
    const first = starts[i]!;
    if (f.length === 1) {
      const before = starts[i - 2] ?? -1;
      const after = starts[i + 2] ?? Infinity;
      expect(first, `${at}: single page ${n0 + i + 1} holds photo ${first}, before page ${n0 + i - 1} started at ${before}`).toBeGreaterThanOrEqual(before);
      expect(first, `${at}: single page ${n0 + i + 1} holds photo ${first}, after page ${n0 + i + 3} starts at ${after}`).toBeLessThanOrEqual(after);
      continue;
    }
    expect(first, `${at}: page ${n0 + i + 1} starts at photo ${first}, after page ${n0 + i} started at ${last}`).toBeGreaterThanOrEqual(last);
    last = first;
  }
}

describe('photos go on the pages in the order they were taken', () => {
  const sizes = Object.keys(DENSITY_BY_SIZE) as AlbumSizePreset[];

  for (const size of sizes) {
    it(`${size}: Surprise/auto — pages read forward and no page reaches more than ${TIME_ORDER_REACH} photos ahead`, () => {
      for (const n of [40, 97, 199]) {
        for (const gaps of [false, true]) {
          const photos = roll(n, gaps);
          for (const seed of [1, 2, 3]) {
            const pages = gen(seed, photos, size);
            const at = `${size}, ${n} photos${gaps ? ' over several days' : ''}, auto, seed ${seed}`;
            expect(new Set(pages.flatMap(fills)).size, `${at}: placed`).toBe(n);
            expect(pages.length, at).toBeGreaterThanOrEqual(MIN_ALBUM_PAGES);
            expectForward(pages, at);
            // A page reaches over the photos NOT YET PLACED when it is dealt:
            // the memory photos are reserved for their full pages before the
            // rest, and an earlier page may have taken a photo from ahead.
            const reserved = new Set(pages.flatMap((p) => (fills(p).length === 1 ? fills(p) : [])));
            const placed = new Set<number>();
            for (const [i, p] of pages.entries()) {
              const f = fills(p);
              if (f.length < 2) { f.forEach((x) => placed.add(x)); continue; }
              const lo = Math.min(...f), hi = Math.max(...f);
              let ahead = 0; // photos after the page's first, up to its last, still unplaced then
              for (let x = lo + 1; x <= hi; x++) if (!reserved.has(x) && !placed.has(x)) ahead++;
              expect(ahead, `${at}: page ${i + 1} holds ${f.join(',')}`).toBeLessThan(TIME_ORDER_REACH);
              f.forEach((x) => placed.add(x));
            }
          }
        }
      }
    });

    it(`${size}: a chosen photos-per-page — pages read forward and the estimate is still the album`, () => {
      for (const n of [40, 97, 199]) {
        const photos = roll(n, true);
        for (const ppp of DENSITY_BY_SIZE[size]) {
          const said = chosenAlbumPages(photos, size, ppp)!;
          for (const seed of [1, 2]) {
            const pages = gen(seed, photos, size, ppp);
            const at = `${size}, ${n} photos at ${ppp}, seed ${seed}`;
            expect(pages.length, at).toBe(said.pages);
            expect(new Set(pages.flatMap(fills)).size, `${at}: placed`).toBe(n);
            expectForward(pages, at);
          }
        }
      }
    });
  }

  it('a party of 3 hours is one moment: it still reads forward page by page', () => {
    const photos = roll(120); // 120 shots a minute apart: 2 hours, one moment
    for (const size of sizes) {
      const pages = gen(7, photos, size);
      expectForward(pages, `${size}, one moment`);
    }
  });
});
