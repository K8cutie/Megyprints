import { describe, it, expect } from 'vitest';
import { generateAlbum, memoriesAcrossSize, memoryPhotoFits, memoriesOn, layoutHoldsMemory, isMemoryReady, MIN_MEMORY_PAGES } from './generateAlbum';
import { getTemplateById, getTemplatesForAlbum, qrBadgeTemplate, QR_CORNERS, type QrCorner } from './pageTemplates';
import type { AlbumPage, AlbumSizePreset, QrFill, UploadedPhoto } from './types';
import { seedMathRandom, mulberry32 } from '../../test/seededRandom';

seedMathRandom(); // same albums every run (generateAlbum deals with Math.random)

/* ══════════════════════════════════════════════════════════════════════════
   WHICH MEMORIES A NEW SIZE CARRIES, AND WHERE THEY LAND (2026-10-08).
   A memory comes along as its corner badge on its own photo, in its corner,
   on a full page of the new size — when that photo can fill one: the rule
   the generator uses for every memory page, or no more cut than the photo
   already had as a full page. Never across orientation. The rest are
   reported, never dropped quietly (the caller asks).
   ══════════════════════════════════════════════════════════════════════════ */

const SIZES: AlbumSizePreset[] = ['6x6', '8x8', '9x9', '6x4', '8x6', '6x8', '11.5x8', '8.5x11'];
const ASPECT: Record<string, number> = { '6x6': 1, '8x8': 1, '9x9': 1, '6x4': 1.5, '8x6': 8 / 6, '6x8': 6 / 8, '11.5x8': 11.5 / 8, '8.5x11': 8.5 / 11 };
const orient = (a: number) => (a > 1.05 ? 'L' : a < 0.95 ? 'P' : 'S');
const crosses = (a: number, b: number) => (orient(a) === 'L' && orient(b) === 'P') || (orient(a) === 'P' && orient(b) === 'L');

const memory = (code: string): QrFill => ({
  code, destination: `https://clips.test/${code}.mp4`, qrPngDataUrl: 'data:image/png;base64,',
  memoryUrl: `https://megyprints.test/m/${code}`, createdAt: 1, kind: 'clip', clipExt: 'mp4',
});
const photo = (i: number, w: number, h: number): UploadedPhoto => ({ id: `p${i}`, name: `p${i}.jpg`, previewUrl: '', type: 'image/jpeg', size: 1, width: w, height: h, capturedAt: i });
/** 48 photos: landscapes, squares, portraits. */
const roll = (): UploadedPhoto[] => Array.from({ length: 48 }, (_, i) => (i % 4 === 3 ? photo(i, 3024, 4032) : i % 4 === 2 ? photo(i, 3000, 3000) : photo(i, 4032, 3024)));

/** A badge page as "Add a video memory" makes it. */
function badgePage(size: AlbumSizePreset, corner: QrCorner, photoIdx: number, fill: QrFill): AlbumPage {
  const t = qrBadgeTemplate(size, corner)!;
  return {
    id: `b-${photoIdx}`, layout: 'freeform', size, background: { type: 'solid', solid: '#FFFFFF' }, photos: [], textElements: [],
    templateId: t.id, slotFills: [photoIdx, null], qrFills: [null, fill], slotScales: [1, 1], slotOffsetsX: [0, 0], slotOffsetsY: [0, 0],
  };
}

describe('every size to every size, every corner', () => {
  for (const from of SIZES) for (const to of SIZES) {
    if (from === to) continue;
    it(`${from} → ${to}`, () => {
      // A memory on a photo exactly the shape of the old page.
      const a = ASPECT[from];
      const photos = roll();
      photos[5] = photo(5, Math.round(3000 * a), 3000);
      for (const corner of QR_CORNERS) {
        const fill = memory(`m-${corner}`);
        const { carried, lost } = memoriesAcrossSize([badgePage(from, corner, 5, fill)], photos, from, to);
        const crop = 1 - Math.min(a, ASPECT[to]) / Math.max(a, ASPECT[to]);
        if (crosses(a, ASPECT[to])) {
          expect(lost, `${corner}: across orientation never comes`).toEqual([fill]);
          continue;
        }
        if (Math.abs(Math.log(a / ASPECT[to])) < 1e-9) expect(carried.length, 'same shape always comes').toBe(1);
        if (lost.length) {
          // Only when the generator wouldn't put it on a full page and it would be cut more than it was (0).
          expect(memoryPhotoFits(photos[5], to)).toBe(false);
          expect(crop).toBeGreaterThan(0);
          continue;
        }
        expect(carried).toEqual([{ photo: 5, fill, corner }]);
        // And the album at the new size has it: a badge on photo 5, in that corner.
        const pages = generateAlbum(photos, to, undefined, undefined, { memories: carried });
        const on = pages.filter((p) => memoriesOn(p).length);
        expect(on.map((p) => [p.templateId, p.slotFills?.[0], memoriesOn(p)[0].code])).toEqual([[qrBadgeTemplate(to, corner)!.id, 5, fill.code]]);
        expect(layoutHoldsMemory(getTemplateById(on[0].templateId!)!)).toBe(true);
        expect(on[0].size).toBe(to);
        expect(on[0].cornerBase).toBeUndefined();
        // Every photo exactly once; the album still offers its memory pages.
        const placed = pages.flatMap((p) => [...(p.slotFills ?? []), ...(p.textSlotFills ?? [])]).filter((f) => f != null).sort((x, y) => x! - y!);
        expect(placed).toEqual(photos.map((_, i) => i));
      }
    });
  }
});

describe('the size matrix covers both answers', () => {
  it('some changes carry the memory and some must ask (same shape always carries, across orientation always asks)', () => {
    let carried = 0, asked = 0;
    for (const from of SIZES) for (const to of SIZES) {
      if (from === to) continue;
      const photos = roll();
      photos[5] = photo(5, Math.round(3000 * ASPECT[from]), 3000);
      const plan = memoriesAcrossSize([badgePage(from, 'br', 5, memory('m'))], photos, from, to);
      carried += plan.carried.length;
      asked += plan.lost.length;
    }
    expect(carried).toBeGreaterThan(20);
    expect(asked).toBeGreaterThan(10);
    expect(carried + asked).toBe(56);
  });
});

describe('the generator around carried memories', () => {
  it('memories take their full pages first; the album still offers at least MIN_MEMORY_PAGES', () => {
    const photos = roll();
    const memories = [0, 8, 16, 24, 32, 40, 44, 45, 1].map((p, k) => ({ photo: p, fill: memory(`m${k}`), corner: 'br' as const }));
    for (const some of [memories.slice(0, 2), memories]) {
      const pages = generateAlbum(photos, '8x8', undefined, undefined, { memories: some });
      expect(pages.filter((p) => memoriesOn(p).length).map((p) => p.slotFills?.[0]).sort((a, b) => a! - b!)).toEqual(some.map((m) => m.photo).sort((a, b) => a - b));
      expect(pages.filter(isMemoryReady).length).toBeGreaterThanOrEqual(Math.max(MIN_MEMORY_PAGES, some.length));
      expect(pages.length).toBeGreaterThanOrEqual(40);
    }
  });
  it('the look-alike pass never swaps a memory page\'s photo away from its QR', () => {
    // Shot in twos: each pair looks alike, pairs don't look like each other,
    // so the pass has a twin to move off nearly every page.
    const fingerprint = (k: number) => { const r = mulberry32(k + 1); return Array.from({ length: 8 }, () => Math.floor(r() * 256).toString(16).padStart(2, '0')).join(''); };
    const pairs = Array.from({ length: 60 }, (_, i) => ({ ...photo(i, 4032, 3024), capturedAt: i * 20_000, check: { v: 1 as const, sharp: 50, hash: fingerprint(i >> 1), faces: 1, eyesClosed: false } }));
    const memories = [5, 20, 35, 50].map((p, k) => ({ photo: p, fill: memory(`b${k}`), corner: 'tl' as const }));
    // (Passing canTakeMemoryQr, as before, put b1 on photo 19 at 8×8 / 2 a page.)
    for (const size of ['8x8', '6x6', '8x6', '6x4'] as AlbumSizePreset[]) for (const perPage of [2, 3, 4]) {
      const pages = generateAlbum(pairs, size, perPage, undefined, { memories });
      const on = pages.filter((p) => memoriesOn(p).length).map((p) => [memoriesOn(p)[0].code, p.slotFills?.[0]]);
      expect(on.sort(), `${size}/${perPage}`).toEqual(memories.map((m) => [m.fill.code, m.photo]));
    }
  });
  it('no carried memories: the same album as before (same seed, same pages)', () => {
    const photos = roll();
    const a = JSON.stringify(withSeed(() => generateAlbum(photos, '8x8')));
    const b = JSON.stringify(withSeed(() => generateAlbum(photos, '8x8', undefined, undefined, { memories: [] })));
    expect(b).toBe(a);
  });
});

describe('memories placed before they moved to full pages, and doubles', () => {
  const photos = roll();
  const three = getTemplatesForAlbum('8x8').find((t) => t.slots.length === 3)!;
  const boxed = getTemplatesForAlbum('8x8').find((t) => (t.textSlots?.length ?? 0) > 0 && t.slots.length >= 1)!;
  const page = (over: Partial<AlbumPage>): AlbumPage => ({
    id: 'x', layout: 'freeform', size: '8x8', background: { type: 'solid', solid: '#FFFFFF' }, photos: [], textElements: [], ...over,
  });
  it('a QR in a frame comes along on the first photo of its page that fits, with no corner yet', () => {
    // Frame 0 holds a portrait (can't fill a 6×4 page), frame 2 a landscape.
    const pages = [page({ templateId: three.id, slotFills: [3, null, 4], qrFills: [null, memory('frame'), null] })];
    expect(memoriesAcrossSize(pages, photos, '8x8', '6x4')).toEqual({ carried: [{ photo: 4, fill: memory('frame'), corner: null }], lost: [] });
  });
  it('a QR in a caption box comes along on its page\'s photo', () => {
    const pages = [page({ templateId: boxed.id, slotFills: [8], textSlotQr: [memory('box')] })];
    expect(memoriesAcrossSize(pages, photos, '8x8', '6x6').carried).toEqual([{ photo: 8, fill: memory('box'), corner: null }]);
  });
  it('a frame QR alone on a page with no photo that fits can\'t come — reported, not dropped quietly', () => {
    const pages = [page({ templateId: three.id, slotFills: [3, null, null], qrFills: [null, memory('alone'), null] })];
    expect(memoriesAcrossSize(pages, photos, '8x8', '6x4')).toEqual({ carried: [], lost: [memory('alone')] });
  });
  it('a duplicated memory page brings the memory once (and does not count it as lost)', () => {
    const fill = memory('twice');
    const pages = [badgePage('8x8', 'tl', 0, fill), badgePage('8x8', 'tl', 0, fill)];
    expect(memoriesAcrossSize(pages, photos, '8x8', '6x6')).toEqual({ carried: [{ photo: 0, fill, corner: 'tl' }], lost: [] });
  });
  it('an album with no memories plans nothing', () => {
    expect(memoriesAcrossSize(generateAlbum(photos, '8x8'), photos, '8x8', '6x8')).toEqual({ carried: [], lost: [] });
  });
});

/** Run `f` from the same Math.random stream each time. */
function withSeed<T>(f: () => T): T {
  const real = Math.random;
  Math.random = mulberry32(12345);
  try { return f(); } finally { Math.random = real; }
}
