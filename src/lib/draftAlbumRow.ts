/* ══════════════════════════════════════════════════════════════════════════
   The device draft as an album row: ONE shape for every place that saves a
   draft to an account (the builder's own serializeAlbum is the same shape,
   built from live state). The part of draftAlbum.ts that needs no browser,
   so the 2.0 app's album builder (useBuilderState) builds it the same way
   (src/shared/sharedModules.ts). Moved here unchanged, except that the
   occasion is always handed in (it used to default to this browser's).
   draftAlbum.ts re-exports it and keeps the reader of this browser's draft.
   ══════════════════════════════════════════════════════════════════════════ */

import type { AlbumData } from './albumCloud';
import { albumNameToSave } from './albumName';
import { liveAlbumSize, liftRetiredPage, liftRetiredPages } from '../pages/builder/retiredSizes';

export interface StoredDraft {
  albumId?: string;
  title?: string;
  albumSize?: string;
  albumPages?: unknown[];
  uploadedPhotos?: Array<{ id: string; name: string; size?: number; width?: number; height?: number; capturedAt?: number | null; check?: unknown; kept?: boolean; leftOut?: boolean }>;
  coverFront?: unknown;
  accountId?: string | null;
  photosPerPage?: number | null;
  /** The cloud version this draft is based on (albumSyncRecord.DraftSync). */
  sync?: unknown;
}

/** The album row for a stored draft (photo bytes stay on the device).
 *  `occasion`: the album's occasion as this device keeps it (the builder
 *  passes the one in its device store; checkout this browser's). */
export function albumDataFromDraft(stored: StoredDraft, occasion: string): AlbumData {
  return {
    id: stored.albumId,
    title: albumNameToSave(stored.title),
    sizePreset: liveAlbumSize(stored.albumSize) ?? '8x8',
    pages: liftRetiredPages(stored.albumPages ?? []) as unknown as AlbumData['pages'],
    photos: (stored.uploadedPhotos ?? []).map((p) => ({
      ...(p.size ? { size: p.size } : {}),
      ...(p.width && p.height ? { width: p.width, height: p.height } : {}),
      ...(p.capturedAt ? { capturedAt: p.capturedAt } : {}),
      id: p.id,
      name: p.name,
      ...(p.check ? { check: p.check as NonNullable<AlbumData['photos']>[number]['check'] } : {}),
      ...(p.kept ? { kept: true } : {}),
      ...(p.leftOut ? { leftOut: true } : {}),
    })),
    ...(stored.coverFront ? { coverFront: liftRetiredPage(stored.coverFront) as unknown as AlbumData['coverFront'] } : {}),
    // The occasion and photos-per-page travel with the album, as in the
    // builder's own save (round 2, N4). A draft knows only this device's.
    occasion: occasion || null,
    photosPerPage: typeof stored.photosPerPage === 'number' && stored.photosPerPage > 0 ? stored.photosPerPage : null,
  };
}
