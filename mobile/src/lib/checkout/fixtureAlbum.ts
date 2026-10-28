/* ══════════════════════════════════════════════════════════════════════════
   THE TEST ALBUM checkout uses until Phase 3 (the album steps and Make my
   album) lands in the app.

   It is a real album, made by the website's own album maker (shared
   generateAlbum, with a fixed seed so every run makes the same pages) from
   48 of Megy's sample photos (public/sample-photos: free Unsplash photos,
   never anyone's own). Only their sizes and a pretend "taken" time go in;
   the pictures are shown from the website (site.ts).

   `row` is the album as the database would hold it (the albums row the
   website's createOrderFromAlbum reads with select('*')), so the order
   built from it is the order the website would build. When Phase 3 lands,
   checkout gets the real album row instead and this file goes.
   ══════════════════════════════════════════════════════════════════════════ */
import { generateAlbum } from '@web/pages/builder/generateAlbum';
import type { AlbumPage, AlbumSizePreset, UploadedPhoto } from '@web/pages/builder/types';
import { withSeed } from '../sharedCheck';
import { siteFile } from './site';
import type { CheckoutAlbum, OrderAlbumRow } from './orderPayload';

/** Sample photos 01–48: [width, height] as the files are (read from the
 *  JPEGs in public/sample-photos on 2026-10-29). */
const SAMPLE_SIZES: readonly [number, number][] = [
  [1067, 1600], [1067, 1600], [1600, 1067], [1067, 1600], [1067, 1600], [1600, 1067], [1600, 1067], [1600, 1067],
  [1600, 1067], [1067, 1600], [1600, 900], [1600, 1067], [1600, 1067], [1600, 1067], [1600, 1067], [1600, 1067],
  [1600, 1373], [1067, 1600], [1067, 1600], [1600, 1067], [1600, 1067], [1600, 1067], [1600, 1067], [1069, 1600],
  [1067, 1600], [1067, 1600], [1600, 900], [1067, 1600], [1067, 1600], [1067, 1600], [1600, 1071], [1600, 1315],
  [1600, 1067], [1600, 1176], [1600, 1067], [1600, 1067], [1600, 1008], [1067, 1600], [1600, 1067], [1600, 1067],
  [1420, 1600], [1600, 1280], [1600, 1067], [1600, 1064], [1067, 1600], [1067, 1600], [1061, 1600], [1067, 1600],
];

export const FIXTURE_ALBUM_ID = '00000000-0000-4000-8000-00000000c0de';
export const FIXTURE_TITLE = 'Test album (sample photos)';
export const FIXTURE_SIZE: AlbumSizePreset = '8x8';
export const FIXTURE_SEED = 0xc4ec;
/** 2026-10-29 09:00 Manila: the pretend day the sample photos were taken. */
const DAY_START = Date.UTC(2026, 9, 29, 1, 0, 0);

const sampleName = (n: number) => `megy-sample-${String(n).padStart(2, '0')}.jpg`;

/** The 48 photos, as the album maker reads them. */
export function fixturePhotos(): UploadedPhoto[] {
  return SAMPLE_SIZES.map(([width, height], i) => ({
    id: `sample-${i + 1}`,
    name: sampleName(i + 1),
    previewUrl: siteFile(`sample-photos/${sampleName(i + 1)}`),
    type: 'image/jpeg',
    size: 250_000,
    width,
    height,
    capturedAt: DAY_START + i * 7 * 60_000,
  }));
}

/** The front cover: the album's first full page, as its own page. */
function coverFrom(pages: AlbumPage[]): AlbumPage {
  const full = pages.find((p) => (p.slotFills ?? []).filter((f) => f != null).length === 1) ?? pages[0];
  return { ...full, id: 'cover-front' };
}

export function fixtureCheckoutAlbum(): CheckoutAlbum {
  const photos = fixturePhotos();
  const pages = withSeed(FIXTURE_SEED, () => generateAlbum(photos, FIXTURE_SIZE));
  const coverFront = coverFrom(pages);
  const coverIndex = (coverFront.slotFills ?? []).find((f): f is number => typeof f === 'number');
  const coverPhotoUri = coverIndex != null ? photos[coverIndex]?.previewUrl ?? null : null;
  const row: OrderAlbumRow = {
    id: FIXTURE_ALBUM_ID,
    title: FIXTURE_TITLE,
    album_type: 'standard',
    album_size: FIXTURE_SIZE,
    selected_template: 'classic',
    photos_per_page: null,
    pages,
    // What the website saves for each photo (serializeAlbum): no picture, no address.
    photos: photos.map((p) => ({ id: p.id, name: p.name, size: p.size, width: p.width, height: p.height, capturedAt: p.capturedAt })),
    cover_photo: null,
    cover_front: coverFront,
    occasion: null,
  };
  return {
    albumId: FIXTURE_ALBUM_ID,
    title: FIXTURE_TITLE,
    albumSize: FIXTURE_SIZE,
    pages,
    photoUris: photos.map((p) => p.previewUrl),
    coverFront,
    coverPhotoUri,
    row,
    fixture: true,
  };
}
