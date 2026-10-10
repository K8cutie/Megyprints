/* ══════════════════════════════════════════════════════════════════════════
   DELETING A MEMORY TAKES ITS QR OFF THE ALBUM (1-star testers round 3, the
   Memory Maker; confirmed by the checker). "Delete" in My Memories removed
   the memory's row and nothing else: the album kept the QR, checkout still
   counted it ("This album has 10", "3 extra × ₱20") and a reorder would
   print a code that scans to "Memory not found". The only warning was "Tap
   again to delete", with no word that the QR was printed in an order.

   Now My Memories asks first, saying where the QR is (the albums and pages
   that carry it, the orders that printed it), and a confirmed delete takes
   the QR off those albums through the builder's own save (saveAlbumRow, on
   each album's version) and off this device's draft, so the next checkout
   neither counts nor charges it. A printed order can't change: it is said
   before the delete, with Replace video as the way to change the video.
   ══════════════════════════════════════════════════════════════════════════ */

import { supabase } from './supabase';
import { saveAlbumRow, serializeAlbum, deserializeAlbum, type AlbumData } from './useAlbumSync';
import { DRAFT_STORAGE_KEY } from './localDraft';
import type { StoredDraft } from './draftAlbum';
import { albumContentKey, draftSyncRecord, toDraftSync } from './albumSyncRecord';
import { removeMemory, memoryCodesInSnapshot } from './qrMemories';

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

/** The pages with this memory's QR taken off, as the builder's own "Remove"
 *  does it (setQrFill(slot, null); a box QR goes with its geometry). */
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

/** Where a memory's QR is: the account's albums that carry it (with pages),
 *  and the orders whose printed album has it. */
export interface MemoryPlaces {
  albums: { id: string; title: string; pages: number[] }[];
  orders: string[];
}

const readDraft = (): StoredDraft | null => {
  try { return JSON.parse(localStorage.getItem(DRAFT_STORAGE_KEY) || 'null') as StoredDraft | null; } catch { return null; }
};
const draftIsTheirs = (d: StoredDraft | null, userId: string): d is StoredDraft =>
  !!d && (!d.accountId || d.accountId === userId) && Array.isArray(d.albumPages);

export async function memoryPlaces(userId: string, code: string): Promise<MemoryPlaces> {
  const [albums, orders] = await Promise.all([
    supabase.from('albums').select('id, title, pages').eq('user_id', userId),
    supabase.from('orders').select('order_number, status, album_snapshot').eq('user_id', userId),
  ]);
  const places: MemoryPlaces = { albums: [], orders: [] };
  for (const a of (albums.data ?? []) as { id: string; title: string | null; pages: unknown }[]) {
    const pages = pagesWithMemory(Array.isArray(a.pages) ? a.pages : [], code);
    if (pages.length) places.albums.push({ id: a.id, title: a.title || 'Untitled album', pages });
  }
  // This device's draft is the newest copy of its album (or the only one).
  const d = readDraft();
  if (draftIsTheirs(d, userId)) {
    const pages = pagesWithMemory(d.albumPages ?? [], code);
    const known = places.albums.find((a) => a.id === d.albumId);
    if (known && pages.length) known.pages = pages;
    else if (!known && pages.length) places.albums.push({ id: d.albumId ?? 'draft', title: d.title || 'Untitled album', pages });
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

/** Delete the memory and take its QR off the account's albums and this
 *  device's draft. The memory row goes first: when it can't be deleted,
 *  nothing else changes. Returns the albums it came off. */
export async function deleteMemoryEverywhere(userId: string, code: string): Promise<{ ok: boolean; albums: { title: string; pages: number[] }[] }> {
  if (!(await removeMemory(code))) return { ok: false, albums: [] };
  const done: { title: string; pages: number[] }[] = [];
  const savedAt = new Map<string, { from: string; to: string; key: string }>();

  const { data } = await supabase.from('albums').select('*').eq('user_id', userId);
  for (const row of (data ?? []) as Record<string, unknown>[]) {
    const pages = pagesWithMemory(Array.isArray(row.pages) ? row.pages : [], code);
    if (!pages.length) continue;
    // On the album's own version, once more on a fresh read if another
    // device saved in between — never over a newer copy blindly.
    let current: Record<string, unknown> | null = row;
    for (let attempt = 0; attempt < 2 && current; attempt++) {
      const album: AlbumData = deserializeAlbum(current);
      const stripped = { ...album, pages: withoutMemory(album.pages, code).pages };
      const base = current.updated_at as string;
      try {
        const res = await saveAlbumRow(userId, stripped, { base });
        if (res.success) {
          savedAt.set(album.id as string, { from: base, to: res.updatedAt ?? base, key: albumContentKey(serializeAlbum(stripped)) });
          done.push({ title: album.title || 'Untitled album', pages });
          break;
        }
        if (!res.conflict) break;
      } catch { break; }
      const { data: fresh } = await supabase.from('albums').select('*').eq('id', row.id as string).maybeSingle();
      current = (fresh as Record<string, unknown> | null) ?? null;
    }
  }

  // This device's draft: the QR comes off its pages too. Its version moves
  // with the save above only when it was based on the version that save
  // started from; otherwise it stays, and the builder asks as it always does.
  try {
    const d = readDraft();
    if (draftIsTheirs(d, userId)) {
      const { pages, removed } = withoutMemory(d.albumPages ?? [], code);
      if (removed > 0) {
        const saved = d.albumId ? savedAt.get(d.albumId) : undefined;
        const rec = draftSyncRecord(d.albumId, d.sync);
        const sync = saved && rec && rec.base === saved.from
          ? toDraftSync({ albumId: d.albumId as string, base: saved.to, key: saved.key })
          : d.sync;
        localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ ...d, albumPages: pages, sync }));
        if (!saved) done.push({ title: d.title || 'Untitled album', pages: pagesWithMemory(d.albumPages ?? [], code) });
      }
    }
  } catch { /* storage full: the account's copies are fixed either way */ }
  return { ok: true, albums: done };
}
