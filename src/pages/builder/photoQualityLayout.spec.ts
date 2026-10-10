import { describe, it, expect, vi } from 'vitest';
import { generateAlbum, canTakeMemoryQr } from './generateAlbum';
import { separateLookAlikes } from './lookAlikes';
import { getTemplateById } from './pageTemplates';
import type { AlbumPage, UploadedPhoto } from './types';
import type { PhotoCheck } from '../../lib/photoCheck';
import { seedMathRandom, mulberry32, TEST_SEED } from '../../test/seededRandom';

seedMathRandom(); // same albums every run (generateAlbum deals with Math.random)

/* ══════════════════════════════════════════════════════════════════════════
   THE PHOTO CHECK SHAPES THE ALBUM (owner, 2026-10-04). With Megy's free
   photo check on each photo (lib/photoCheck):
     • the 7 full pages (video memories) go to the best shots — never a
       blurry one while there is another, and not one with shut eyes;
     • two shots of the same moment the customer kept never share a page.
   Without check results, the album is exactly what it was.
   ══════════════════════════════════════════════════════════════════════════ */

/** A distinct, stable 64-bit fingerprint per photo (no accidental repeats). */
const hashOf = (i: number) => {
  let x = (i + 1) * 2654435761 >>> 0, hex = '';
  for (let k = 0; k < 4; k++) { x = (Math.imul(x ^ (x >>> 15), 2246822507) + 0x9e3779b9) >>> 0; hex += x.toString(16).padStart(8, '0').slice(0, 4); }
  return hex;
};
const check = (i: number, over: Partial<PhotoCheck> = {}): PhotoCheck => ({ v: 1, sharp: 1500, hash: hashOf(i), faces: 1, eyesClosed: false, facesTried: true, ...over });
const ph = (i: number, w: number, h: number, c?: PhotoCheck): UploadedPhoto =>
  ({ id: `p${i}`, previewUrl: '', name: `p${i}.jpg`, type: 'image/jpeg', size: 1, width: w, height: h, capturedAt: i * 60_000, ...(c ? { check: c } : {}) });
const landscapes = (n: number, c?: (i: number) => PhotoCheck | undefined) => Array.from({ length: n }, (_, i) => ph(i, 4032, 3024, c?.(i)));
const mixed = (n: number, c?: (i: number) => PhotoCheck | undefined) => Array.from({ length: n }, (_, i) => (i % 5 >= 3 ? ph(i, 3024, 4032, c?.(i)) : ph(i, 4032, 3024, c?.(i))));

const memoryPhotos = (pages: AlbumPage[]) => pages.filter(canTakeMemoryQr).map((p) => p.slotFills![0]!).sort((a, b) => a - b);
const placed = (pages: AlbumPage[]) => pages.flatMap((p) => p.slotFills ?? []).filter((f): f is number => f != null).sort((a, b) => a - b);
/** Generate from the SAME random stream every time, so two albums differ only by the photos. */
const gen = (photos: UploadedPhoto[]) => {
  vi.spyOn(Math, 'random').mockImplementation(mulberry32(TEST_SEED));
  return generateAlbum(photos, '8x8', undefined, { type: 'solid', solid: '#fff' });
};

describe('the full pages go to the best shots', () => {
  it('equal checks on every photo change nothing (only differences between shots count)', () => {
    expect(memoryPhotos(gen(landscapes(60, (i) => check(i))))).toEqual(memoryPhotos(gen(landscapes(60))));
  });

  it('never a blurry shot while there is a sharp one', () => {
    const before = memoryPhotos(gen(landscapes(60, (i) => check(i))));
    expect(before).toHaveLength(7);
    const blurry = new Set(before);
    const after = memoryPhotos(gen(landscapes(60, (i) => check(i, blurry.has(i) ? { sharp: 10 } : {}))));
    expect(after).toHaveLength(7);
    expect(after.filter((i) => blurry.has(i))).toEqual([]);
  });

  it('not a shot with shut eyes when the same stretch has another', () => {
    const before = memoryPhotos(gen(landscapes(60, (i) => check(i))));
    const shut = new Set(before);
    const after = memoryPhotos(gen(landscapes(60, (i) => check(i, shut.has(i) ? { eyesClosed: true } : {}))));
    expect(after.filter((i) => shut.has(i))).toEqual([]);
  });

  it('every photo is still placed once', () => {
    const photos = landscapes(60, (i) => check(i, i % 9 === 0 ? { sharp: 10 } : {}));
    expect(placed(gen(photos))).toEqual(photos.map((_, i) => i));
  });
});

describe('two shots of the same moment never share a page', () => {
  /** The first two photos the album puts together on one page. */
  const firstPair = (pages: AlbumPage[]) => {
    const p = pages.find((pg) => (pg.slotFills ?? []).filter((f) => f != null).length >= 2)!;
    const [a, b] = (p.slotFills ?? []).filter((f): f is number => f != null);
    return [a, b] as const;
  };
  const pageOf = (pages: AlbumPage[], photo: number) => pages.findIndex((p) => (p.slotFills ?? []).includes(photo));

  for (const [name, make] of [['landscapes', landscapes], ['a phone roll (3 landscape : 2 portrait)', mixed]] as const) {
    it(`${name}: a kept repeat pair is split across pages, nothing lost, orientation kept`, () => {
      const base = gen(make(70, (i) => check(i)));
      const [a, b] = firstPair(base);
      expect(pageOf(base, a)).toBe(pageOf(base, b)); // the album would have paired them
      // Make them the same moment: same fingerprint, taken 2 s apart.
      const photos = make(70, (i) => check(i, i === b ? { hash: hashOf(a) } : {}));
      photos[b] = { ...photos[b], capturedAt: (photos[a].capturedAt as number) + 2_000 };
      const pages = gen(photos);
      expect(pageOf(pages, a)).not.toBe(pageOf(pages, b));
      expect(placed(pages)).toEqual(photos.map((_, i) => i));
      for (const p of pages) {
        const t = p.templateId ? getTemplateById(p.templateId) : undefined;
        (p.slotFills ?? []).forEach((f, s) => {
          if (f == null || !t?.slots[s]?.ratio) return;
          const [rw, rh] = t.slots[s].ratio!.split(':').map(Number);
          const slotLand = rw > rh, slotPort = rh > rw;
          const ph = photos[f], land = ph.width > ph.height, port = ph.height > ph.width;
          expect(!(slotLand && port) && !(slotPort && land), `photo ${f} on page ${p.id}`).toBe(true);
        });
      }
    });
  }
});

describe('separateLookAlikes', () => {
  const page = (id: string, templateId: string, fills: (number | null)[]): AlbumPage =>
    ({ id, layout: 'freeform', size: '8x8', background: { type: 'solid', solid: '#fff' }, photos: [], textElements: [], templateId, slotFills: fills }) as AlbumPage;
  it('swaps one of a pair with a like-shaped photo on the next page; no repeats → no swaps', () => {
    const two = '8x8-sq-two-landscapes-box'; // any id: the swap only needs the photos' shapes
    const photos = landscapes(4, (i) => check(i, i === 1 ? { hash: hashOf(0) } : {}));
    photos[1] = { ...photos[1], capturedAt: (photos[0].capturedAt as number) + 1_000 };
    const pages = [page('a', two, [0, 1]), page('b', two, [2, 3])];
    expect(separateLookAlikes(pages, photos)).toBe(1);
    expect(pages[0].slotFills).not.toEqual(expect.arrayContaining([0, 1]));
    expect([...pages[0].slotFills!, ...pages[1].slotFills!].sort()).toEqual([0, 1, 2, 3]);
    expect(separateLookAlikes(pages, photos)).toBe(0);
  });

  it('leaves the full pages alone, but a one-photo page with boxes can take the twin', () => {
    const make = () => {
      const photos = landscapes(3, (i) => check(i, i === 1 ? { hash: hashOf(0) } : {}));
      photos[1] = { ...photos[1], capturedAt: (photos[0].capturedAt as number) + 1_000 };
      return { photos, pages: [page('a', 'x', [0, 1]), page('b', 'solo', [2])] };
    };
    const full = make();
    expect(separateLookAlikes(full.pages, full.photos, (p) => p.id === 'b')).toBe(0);
    expect(full.pages[1].slotFills).toEqual([2]);
    const boxed = make();
    expect(separateLookAlikes(boxed.pages, boxed.photos, () => false)).toBe(1);
    expect(boxed.pages[1].slotFills).toEqual([1]);
  });
});
