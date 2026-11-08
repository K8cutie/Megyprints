import { describe, it, expect, vi } from 'vitest';
import { generateAlbum, chosenAlbumPages, planScenes, distanceM, SCENE_GAP_MS, SCENE_MOVE_M } from './generateAlbum';
import { DENSITY_BY_SIZE, MIN_ALBUM_PAGES } from './densities';
import type { AlbumPage, AlbumSizePreset, UploadedPhoto } from './types';
import { seedMathRandom, mulberry32 } from '../../test/seededRandom';

seedMathRandom(); // registers the seeding hooks; each album below re-seeds explicitly

/* ════════════════════════════════════════════════════════════════════════
   SCENES (owner, 2026-11-09): "if the gap is big then that picture might not
   be related to the group of pictures clustered within 5 mins of each other".
   Inside a moment (3 hours), photos more than SCENE_GAP_MS apart, or taken
   more than SCENE_MOVE_M apart, start a new scene, and the dealer keeps a
   page inside the leading scene when it can: the plan's counts are dealt in
   the order that fits the scenes, a page ends at a scene when the plan's
   room pays for it, a lone photo of its shape joins the next scene's.
   A page is a price, so the scenes never add a page: the album with scenes
   has at most the page count the album without them has (the layout is
   made both ways and the no-scene one is the budget), and at a chosen
   photos-per-page the count the upload step said.

   What this cannot do (measured 2026-11-09, 150 albums): a page holds one
   photo shape (mixed-shape pages are off in fill mode), and a burst of five
   phone shots is usually three shapes, so most pages that hold two scenes
   hold a lone landscape or square beside the next burst's. The scenes take
   away about a tenth of those pages overall, a third where the album has
   room (11.5x8 at 60 photos: 7.7 → 3.0 a seed; 8x8 at 97: 18.7 → 16.2).
   The next lever is mixed-shape pages inside a scene, in fill mode.
   ════════════════════════════════════════════════════════════════════════ */

const SHAPE = { L: [4032, 3024], P: [3024, 4032], S: [1440, 1440], W: [1920, 1080] } as const;
const MIN = 60_000;

interface Day { photos: UploadedPhoto[]; sceneOf: number[] }

/** A day out, shot in bursts: 2–7 photos a minute or so apart, then 8 to 50
 *  minutes to the next burst (always more than SCENE_GAP_MS, never 3 hours:
 *  one moment). `place`: every burst at its own spot, 1 km from the last.
 *  Same day every run for the same n and seed. */
function day(n: number, seed: number, opts: { place?: boolean; burstGapMin?: [number, number] } = {}): Day {
  const rnd = mulberry32(n * 104_729 + seed);
  const [gapLo, gapHi] = opts.burstGapMin ?? [8, 50];
  let t = Date.UTC(2026, 10, 7, 9);
  let lat = 14.5995;
  const lon = 120.9842;
  const photos: UploadedPhoto[] = [];
  const sceneOf: number[] = [];
  let scene = 0;
  while (photos.length < n) {
    const burst = Math.min(n - photos.length, 2 + Math.floor(rnd() * 6));
    for (let k = 0; k < burst; k++) {
      const r = rnd();
      const [width, height] = SHAPE[r < 0.6 ? 'P' : r < 0.88 ? 'L' : r < 0.95 ? 'S' : 'W'];
      t += 40_000 + Math.floor(rnd() * 50_000); // 40–90 s between shots
      const i = photos.length;
      photos.push({ id: `ph-${i}`, previewUrl: '', name: `ph-${i}.jpg`, type: 'image/jpeg', size: 1, width, height, capturedAt: t,
        ...(opts.place ? { location: { lat, lon } } : {}) });
      sceneOf.push(scene);
    }
    t += (gapLo + Math.floor(rnd() * (gapHi - gapLo))) * MIN;
    if (opts.place) lat += 0.009; // about 1 km north
    scene++;
  }
  return { photos, sceneOf };
}

const fills = (p: AlbumPage) => (p.slotFills ?? []).filter((f): f is number => f != null);
const gen = (seed: number, photos: UploadedPhoto[], size: AlbumSizePreset, ppp?: number, scenes?: false) => {
  const spy = vi.spyOn(Math, 'random').mockImplementation(mulberry32(seed));
  try { return generateAlbum(photos, size, ppp, undefined, scenes === false ? { scenes: false } : undefined); } finally { spy.mockRestore(); }
};
/** Pages holding photos of two or more scenes. */
const mixedPages = (pages: AlbumPage[], sceneOf: number[]) =>
  pages.filter((p) => new Set(fills(p).map((i) => sceneOf[i])).size > 1).length;

describe('scenes: photos taken within 5 minutes stay together on a page', () => {
  const sizes = Object.keys(DENSITY_BY_SIZE) as AlbumSizePreset[];

  it('planScenes: a gap over 5 minutes, a move over 200 m, or a new moment starts a scene; no time is one scene', () => {
    const base = Date.UTC(2026, 10, 7, 9);
    const at = (i: number, ms: number, location?: { lat: number; lon: number }): UploadedPhoto =>
      ({ id: `p${i}`, previewUrl: '', name: `p${i}.jpg`, type: 'image/jpeg', size: 1, width: 4032, height: 3024, capturedAt: base + ms, ...(location ? { location } : {}) });
    const photos = [
      at(0, 0), at(1, SCENE_GAP_MS), // exactly 5 minutes: the same scene
      at(2, 2 * SCENE_GAP_MS + 1_000), // 5 minutes and a second: a new scene
      at(3, 2 * SCENE_GAP_MS + 2_000, { lat: 14.5995, lon: 120.9842 }), // a second later, with a place
      at(4, 2 * SCENE_GAP_MS + 3_000, { lat: 14.5995 + 0.0015, lon: 120.9842 }), // about 170 m: the same scene
      at(5, 2 * SCENE_GAP_MS + 4_000, { lat: 14.5995 + 0.0040, lon: 120.9842 }), // about 280 m more: a new scene
      at(6, 4 * 3600_000), // 4 hours on: a new moment, so a new scene
      { id: 'p7', previewUrl: '', name: 'p7.jpg', type: 'image/jpeg', size: 1, width: 4032, height: 3024 } as UploadedPhoto, // no time
      { id: 'p8', previewUrl: '', name: 'p8.jpg', type: 'image/jpeg', size: 1, width: 4032, height: 3024 } as UploadedPhoto,
    ];
    const s = planScenes(photos);
    const id = (i: number) => s.get(`p${i}`);
    expect(id(1)).toBe(id(0));
    expect(id(2)).not.toBe(id(1));
    expect(id(3)).toBe(id(2));
    expect(id(4)).toBe(id(3));
    expect(id(5)).not.toBe(id(4));
    expect(id(6)).not.toBe(id(5));
    expect(id(7)).toBe(id(8));
    expect(id(7)).not.toBe(id(6));
    expect(distanceM({ lat: 0, lon: 0 }, { lat: 1, lon: 0 })).toBeGreaterThan(110_000);
    expect(distanceM({ lat: 0, lon: 0 }, { lat: 1, lon: 0 })).toBeLessThan(112_000);
    expect(SCENE_MOVE_M).toBe(200);
  });

  it('the roller coaster and lunch: the two upright shots at 2:00 never share a page with the 3:15 lunch (8x8, Surprise/auto)', () => {
    const base = Date.UTC(2026, 10, 7, 14);
    const photos: UploadedPhoto[] = [];
    const add = (ms: number, shape: keyof typeof SHAPE) => {
      const [width, height] = SHAPE[shape];
      const i = photos.length;
      photos.push({ id: `ph-${i}`, previewUrl: '', name: `ph-${i}.jpg`, type: 'image/jpeg', size: 1, width, height, capturedAt: base + ms });
    };
    add(0, 'P'); add(60_000, 'P'); add(120_000, 'L'); // the roller coaster, 2:00–2:02
    // lunch from 3:15, then the afternoon in bursts: 94 more photos
    const rnd = mulberry32(11);
    let t = 75 * MIN;
    for (let b = 0; photos.length < 97; b++) {
      const burst = 3 + Math.floor(rnd() * 5);
      for (let k = 0; k < burst && photos.length < 97; k++) { t += 45_000 + Math.floor(rnd() * 45_000); add(t, rnd() < 0.6 ? 'P' : 'L'); }
      t += (10 + Math.floor(rnd() * 30)) * MIN;
    }
    // The two upright shots (0, 1) stay together, or each on a full page.
    // The lone landscape (2) has no upright page to join and may sit with
    // the next landscapes: a page of its own would be a page the album pays
    // for, and the scenes never add a page.
    for (const seed of [1, 2, 3, 4, 5]) {
      const pages = gen(seed, photos, '8x8');
      for (const [i, p] of pages.entries()) {
        const f = fills(p);
        if (!f.includes(0) && !f.includes(1)) continue;
        expect(f.every((x) => x < 3), `seed ${seed}: page ${i + 1} holds ${f.join(',')}: the roller coaster shares a page with lunch`).toBe(true);
      }
    }
  });

  /** Pages holding two scenes, over every size and photo count below: the
   *  scenes must take some away overall (the measured gain is about a tenth,
   *  a third where the album has room). */
  const tally = { with: 0, without: 0 };

  for (const size of sizes) {
    it(`${size}: Surprise/auto — scenes never add a page, and no more pages mix two scenes`, () => {
      for (const n of [40, 60, 97, 160, 199]) {
        let mixedWith = 0;
        let mixedWithout = 0;
        for (const seed of [1, 2, 3, 4, 5, 6]) {
          const { photos, sceneOf } = day(n, seed);
          const without = gen(seed, photos, size, undefined, false);
          const pages = gen(seed, photos, size);
          const at = `${size}, ${n} photos, auto, seed ${seed}`;
          expect(new Set(pages.flatMap(fills)).size, `${at}: placed`).toBe(n);
          expect(pages.length, at).toBeGreaterThanOrEqual(MIN_ALBUM_PAGES);
          expect(pages.length, `${at}: pages with scenes vs without`).toBeLessThanOrEqual(without.length);
          mixedWith += mixedPages(pages, sceneOf);
          mixedWithout += mixedPages(without, sceneOf);
        }
        // Over the six days: never more pages holding two scenes than
        // without (one album's swing allowed). A deck whose pages hold two
        // photos (6x4) or whose bursts are one shape gains nothing; the
        // gain is checked over the whole table below.
        expect(mixedWith, `${size}, ${n} photos: pages holding two scenes over 6 days, with ${mixedWith} vs without ${mixedWithout}`).toBeLessThanOrEqual(mixedWithout + 6);
        tally.with += mixedWith;
        tally.without += mixedWithout;
      }
    });

    it(`${size}: a chosen photos-per-page — the estimate is still the album, and no more pages mix two scenes`, () => {
      for (const n of [40, 97, 199]) {
        for (const ppp of DENSITY_BY_SIZE[size]) {
          let mixedWith = 0;
          let mixedWithout = 0;
          for (const seed of [1, 2, 3]) {
            const { photos, sceneOf } = day(n, seed);
            const said = chosenAlbumPages(photos, size, ppp)!;
            const without = gen(seed, photos, size, ppp, false);
            const pages = gen(seed, photos, size, ppp);
            const at = `${size}, ${n} photos at ${ppp}, seed ${seed}`;
            expect(pages.length, at).toBe(said.pages);
            expect(new Set(pages.flatMap(fills)).size, `${at}: placed`).toBe(n);
            mixedWith += mixedPages(pages, sceneOf);
            mixedWithout += mixedPages(without, sceneOf);
          }
          // The plan's counts in another order: the same pages, so one
          // album's swing either way; never more than that.
          expect(mixedWith, `${size}, ${n} photos at ${ppp}: pages holding two scenes over 3 days, with ${mixedWith} vs without ${mixedWithout}`).toBeLessThanOrEqual(mixedWithout + 3);
        }
      }
    });
  }

  it('over every size and photo count, the scenes take pages holding two scenes away (Surprise/auto)', () => {
    expect(tally.without, 'the sizes ran first').toBeGreaterThan(0);
    expect(tally.with, `with ${tally.with} vs without ${tally.without}`).toBeLessThan(tally.without);
  });

  it('a change of place splits a scene even when the clock never paused (8x8, 97 photos, auto)', () => {
    // 97 shots a minute apart, the first 48 at one spot, the rest 1 km away.
    const base = Date.UTC(2026, 10, 7, 9);
    const photos: UploadedPhoto[] = Array.from({ length: 97 }, (_, i) => {
      const [width, height] = SHAPE[i % 3 === 0 ? 'L' : 'P'];
      return { id: `ph-${i}`, previewUrl: '', name: `ph-${i}.jpg`, type: 'image/jpeg', size: 1, width, height, capturedAt: base + i * MIN,
        location: { lat: 14.5995 + (i < 48 ? 0 : 0.009), lon: 120.9842 } };
    });
    const s = planScenes(photos);
    expect(new Set(s.values()).size).toBe(2);
    // One boundary in time, crossed once by each shape's queue at most: a
    // page may hold both places only where a lone photo of its shape was
    // left at the first place (it joins the next shape-mates rather than
    // add a page), so at most a page or two, never the spread of pages a
    // 12-photo reach allowed.
    for (const seed of [1, 2, 3]) {
      const pages = gen(seed, photos, '8x8');
      const both = pages.filter((p) => { const f = fills(p); const here = f.filter((x) => x < 48).length; return here > 0 && here < f.length; });
      expect(both.length, `seed ${seed}: pages holding both places: ${both.map((p) => fills(p).join(',')).join(' | ')}`).toBeLessThanOrEqual(2);
    }
  });

  it('a 4-minute roll is one scene: the album is the same as without scenes', () => {
    const base = Date.UTC(2026, 10, 7, 9);
    const photos: UploadedPhoto[] = Array.from({ length: 60 }, (_, i) => {
      const [width, height] = SHAPE[i % 4 === 0 ? 'L' : 'P'];
      return { id: `ph-${i}`, previewUrl: '', name: `ph-${i}.jpg`, type: 'image/jpeg', size: 1, width, height, capturedAt: base + i * 4 * MIN };
    });
    expect(new Set(planScenes(photos).values()).size).toBe(1);
    const a = gen(9, photos, '8x8', undefined, false).map(fills);
    const b = gen(9, photos, '8x8').map(fills);
    expect(b).toEqual(a);
  });
});
