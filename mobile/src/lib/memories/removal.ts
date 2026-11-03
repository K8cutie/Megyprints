/* ══════════════════════════════════════════════════════════════════════════
   DELETING A MEMORY TAKES ITS QR OFF THE ALBUMS (the website's
   src/lib/memoryRemoval.ts, for My Memories on the phone).

   "Delete" asks first, saying where the QR is: the albums and pages that
   carry it, and the orders that printed it ("To change the video, use
   Replace video instead"). A confirmed delete removes the memory's row, then
   takes the QR off every album in the account through the album's own save
   (shared albumCloud.ts saveAlbumRowWith, on each album's version, once more
   on a fresh read if another device saved in between), so the next order
   neither prints nor charges it. The website also fixes its browser's draft;
   the app's open album sees the account's new version as it does any change
   made on another device.

   The website keeps these in a file that also reads its browser's draft,
   so the app keeps this copy; test/memoryRemoval.test.ts runs the
   website's own functions beside these on the same stand-in database.
   ══════════════════════════════════════════════════════════════════════════ */
import type { SupabaseClient } from '@supabase/supabase-js';
import { deserializeAlbum, saveAlbumRowWith, type AlbumData } from '@web/lib/albumCloud';
import { memoryCodesInSnapshot } from './memories';

interface PageLike {
  qrFills?: ({ code?: unknown } | null)[] | null;
  textSlotQr?: ({ code?: unknown } | null)[] | null;
  textSlotQrGeom?: (unknown | null)[] | null;
}
const holds = (f: { code?: unknown } | null | undefined, code: string) => !!f && f.code === code;

/** The pages (1-based) whose QR is this memory. */
export function pagesWithMemory(pages: readonly unknown[], code: string): number[] {
  const out: number[] = [];
  (pages as PageLike[]).forEach((p, i) => {
    if ((p?.qrFills ?? []).some((f) => holds(f, code)) || (p?.textSlotQr ?? []).some((f) => holds(f, code))) out.push(i + 1);
  });
  return out;
}

/** The pages with this memory's QR taken off (the editor's own "Remove"). */
export function withoutMemory<P>(pages: readonly P[], code: string): { pages: P[]; removed: number } {
  let removed = 0;
  const next = pages.map((page) => {
    const p = page as P & PageLike;
    const inPhoto = (p.qrFills ?? []).some((f) => holds(f, code));
    const inBox = (p.textSlotQr ?? []).some((f) => holds(f, code));
    if (!inPhoto && !inBox) return page;
    const out = { ...p } as P & PageLike;
    if (inPhoto) out.qrFills = (p.qrFills ?? []).map((f) => (holds(f, code) ? (removed++, null) : f));
    if (inBox) {
      const at = (p.textSlotQr ?? []).map((f) => holds(f, code));
      out.textSlotQr = (p.textSlotQr ?? []).map((f, i) => (at[i] ? (removed++, null) : f));
      if (p.textSlotQrGeom) out.textSlotQrGeom = p.textSlotQrGeom.map((g, i) => (at[i] ? null : g));
    }
    return out as P;
  });
  return { pages: next, removed };
}

export interface MemoryPlaces {
  albums: { id: string; title: string; pages: number[] }[];
  orders: string[];
}

/** Where a memory's QR is: the account's albums (with pages) and the
 *  orders whose printed album has it (not cancelled). */
export async function memoryPlaces(client: SupabaseClient, userId: string, code: string): Promise<MemoryPlaces> {
  const [albums, orders] = await Promise.all([
    client.from('albums').select('id, title, pages').eq('user_id', userId),
    client.from('orders').select('order_number, status, album_snapshot').eq('user_id', userId),
  ]);
  const places: MemoryPlaces = { albums: [], orders: [] };
  for (const a of (albums.data ?? []) as { id: string; title: string | null; pages: unknown }[]) {
    const pages = pagesWithMemory(Array.isArray(a.pages) ? a.pages : [], code);
    if (pages.length) places.albums.push({ id: a.id, title: a.title || 'Untitled album', pages });
  }
  for (const o of (orders.data ?? []) as { order_number: string; status: string; album_snapshot: unknown }[]) {
    if (o.status !== 'cancelled' && memoryCodesInSnapshot(o.album_snapshot).includes(code)) places.orders.push(o.order_number);
  }
  return places;
}

/** "This QR is printed in order MP-… . It comes off page 40 of "HK Trip" …" */
export function memoryDeleteWarning(places: MemoryPlaces): string {
  const quote = (s: string) => `“${s}”`;
  const pageList = (n: number[]) => (n.length === 1 ? `page ${n[0]}` : `pages ${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}`);
  const parts: string[] = [];
  if (places.orders.length) {
    parts.push(`This QR is printed in your order ${places.orders.join(', ')}. Deleting the video makes that printed QR show “Memory not found”. To change the video, use Replace video instead.`);
  }
  if (places.albums.length) {
    parts.push(`It comes off ${places.albums.map((a) => `${pageList(a.pages)} of ${quote(a.title)}`).join(' and ')} too, so the next order doesn't print or charge it.`);
  }
  if (!parts.length) parts.push('This QR isn’t in any of your albums or orders.');
  return `${parts.join(' ')} Delete it?`;
}

/** qrMemories.ts removeMemory: the memory's row. */
export async function removeMemoryRow(client: SupabaseClient, code: string): Promise<boolean> {
  const { error } = await client.from('qr_memories').delete().eq('code', code);
  return !error;
}

/** Delete the memory and take its QR off the account's albums. The row goes
 *  first: when it can't be deleted, nothing else changes. */
export async function deleteMemoryEverywhere(client: SupabaseClient, userId: string, code: string): Promise<{ ok: boolean; albums: { title: string; pages: number[] }[] }> {
  if (!(await removeMemoryRow(client, code))) return { ok: false, albums: [] };
  const done: { title: string; pages: number[] }[] = [];
  const { data } = await client.from('albums').select('*').eq('user_id', userId);
  for (const row of (data ?? []) as Record<string, unknown>[]) {
    const pages = pagesWithMemory(Array.isArray(row.pages) ? row.pages : [], code);
    if (!pages.length) continue;
    let current: Record<string, unknown> | null = row;
    for (let attempt = 0; attempt < 2 && current; attempt++) {
      const album: AlbumData = deserializeAlbum(current);
      const stripped = { ...album, pages: withoutMemory(album.pages, code).pages };
      const base = current.updated_at as string;
      try {
        const res = await saveAlbumRowWith(client, userId, stripped, { base });
        if (res.success) {
          done.push({ title: album.title || 'Untitled album', pages });
          break;
        }
        if (!res.conflict) break;
      } catch { break; }
      const { data: fresh } = await client.from('albums').select('*').eq('id', row.id as string).maybeSingle();
      current = (fresh as Record<string, unknown> | null) ?? null;
    }
  }
  return { ok: true, albums: done };
}

/** MyMemories.tsx's line after a delete. */
export function deletedNotice(albums: { title: string; pages: number[] }[]): string {
  const where = albums.map((a) => `${a.pages.length === 1 ? `page ${a.pages[0]}` : `pages ${a.pages.join(', ')}`} of “${a.title}”`).join(' and ');
  return `Deleted.${where ? ` Its QR came off ${where}.` : ''}`;
}
