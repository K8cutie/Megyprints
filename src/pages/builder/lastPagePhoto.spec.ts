import { describe, it, expect } from 'vitest';
import { generateAlbum } from './generateAlbum';
import { withPhotoOnLastPage } from './lastPagePhoto';
import type { AlbumPage, UploadedPhoto } from './types';
import { seedMathRandom } from '../../test/seededRandom';
import { sampleAlbumPhotos, sampleDayNumber, SAMPLE_END_OF_DAY_NAMES } from '../../lib/samplePhotos';

seedMathRandom(); // same albums every run (generateAlbum deals with Math.random)

/* ══════════════════════════════════════════════════════════════════════════
   THE DAY'S END-OF-DAY PHOTO ON THE SAMPLE ALBUM'S LAST PAGE (owner,
   2026-10-28: "so the youre done shows something different every day").
   The album maker reserves photos for full pages and video memories, so
   the latest-timed photo is not always last (walk: page 40 showed an
   earlier one). withPhotoOnLastPage trades it onto the last page. Run on
   the real album maker with each of 14 days' sample albums, every size.
   ══════════════════════════════════════════════════════════════════════════ */

const SHAPE: Record<string, [number, number]> = {};
// The samples' real shapes don't matter to the rule; mix them like the pool.
const shapeOf = (name: string): [number, number] => (SHAPE[name] ??= Number(name.slice(12, 14)) % 5 < 3 ? [1600, 1067] : [1067, 1600]);
const photosFor = (day: number): UploadedPhoto[] => sampleAlbumPhotos(day).map((name, i) => {
  const [width, height] = shapeOf(name);
  return { id: `p${i}`, previewUrl: '', name, type: 'image/jpeg', size: 1, width, height, capturedAt: Date.UTC(2026, 9, 25, 7, 40) + i * 15 * 60_000 };
});
const placed = (pages: AlbumPage[]) => pages.flatMap((p) => (p.slotFills ?? []).filter((f): f is number => f != null));

const TODAY = sampleDayNumber(new Date(2026, 9, 28));

describe('the sample album, 14 days in a row', () => {
  for (const size of ['8x8', '6x6', '8x6', '6x8', '6x4'] as const) {
    it(`${size}: the day's end-of-day photo is on the last page, and every photo is still in the album once`, () => {
      const lastPhotos = new Set<string>();
      for (let k = 0; k < 14; k++) {
        const photos = photosFor(TODAY + k);
        const endOfDay = photos.findIndex((p) => SAMPLE_END_OF_DAY_NAMES.includes(p.name));
        const made = generateAlbum(photos, size, undefined, { type: 'solid', solid: '#fff' });
        const pages = withPhotoOnLastPage(made, endOfDay);
        expect(pages[pages.length - 1].slotFills, `day ${k}`).toContain(endOfDay);
        expect([...placed(pages)].sort((a, b) => a - b)).toEqual([...placed(made)].sort((a, b) => a - b));
        expect(pages).toHaveLength(made.length);
        lastPhotos.add(photos[endOfDay].name);
      }
      // 14 days, 14 different photos under "You're done with today's test!".
      expect(lastPhotos.size).toBe(14);
    });
  }
});

describe('withPhotoOnLastPage', () => {
  const page = (id: string, fills: (number | null)[], extra: Partial<AlbumPage> = {}): AlbumPage =>
    ({ id, layout: 'single', slotFills: fills, photos: [], textElements: [], background: { type: 'solid', solid: '#fff' }, ...extra } as AlbumPage);

  it('trades places with the photo on the last page; each keeps its own pan and zoom', () => {
    const pages = [page('a', [0], { slotScales: [1.4], slotOffsetsX: [0.2], slotOffsetsY: [-0.1] }), page('b', [1]), page('c', [2], { slotScales: [1.1] })];
    const out = withPhotoOnLastPage(pages, 0);
    expect(out.map((p) => p.slotFills)).toEqual([[2], [1], [0]]);
    expect(out[2].slotScales).toEqual([1.4]);
    expect(out[2].slotOffsetsX).toEqual([0.2]);
    expect(out[2].slotOffsetsY).toEqual([-0.1]);
    expect(out[0].slotScales).toEqual([1.1]);
    expect(out[0].slotOffsetsX?.[0]).toBeUndefined();
    expect(pages[0].slotFills).toEqual([0]); // the old pages are not changed
  });

  it('changes nothing when the photo is on the last page already, or not in the album', () => {
    const pages = [page('a', [0]), page('b', [1, 2])];
    expect(withPhotoOnLastPage(pages, 2).map((p) => p.slotFills)).toEqual([[0], [1, 2]]);
    expect(withPhotoOnLastPage(pages, 9).map((p) => p.slotFills)).toEqual([[0], [1, 2]]);
  });

  it("never moves a video memory's page or a page the customer made their own", () => {
    const qr = { code: 'ABC', corner: 'br' } as never;
    const withMemory = [page('a', [0], { qrFills: [qr] }), page('b', [1])];
    expect(withPhotoOnLastPage(withMemory, 0).map((p) => p.slotFills)).toEqual([[0], [1]]);
    const studio = [page('a', [0]), page('b', [1], { studio: true })];
    expect(withPhotoOnLastPage(studio, 0).map((p) => p.slotFills)).toEqual([[0], [1]]);
  });
});
