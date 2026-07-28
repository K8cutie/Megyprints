import { describe, it, expect } from 'vitest';
import { generateAlbum } from './generateAlbum';
import type { AlbumSizePreset, UploadedPhoto } from './types';

/* ══════════════════════════════════════════════════════════════════════════
   AN ALBUM MUST HAVE RHYTHM, NOT JUST VARIED LAYOUTS.

   Varying the LAYOUT is not enough. Two different 2-photo layouts both look
   "different" by geometry, so a run of twenty 2-photo pages passed every
   variety check while reading as one flat stretch — which is exactly what was
   reported. The generator now also steers the PHOTOS-PER-PAGE, so consecutive
   pages break the count as well as the frame.
   ══════════════════════════════════════════════════════════════════════════ */

const roll = (n: number): UploadedPhoto[] => Array.from({ length: n }, (_, i) => {
  const portrait = i % 5 >= 3;
  return {
    id: `p${i}`, previewUrl: '', name: `p${i}.jpg`, type: 'image/jpeg', size: 1000,
    width: portrait ? 3024 : 4032, height: portrait ? 4032 : 3024, capturedAt: i,
  };
});

const perPage = (pages: ReturnType<typeof generateAlbum>) =>
  pages.map((p) => (p.slotFills ?? []).filter((x) => x != null).length);

const longestRun = (xs: number[]) => {
  let best = 0, cur = 0, prev = -1;
  for (const x of xs) { cur = x === prev ? cur + 1 : 1; prev = x; best = Math.max(best, cur); }
  return best;
};

// Sizes with a deck rich enough to offer more than one photo count.
const SIZES: AlbumSizePreset[] = ['6x6', '8x8', '9x9', '8x6', '6x8'];

describe('photos-per-page rhythm', () => {
  for (const size of SIZES) {
    it(`${size}: never sits on one photo-count for a long stretch`, () => {
      // 120+ photos is where multi-photo pages are dealt (below that the album
      // spreads to 1/page to fill MIN_PAGES without blanks — a deliberate,
      // separate behaviour).
      const counts = perPage(generateAlbum(roll(150), size, undefined));
      const distinct = new Set(counts).size;
      // If the deck genuinely only supports one count there is nothing to vary.
      if (distinct < 2) return;
      expect(longestRun(counts), `${size} rhythm: ${counts.slice(0, 30).join(' ')}`)
        .toBeLessThanOrEqual(3);
    });
  }

  it('8×8: a long album actually mixes counts rather than favouring one', () => {
    const counts = perPage(generateAlbum(roll(150), '8x8', undefined));
    expect(new Set(counts).size).toBeGreaterThanOrEqual(2);
    // no single count may swallow the whole album
    for (const c of new Set(counts)) {
      expect(counts.filter((x) => x === c).length).toBeLessThan(counts.length);
    }
  });

  it('single-photo pages still vary their LAYOUT (the count cannot change there)', () => {
    // 60 photos → 1/page by design; the look must still move page to page.
    const pages = generateAlbum(roll(60), '8x8', undefined);
    const ids = pages.map((p) => p.templateId);
    let adjacentRepeats = 0;
    for (let i = 1; i < ids.length; i++) if (ids[i] === ids[i - 1]) adjacentRepeats++;
    expect(adjacentRepeats).toBe(0);
    expect(new Set(ids).size).toBeGreaterThan(3);
  });
});
