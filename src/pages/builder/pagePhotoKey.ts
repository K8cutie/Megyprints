import type { AlbumPage, UploadedPhoto } from './types';
import { resolveBgImageSrc } from './types';

/** The photo URLs a page actually DRAWS — the photo half of the Fabric
 *  editor's repaint fingerprint (useCanvasEngine).
 *
 *  The fingerprint used to carry only photo INDEXES (slotFills). After a
 *  reload every saved blob: URL is dead, so the editor's first paint loads
 *  nothing (0×0 images); IndexedDB rehydration then swaps in live URLs for
 *  the SAME indexes — the fingerprint didn't change, the editor never
 *  repainted, and the page sat photo-less until the customer turned the page.
 *
 *  Covers every place the editor draws an uploaded photo: photo slots,
 *  photos inside caption boxes, and a photo background (by photo id). Only
 *  this page's photos, so a URL change elsewhere in the album repaints
 *  nothing. */
export function pagePhotoKey(page: AlbumPage, photos: UploadedPhoto[]): string {
  const url = (i: number | null | undefined) => (i != null ? photos[i]?.previewUrl ?? '' : '');
  const slots = (page.slotFills ?? []).map(url).join('|');
  const boxes = (page.textSlotFills ?? []).map(url).join('|');
  const bg = page.background?.photoId ? resolveBgImageSrc(page.background, photos) ?? '' : '';
  return `${slots}#${boxes}#${bg}`;
}
