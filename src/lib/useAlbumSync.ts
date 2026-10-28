/* ══════════════════════════════════════════════════════════════════════════
   useAlbumSync — the album rows in the account, on the WEBSITE.

   What a row holds and how it is read and written live in albumCloud.ts,
   which the 2.0 app shares (one way to save an album, for both). Each of its
   readers and writers takes the Supabase client to use; this file hands in
   the website's own (lib/supabase) and offers them under the names they
   always had, so every website import stays as it was.
   ══════════════════════════════════════════════════════════════════════════ */

import { supabase } from './supabase';
import {
  insertAlbumRowWith,
  listAccountAlbumsWith,
  saveAlbumRowWith,
  updateAlbumRowAtWith,
  useAlbumSyncWith,
  type AlbumData,
  type SaveOptions,
  type SaveResult,
  type UseAlbumSyncReturn,
} from './albumCloud';

export {
  serializeAlbum,
  deserializeAlbum,
  isMissingCoverFrontColumn,
  missingOptionalColumn,
  type AlbumPage,
  type AlbumData,
  type SaveOptions,
  type SaveResult,
  type UseAlbumSyncReturn,
} from './albumCloud';

/** Insert one NEW album row (albumCloud.insertAlbumRowWith). */
export async function insertAlbumRow(row: Record<string, unknown>) {
  return insertAlbumRowWith(supabase, row);
}

/** Write the album row only on version `base` (albumCloud.updateAlbumRowAtWith). */
export async function updateAlbumRowAt(row: Record<string, unknown>, base: string) {
  return updateAlbumRowAtWith(supabase, row, base);
}

/** Save one album row for `userId`, never blindly (albumCloud.saveAlbumRowWith). */
export async function saveAlbumRow(userId: string, albumData: AlbumData, opts?: SaveOptions): Promise<SaveResult> {
  return saveAlbumRowWith(supabase, userId, albumData, opts);
}

/** The account's albums, newest first; throws when they can't be loaded
 *  (albumCloud.listAccountAlbumsWith). */
export async function listAccountAlbums(userId: string): Promise<AlbumData[]> {
  return listAccountAlbumsWith(supabase, userId);
}

/** The album rows as a React hook (albumCloud.useAlbumSyncWith). */
export function useAlbumSync(): UseAlbumSyncReturn {
  return useAlbumSyncWith(supabase);
}
