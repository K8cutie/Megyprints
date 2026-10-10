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
//   • the ordered album's `albums` row in Supabase (pages + album_size), read
//     by the id the order froze (orderAlbum.selectOrderAlbum, the same reader
//     createOrderFromAlbum uses), so the PDF and the order can never diverge; and
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
import { selectOrderAlbum, AlbumNotSavedError } from './orderAlbum';
import { DRAFT_STORAGE_KEY } from './localDraft';
import type { AlbumPage, UploadedPhoto, AlbumSizePreset, CoverDesign } from '../pages/builder/types';
import type { StoredPhoto } from './useIndexedDBPhotos';
import { normalizeStoredPageFields, storedCoverPage } from '../pages/builder/pageNormalize';
import { withLiveCoverPhoto } from '../pages/builder/coverPhoto';
import { missingPhotos } from './photoPresence';

// The local draft (DRAFT_STORAGE_KEY, written by useBuilderState) survives a
// full reload — unlike the in-memory print job — so it's the fallback for the
// DESIGNED COVER of an album row saved before 0036 (which added
// albums.cover_front, the cover saved with the album itself), recovered after
// the same-device OAuth round-trip at checkout.
//
// The draft is ONE album: the one last open on this device. Its cover is only
// this order's cover when the draft IS the ordered album — another album's
// cover must never be printed on this one.
type DraftCover = { albumId?: string; coverDesign?: CoverDesign; coverFront?: unknown };

function readDraftCover(albumId: string | undefined): DraftCover | null {
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as DraftCover;
    if (albumId && d?.albumId && d.albumId !== albumId) return null;
    return d ?? null;
  } catch {
    return null;
  }
}

function draftCoverDesign(albumId: string | undefined): CoverDesign | undefined {
  return readDraftCover(albumId)?.coverDesign;
}

/** Recover the cover-as-pages FRONT page for an album row saved before 0036
 *  (no cover_front) from the local draft, after the same-device OAuth
 *  round-trip — but only when that draft IS this album (readDraftCover): a
 *  cover's photo slots index its own album's photos, so another album's cover
 *  would print the wrong ones. (A draft from before album ids were kept can't
 *  say; it is trusted, as it always was.) It is normalized through the same
 *  sanitizer the interior pages use (shape + ornament data-URI validation). The
 *  back cover is NOT recovered — it's the reserved Megy Prints panel, derived
 *  from the front at wrap time. The cover upload is best-effort, so a missing
 *  cover photo degrades the cover only — it does NOT fail the interior job. */
function draftCoverPages(albumId: string, albumSize: AlbumSizePreset): { coverFront?: AlbumPage } {
  try {
    const d = readDraftCover(albumId);
    if (!d) return {};
    return { coverFront: storedCoverPage(d.coverFront, albumSize) ?? undefined };
  } catch {
    return {};
  }
}

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
 * Rebuild the print job from the ordered album + IndexedDB photos.
 * Returns null when there's no album, no pages, or a photo a page uses is
 * missing from this browser's IndexedDB (device mismatch / eviction) — every
 * such case must fail loud at the call site rather than ship a broken PDF.
 * Throws AlbumNotSavedError when the named album isn't in the account.
 *
 * @param userId   The signed-in customer's id (same one used to place the order).
 * @param idbGet   useIndexedDBPhotos().get — reads a photo blob + fresh URL.
 * @param albumId  The album the order froze (CreatedOrder.album_id). Without
 *                 one, the most recently updated album (drafts from before ids).
 */
export async function rebuildPrintJobFromAlbum(
  userId: string,
  idbGet: (id: string) => Promise<StoredPhoto | null>,
  albumId: string | undefined,
): Promise<PrintJob | null> {
  // Load the SAME album createOrderFromAlbum froze, so the PDF is built from
  // the identical pages the order snapshots. '*' so its cover (cover_front,
  // 0036) comes along when the database has it — naming the column would fail
  // the whole read on one that doesn't yet.
  let album: { id: string; album_size: string | null; pages: unknown; photos: unknown; cover_front?: unknown } | null;
  try {
    album = await selectOrderAlbum(supabase, { userId, albumId, columns: '*' });
  } catch (e) {
    if (e instanceof AlbumNotSavedError) throw e;
    return null;
  }
  if (!album) return null;

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
  if (missingPhotos(pages, photos).count > 0) return null;

  // The cover saved with this album — its slots index these same photos.
  // Without one (saved before 0036), this album's own draft cover.
  const savedCover: AlbumPage | null = storedCoverPage(album.cover_front, albumSize);
  const cover = savedCover ? { coverFront: savedCover } : draftCoverPages(album.id, albumSize);
  // A photo uploaded for the cover itself: its link died with the reload, its
  // file is in this device's photo store (coverPhoto).
  if (cover.coverFront) cover.coverFront = await withLiveCoverPhoto(cover.coverFront, idbGet);

  return { pages, photos, albumSize, albumId: album.id, coverDesign: draftCoverDesign(album.id), ...cover };
}
