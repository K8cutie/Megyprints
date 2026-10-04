/* ══════════════════════════════════════════════════════════════════════════
   photoPresence — is each photo the album prints actually ON THIS DEVICE?
   Photos never go to the cloud before an order (that would be paying to store
   every visitor's photos); only the album's layout does. So an album opened
   on a second device — a laptop, a fresh browser — has every page but none of
   the photo files. It used to show blank pages without a word and take the
   order, printing blank frames (1-star testers round 2, 2026-10-05: the
   two-device parent, the Memory Maker, the Commuter, the Quitter).
   A photo is here when it has a live preview; restoring from this device's
   photo store leaves a photo it can't find with an empty preview.
   ══════════════════════════════════════════════════════════════════════════ */

import type { AlbumPage, UploadedPhoto } from '../pages/builder/types';

/** Indexes of the photos an album prints: photo frames and caption-box photos
 *  on every page, and the front cover's photo frames. */
export function usedPhotoIndexes(pages: AlbumPage[], coverFront?: AlbumPage | null): Set<number> {
  const used = new Set<number>();
  for (const pg of [...pages, ...(coverFront ? [coverFront] : [])]) {
    for (const f of pg.slotFills ?? []) if (typeof f === 'number' && f >= 0) used.add(f);
    for (const f of pg.textSlotFills ?? []) if (typeof f === 'number' && f >= 0) used.add(f);
  }
  return used;
}

export const photoIsHere = (p: Pick<UploadedPhoto, 'previewUrl'> | undefined): boolean => !!p?.previewUrl;

export interface MissingPhotos {
  /** How many photos the album prints are not on this device. */
  count: number;
  /** Album pages (1-based) that print one of them. */
  pages: number[];
  /** The front cover prints one of them. */
  cover: boolean;
  /** Their file names, so the customer knows what to look for. */
  names: string[];
}

export function missingPhotos(pages: AlbumPage[], photos: Pick<UploadedPhoto, 'previewUrl' | 'name'>[], coverFront?: AlbumPage | null): MissingPhotos {
  const gone = (i: number) => !photoIsHere(photos[i]);
  const missing = [...usedPhotoIndexes(pages, coverFront)].filter(gone);
  const onPage = (pg: AlbumPage) => [...(pg.slotFills ?? []), ...(pg.textSlotFills ?? [])].some((f) => typeof f === 'number' && f >= 0 && gone(f));
  return {
    count: missing.length,
    pages: pages.flatMap((pg, i) => (onPage(pg) ? [i + 1] : [])),
    cover: !!coverFront && onPage(coverFront),
    names: missing.map((i) => photos[i]?.name ?? '').filter(Boolean),
  };
}

/** Photos put back from another copy (photoRelink) that the album prints:
 *  said before ordering, never blocking — the customer judges the copy. */
export function copyNotesMessage(pages: AlbumPage[], photos: Pick<UploadedPhoto, 'copyNote'>[], coverFront?: AlbumPage | null): string {
  const used = [...usedPhotoIndexes(pages, coverFront)];
  const softer = used.filter((i) => photos[i]?.copyNote === 'smaller' || photos[i]?.copyNote === 'differentCopy').length;
  const odd = used.filter((i) => photos[i]?.copyNote === 'mismatch').length;
  return [
    softer ? `${softer} photo${softer > 1 ? 's were' : ' was'} put back from a different, smaller copy and may print softer` : '',
    odd ? `${odd} photo${odd > 1 ? 's' : ''} put back ${odd > 1 ? "don't" : "doesn't"} have the original's shape — check ${odd > 1 ? 'they are' : "it's"} the right picture` : '',
  ].filter(Boolean).join('; ');
}

const list = (n: number[]) => (n.length <= 1 ? String(n[0] ?? '') : `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}`);

/** Where the missing photos are, and the two ways on. */
export function missingPhotosMessage(m: MissingPhotos): string {
  if (m.count === 0) return '';
  const where = [
    m.pages.length ? (m.pages.length > 6 ? `${m.pages.length} pages` : `page${m.pages.length > 1 ? 's' : ''} ${list(m.pages)}`) : '',
    m.cover ? 'the cover' : '',
  ].filter(Boolean).join(' and ');
  return `${m.count} photo${m.count > 1 ? 's' : ''} on ${where} ${m.count > 1 ? "aren't" : "isn't"} on this device. `
    + `${m.count > 1 ? "They're" : "It's"} on the phone or computer you made this album on: order from there, or add the same photos here and Megy puts each one back in its place.`;
}
