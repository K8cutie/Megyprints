import { describe, it, expect } from 'vitest';
import {
  MIN_ALBUM_PHOTOS, photosGoingIn, photosShortBy, albumPhotoCount, addMoreLabel,
  tooFewToMakeMessage, tooFewToOrderMessage, TooFewPhotosError,
} from './albumMinimum';
import { MIN_ALBUM_PAGES, DENSITY_BY_SIZE } from './densities';
import { generateAlbum } from './generateAlbum';
import type { AlbumPage, AlbumSizePreset, UploadedPhoto } from './types';
import { seedMathRandom } from '../../test/seededRandom';

seedMathRandom(); // same albums every run (generateAlbum deals with Math.random)

/* ══════════════════════════════════════════════════════════════════════════
   THE 40-PHOTO MINIMUM (owner, 2026-10-04: "who prints albums with 14
   pictures in it" / "can we do a hard gate if there isnt a minimum of 40
   images for the album"). No album is made, or ordered, with fewer than 40
   photos — and 40 is exactly enough: at 40 the generator fills every page of
   every size, whatever photos-per-page is picked.
   ══════════════════════════════════════════════════════════════════════════ */

const page = (over: Partial<AlbumPage> = {}): AlbumPage =>
  ({ id: 'p', layout: 'freeform', size: '8x8', background: { type: 'solid', solid: '#fff' }, photos: [], textElements: [], ...over }) as AlbumPage;

describe('the numbers', () => {
  it('40 photos, one for every page of the shortest album', () => {
    expect(MIN_ALBUM_PHOTOS).toBe(40);
    expect(MIN_ALBUM_PHOTOS).toBe(MIN_ALBUM_PAGES);
  });

  it('photos the photo check left out do not count', () => {
    expect(photosGoingIn([{}, { leftOut: true }, {}, { leftOut: false }])).toBe(3);
  });

  it('how many more: 14 → 26, 39 → 1, 40 and up → 0', () => {
    expect(photosShortBy(14)).toBe(26);
    expect(photosShortBy(39)).toBe(1);
    expect(photosShortBy(40)).toBe(0);
    expect(photosShortBy(200)).toBe(0);
  });

  it('the words: "Add 26 more photos", "Add 1 more photo"', () => {
    expect(addMoreLabel(26)).toBe('Add 26 more photos');
    expect(addMoreLabel(1)).toBe('Add 1 more photo');
    expect(tooFewToMakeMessage(14)).toBe("Albums need at least 40 photos, one for every page. You have 14: add 26 more and I'll make your album.");
    expect(tooFewToOrderMessage(38)).toBe('Your album has 38 photos. Albums need at least 40 to print, so add 2 more before you order.');
    expect(tooFewToOrderMessage(1)).toContain('Your album has 1 photo.');
    const e = new TooFewPhotosError(14);
    expect(e).toBeInstanceOf(Error);
    expect(e.message).toBe(tooFewToOrderMessage(14));
  });
});

describe('albumPhotoCount — the photos actually ON the pages', () => {
  it('counts each photo once, wherever it sits; empty slots count nothing', () => {
    const pages = [
      page({ slotFills: [0, 1, null, 2] }),
      page({ slotFills: [null, null] }),
      page({ slotFills: [3], textSlotFills: [4, null] }),   // a photo that took a text box's place
      page({ photos: [{ photoIndex: 5 }, { photoIndex: 0 }] as AlbumPage['photos'] }), // free-placed; 0 again
      page({ slotFills: [1] }),                              // the same photo twice counts once
    ];
    expect(albumPhotoCount(pages)).toBe(6);
  });

  it('a blank album has none', () => {
    expect(albumPhotoCount(Array.from({ length: 40 }, () => page()))).toBe(0);
  });
});

describe('40 is exactly enough: every page of every size fills, at every photos-per-page', () => {
  // A phone roll: 3 landscape : 2 portrait, plus a few squares.
  const roll = (n: number): UploadedPhoto[] => Array.from({ length: n }, (_, i) => {
    const shape = i % 7 === 6 ? [3000, 3000] : i % 5 >= 3 ? [3024, 4032] : [4032, 3024];
    return { id: `r${i}`, previewUrl: '', name: `r${i}.jpg`, type: 'image/jpeg', size: 1, width: shape[0], height: shape[1], capturedAt: i };
  });
  const photosOn = (p: AlbumPage) => (p.slotFills ?? []).filter((f) => f != null).length + (p.textSlotFills ?? []).filter((f) => f != null).length;

  for (const size of Object.keys(DENSITY_BY_SIZE) as AlbumSizePreset[]) {
    for (const ppp of [undefined, ...DENSITY_BY_SIZE[size]]) {
      it(`${size}, ${ppp ?? 'Surprise'} per page: 40 photos → 40 pages, none blank, all 40 placed`, () => {
        const pages = generateAlbum(roll(40), size, ppp);
        expect(pages.length).toBe(40);
        expect(pages.filter((p) => photosOn(p) === 0)).toHaveLength(0);
        expect(albumPhotoCount(pages)).toBe(40);
      });
    }
  }

  // The sweep above caught "1 · Big & bold" dealing a 3-4-photo MIXED page
  // (portrait + squares) and leaving the last pages blank at 40 photos.
  for (const size of Object.keys(DENSITY_BY_SIZE) as AlbumSizePreset[]) {
    it(`${size}, 1 per page is one photo a page at 40, 80 and 120 photos`, () => {
      for (const n of [40, 80, 120]) {
        const pages = generateAlbum(roll(n), size, 1);
        expect(pages.filter((p) => photosOn(p) > 1), `${n} photos`).toHaveLength(0);
        expect(pages.length, `${n} photos`).toBe(n);
      }
    });
  }

  it('why the gate is needed: 14 photos leave blank pages', () => {
    const pages = generateAlbum(roll(14), '8x8');
    expect(pages.length).toBe(40);
    expect(pages.filter((p) => photosOn(p) === 0).length).toBe(26);
  });
});
