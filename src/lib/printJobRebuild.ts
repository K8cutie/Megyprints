// ──────────────────────────────────────────────────────────────────────────
// Print-job rebuild — durable recovery of the print job when in-memory state
// is gone.
//
// The pending print job (setPendingPrintJob) lives in MODULE MEMORY, so any
// full page reload — most commonly the Google sign-in redirect at checkout —
// wipes it. When that happens, getPendingPrintJob() returns null and the
// upload of the print-ready PDF would be silently skipped.
//
// This rebuilds the SAME job { pages, photos, albumSize } from durable sources:
//   • the latest saved `albums` row in Supabase (pages + album_size) — the
//     IDENTICAL album createOrderFromLatestAlbum snapshots, so the PDF and the
//     order can never diverge; and
//   • the photo BLOBS from the browser's IndexedDB (the same store the builder
//     rehydrates from on open) — resolved to fresh preview URLs.
//
// No raw photo ever leaves the device: only the composed PDF is uploaded, and
// only local blobs are read here. If the album is gone, empty, or every photo
// is missing from IndexedDB (e.g. ordering from a different device/browser),
// this returns null so the caller can fail LOUD instead of shipping an empty
// or broken PDF.
// ──────────────────────────────────────────────────────────────────────────

import { supabase } from './supabase';
import type { PrintJob } from './printQueue';
import type { AlbumPage, UploadedPhoto, AlbumSizePreset } from '../pages/builder/types';
import type { StoredPhoto } from './useIndexedDBPhotos';
import { normalizeStoredPageFields } from '../pages/builder/pageNormalize';

/** Coalesce snake_case / camelCase JSONB fields into the builder AlbumPage
 *  shape — shares normalizeStoredPageFields() with useBuilderState.normalizePage
 *  so a rebuilt page carries the same fills/QR/text the renderers expect. */
function normalizeStoredPage(p: any): AlbumPage {
  if (!p || typeof p !== 'object') return p as AlbumPage;
  return {
    ...normalizeStoredPageFields(p),
    templateId: (p.templateId ?? p.template_id) ?? undefined,
  } as AlbumPage;
}

/**
 * Rebuild the print job from the user's latest saved album + IndexedDB photos.
 * Returns null when there's no album, no pages, or NONE of the album's photos
 * are present in this browser's IndexedDB (device mismatch / eviction) — every
 * such case must fail loud at the call site rather than ship a broken PDF.
 *
 * @param userId  The signed-in customer's id (same one used to place the order).
 * @param idbGet  useIndexedDBPhotos().get — reads a photo blob + fresh URL.
 */
export async function rebuildPrintJobFromLatestAlbum(
  userId: string,
  idbGet: (id: string) => Promise<StoredPhoto | null>,
): Promise<PrintJob | null> {
  // Load the SAME latest album createOrderFromLatestAlbum freezes, so the PDF
  // is built from the identical pages the order snapshots.
  const { data: album, error } = await supabase
    .from('albums')
    .select('id, album_size, pages, photos')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !album) return null;

  const rawPages = Array.isArray(album.pages) ? album.pages : [];
  if (rawPages.length === 0) return null;

  const albumSize = (album.album_size as AlbumSizePreset) ?? '8x8';
  const pages: AlbumPage[] = rawPages.map((p: any, idx: number) => {
    const np = normalizeStoredPage(p);
    return {
      ...np,
      id: np.id ?? `page-${Date.now()}-${idx}`,
      size: (np.size as AlbumSizePreset) ?? albumSize,
    };
  });

  // Album `photos` is metadata-only [{ id, name }] — recover the real bytes
  // from IndexedDB. The renderer (printPipeline) resolves each filled slot by
  // POSITIONAL INDEX into this array (photos[slotFills[i]]), so positional
  // alignment with album.photos is a hard invariant: dropping a middle photo
  // would shift every later photo down one index and silently render the wrong
  // (or a blank) photo in every slot after the gap. So we DON'T filter —
  // exactly like the builder's own rehydration (useBuilderState) — and instead
  // keep a full-length array, emitting a placeholder (previewUrl:'') for any id
  // whose blob is missing locally. Only the genuinely-evicted slot renders
  // blank; every other index stays valid.
  const photosMeta: Array<{ id: string; name?: string }> = Array.isArray(album.photos)
    ? (album.photos as Array<{ id: string; name?: string }>)
    : [];

  const photos: UploadedPhoto[] = await Promise.all(
    photosMeta.map(async (meta) => {
      const stored = await idbGet(meta.id);
      if (!stored?.url) {
        // Evicted / different device: keep the slot in place with an empty
        // preview so downstream positional indices stay aligned.
        return {
          id: meta.id,
          name: meta.name ?? 'Untitled',
          previewUrl: '',
          type: 'image/jpeg',
          size: 0,
          width: 0,
          height: 0,
        } as UploadedPhoto;
      }
      const photo: UploadedPhoto = {
        id: meta.id,
        name: meta.name ?? stored.name ?? 'Untitled',
        previewUrl: stored.url,
        type: stored.type ?? 'image/jpeg',
        size: stored.size ?? 0,
        width: stored.width ?? 0,
        height: stored.height ?? 0,
      };
      return photo;
    }),
  );

  // Fail loud if a photo a page ACTUALLY USES (a filled photo slot or caption-box
  // photo) is missing locally — that slot would otherwise print BLANK. "Some other
  // photo resolved" is not good enough: every USED index must have a real preview,
  // or this device can't build a correct PDF and checkout must stop and say so.
  const usedIdx = new Set<number>();
  for (const pg of pages) {
    for (const f of pg.slotFills ?? []) if (typeof f === 'number' && f >= 0) usedIdx.add(f);
    for (const f of pg.textSlotFills ?? []) if (typeof f === 'number' && f >= 0) usedIdx.add(f);
  }
  for (const i of usedIdx) {
    if (!photos[i]?.previewUrl) return null;
  }

  return { pages, photos, albumSize };
}
