import { describe, it, expect } from 'vitest';
import { generateAlbum } from './generateAlbum';
import { getTemplateById } from './pageTemplates';
import { marginForTemplate } from './binding';
import { slotPhotoRect, slotDesignSize } from './slotPhotoFit';
import { ALBUM_SIZES, type AlbumPage, type UploadedPhoto } from './types';
import {
  SPREAD_LEFT_INDEX, SPREAD_LEFT_ID, SPREAD_RIGHT_ID, SPREAD_TEMPLATES, SPREAD_QR_CORNERS,
  spreadHalfOf, spreadTemplateId, spreadQrCornerOf, pickSpreadPhoto, healSpreadPairs,
  outerSpreadCorner, placeSpreadPair,
} from './miniSpread';
import { MINI_SIZE } from '../../lib/megyMini';
import { getTemplatesForAlbum } from './pageTemplates';
import { seedMathRandom, mulberry32 } from '../../test/seededRandom';

seedMathRandom();

/* ═══════════════════════════════════════════════════════════════════════════
   THE MEGY MINI'S MIDDLE SPREAD (owner, 2026-11-16): one photo across pages
   8 and 9, the stapled booklet's centre, which is one piece of paper. Its two
   halves must meet exactly at the fold, stay in step after an edit, and a
   video memory may sit only in an OUTER corner.
   ═══════════════════════════════════════════════════════════════════════════ */

const SHAPE = { L: [4032, 3024], P: [3024, 4032], S: [3000, 3000] } as const;
function roll(n: number, mix: 'phone' | 'portraits' = 'phone', seed = n): UploadedPhoto[] {
  const rnd = mulberry32(seed * 7919);
  const t0 = Date.UTC(2026, 10, 16, 9);
  return Array.from({ length: n }, (_, i) => {
    const r = rnd();
    const [width, height] = mix === 'portraits' ? SHAPE.P : SHAPE[r < 0.55 ? 'P' : r < 0.95 ? 'L' : 'S'];
    return { id: `ph-${i}`, previewUrl: '', name: `ph-${i}.jpg`, type: 'image/jpeg', size: 1, width, height, capturedAt: t0 + i * 60_000 };
  });
}
const A5 = ALBUM_SIZES.find((s) => s.preset === MINI_SIZE)!;

describe('the middle spread: which pages, which photo', () => {
  it('a Mini puts one landscape photo across pages 8 and 9, for every roll of 16 to 40', () => {
    for (let n = 16; n <= 40; n++) {
      const photos = roll(n);
      const pages = generateAlbum(photos, MINI_SIZE);
      expect(pages.length, `${n} photos`).toBe(16);
      expect(pages[SPREAD_LEFT_INDEX].templateId, `${n} photos`).toBe(SPREAD_LEFT_ID);
      expect(pages[SPREAD_LEFT_INDEX + 1].templateId, `${n} photos`).toBe(SPREAD_RIGHT_ID);
      const photo = pages[SPREAD_LEFT_INDEX].slotFills![0]!;
      expect(pages[SPREAD_LEFT_INDEX + 1].slotFills![0]).toBe(photo);
      expect(photos[photo].width).toBeGreaterThan(photos[photo].height);
      // the spread's photo is nowhere else in the book; every photo is in it
      const elsewhere = pages.filter((_, i) => i !== SPREAD_LEFT_INDEX && i !== SPREAD_LEFT_INDEX + 1)
        .flatMap((p) => p.slotFills ?? []).filter((f) => f === photo);
      expect(elsewhere, `${n} photos`).toEqual([]);
      const placed = new Set(pages.flatMap((p) => (p.slotFills ?? []).filter((f): f is number => f != null)));
      expect(placed.size, `${n} photos`).toBe(n);
    }
  });

  it('a roll of only portraits: no spread, the Mini made as before', () => {
    const pages = generateAlbum(roll(24, 'portraits'), MINI_SIZE);
    expect(pages.length).toBe(16);
    expect(pages.some((p) => spreadHalfOf(p.templateId))).toBe(false);
  });

  it('albums never get one', () => {
    const pages = generateAlbum(roll(60), '8x8');
    expect(pages.some((p) => spreadHalfOf(p.templateId))).toBe(false);
  });

  it('picks a landscape photo that fits, nearest the middle, never a memory\'s own', () => {
    const photos = roll(30);
    const pick = pickSpreadPhoto(photos)!;
    expect(photos[pick].width).toBeGreaterThan(photos[pick].height);
    expect(pickSpreadPhoto(photos, new Set([pick]))).not.toBe(pick);
    expect(pickSpreadPhoto(roll(20, 'portraits'))).toBeNull();
  });

  it('is never dealt or listed as a layout, but always resolves', () => {
    const ids = new Set(getTemplatesForAlbum(MINI_SIZE).map((t) => t.id));
    for (const t of SPREAD_TEMPLATES) {
      expect(ids.has(t.id)).toBe(false);
      expect(getTemplateById(t.id)).toBe(t);
      expect(t.albumSizes).toEqual([MINI_SIZE]);
    }
  });
});

describe('the middle spread: the halves meet exactly at the fold', () => {
  const left = getTemplateById(SPREAD_LEFT_ID)!;
  const right = getTemplateById(SPREAD_RIGHT_ID)!;

  it('has no spine margin on either half', () => {
    for (const [t, i] of [[left, 7], [right, 8]] as const) {
      expect(marginForTemplate(t, t.margin, MINI_SIZE, i)).toEqual({ top: 0, bottom: 0, left: 0, right: 0 });
    }
  });

  it('each half is one frame two pages wide: page 8 its left half, page 9 its right', () => {
    const W = A5.width, H = A5.height;
    const box = (t: typeof left) => ({ x: t.slots[0].x * W, w: t.slots[0].width * W, y: t.slots[0].y * H, h: t.slots[0].height * H });
    expect(box(left)).toEqual({ x: 0, w: 2 * W, y: 0, h: H });
    expect(box(right)).toEqual({ x: -W, w: 2 * W, y: 0, h: H });
  });

  it('draws the same photo, zoom and pan so that page 9 carries on exactly where page 8 stops', () => {
    const page = (id: string, i: number): AlbumPage => ({ id: `p${i}`, layout: 'single' as AlbumPage['layout'], templateId: id, slotFills: [0], photos: [], textElements: [], background: { type: 'solid', value: '#fff' } } as unknown as AlbumPage);
    const sizeL = slotDesignSize(page(SPREAD_LEFT_ID, 7), 0, MINI_SIZE, 7)!;
    const sizeR = slotDesignSize(page(SPREAD_RIGHT_ID, 8), 0, MINI_SIZE, 8)!;
    expect(sizeR).toEqual(sizeL);
    for (const img of [{ w: 4032, h: 3024 }, { w: 6000, h: 4000 }, { w: 1920, h: 1080 }]) {
      for (const [zoom, pan] of [[1, { x: 0, y: 0 }], [1.3, { x: 40, y: -25 }]] as const) {
        const rectL = slotPhotoRect(img, sizeL, zoom, pan);
        const rectR = slotPhotoRect(img, sizeR, zoom, pan);
        expect(rectR).toEqual(rectL);
        // Where the photo is at the fold, seen from each page: page 8's right
        // edge (x = pageW) and page 9's left edge (x = 0), through each half's
        // own frame (page 8's starts at 0, page 9's one page to the left).
        const pageW = sizeL.w / 2;
        const frameX8 = getTemplateById(SPREAD_LEFT_ID)!.slots[0].x * pageW;
        const frameX9 = getTemplateById(SPREAD_RIGHT_ID)!.slots[0].x * pageW;
        const photoAtFoldFrom8 = pageW - (frameX8 + rectL.x);
        const photoAtFoldFrom9 = 0 - (frameX9 + rectR.x);
        expect(photoAtFoldFrom9).toBeCloseTo(photoAtFoldFrom8, 9);
        const rect = rectL;
        // the photo covers the whole spread: nothing of the page shows
        expect(rect.x).toBeLessThanOrEqual(1e-9);
        expect(rect.x + rect.w).toBeGreaterThanOrEqual(sizeL.w - 1e-9);
        expect(rect.y).toBeLessThanOrEqual(1e-9);
        expect(rect.y + rect.h).toBeGreaterThanOrEqual(sizeL.h - 1e-9);
      }
    }
  });
});

describe('the middle spread: a video memory goes in an outer corner only', () => {
  const W = 148 / 25.4, H = 210 / 25.4;

  it('left half: top or bottom LEFT; right half: top or bottom RIGHT', () => {
    expect(SPREAD_QR_CORNERS).toEqual({ left: ['bl', 'tl'], right: ['br', 'tr'] });
    expect(outerSpreadCorner('left', 'br')).toBe('bl');
    expect(outerSpreadCorner('left', 'tr')).toBe('tl');
    expect(outerSpreadCorner('right', 'bl')).toBe('br');
    expect(outerSpreadCorner('right', 'tl')).toBe('tr');
    expect(spreadQrCornerOf(spreadTemplateId('left', 'bl'))).toBe('bl');
    expect(spreadHalfOf(spreadTemplateId('right', 'tr'))).toBe('right');
  });

  it('the chip prints 1.2" square, 0.35" in from the outer trim, far from the fold', () => {
    for (const side of ['left', 'right'] as const) {
      for (const corner of SPREAD_QR_CORNERS[side]) {
        const t = getTemplateById(spreadTemplateId(side, corner))!;
        const q = t.slots.find((s) => s.kind === 'qr')!;
        const x0 = q.x * W, x1 = (q.x + q.width) * W, y0 = q.y * H, y1 = (q.y + q.height) * H;
        expect(x1 - x0).toBeCloseTo(1.2, 9);
        expect(y1 - y0).toBeCloseTo(1.2, 9);
        // 0.35" from the outer edge; the fold is the other edge of the page
        const fromOuter = side === 'left' ? x0 : W - x1;
        const fromFold = side === 'left' ? W - x1 : x0;
        expect(fromOuter).toBeCloseTo(0.35, 9);
        expect(fromFold).toBeGreaterThan(4);
        expect(Math.min(y0, H - y1)).toBeCloseTo(0.35, 9);
        // the photo frame is the same two-page frame as the plain half
        expect(t.slots[0]).toEqual(getTemplateById(spreadTemplateId(side))!.slots[0]);
      }
    }
  });
});

describe('the middle spread: both halves stay in step', () => {
  const base = (id: string, extra: Partial<AlbumPage> = {}): AlbumPage => ({ id, templateId: id, slotFills: [3], slotScales: [1], slotOffsetsX: [0], slotOffsetsY: [0], ...extra } as unknown as AlbumPage);
  const book = (): AlbumPage[] => [base('a'), base(SPREAD_LEFT_ID), base(SPREAD_RIGHT_ID), base('b')];

  it('a pan or zoom on one half is copied to the other', () => {
    const prev = book();
    const next = [...prev];
    next[1] = { ...next[1], slotOffsetsX: [30], slotOffsetsY: [-12], slotScales: [1.4] };
    const healed = healSpreadPairs(prev, next);
    expect(healed[2]).toMatchObject({ slotOffsetsX: [30], slotOffsetsY: [-12], slotScales: [1.4], slotFills: [3] });
  });

  it('a new photo on the right half goes on the left half too', () => {
    const prev = book();
    const next = [...prev];
    next[2] = { ...next[2], slotFills: [7] };
    expect(healSpreadPairs(prev, next)[1].slotFills).toEqual([7]);
  });

  it('a memory on one half stays on that half only', () => {
    const prev = book();
    const next = [...prev];
    next[2] = { ...next[2], templateId: spreadTemplateId('right', 'br'), slotFills: [3, null], qrFills: [null, { kind: 'link', url: 'x' }] as unknown as AlbumPage['qrFills'] };
    const healed = healSpreadPairs(prev, next);
    expect(healed[1].templateId).toBe(SPREAD_LEFT_ID);
    expect(healed[1].qrFills).toBeUndefined();
    expect(healed[1].slotFills).toEqual([3]);
  });

  it('kept Studio pages never push the spread off pages 8 and 9', () => {
    const pages = Array.from({ length: 16 }, (_, i) => base(`p${i}`));
    pages.splice(SPREAD_LEFT_INDEX, 2);
    pages.splice(9, 0, base(SPREAD_LEFT_ID), base(SPREAD_RIGHT_ID));
    const placed = placeSpreadPair(pages);
    expect(placed[SPREAD_LEFT_INDEX].templateId).toBe(SPREAD_LEFT_ID);
    expect(placed[SPREAD_LEFT_INDEX + 1].templateId).toBe(SPREAD_RIGHT_ID);
    expect(placed.length).toBe(16);
  });
});
