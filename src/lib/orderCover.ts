/* ══════════════════════════════════════════════════════════════════════════
   orderCover — send an order's cover again, from the customer's own phone.

   The cover file is made at checkout on the phone that holds the photos (they
   never go to the cloud). Until 2026-10-22 that step was skipped when it
   failed, and a paid order reached the console with "The cover file isn't in
   storage for this order yet" (MP-2026-KGCFSQN). Nobody but that phone can
   make it, so Your orders asks for it:
     • myOrdersMissingCover — my orders whose album pages arrived but whose
       cover didn't, while the cover can still be printed (0050);
     • sendOrderCover — makes the cover from the cover the ORDER froze
       (album_snapshot.cover_front: edits to the album since don't change what
       was ordered) with the order's own size, cover, paper and page count, and
       uploads it the way checkout does (create-only, 3 tries).
   ══════════════════════════════════════════════════════════════════════════ */

import { supabase } from './supabase';
import { uploadOrderCoverPdfWithRetry } from './orders';
import { reportError } from './report';
import { coverBackgroundIndex, missingPhotos, usedPhotoIndexes, PhotosNotHereError } from './photoPresence';
import type { StoredPhoto } from './useIndexedDBPhotos';
import { storedCoverPage } from '../pages/builder/pageNormalize';
import { coverLocalPhotoId, withLiveCoverPhoto } from '../pages/builder/coverPhoto';
import { ALBUM_SIZES, DEFAULT_COVER_DESIGN, type AlbumSizePreset, type CoverType, type UploadedPhoto } from '../pages/builder/types';

/** The ids of my orders still waiting for their cover file. */
export async function myOrdersMissingCover(): Promise<Set<string>> {
  const { data, error } = await supabase.rpc('my_orders_missing_cover');
  if (error) throw new Error(error.message);
  return new Set(((data ?? []) as { order_id: string }[]).map((r) => r.order_id));
}

/** Said when the cover's photo is on another device. */
export const COVER_PHOTO_NOT_HERE =
  "The photo on your cover isn't on this device. Open Your orders on the phone or computer you made this album on, and tap Send the cover there.";

type OrderCoverRow = {
  id: string;
  album_size: string | null;
  cover: string | null;
  material: string | null;
  page_count: number | null;
  cover_front: unknown;
  photos: unknown;
};

/** Make this order's cover on this device and upload it. Throws
 *  PhotosNotHereError when the cover's photo isn't on this device, or an
 *  Error with words to show. */
export async function sendOrderCover(
  userId: string,
  orderId: string,
  idbGet: (id: string) => Promise<StoredPhoto | null>,
): Promise<void> {
  const { data, error } = await supabase
    .from('orders')
    .select('id, album_size, cover, material, page_count, cover_front:album_snapshot->cover_front, photos:album_snapshot->photos')
    .eq('user_id', userId)
    .eq('id', orderId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const row = data as OrderCoverRow | null;
  const albumSize = ALBUM_SIZES.find((s) => s.preset === row?.album_size)?.preset as AlbumSizePreset | undefined;
  const ordered = row && albumSize ? storedCoverPage(row.cover_front, albumSize) : null;
  if (!row || !albumSize || !ordered || !row.page_count) {
    throw new Error("We couldn't find this order's cover. Message us and we'll sort it out.");
  }

  // Full length and in order: the cover's photo frames point at photos by
  // position. Only the photos the cover prints are read from the device.
  const meta = Array.isArray(row.photos) ? (row.photos as { id?: string; name?: string }[]) : [];
  const photos: UploadedPhoto[] = meta.map((m, i) => ({
    id: String(m?.id ?? `missing-${i}`), name: m?.name ?? 'Untitled', previewUrl: '', type: 'image/jpeg', size: 0, width: 0, height: 0,
  }));
  const wanted = usedPhotoIndexes([], ordered);
  const bg = coverBackgroundIndex(ordered, photos);
  if (bg >= 0) wanted.add(bg);
  for (const i of wanted) {
    const p = photos[i];
    if (!p) continue;
    const stored = await idbGet(p.id).catch(() => null);
    if (stored?.url) photos[i] = { ...p, previewUrl: stored.url, type: stored.type ?? p.type, size: stored.size ?? 0, width: stored.width ?? 0, height: stored.height ?? 0 };
  }

  // A photo uploaded for the cover itself lives in the same store.
  const localId = coverLocalPhotoId(ordered);
  const localHere = !localId || !!(await idbGet(localId).catch(() => null))?.url;
  if (!localHere || missingPhotos([], photos, ordered).count > 0) throw new PhotosNotHereError(COVER_PHOTO_NOT_HERE);
  const coverFront = await withLiveCoverPhoto(ordered, idbGet);

  await uploadOrderCoverPdfWithRetry(orderId, {
    albumSize,
    pageCount: row.page_count,
    cover: (row.cover || 'softcover') as CoverType,
    // C2S 140 matte or glossy: the spine is that paper stacked, as at checkout
    // (anything but glossy is matte, as in the console's press sheets).
    material: row.material === 'glossy' ? 'glossy' : 'matte',
    coverDesign: DEFAULT_COVER_DESIGN,
    coverFront,
    photos,
  }, (e, attempt) => reportError(e, { path: 'your_orders', step: 'send_cover', attempt, orderId, pages: row.page_count }));
}
