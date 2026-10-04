import { describe, it, expect } from 'vitest';
import { newCoverPhotoId, coverLocalPhotoId, withLiveCoverPhoto } from './coverPhoto';
import type { AlbumPage } from './types';

/* ══════════════════════════════════════════════════════════════════════════
   A COVER PHOTO THE CUSTOMER UPLOADED STAYS AFTER THE APP IS CLOSED. It was
   kept only as a blob: URL, which dies with the tab: close the app, open it
   again, and the cover was blank (2026-10-04, walked in Chromium). The file is
   now kept in the device's photo store (like the album photos) under
   background.localPhotoId, and withLiveCoverPhoto points the cover at a fresh
   URL for it.
   ══════════════════════════════════════════════════════════════════════════ */

const cover = (background: AlbumPage['background']): AlbumPage => ({
  id: 'cover', layout: 'freeform', size: '8x8', background, photos: [], textElements: [],
} as AlbumPage);
const device = (photos: Record<string, string>) => async (id: string) => (photos[id] ? { url: photos[id] } : null);

describe('coverPhoto', () => {
  it('a cover photo id is its own (never mistaken for an album photo) and unique per pick', async () => {
    const a = newCoverPhotoId('album-1');
    await new Promise((r) => setTimeout(r, 2));
    const b = newCoverPhotoId('album-1');
    expect(a).toMatch(/^cover-album-1-/);
    expect(a).not.toBe(b);
  });

  it('reads the id only off an image background', () => {
    expect(coverLocalPhotoId(cover({ type: 'image', image: 'blob:x', localPhotoId: 'cover-1' }))).toBe('cover-1');
    expect(coverLocalPhotoId(cover({ type: 'solid', solid: '#fff', localPhotoId: 'cover-1' } as AlbumPage['background']))).toBeUndefined();
    expect(coverLocalPhotoId(cover({ type: 'image', image: 'https://x/a.jpg' }))).toBeUndefined();
    expect(coverLocalPhotoId(null)).toBeUndefined();
  });

  it('after the app was closed: the dead link is swapped for a live one from the device', async () => {
    const page = cover({ type: 'image', image: 'blob:dead', localPhotoId: 'cover-1', zoom: 1.4 } as AlbumPage['background']);
    const live = await withLiveCoverPhoto(page, device({ 'cover-1': 'blob:live' }));
    expect(live.background).toEqual({ type: 'image', image: 'blob:live', localPhotoId: 'cover-1', zoom: 1.4 });
    expect(page.background.image).toBe('blob:dead'); // the input is not mutated
  });

  it('nothing on the device (another phone, cleared storage): the cover is left as it was', async () => {
    const page = cover({ type: 'image', image: 'blob:dead', localPhotoId: 'cover-1' });
    expect(await withLiveCoverPhoto(page, device({}))).toBe(page);
  });

  it('a store that throws is a miss, not a crash', async () => {
    const page = cover({ type: 'image', image: 'blob:dead', localPhotoId: 'cover-1' });
    expect(await withLiveCoverPhoto(page, async () => { throw new Error('IDB blocked'); })).toBe(page);
  });

  it('a cover from an album photo (photoId), or no photo at all, is untouched', async () => {
    const fromAlbum = cover({ type: 'image', image: 'blob:dead', photoId: 'photo-3' });
    const plain = cover({ type: 'solid', solid: '#FFFBF7' });
    expect(await withLiveCoverPhoto(fromAlbum, device({ 'photo-3': 'blob:live' }))).toBe(fromAlbum);
    expect(await withLiveCoverPhoto(plain, device({}))).toBe(plain);
  });
});
