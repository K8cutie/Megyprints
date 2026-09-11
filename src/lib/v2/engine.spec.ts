import { describe, it, expect } from 'vitest';
import { generateAlbum } from '../../pages/builder/generateAlbum';
import { getTemplateById, getTemplatesForRatio } from '../../pages/builder/pageTemplates';
import type { AlbumPage, UploadedPhoto } from '../../pages/builder/types';
import type { Rect } from './fit';

/* ══════════════════════════════════════════════════════════════════════════
   v2 · FIT-TO-LAYOUT inside the real engine.
   The bottleneck: an all-square pool could only ever draw square layouts, so
   late in the album "random" stopped being random. With subject boxes, a
   square photo whose subject sits safely inside the window may enter a
   rectangular layout — and a photo whose subject would be cut may NOT, even
   by v1's own loosening. Without subjects the engine is v1, untouched.
   ══════════════════════════════════════════════════════════════════════════ */

const photo = (i: number, w: number, h: number): UploadedPhoto =>
  ({ id: `p${i}`, previewUrl: '', name: `p${i}.jpg`, type: 'image/jpeg', size: 1000, width: w, height: h, capturedAt: i * 60_000 });
const squares = (n: number) => Array.from({ length: n }, (_, i) => photo(i, 3000, 3000));
const landscapes = (n: number) => Array.from({ length: n }, (_, i) => photo(i, 3000, 2000));

const CENTRED: Rect = { x: 0.3, y: 0.3, w: 0.4, h: 0.4 };
const TOP_HEAVY: Rect = { x: 0.3, y: 0.05, w: 0.4, h: 0.3 };
/** Faces from 2% to 98% of the width — even a 4:3 neighbour cuts someone. */
const WIDE_GROUP: Rect = { x: 0.02, y: 0.3, w: 0.96, h: 0.3 };

const pageRatio = (p: AlbumPage) => (p.templateId ? getTemplateById(p.templateId)?.targetRatio : undefined);
const filledPages = (pages: AlbumPage[]) => pages.filter((p) => p.templateId && (p.slotFills ?? []).some((f) => f != null));
const distinctTemplates = (pages: AlbumPage[]) => new Set(filledPages(pages).map((p) => p.templateId)).size;

describe('v2 engine — the unlock', () => {
  it('v1 (no subjects): an all-square pool draws ONLY square layouts, and writes no pan', () => {
    const pages = generateAlbum(squares(80), '8x8', undefined);
    const filled = filledPages(pages);
    expect(filled.length).toBeGreaterThan(20);
    expect(filled.every((p) => pageRatio(p) === '1:1'), 'a non-square layout leaked into v1').toBe(true);
    expect(filled.every((p) => (p.slotOffsetsX ?? []).every((o) => o === 0) && (p.slotOffsetsY ?? []).every((o) => o === 0))).toBe(true);
  });

  it('v2 (subjects): the same square pool ENTERS rectangular layouts and gains variety', () => {
    const photos = squares(80);
    const subjects: Record<number, Rect> = {};
    photos.forEach((_, i) => { subjects[i] = i % 2 ? TOP_HEAVY : CENTRED; });

    // Both engines are randomised; compare the typical case over several runs.
    let v1Variety = 0;
    let v2Variety = 0;
    let v2Rect = 0;
    const RUNS = 6;
    for (let r = 0; r < RUNS; r++) {
      v1Variety += distinctTemplates(generateAlbum(photos, '8x8', undefined));
      const v2 = generateAlbum(photos, '8x8', undefined, undefined, { subjects });
      v2Variety += distinctTemplates(v2);
      v2Rect += filledPages(v2).filter((p) => pageRatio(p) !== '1:1').length;
    }
    expect(v2Rect, 'no rectangular layout was ever used for square photos').toBeGreaterThan(0);
    expect(v2Variety, 'v2 did not draw from a wider library than v1').toBeGreaterThan(v1Variety);
  });

  it('v2 writes the pan in design pixels, only where a subject is known, and never past the photo edge', () => {
    const photos = squares(60);
    const subjects: Record<number, Rect> = {};
    photos.forEach((_, i) => { if (i % 3 !== 2) subjects[i] = i % 2 ? TOP_HEAVY : CENTRED; }); // every 3rd photo: unknown
    const pages = generateAlbum(photos, '8x8', undefined, undefined, { subjects });
    let nonZero = 0;
    for (const p of filledPages(pages)) {
      const t = getTemplateById(p.templateId!)!;
      (p.slotFills ?? []).forEach((idx, s) => {
        if (idx == null) return;
        const ox = p.slotOffsetsX?.[s] ?? 0;
        const oy = p.slotOffsetsY?.[s] ?? 0;
        if (subjects[idx] == null) {
          expect(ox, `unknown-subject photo ${idx} was panned`).toBe(0);
          expect(oy).toBe(0);
          return;
        }
        if (ox !== 0 || oy !== 0) nonZero++;
        // A pan can never exceed half the overflow of a 750-px design canvas.
        expect(Math.abs(ox)).toBeLessThan(750);
        expect(Math.abs(oy)).toBeLessThan(750);
        // Same-ratio slot → no crop → no pan.
        const slotRatio = t.slots[s]?.ratio ?? t.targetRatio;
        if (slotRatio === '1:1') { expect(ox).toBe(0); expect(oy).toBe(0); }
      });
      expect(p.slotScales?.every((sc) => sc === 1), 'v2 must not touch scale').toBe(true);
    }
    expect(nonZero, 'no photo was ever panned — the crop is not being written').toBeGreaterThan(0);
  });

  it('DEFERRAL: a wide group is never cropped, not even by v1\'s loose neighbour — it waits for an exact-ratio slot', () => {
    // 8x6 is a landscape album with exact 3:2 layouts, so the strict queue has
    // somewhere to go; without them the guard would (correctly) fall back.
    expect(getTemplatesForRatio('8x6', '3:2').length).toBeGreaterThan(0);
    const photos = landscapes(40);
    const subjects: Record<number, Rect> = {};
    photos.forEach((_, i) => { subjects[i] = WIDE_GROUP; });
    for (let r = 0; r < 4; r++) {
      const pages = generateAlbum(photos, '8x6', undefined, undefined, { subjects });
      for (const p of filledPages(pages)) {
        const t = getTemplateById(p.templateId!)!;
        (p.slotFills ?? []).forEach((idx, s) => {
          if (idx == null) return;
          const slotRatio = t.slots[s]?.ratio ?? t.targetRatio;
          expect(slotRatio, `group photo ${idx} was placed in a ${slotRatio} slot on ${t.id}`).toBe('3:2');
        });
      }
    }
  });

  it('no photo is ever lost, with or without subjects', () => {
    const photos = squares(53);
    const subjects: Record<number, Rect> = {};
    photos.forEach((_, i) => { subjects[i] = CENTRED; });
    for (const opts of [undefined, { subjects }]) {
      const pages = generateAlbum(photos, '8x8', undefined, undefined, opts);
      const placed = new Set(pages.flatMap((p) => (p.slotFills ?? []).filter((f): f is number => f != null)));
      expect(placed.size).toBe(53);
    }
  });
});
