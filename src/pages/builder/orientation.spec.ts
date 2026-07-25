import { describe, it, expect } from 'vitest';
import { generateAlbum } from './generateAlbum';
import { getTemplateById, orientationOfRatio } from './pageTemplates';
import { analyzePhotos } from './photoAnalyzer';
import type { AlbumSizePreset, UploadedPhoto } from './types';

/* ══════════════════════════════════════════════════════════════════════════
   NO PHOTO MAY LAND IN A FRAME OF THE OPPOSITE ORIENTATION.

   Crossing orientation costs ~50% of the photo — it is what chops heads and
   feet off. The placement code is orientation-strict, but every guarantee it
   makes is applied to the photo's DECLARED ratio, so a mis-measured photo
   defeats all of it silently. These tests pin both halves: the classifier must
   not invent an orientation, and the generator must never cross one.
   ══════════════════════════════════════════════════════════════════════════ */

const SIZES: AlbumSizePreset[] = ['6x6', '8x8', '9x9', '6x4', '8x6', '6x8', '11.5x8', '8.5x11'];

const photo = (id: number, w: number, h: number): UploadedPhoto => ({
  id: `p${id}`, previewUrl: '', name: `p${id}.jpg`, type: 'image/jpeg',
  size: 1000, width: w, height: h, capturedAt: id,
});

/** A deliberately lopsided mix: mostly landscape with a few portraits, which is
 *  the case that used to fail — the minority orientation got swept into the
 *  majority's templates. */
const mixed = (n: number): UploadedPhoto[] =>
  Array.from({ length: n }, (_, i) =>
    (i % 7 === 0 ? photo(i, 1080, 1920) : photo(i, 1920, 1080)));

/** Placed photos whose orientation disagrees with the slot they sit in. */
function crossings(pages: ReturnType<typeof generateAlbum>, photos: UploadedPhoto[]) {
  const out: string[] = [];
  for (const page of pages) {
    const t = page.templateId ? getTemplateById(page.templateId) : undefined;
    if (!t) continue;
    (page.slotFills ?? []).forEach((fillIdx, slotIdx) => {
      if (fillIdx == null) return;
      const p = photos[fillIdx];
      const slot = t.slots[slotIdx];
      if (!p || !slot?.ratio || !p.width || !p.height) return;
      const photoOrient = p.width > p.height ? 'landscape' : p.width < p.height ? 'portrait' : 'square';
      const slotOrient = orientationOfRatio(slot.ratio);
      // square photos are at home anywhere; only a true portrait/landscape
      // swap is the defect.
      if (photoOrient !== 'square' && slotOrient !== 'square' && photoOrient !== slotOrient) {
        out.push(`${t.id} slot${slotIdx}(${slot.ratio}) got ${p.width}x${p.height}`);
      }
    });
  }
  return out;
}

describe('orientation is never crossed when placing photos', () => {
  for (const size of SIZES) {
    it(`${size}: a portrait photo never lands in a landscape frame (or vice versa)`, () => {
      for (const n of [10, 40, 120]) {
        const photos = mixed(n);
        const bad = crossings(generateAlbum(photos, size, undefined), photos);
        expect(bad, `${size} n=${n}\n  ${bad.join('\n  ')}`).toEqual([]);
      }
    });
  }
});

describe('the classifier does not invent an orientation', () => {
  it('an UNMEASURED photo is treated as square, not asserted portrait', () => {
    // Regression: 0x0 used to be guessed at 1200x1600 (portrait), which then
    // drove template choice for the whole album.
    const a = analyzePhotos([{ ...photo(1, 0, 0) }]);
    expect(a.assignments[0]).toBe('1:1');
  });

  it('a real portrait is classified portrait, a real landscape landscape', () => {
    const a = analyzePhotos([photo(1, 1080, 1920), photo(2, 1920, 1080)]);
    expect(orientationOfRatio(a.assignments[0])).toBe('portrait');
    expect(orientationOfRatio(a.assignments[1])).toBe('landscape');
  });
});
