/* ══════════════════════════════════════════════════════════════════════════
   "My albums": the signed-in person's albums, newest change first.

   Read the same way as the website's list (listAccountAlbums in
   src/lib/useAlbumSync.ts, used by src/lib/useAccountAlbums.ts): the albums
   table, this account's rows only, ordered by updated_at. A failed load is
   said as one ("couldn't load", with Try again), never as "no albums".

   The website's list leaves out the pages to stay light. This list shows how
   many pages each album has, so it also reads `pages` and counts them.
   (Later: a page count column, so the list stays light. Phase 1 notes.)

   Sizes use the website's own rules: a size we no longer make opens as its
   stand-in (liveAlbumSize, retiredSizes.ts) and is named as on the size
   picker (SIZE_LABELS, pricing.ts). Both are shared code.
   ══════════════════════════════════════════════════════════════════════════ */
import type { SupabaseClient } from '@supabase/supabase-js';
import { SIZE_LABELS } from '@web/lib/pricing';
import { liveAlbumSize } from '@web/pages/builder/retiredSizes';
import type { AlbumSizePreset } from '@web/pages/builder/types';

export const ALBUMS_RETRY_MS = 20_000;

/** The columns the list reads. */
export const ALBUM_LIST_COLUMNS = 'id, title, album_size, pages, updated_at';

export interface AlbumRow {
  id: string;
  name: string;
  size: AlbumSizePreset;
  /** '8×8', as the website's size picker says it. */
  sizeLabel: string;
  pages: number;
  /** ISO time of the last change, or null when the row has none. */
  updatedAt: string | null;
}

const isSize = (s: string): s is AlbumSizePreset => Object.prototype.hasOwnProperty.call(SIZE_LABELS, s);

/** One database row → one line of the list. Same fallbacks as the website's
 *  deserializeAlbum: 'Untitled Album', and 8x8 for an unknown size. */
export function toAlbumRow(row: Record<string, unknown>): AlbumRow {
  const live = liveAlbumSize(typeof row.album_size === 'string' ? row.album_size : null);
  const size: AlbumSizePreset = live && isSize(live) ? live : '8x8';
  const title = typeof row.title === 'string' && row.title.trim() ? row.title : 'Untitled Album';
  return {
    id: String(row.id),
    name: title,
    size,
    sizeLabel: SIZE_LABELS[size],
    pages: Array.isArray(row.pages) ? row.pages.length : 0,
    updatedAt: typeof row.updated_at === 'string' ? row.updated_at : null,
  };
}

/** This account's albums, newest change first. Throws when they could not
 *  be loaded (so the screen can say "couldn't load", not "no albums"). */
export async function listMyAlbums(client: SupabaseClient, userId: string): Promise<AlbumRow[]> {
  const { data, error } = await client
    .from('albums')
    .select(ALBUM_LIST_COLUMNS)
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  if (!data || !Array.isArray(data)) return [];
  return data.map((row) => toAlbumRow(row as Record<string, unknown>));
}

/** "Changed 3 hours ago", in plain words. */
export function changedAgo(iso: string | null, now: Date = new Date()): string {
  if (!iso) return '';
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return '';
  const sec = Math.max(0, Math.floor((now.getTime() - then.getTime()) / 1000));
  const min = Math.floor(sec / 60);
  const hour = Math.floor(min / 60);
  const day = Math.floor(hour / 24);
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'} ago`;
  if (sec < 60) return 'Changed just now';
  if (min < 60) return `Changed ${plural(min, 'minute')}`;
  if (hour < 24) return `Changed ${plural(hour, 'hour')}`;
  if (day < 30) return `Changed ${plural(day, 'day')}`;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `Changed ${then.getDate()} ${months[then.getMonth()]} ${then.getFullYear()}`;
}
