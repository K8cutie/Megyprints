/* ══════════════════════════════════════════════════════════════════════════
   coverPhoto — the photo a customer uploads for the COVER (the Background
   button), as opposed to one of the album's own photos (background.photoId).

   It used to be kept only as a blob: URL. That link dies with the tab, so
   closing the app and opening it again left the cover blank, and the copy
   saved to the account was blank on every other device. The file now goes
   into the device's photo store (useIndexedDBPhotos, the same store as the
   album photos) under background.localPhotoId, and withLiveCoverPhoto points
   the cover at a fresh URL for it: on opening the builder, on opening a saved
   album, and when checkout rebuilds the print job after the sign-in reload.
   Like the album photos, it lives on THIS device only.
   ══════════════════════════════════════════════════════════════════════════ */

import type { AlbumPage } from './types';

/** A fresh store id for a cover photo. Never the shape of an album photo id,
 *  and unique per pick (a replaced photo never overwrites the old bytes, so an
 *  undo back to it still has them). */
export function newCoverPhotoId(albumId: string): string {
  return `cover-${albumId}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** The store id of the cover's own uploaded photo, if it has one. */
export function coverLocalPhotoId(page: Pick<AlbumPage, 'background'> | null | undefined): string | undefined {
  const bg = page?.background;
  if (!bg || bg.type !== 'image') return undefined;
  return typeof bg.localPhotoId === 'string' && bg.localPhotoId ? bg.localPhotoId : undefined;
}

/** The cover with its uploaded photo pointed at a live URL from the device.
 *  Unchanged (the same object) when it has none, the device doesn't hold it,
 *  or the store can't be read. */
export async function withLiveCoverPhoto<P extends AlbumPage>(
  page: P,
  get: (id: string) => Promise<{ url: string } | null>,
): Promise<P> {
  const id = coverLocalPhotoId(page);
  if (!id) return page;
  const stored = await get(id).catch(() => null);
  if (!stored?.url || stored.url === page.background.image) return page;
  return { ...page, background: { ...page.background, image: stored.url } };
}
