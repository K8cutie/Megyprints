/* ══════════════════════════════════════════════════════════════════════════
   FROM THE ALBUM TO CHECKOUT (Phase 5, step 2): the website's way, on the
   phone. test/orderStart.test.ts holds it to the website.

   1. "Order this album" (the Preview's last page) runs the website's checks
      first, in its order (BuilderPreview handleOrder), all shared code:
        • fewer than 40 photos on the pages: stopped (albumMinimum);
        • a photo this phone doesn't have: stopped, the pages named
          (photoPresence; the app's phone words, screenWords): a paid print
          of empty frames can't be taken back, so there is no "anyway";
        • a blank cover, a cover title cut off, empty frames or boxes,
          placeholder words, blank pages, words too long for their box,
          photos put back from copies: said once, with "Show me" and
          "Order anyway" (orderReadiness, textFit, photoPresence).
   2. Signed in, the album is saved to the account and checkout waits for it
      (Builder handleOrder): checkout orders the account's copy, so it must
      be the one on screen. A failed save says why, in the website's words.
      Not signed in, checkout asks to sign in (as the website's does).
   3. Checkout reads the album back from the account by its id
      (lib/orderAlbum selectOrderAlbum: never another album), and orders
      that row with the pages on screen.
   ══════════════════════════════════════════════════════════════════════════ */
import type { SupabaseClient } from '@supabase/supabase-js';
import { albumPhotoCount, photosShortBy, tooFewToOrderMessage } from '@web/pages/builder/albumMinimum';
import { BLANK_COVER_MESSAGE, checkOrderReadiness, coverIsBlank, readinessMessage } from '@web/pages/builder/orderReadiness';
import { COVER_TITLE_TOO_LONG_MESSAGE, coverTitleFit, longTextsMessage, overflowingCaptions, type Measurer } from '@web/pages/builder/textFit';
import { copyNotesMessage, missingPhotos } from '@web/lib/photoPresence';
import type { AlbumPage, AlbumSizePreset, UploadedPhoto } from '@web/pages/builder/types';
import { missingOnPhoneMessage } from '../../builder/screenWords';
import type { CheckoutAlbum, OrderAlbumRow } from './orderPayload';
import { isNoConnection } from './sendOrder';

export interface OrderInput {
  pages: AlbumPage[];
  photos: UploadedPhoto[];
  coverFront: AlbumPage | null;
  albumSize: AlbumSizePreset;
  /** The caption measurer (the app's Skia one); null: long words aren't checked. */
  measurer: Measurer | null;
}

export type OrderCheck =
  | { kind: 'tooFew'; have: number; message: string }
  | { kind: 'missing'; message: string }
  /** Said once; "Order anyway" goes on. `coverFirst`: "Show me" opens the
   *  cover; else `firstPage` (the first page with something to fix). */
  | { kind: 'warn'; message: string; coverFirst: boolean; firstPage: number | null }
  | { kind: 'go' };

/** BuilderPreview handleOrder's checks, in its order. `anyway`: the customer
 *  read the warning and tapped "Order anyway". */
export function orderCheck(a: OrderInput, { anyway = false }: { anyway?: boolean } = {}): OrderCheck {
  const have = albumPhotoCount(a.pages);
  if (photosShortBy(have) > 0) return { kind: 'tooFew', have, message: tooFewToOrderMessage(have) };
  const gone = missingPhotos(a.pages, a.photos, a.coverFront);
  if (gone.count > 0) return { kind: 'missing', message: missingOnPhoneMessage(gone) };
  if (anyway) return { kind: 'go' };
  const copies = copyNotesMessage(a.pages, a.photos, a.coverFront);
  const long = overflowingCaptions(a.pages, a.albumSize, a.measurer);
  const titleCut = coverTitleFit(a.coverFront, a.albumSize, a.measurer)?.fits === false;
  const ready = checkOrderReadiness(a.pages);
  const blankCover = coverIsBlank(a.coverFront);
  const warning = [blankCover ? BLANK_COVER_MESSAGE : '', titleCut ? COVER_TITLE_TOO_LONG_MESSAGE : '', readinessMessage(ready), longTextsMessage(long.length), copies ? `${copies}.` : ''].filter(Boolean).join(' ');
  if (!warning) return { kind: 'go' };
  const first = [ready.firstPage, long[0]?.pageIndex ?? null].filter((n): n is number => n != null);
  return { kind: 'warn', message: warning, coverFirst: blankCover || titleCut, firstPage: first.length ? Math.min(...first) : null };
}

/** Builder.tsx handleOrder, a failed save: changed on another device too (the
 *  Preview's note asks which to keep), or not saved (the connection). The
 *  website's words; its note is at the top of the page, the app's below. */
export const ORDER_SAVE_CONFLICT = 'This album was also changed on another device. Choose which version to keep (the note below), then tap Order again.';
export const ORDER_SAVE_FAILED = "We couldn't save your album to your account, so it can't be ordered yet. Check your connection and tap Order again.";
export function orderSaveError(conflict: boolean): string {
  return conflict ? ORDER_SAVE_CONFLICT : ORDER_SAVE_FAILED;
}

/** lib/orderAlbum AlbumNotSavedError's words. */
export const ALBUM_NOT_SAVED = "This album isn't saved to your account yet, so we can't order it. Open it in the builder and tap Order again. It saves on the way.";

/** No connection while reading it: plain words, not the phone's error. */
export const ALBUM_LOAD_OFFLINE = "We couldn't reach your account to get this album. Check your internet, then tap Place order again.";

/** The album's row in the account, by its id (selectOrderAlbum with an id:
 *  that row or nothing, never another album). */
export async function loadOrderAlbumRow(client: Pick<SupabaseClient, 'from'>, userId: string, albumId: string): Promise<OrderAlbumRow> {
  const { data, error } = await client.from('albums').select('*').eq('user_id', userId).eq('id', albumId).maybeSingle();
  if (error) throw new Error(isNoConnection(error.message) ? ALBUM_LOAD_OFFLINE : `Could not load your album: ${error.message}`);
  if (!data) throw new Error(ALBUM_NOT_SAVED);
  return data as OrderAlbumRow;
}

/** The photo on the front cover, for checkout's "Your cover" card when the
 *  cover can't be drawn: the one the cover step put on it (its background,
 *  the website's setCoverToPhoto), else the first photo in a cover slot. The
 *  card read only the slot, so it showed an empty "Cover" box for every
 *  album made in the app (beta testers, 2026-11-04). */
export function coverPhotoUri(coverFront: AlbumPage | null, photos: readonly Pick<UploadedPhoto, 'id' | 'previewUrl'>[]): string | null {
  const bg = coverFront?.background as { type?: string; photoId?: string } | undefined;
  const onCover = bg?.type === 'image' && bg.photoId ? photos.find((p) => p.id === bg.photoId) : undefined;
  if (onCover) return onCover.previewUrl;
  const index = (coverFront?.slotFills ?? []).find((f): f is number => typeof f === 'number');
  return index != null ? photos[index]?.previewUrl ?? null : null;
}

/** What checkout orders: the album on screen, with its row from the account. */
export function checkoutAlbumFrom(
  b: { getAlbumId: () => string | undefined; albumTitle: string; albumSize: AlbumSizePreset; albumPages: AlbumPage[]; uploadedPhotos: UploadedPhoto[]; coverFront: AlbumPage | null },
  row: OrderAlbumRow,
): CheckoutAlbum {
  return {
    albumId: b.getAlbumId() ?? row.id,
    title: b.albumTitle,
    albumSize: b.albumSize,
    pages: b.albumPages,
    photoUris: b.uploadedPhotos.map((p) => p.previewUrl),
    photoIds: b.uploadedPhotos.map((p) => p.id),
    coverFront: b.coverFront,
    coverPhotoUri: coverPhotoUri(b.coverFront, b.uploadedPhotos),
    row,
  };
}
