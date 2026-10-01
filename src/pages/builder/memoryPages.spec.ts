import { describe, it, expect } from 'vitest';
import { generateAlbum, dealAlbumBoxes, sweepFillQuotes, isMemoryReady, canTakeMemoryQr, memoryShortfall, MIN_MEMORY_PAGES, type BoxContentOptions } from './generateAlbum';
import { getTemplateById, getTemplatesForAlbum, photoSlotCount, migrateRetiredPages } from './pageTemplates';
import { MIN_ALBUM_PAGES } from './densities';
import type { AlbumPage, AlbumSizePreset, QrFill, UploadedPhoto } from './types';

/* ══════════════════════════════════════════════════════════════════════════
   VIDEO MEMORIES LIVE ON FULL-PAGE PHOTOS (owner, 2026-10-02).
   "7 QR links as the minimum for a 40-page album" (2026-09-12) still holds,
   but the places are no longer combo boxes ("Add a VIDEO to this QR" is
   gone): every album carries at least MIN_MEMORY_PAGES full-bleed
   single-photo pages, spread across it — each takes "Add a video memory".
   Those pages get the photos that crop least on a full page (square pages:
   landscapes, never heads off portraits; 8×6: landscapes; 6×8: portraits);
   only an album short of those crops others, preferring photos whose faces
   sit inside the crop. Bordered single-photo layouts are retired.
   ══════════════════════════════════════════════════════════════════════════ */

const ph = (id: string, w: number, h: number, t: number): UploadedPhoto => ({ id, previewUrl: '', name: `${id}.jpg`, type: 'image/jpeg', size: 1, width: w, height: h, capturedAt: t });
const sq = (n: number) => Array.from({ length: n }, (_, i) => ph(`q${i}`, 3000, 3000, i));
const portraits = (n: number) => Array.from({ length: n }, (_, i) => ph(`v${i}`, 3024, 4032, i));
const landscapes = (n: number) => Array.from({ length: n }, (_, i) => ph(`h${i}`, 4032, 3024, i));
const mixed = (n: number) => Array.from({ length: n }, (_, i) => (i % 5 >= 3 ? ph(`v${i}`, 3024, 4032, i) : ph(`h${i}`, 4032, 3024, i)));
const BOX: BoxContentOptions = { quotePool: Array.from({ length: 400 }, (_, i) => `Line ${i}`), quoteFontFamily: 'Playfair Display', quoteColor: '#2D2D2D' };

const tpl = (p: AlbumPage) => (p.templateId ? getTemplateById(p.templateId) : undefined);
const memoryIdx = (pages: AlbumPage[]) => pages.map((p, i) => (canTakeMemoryQr(p) ? i : -1)).filter((i) => i >= 0);
const placed = (pages: AlbumPage[]) => pages.flatMap((p) => [...(p.slotFills ?? []), ...(p.textSlotFills ?? [])]).filter((f): f is number => f != null).sort((a, b) => a - b);
const isBorderedSingle = (p: AlbumPage) => { const t = tpl(p); return !!t && photoSlotCount(t) === 1 && !t.fullBleed; };
const SIZES: AlbumSizePreset[] = ['6x6', '8x8', '9x9', '8x6', '6x8', '6x4'];
const PAGE_ASPECT: Record<string, number> = { '6x6': 1, '8x8': 1, '9x9': 1, '8x6': 8 / 6, '6x8': 6 / 8, '6x4': 1.5 };
/** The spec's own statement of the crop rule: a photo may go on a full page
 *  unless that crosses orientation, cuts more than 25% off the top + bottom,
 *  or more than 34% off the sides. */
const allowedOnFullPage = (p: UploadedPhoto, size: string) => {
  const a = p.width / p.height, g = PAGE_ASPECT[size];
  const o = (x: number) => (x > 1.05 ? 'L' : x < 0.95 ? 'P' : 'S');
  if ((o(a) === 'L' && o(g) === 'P') || (o(a) === 'P' && o(g) === 'L')) return false;
  const crop = 1 - Math.min(a, g) / Math.max(a, g);
  return a < g ? crop <= 0.25 + 1e-9 : crop <= 0.34 + 1e-9;
};

describe('every generated album offers at least MIN_MEMORY_PAGES full-page memory pages', () => {
  expect(MIN_MEMORY_PAGES).toBe(7);
  for (const size of SIZES) {
    it(`${size}: 60 / 100 / 160 / 240 photos — square, portrait, landscape, mixed — AUTO and every density`, () => {
      for (const n of [60, 100, 160, 240]) for (const set of [sq, portraits, landscapes, mixed]) for (const density of [undefined, 2, 3, 4]) {
        const label = `${size}/${set.name}${n}/${density ?? 'auto'}`;
        const photos = set(n);
        const pages = generateAlbum(photos, size, density);
        dealAlbumBoxes(pages, BOX);
        const ready = memoryIdx(pages);
        // At least 7 whenever the album HAS 7 photos a full page may take.
        const expected = Math.min(MIN_MEMORY_PAGES, photos.filter((p) => allowedOnFullPage(p, size)).length);
        expect(ready.length, `${label}: memory pages`).toBeGreaterThanOrEqual(expected);
        // No memory page crosses orientation or cuts past the limits.
        for (const i of ready) {
          const p = photos[pages[i].slotFills!.find((f) => f != null) as number];
          expect(allowedOnFullPage(p, size), `${label}: page ${i} crops ${p.width}x${p.height} too far`).toBe(true);
        }
        // Spread: neither all at the front nor all at the back.
        if (expected >= MIN_MEMORY_PAGES) {
          expect(ready[ready.length - 1], `${label}: bunched at the front ${JSON.stringify(ready)}`).toBeGreaterThan(pages.length / 4);
          expect(ready[0], `${label}: bunched at the back ${JSON.stringify(ready)}`).toBeLessThan((pages.length * 3) / 4);
        }
        expect(pages.length).toBeGreaterThanOrEqual(MIN_ALBUM_PAGES);
        // Every photo exactly once — reserving the memory photos loses none, doubles none.
        expect(placed(pages), `${label}: photos placed`).toEqual(Array.from({ length: n }, (_, i) => i));
        // No combo box is ever dealt a QR any more.
        expect(pages.every((p) => !(p.textSlotRoll ?? []).includes('qr')), `${label}: a QR box was dealt`).toBe(true);
        // Bordered single-photo layouts are never dealt.
        expect(pages.filter(isBorderedSingle).map((p) => p.templateId), `${label}: bordered single dealt`).toEqual([]);
        // The finish-line sweep never paves a memory page over.
        const { pages: swept } = sweepFillQuotes(pages, BOX);
        expect(memoryIdx(swept).length, `${label}: after sweep`).toBeGreaterThanOrEqual(expected);
      }
    });
  }
  it('every common size reaches the floor with ordinary phone photos (mixed, square, or its own shape)', () => {
    const cases: [AlbumSizePreset, (n: number) => UploadedPhoto[]][] = [
      ['8x8', mixed], ['8x8', portraits], ['8x8', landscapes], ['8x8', sq], ['6x6', portraits], ['9x9', portraits],
      ['8x6', mixed], ['8x6', landscapes], ['8x6', sq], ['6x8', mixed], ['6x8', portraits], ['6x8', sq], ['6x4', mixed], ['6x4', landscapes],
    ];
    for (const [size, set] of cases) for (const n of [60, 100, 240]) {
      expect(memoryIdx(generateAlbum(set(n), size)).length, `${size}/${set.name}${n}`).toBeGreaterThanOrEqual(MIN_MEMORY_PAGES);
    }
  });
  it('photos all the WRONG shape for the album (portraits in 8×6, landscapes in 6×8) get no full page rather than lose half the photo', () => {
    expect(memoryIdx(generateAlbum(portraits(100), '8x6')).length).toBe(0);
    expect(memoryIdx(generateAlbum(landscapes(100), '6x8')).length).toBe(0);
  });
  it('the generation-time dealer (boxContent passed to generateAlbum) gives the same floor, and no QR boxes', () => {
    const pages = generateAlbum(sq(160), '8x6', undefined, undefined, { boxContent: BOX });
    expect(memoryIdx(pages).length).toBeGreaterThanOrEqual(MIN_MEMORY_PAGES);
    expect(pages.every((p) => !(p.textSlotRoll ?? []).includes('qr'))).toBe(true);
  });
  it('an album with fewer photos than the floor puts every photo on a memory page', () => {
    const pages = generateAlbum(mixed(5), '8x8');
    expect(memoryIdx(pages).length).toBe(5);
    expect(placed(pages)).toEqual([0, 1, 2, 3, 4]);
  });
});

describe('memory pages get the photos that crop least on a full page', () => {
  const memoryPhotos = (pages: AlbumPage[], photos: UploadedPhoto[]) => memoryIdx(pages).map((i) => photos[pages[i].slotFills!.find((f) => f != null) as number]);
  it('square album: landscapes (sides trimmed) — never a portrait while landscapes remain', () => {
    for (const size of ['6x6', '8x8', '9x9'] as const) for (const n of [60, 100, 160]) {
      const photos = mixed(n);
      const mem = memoryPhotos(generateAlbum(photos, size), photos);
      expect(mem.filter((p) => p.height > p.width).map((p) => p.id), `${size}/${n}`).toEqual([]);
    }
  });
  it('8×6 takes landscapes, 6×8 takes portraits (the page\'s own shape — zero crop)', () => {
    const photos = mixed(100);
    expect(memoryPhotos(generateAlbum(photos, '8x6'), photos).every((p) => p.width > p.height)).toBe(true);
    expect(memoryPhotos(generateAlbum(photos, '6x8'), photos).every((p) => p.height > p.width)).toBe(true);
  });
  it('an album SHORT of fitting photos crops others — preferring faces the crop keeps', () => {
    // All portraits on a square page: every memory page is a fallback crop
    // (top and bottom 12.5% go). Faces near the vertical middle survive that;
    // faces in the top 10% would not. Megy picks the former when it knows.
    const photos = portraits(100);
    const faces: Record<number, { x: number; y: number }> = {};
    photos.forEach((_, i) => { faces[i] = i % 3 === 0 ? { x: 0.5, y: 0.45 } : { x: 0.5, y: 0.06 }; });
    const pages = generateAlbum(photos, '8x8', undefined, undefined, { faceCenters: faces });
    const memIdx = memoryIdx(pages);
    expect(memIdx.length).toBeGreaterThanOrEqual(MIN_MEMORY_PAGES);
    const memPhotoIdx = memIdx.map((i) => pages[i].slotFills!.find((f) => f != null) as number);
    expect(memPhotoIdx.filter((i) => faces[i].y < 0.13), 'a memory crop beheads').toEqual([]);
  });
});

describe('bordered single-photo layouts are retired — never dealt, still resolvable', () => {
  it('no size offers a non-full-bleed single any more', () => {
    for (const size of SIZES) {
      const bordered = getTemplatesForAlbum(size).filter((t) => photoSlotCount(t) === 1 && !t.fullBleed);
      expect(bordered.map((t) => t.id), size).toEqual([]);
    }
  });
  it('an album saved with one still renders it and keeps its video-memory button (no silent re-layout)', () => {
    const saved: AlbumPage = { id: 'p', layout: 'freeform', size: '8x8', background: { type: 'solid', solid: '#FFFFFF' }, photos: [], textElements: [], templateId: 't88-solo-portrait', slotFills: [0] };
    expect(getTemplateById('t88-solo-portrait')).toBeDefined();
    expect(migrateRetiredPages([saved], '8x8')[0]).toBe(saved);
    expect(canTakeMemoryQr(saved)).toBe(true);
  });
});

describe('memoryShortfall — the upload-step nudge when photos don\'t fit the album\'s full pages', () => {
  const SIZES_OFFERED: AlbumSizePreset[] = ['6x6', '8x8', '9x9', '6x4', '8x6', '6x8'];
  const withLandscapes = (portraitN: number, landscapeN: number) => [
    ...Array.from({ length: portraitN }, (_, i) => ph(`v${i}`, 3024, 4032, i)),
    ...Array.from({ length: landscapeN }, (_, i) => ph(`h${i}`, 4032, 3024, portraitN + i)),
  ];
  it('all portraits in an 8×6: 0 of 7 fit — add 7 landscapes, or switch to 6×8', () => {
    expect(memoryShortfall(portraits(100), '8x6', SIZES_OFFERED)).toEqual({ have: 0, missing: 7, shape: 'landscape', betterSize: '6x8' });
  });
  it('3 landscapes among portraits: add 4 more', () => {
    expect(memoryShortfall(withLandscapes(97, 3), '8x6', SIZES_OFFERED)).toEqual({ have: 3, missing: 4, shape: 'landscape', betterSize: '6x8' });
  });
  it('all landscapes in a 6×8: add portraits, or switch to 8×6', () => {
    expect(memoryShortfall(landscapes(60), '6x8', SIZES_OFFERED)).toMatchObject({ have: 0, missing: 7, shape: 'portrait', betterSize: '8x6' });
  });
  it('no nudge when the album already has 7 that fit, on a square album (portraits fit there), or with under 7 photos', () => {
    expect(memoryShortfall(withLandscapes(93, 7), '8x6', SIZES_OFFERED)).toBeNull();
    expect(memoryShortfall(mixed(100), '6x8', SIZES_OFFERED)).toBeNull();
    expect(memoryShortfall(portraits(100), '8x8', SIZES_OFFERED)).toBeNull();
    expect(memoryShortfall(portraits(5), '8x6', SIZES_OFFERED)).toBeNull();
  });
  it('ignores photos still being measured (0×0), and offers no switch when no offered size fits', () => {
    const unmeasured = Array.from({ length: 20 }, (_, i) => ph(`u${i}`, 0, 0, i));
    expect(memoryShortfall(unmeasured, '8x6', SIZES_OFFERED)).toBeNull();
    expect(memoryShortfall(portraits(100), '8x6', ['8x6'])).toEqual({ have: 0, missing: 7, shape: 'landscape' });
  });
  it('the nudge agrees with what generation does: follow it and the album gets its 7', () => {
    const photos = withLandscapes(93, 7);
    expect(memoryShortfall(photos, '8x6', SIZES_OFFERED)).toBeNull();
    expect(memoryIdx(generateAlbum(photos, '8x6')).length).toBeGreaterThanOrEqual(MIN_MEMORY_PAGES);
    expect(memoryIdx(generateAlbum(portraits(100), '6x8')).length).toBeGreaterThanOrEqual(MIN_MEMORY_PAGES); // the suggested switch
  });
});

describe('canTakeMemoryQr — the ONE rule the "Add a video memory" button and the generator share', () => {
  const page = (templateId: string, over: Partial<AlbumPage> = {}): AlbumPage => ({ id: 'p', layout: 'freeform', size: '8x8', background: { type: 'solid', solid: '#FFFFFF' }, photos: [], textElements: [], templateId, slotFills: [0], ...over });
  const qr = { code: 'abc' } as unknown as QrFill;
  it('a full-page single with a photo takes one; with a QR already, an empty one or a caption box, not', () => {
    expect(canTakeMemoryQr(page('t88-fb-solo'))).toBe(true);
    expect(canTakeMemoryQr(page('t88-fb-solo', { slotFills: [null] }))).toBe(false);
    expect(canTakeMemoryQr(page('t88-fb-solo', { qrFills: [qr] }))).toBe(false);
    expect(canTakeMemoryQr(page('t88-fb-solo-ls-box-below'))).toBe(false);
  });
  it('a memory page counts as video-ready before and after its QR goes on', () => {
    expect(isMemoryReady(page('t88-fb-solo'))).toBe(true);
    expect(isMemoryReady(page('t88-fb-solo', { qrFills: [qr] }))).toBe(true);
    // An empty QR caption box no longer counts — those are retired.
    expect(isMemoryReady(page('t88-fb-solo-ls-box-below', { textSlotRoll: ['qr'] }))).toBe(false);
  });
});
