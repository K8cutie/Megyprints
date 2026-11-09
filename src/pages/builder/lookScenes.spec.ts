import { describe, it, expect, vi } from 'vitest';
import { generateAlbum, chosenAlbumPages, planScenes, SCENE_GAP_MS, LOOK_WINDOW } from './generateAlbum';
import { DENSITY_BY_SIZE, MIN_ALBUM_PAGES } from './densities';
import type { AlbumPage, AlbumSizePreset, UploadedPhoto } from './types';
import { seedMathRandom, mulberry32 } from '../../test/seededRandom';
import { madeUpLooks, type MadeUpLooks, type Place } from '../../test/madeUpLooks';

seedMathRandom(); // registers the seeding hooks; each album below re-seeds explicitly

/* ════════════════════════════════════════════════════════════════════════
   LOOK SCENES (2026-11-09, next to scenes.spec.ts): where the photo check's
   look pass has read the photos (PhotoCheck.look, lib/photoLook), the album
   uses what they show when the clock can't help:
     • a photo with no capture time (a Facebook or Messenger download) lands
       next to the photos it looks like: with a dated look-alike's scene,
       else with the other undated photos of its place, instead of at the
       end of the album in the order it was added;
     • a change of place splits a scene even when the clock never paused.
   The page budget of scenes.spec.ts holds: never more pages than the album
   made without scenes and looks, and a chosen photos-per-page still makes
   the page count the upload step said.

   The looks here are made up (test/madeUpLooks) to sit where real ones were
   measured: same place about 0.8 alike, any two photos of a trip about 0.45.
   The real photos: docs/mobile-port-plan.md, "Look scenes".
   ════════════════════════════════════════════════════════════════════════ */

const SHAPE = { L: [4032, 3024], P: [3024, 4032], S: [1440, 1440] } as const;
type Shape = keyof typeof SHAPE;
const MIN = 60_000;

/** A photo; `look` as the look pass keeps it, `at` when it was taken. */
function photo(i: number, shape: Shape, look?: string, at?: number): UploadedPhoto {
  const [width, height] = SHAPE[shape];
  return {
    id: `ph-${i}`, previewUrl: '', name: `ph-${i}.jpg`, type: 'image/jpeg', size: 1, width, height,
    ...(at === undefined ? {} : { capturedAt: at }),
    // No fingerprint: none of these are repeats of each other.
    check: { v: 1, sharp: 500, hash: '', faces: null, eyesClosed: false, ...(look ? { look } : {}) },
  };
}
const withoutLooks = (photos: UploadedPhoto[]): UploadedPhoto[] => photos.map((p) => ({ ...p, check: { ...p.check!, look: undefined } }));

const fills = (p: AlbumPage) => (p.slotFills ?? []).filter((f): f is number => f != null);
const gen = (seed: number, photos: UploadedPhoto[], size: AlbumSizePreset, ppp?: number, scenes?: false) => {
  const spy = vi.spyOn(Math, 'random').mockImplementation(mulberry32(seed));
  try { return generateAlbum(photos, size, ppp, undefined, scenes === false ? { scenes: false } : undefined); } finally { spy.mockRestore(); }
};
/** Photos that come right after a photo of the same place, reading the album front to back. */
const sidebySide = (pages: AlbumPage[], placeOf: number[]) => {
  const order = pages.flatMap(fills);
  let n = 0;
  for (let k = 1; k < order.length; k++) if (placeOf[order[k]] === placeOf[order[k - 1]]) n++;
  return n;
};
const pageOf = (pages: AlbumPage[]) => {
  const at = new Map<number, number>();
  pages.forEach((p, k) => fills(p).forEach((i) => at.set(i, k)));
  return at;
};

interface Trip { photos: UploadedPhoto[]; placeOf: number[] }

/** Photos downloaded from Facebook: no capture time, mostly square, `counts[k]`
 *  of them at place k, in no order at all (shuffled). */
function download(seed: number, counts: number[], upright = 0.1): Trip {
  const looks = madeUpLooks(seed);
  const rnd = mulberry32(seed * 7919 + 1);
  const shots = counts.flatMap((n, k) => { const place = looks.place(); return Array.from({ length: n }, () => ({ k, look: looks.shot(place) })); });
  for (let i = shots.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [shots[i], shots[j]] = [shots[j], shots[i]]; }
  return { photos: shots.map((s, i) => photo(i, rnd() < upright ? 'P' : 'S', s.look)), placeOf: shots.map((s) => s.k) };
}

/** A day out from the camera roll: bursts of 3 to 7 shots a minute or so
 *  apart, each burst at its own place, 12 to 40 minutes between bursts. */
function day(n: number, seed: number, looks: MadeUpLooks): Trip & { places: Place[] } {
  const rnd = mulberry32(n * 104_729 + seed);
  let t = Date.UTC(2026, 10, 7, 9);
  const photos: UploadedPhoto[] = [];
  const placeOf: number[] = [];
  const places: Place[] = [];
  while (photos.length < n) {
    const place = looks.place();
    places.push(place);
    const burst = Math.min(n - photos.length, 3 + Math.floor(rnd() * 5));
    for (let k = 0; k < burst; k++) {
      t += 40_000 + Math.floor(rnd() * 50_000);
      photos.push(photo(photos.length, rnd() < 0.6 ? 'P' : 'L', looks.shot(place), t));
      placeOf.push(places.length - 1);
    }
    t += (12 + Math.floor(rnd() * 28)) * MIN;
  }
  return { photos, placeOf, places };
}

describe('photos with no capture time land next to the photos they look like', () => {
  it('planScenes: each place is one scene and its photos are put side by side, whatever order they came in', () => {
    const { photos, placeOf } = download(3, [9, 7, 6, 5, 4, 3, 2, 1, 1]);
    const plan = planScenes(photos);
    const sceneOfPlace = new Map<number, Set<number>>();
    photos.forEach((p, i) => sceneOfPlace.set(placeOf[i], (sceneOfPlace.get(placeOf[i]) ?? new Set()).add(plan.get(p.id)!)));
    // One scene a place, and no two places share one.
    expect([...sceneOfPlace.values()].map((s) => s.size)).toEqual(Array(9).fill(1));
    expect(new Set([...sceneOfPlace.values()].map((s) => [...s][0])).size).toBe(9);
    // The order the album takes them in: every place's photos in one run.
    const order = plan.untimed!.map((id) => placeOf[Number(id.slice(3))]);
    const runs = order.filter((k, at) => at === 0 || order[at - 1] !== k);
    expect(runs).toHaveLength(9);
    expect(plan.after?.size).toBe(0); // no dated photo to join
    // Without looks the clock has nothing to say: one scene, the order they came in.
    const bare = planScenes(withoutLooks(photos));
    expect(new Set(bare.values()).size).toBe(1);
    expect(bare.untimed).toBeUndefined();
  });

  for (const size of ['8x8', '6x8', '11.5x8'] as AlbumSizePreset[]) {
    it(`${size}, Surprise/auto: a downloaded album reads place by place, and has no more pages`, () => {
      for (const seed of [1, 2, 3, 4, 5]) {
        const { photos, placeOf } = download(seed, [12, 10, 9, 8, 7, 6, 5, 4, 3, 2, 2, 1, 1]);
        const n = photos.length;
        const without = gen(seed, photos, size, undefined, false);
        const pages = gen(seed, photos, size);
        const at = `${size}, seed ${seed}`;
        expect(new Set(pages.flatMap(fills)).size, `${at}: placed`).toBe(n);
        expect(pages.length, at).toBeGreaterThanOrEqual(MIN_ALBUM_PAGES);
        expect(pages.length, `${at}: pages with looks vs without`).toBeLessThanOrEqual(without.length);
        // 70 photos at 13 places: at most 57 can follow a photo of their own place.
        expect(sidebySide(without, placeOf), `${at}: side by side without looks`).toBeLessThan(20);
        expect(sidebySide(pages, placeOf), `${at}: side by side with looks`).toBeGreaterThan(40);
        // A photo and another of its place: on the same page or the next one,
        // for at least four in five (a photo of a rare shape, and the three
        // opening pages, may sit further off).
        const where = pageOf(pages);
        const near = photos.filter((_, i) => photos.some((__, j) => j !== i && placeOf[j] === placeOf[i] && Math.abs(where.get(j)! - where.get(i)!) <= 1)).length;
        const companions = photos.filter((_, i) => placeOf.filter((k) => k === placeOf[i]).length > 1).length;
        expect(near, `${at}: of ${companions} photos with another of their place, on the same or the next page`).toBeGreaterThanOrEqual(Math.floor(companions * 0.8));
      }
    });
  }

  it('the upright photos of a downloaded album still share pages (6x8, Surprise/auto): sorting by look never costs a page for a rare shape', () => {
    // The owner's Hong Kong folder: 183 squares and 13 upright photos that sat
    // together in file order. By look they are spread out, and a page holds
    // one shape. Here: 60 squares at 10 places, then 9 upright ones at 9 of them.
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const looks = madeUpLooks(seed);
      const places = Array.from({ length: 10 }, () => looks.place());
      const rnd = mulberry32(seed + 5);
      const placeOf = [...Array.from({ length: 60 }, () => Math.floor(rnd() * 10)), 0, 1, 2, 3, 4, 5, 6, 7, 8];
      const photos = placeOf.map((k, i) => photo(i, i < 60 ? 'S' : 'P', looks.shot(places[k])));
      const without = gen(seed, photos, '6x8', undefined, false);
      const pages = gen(seed, photos, '6x8');
      expect(new Set(pages.flatMap(fills)).size).toBe(photos.length);
      expect(pages.length, `seed ${seed}: pages with looks vs without`).toBeLessThanOrEqual(without.length);
      // ...and the look order was kept, not dropped to stay inside the budget.
      expect(sidebySide(pages, placeOf), `seed ${seed}: side by side`).toBeGreaterThan(sidebySide(without, placeOf) + 15);
    }
  });

  it('a forwarded photo joins the scene of the dated photos it looks like, right after its look-alike', () => {
    const looks = madeUpLooks(12);
    const { photos, placeOf, places } = day(70, 4, looks);
    const dated = photos.length;
    // Six photos a guest sent through Messenger, of three of the day's places
    // (not the last ones), added last; and two of somewhere the camera roll never was.
    const sent = [1, 1, 3, 3, 5, 5];
    for (const k of sent) { photos.push(photo(photos.length, 'P', looks.shot(places[k]))); placeOf.push(k); }
    const elsewhere = looks.place();
    for (let k = 0; k < 2; k++) { photos.push(photo(photos.length, 'P', looks.shot(elsewhere))); placeOf.push(-1); }
    const plan = planScenes(photos);
    const sceneOfPlace = (k: number) => plan.get(photos[placeOf.indexOf(k)].id);
    sent.forEach((k, s) => {
      const id = photos[dated + s].id;
      expect(plan.get(id), `the photo sent of place ${k}`).toBe(sceneOfPlace(k));
      // It goes right after a dated photo of that place.
      const to = plan.after!.get(id)!;
      expect(placeOf[Number(to.slice(3))]).toBe(k);
      expect(typeof photos[Number(to.slice(3))].capturedAt).toBe('number');
    });
    // The two from somewhere else: a scene of their own, after the dated ones.
    const [a, b] = [photos[dated + 6].id, photos[dated + 7].id];
    expect(plan.get(a)).toBe(plan.get(b));
    expect(photos.slice(0, dated).every((p) => plan.get(p.id) !== plan.get(a))).toBe(true);
    expect(plan.after!.has(a) || plan.after!.has(b)).toBe(false);

    // In the album: on the page of a dated photo of its place, or within two
    // pages of one (a full page may sit between). Without looks they wait
    // at the end, many pages away.
    for (const seed of [1, 2, 3, 4]) {
      const without = gen(seed, photos, '8x8', undefined, false);
      const pages = gen(seed, photos, '8x8');
      expect(new Set(pages.flatMap(fills)).size).toBe(photos.length);
      expect(pages.length, `seed ${seed}: pages with looks vs without`).toBeLessThanOrEqual(without.length);
      const away = (album: AlbumPage[], s: number) => {
        const where = pageOf(album);
        const mine = where.get(dated + s)!;
        return Math.min(...photos.slice(0, dated).map((_, i) => (placeOf[i] === sent[s] ? Math.abs(where.get(i)! - mine) : Infinity)));
      };
      sent.forEach((k, s) => {
        expect(away(pages, s), `seed ${seed}: the photo sent of place ${k} is ${away(pages, s)} pages from its place`).toBeLessThanOrEqual(2);
        expect(away(without, s), `seed ${seed}: without looks`).toBeGreaterThan(3);
      });
    }
  });

  it('only some photos have a look (the pass stopped early): those are placed by look, the rest stay as they came, in one scene', () => {
    const looks = madeUpLooks(21);
    const [a, b] = [looks.place(), looks.place()];
    // Added in this order: A, none, B, none, A, B, A.
    const photos = [
      photo(0, 'S', looks.shot(a)), photo(1, 'S'), photo(2, 'S', looks.shot(b)), photo(3, 'S'),
      photo(4, 'S', looks.shot(a)), photo(5, 'S', looks.shot(b)), photo(6, 'S', looks.shot(a)),
    ];
    const plan = planScenes(photos);
    expect(plan.untimed).toEqual(['ph-0', 'ph-4', 'ph-6', 'ph-2', 'ph-5', 'ph-1', 'ph-3']);
    const s = (i: number) => plan.get(`ph-${i}`);
    expect([s(4), s(6)]).toEqual([s(0), s(0)]);
    expect(s(5)).toBe(s(2));
    expect(s(3)).toBe(s(1));
    expect(new Set([s(0), s(2), s(1)]).size).toBe(3);
  });
});

describe('a change of place splits a scene even when the clock never paused', () => {
  const base = Date.UTC(2026, 10, 7, 9);
  /** Shots a minute apart, one per letter: the same letter = the same place,
   *  a digit = a place of its own. No pause, no GPS. */
  function walk(seed: number, places: string, opts: { pauseBefore?: number } = {}): UploadedPhoto[] {
    const looks = madeUpLooks(seed);
    const at = new Map<string, Place>();
    return [...places].map((c, i) => {
      if (!at.has(c)) at.set(c, looks.place());
      const pause = opts.pauseBefore !== undefined && i >= opts.pauseBefore ? SCENE_GAP_MS + MIN : 0;
      return photo(i, i % 3 === 0 ? 'L' : 'P', looks.shot(at.get(c)!), base + i * MIN + pause);
    });
  }
  const scenesOf = (photos: UploadedPhoto[]) => { const plan = planScenes(photos); const first = plan.get(photos[0].id)!; return photos.map((p) => plan.get(p.id)! - first).join(''); };

  it('six shots at one place then six at another, a minute apart: two scenes, split where the place changed', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const photos = walk(seed, 'AAAAAABBBBBB');
      expect(scenesOf(photos), `seed ${seed}`).toBe('000000111111');
      // The clock alone sees one scene.
      expect(scenesOf(withoutLooks(photos))).toBe('000000000000');
    }
    expect(LOOK_WINDOW).toBe(3);
  });

  it('three places in a row: a scene each', () => {
    expect(scenesOf(walk(6, 'AAAABBBBBCCCC'))).toBe('0000111112222');
  });

  it('one odd shot does not split a scene (a selfie in the middle of the view)', () => {
    for (const seed of [1, 2, 3]) expect(scenesOf(walk(seed, 'AAA1AAA')), `seed ${seed}`).toBe('0000000');
  });

  it('a burst where every shot shows something else stays one scene: looking different is not a change of place', () => {
    for (const seed of [1, 2, 3]) expect(scenesOf(walk(seed, '12345678')), `seed ${seed}`).toBe('00000000');
  });

  it('two shots of one thing, two of another, back again: one scene (a run needs three)', () => {
    for (const seed of [1, 2, 3]) expect(scenesOf(walk(seed, 'AABBAABB')), `seed ${seed}`).toBe('00000000');
  });

  it('a pause still splits a scene at the same place, and looks never join what the clock split', () => {
    expect(scenesOf(walk(7, 'AAAAAA', { pauseBefore: 3 }))).toBe('000111');
    // A pause right where the place changes: one split, not two.
    expect(scenesOf(walk(8, 'AAAABBBB', { pauseBefore: 4 }))).toBe('00001111');
  });

  it('photos the look pass has not read are split by the clock alone', () => {
    const photos = walk(9, 'AAAAAABBBBBB').map((p, i) => (i === 5 || i === 6 ? { ...p, check: { ...p.check!, look: undefined } } : p));
    expect(scenesOf(photos)).toBe('000000000000');
  });

  it('in the album (8x8, 97 photos, auto): at most a page or two hold both places', () => {
    // 97 shots a minute apart, the first 48 at one place, the rest at another:
    // scenes.spec.ts's place change, told by the looks instead of GPS.
    const photos = walk(10, 'A'.repeat(48) + 'B'.repeat(49));
    expect(new Set(planScenes(photos).values()).size).toBe(2);
    for (const seed of [1, 2, 3]) {
      const pages = gen(seed, photos, '8x8');
      const without = gen(seed, photos, '8x8', undefined, false);
      expect(pages.length, `seed ${seed}`).toBeLessThanOrEqual(without.length);
      const both = pages.filter((p) => { const f = fills(p); const here = f.filter((x) => x < 48).length; return here > 0 && here < f.length; });
      expect(both.length, `seed ${seed}: pages holding both places: ${both.map((p) => fills(p).join(',')).join(' | ')}`).toBeLessThanOrEqual(2);
    }
  });
});

describe('looks never cost a page', () => {
  const sizes = Object.keys(DENSITY_BY_SIZE) as AlbumSizePreset[];
  /** A camera-roll day plus photos sent by others: a quarter of the album
   *  has no capture time, half of those of the day's places. */
  function mixed(n: number, seed: number): Trip {
    const looks = madeUpLooks(seed + 100);
    const dated = Math.round(n * 0.75);
    const { photos, placeOf, places } = day(dated, seed, looks);
    const rnd = mulberry32(seed * 31 + n);
    const extra = [looks.place(), looks.place(), looks.place()];
    while (photos.length < n) {
      const own = rnd() < 0.5;
      const k = own ? Math.floor(rnd() * places.length) : places.length + Math.floor(rnd() * extra.length);
      photos.push(photo(photos.length, rnd() < 0.7 ? 'S' : 'P', looks.shot(own ? places[k] : extra[k - places.length])));
      placeOf.push(k);
    }
    return { photos, placeOf };
  }

  for (const size of sizes) {
    it(`${size}: Surprise/auto — never more pages than without scenes and looks, and more photos sit beside their place`, () => {
      let withLooks = 0;
      let plain = 0;
      for (const n of [40, 97, 160]) {
        for (const seed of [1, 2, 3, 4]) {
          const { photos, placeOf } = mixed(n, seed);
          const without = gen(seed, photos, size, undefined, false);
          const pages = gen(seed, photos, size);
          const at = `${size}, ${n} photos, auto, seed ${seed}`;
          expect(new Set(pages.flatMap(fills)).size, `${at}: placed`).toBe(n);
          expect(pages.length, at).toBeGreaterThanOrEqual(MIN_ALBUM_PAGES);
          expect(pages.length, `${at}: pages with looks vs without`).toBeLessThanOrEqual(without.length);
          withLooks += sidebySide(pages, placeOf);
          plain += sidebySide(without, placeOf);
        }
      }
      expect(withLooks, `${size}: photos right after one of their place, with looks ${withLooks} vs without ${plain}`).toBeGreaterThan(plain);
    });

    it(`${size}: a chosen photos-per-page — the estimate is still the album, and no photo changes moment`, () => {
      for (const n of [40, 97]) {
        for (const ppp of DENSITY_BY_SIZE[size]) {
          for (const seed of [1, 2]) {
            const { photos } = mixed(n, seed);
            const said = chosenAlbumPages(photos, size, ppp)!;
            const pages = gen(seed, photos, size, ppp);
            const at = `${size}, ${n} photos at ${ppp}, seed ${seed}`;
            expect(pages.length, at).toBe(said.pages);
            expect(new Set(pages.flatMap(fills)).size, `${at}: placed`).toBe(n);
            // The promise is counted from each moment's photos, so the looks
            // say the same number as no looks at all.
            expect(chosenAlbumPages(withoutLooks(photos), size, ppp)!.pages, at).toBe(said.pages);
            // Dated and undated photos never share a page there (one photo a
            // page aside: those pages hold one photo each).
            if (ppp > 1) {
              const crossed = pages.filter((p) => { const f = fills(p); const d = f.filter((i) => typeof photos[i].capturedAt === 'number').length; return d > 0 && d < f.length; });
              expect(crossed.length, `${at}: pages holding dated and undated photos`).toBe(0);
            }
          }
        }
      }
    });
  }

  it('a chosen photos-per-page: the downloaded photos are still sorted by look where they are', () => {
    const { photos, placeOf } = download(5, [12, 10, 9, 8, 7, 6, 5, 4, 3, 2, 2, 1, 1], 0);
    for (const seed of [1, 2, 3]) {
      const pages = gen(seed, photos, '8x8', 4);
      expect(pages.length).toBe(chosenAlbumPages(photos, '8x8', 4)!.pages);
      expect(sidebySide(pages, placeOf), `seed ${seed}`).toBeGreaterThan(40);
      expect(sidebySide(gen(seed, photos, '8x8', 4, false), placeOf), `seed ${seed}: without looks`).toBeLessThan(20);
    }
  });

  it('an album with no looks at all is made exactly as before', () => {
    const { photos } = mixed(97, 3);
    const bare = withoutLooks(photos);
    const plan = planScenes(bare);
    expect(plan.untimed).toBeUndefined();
    expect(plan.after).toBeUndefined();
    // The undated photos: one scene, as in scenes.spec.ts.
    expect(new Set(bare.filter((p) => typeof p.capturedAt !== 'number').map((p) => plan.get(p.id))).size).toBe(1);
  });
});
