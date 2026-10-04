/* ══════════════════════════════════════════════════════════════════════════
   lookAlikes — two shots of the same moment never share a page (owner,
   2026-10-04, Megy's free photo check). Megy suggests leaving repeats out;
   when the customer keeps both, this pass moves one of them: it swaps with a
   photo of the same shape on the nearest page that has one, so the frame
   still fits (orientation is never crossed) and the album keeps its order
   closely. The full pages (the video memories) are never touched: their
   photos were picked for them.
   Works on photo INDEXES in slotFills, so nothing is lost or duplicated.
   ══════════════════════════════════════════════════════════════════════════ */

import { areRepeats, photoOrientation } from '../../lib/photoCheck';
import type { AlbumPage, UploadedPhoto } from './types';

/** How far (in pages) a photo may move to get away from its twin. */
const REACH = 6;

/** Separate repeat pairs that landed on one page. Mutates the pages' slotFills;
 *  returns how many swaps it made. */
export function separateLookAlikes(
  pages: AlbumPage[], photos: UploadedPhoto[],
  /** A page to leave alone: the full pages (generateAlbum passes canTakeMemoryQr). */
  isFullPage: (p: AlbumPage) => boolean = () => false,
): number {
  const filled = (p: AlbumPage) => (p.slotFills ?? []).filter((f): f is number => f != null);
  const multi = (p: AlbumPage) => filled(p).length >= 2 && !p.studio;
  const swappable = (p: AlbumPage) => filled(p).length >= 1 && !p.studio && !isFullPage(p);
  const repeatOnPage = (photo: number, page: AlbumPage, except: number) =>
    filled(page).some((f) => f !== except && f !== photo && areRepeats(photos[photo], photos[f]));
  let swaps = 0;
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    if (!multi(page)) continue;
    const fills = page.slotFills!;
    for (let s = 0; s < fills.length; s++) {
      const y = fills[s];
      if (y == null || !photos[y]) continue;
      // Only the LATER shot of a pair on this page moves.
      if (!fills.slice(0, s).some((x) => x != null && areRepeats(photos[x], photos[y]))) continue;
      search: for (let d = 1; d <= REACH; d++) {
        for (const j of [i + d, i - d]) {
          const other = pages[j];
          if (!other || !swappable(other)) continue;
          const of = other.slotFills!;
          for (let t = 0; t < of.length; t++) {
            const z = of[t];
            if (z == null || !photos[z] || photoOrientation(photos[z]) !== photoOrientation(photos[y])) continue;
            if (areRepeats(photos[z], photos[y]) || repeatOnPage(z, page, y) || repeatOnPage(y, other, z)) continue;
            fills[s] = z; of[t] = y;
            swaps++;
            break search;
          }
        }
      }
    }
  }
  return swaps;
}
