// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

/* ══════════════════════════════════════════════════════════════════════════
   DELETING A MEMORY TAKES ITS QR OFF THE ALBUM (1-star testers round 3, the
   Memory Maker): 10 memories on an 8×8, order MP-2026-MUGCCF5 placed, then
   the page-40 memory deleted in My Memories. The album kept the QR, the next
   checkout still said "This album has 10" and charged "3 extra × ₱20", and
   the QR scanned to "Memory not found". The delete said nothing but "Tap
   again to delete".
   ══════════════════════════════════════════════════════════════════════════ */

type Row = Record<string, unknown>;
const db: { albums: Row[]; orders: Row[] } = { albums: [], orders: [] };
const query = (table: 'albums' | 'orders') => {
  let rows = db[table];
  const q = {
    select: () => q,
    eq: (col: string, v: unknown) => { rows = rows.filter((r) => r[col] === v); return q; },
    maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
    then: (res: (v: { data: Row[]; error: null }) => unknown) => Promise.resolve({ data: rows, error: null }).then(res),
  };
  return q;
};
vi.mock('./supabase', () => ({ supabase: { from: (t: 'albums' | 'orders') => query(t) } }));
const removeMemory = vi.fn<(code: string) => Promise<boolean>>(async () => true);
vi.mock('./qrMemories', async (importOriginal) => ({ ...(await importOriginal<Record<string, unknown>>()), removeMemory: (code: string) => removeMemory(code) }));
const saveAlbumRow = vi.fn();
vi.mock('./useAlbumSync', async (importOriginal) => ({ ...(await importOriginal<Record<string, unknown>>()), saveAlbumRow: (...a: unknown[]) => saveAlbumRow(...a) }));

import { pagesWithMemory, withoutMemory, memoryPlaces, memoryDeleteWarning, deleteMemoryEverywhere } from './memoryRemoval';
import { DRAFT_STORAGE_KEY } from './localDraft';
import { countQrMemories } from './pricing';

const USER = 'user-1';
const qr = (code: string) => ({ code, destination: `https://x.supabase.co/storage/v1/object/public/memory-clips/${code}.mp4`, qrPngDataUrl: '', memoryUrl: `/m/${code}`, createdAt: 1, kind: 'clip' });
/** The tester's 40-page album: memories on pages 1-8, 10 and 40 (vvb6inkz). */
const CODES = ['aaaa2222', 'bbbb2222', 'cccc2222', 'dddd2222', 'eeee2222', 'ffff2222', 'gggg2222', 'hhhh2222', 'jjjj2222', 'vvb6inkz'];
const albumPages = () => Array.from({ length: 40 }, (_, i) => {
  const at = [0, 1, 2, 3, 4, 5, 6, 7, 9, 39].indexOf(i);
  return { id: `p${i}`, templateId: 'qr-badge-8x8-br', slotFills: [i, null], qrFills: at >= 0 ? [null, qr(CODES[at])] : [null, null] };
});

beforeEach(() => {
  localStorage.clear();
  removeMemory.mockClear().mockResolvedValue(true);
  saveAlbumRow.mockReset().mockImplementation(async (_u: string, album: { id: string; pages: unknown[] }, opts: { base: string }) => {
    const row = db.albums.find((r) => r.id === album.id)!;
    if (row.updated_at !== opts.base) return { success: false, conflict: { updatedAt: row.updated_at } };
    Object.assign(row, { pages: album.pages, updated_at: 'v2' });
    return { success: true, albumId: album.id, updatedAt: 'v2' };
  });
  db.albums = [{ id: 'album-1', user_id: USER, title: 'HK Trip', size_preset: '8x8', pages: albumPages(), photos: [], updated_at: 'v1' }];
  db.orders = [
    { order_number: 'MP-2026-MUGCCF5', user_id: USER, status: 'pending_payment', album_snapshot: { pages: albumPages() } },
    { order_number: 'MP-2026-OLDCNCL', user_id: USER, status: 'cancelled', album_snapshot: { pages: albumPages() } },
  ];
});

describe('where a memory\'s QR is', () => {
  it('the pages that carry it, in a photo slot or a caption box', () => {
    expect(pagesWithMemory(albumPages(), 'vvb6inkz')).toEqual([40]);
    expect(pagesWithMemory([{ textSlotQr: [qr('vvb6inkz')] }, {}], 'vvb6inkz')).toEqual([1]);
    expect(pagesWithMemory(albumPages(), 'zzzz2222')).toEqual([]);
  });
  it('taking it off is the builder\'s own Remove: the slot is cleared, the other memories stay', () => {
    const { pages, removed } = withoutMemory(albumPages(), 'vvb6inkz');
    expect(removed).toBe(1);
    expect(pages[39].qrFills).toEqual([null, null]);
    expect(pages[39].slotFills).toEqual([39, null]); // the photo stays
    expect(countQrMemories(pages)).toBe(9);
    const box = withoutMemory([{ textSlotQr: [qr('vvb6inkz')], textSlotQrGeom: [{ x: 0.5 }] }], 'vvb6inkz').pages[0];
    expect(box).toMatchObject({ textSlotQr: [null], textSlotQrGeom: [null] });
  });
  it('the account\'s albums and the orders that printed it (a cancelled order doesn\'t count)', async () => {
    const places = await memoryPlaces(USER, 'vvb6inkz');
    expect(places).toEqual({ albums: [{ id: 'album-1', title: 'HK Trip', pages: [40] }], orders: ['MP-2026-MUGCCF5'] });
  });
  it('the question before the delete says it', async () => {
    expect(memoryDeleteWarning(await memoryPlaces(USER, 'vvb6inkz'))).toBe(
      'This QR is printed in your order MP-2026-MUGCCF5. Deleting the video makes that printed QR show “Memory not found”. To change the video, use Replace video instead.'
      + ' It comes off page 40 of “HK Trip” too, so the next order doesn\'t print or charge it. Delete it?');
    expect(memoryDeleteWarning({ albums: [], orders: [] })).toBe('This QR isn’t in any of your albums or orders. Delete it?');
  });
});

describe('a confirmed delete', () => {
  it('deletes the memory and takes its QR off the album, on the album\'s own version: the next checkout counts 9', async () => {
    const r = await deleteMemoryEverywhere(USER, 'vvb6inkz');
    expect(r).toEqual({ ok: true, albums: [{ title: 'HK Trip', pages: [40] }] });
    expect(removeMemory).toHaveBeenCalledWith('vvb6inkz');
    expect(saveAlbumRow).toHaveBeenCalledWith(USER, expect.objectContaining({ id: 'album-1' }), { base: 'v1' });
    expect(countQrMemories(db.albums[0].pages as never)).toBe(9);
    expect(pagesWithMemory(db.albums[0].pages as unknown[], 'vvb6inkz')).toEqual([]);
  });
  it('this device\'s draft of the album loses the QR too and moves to the new version, so the builder carries on without a conflict', async () => {
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ albumId: 'album-1', accountId: USER, title: 'HK Trip', albumSize: '8x8', albumPages: albumPages(), uploadedPhotos: [], sync: { base: 'v1', key: 'k1' } }));
    await deleteMemoryEverywhere(USER, 'vvb6inkz');
    const d = JSON.parse(localStorage.getItem(DRAFT_STORAGE_KEY)!);
    expect(pagesWithMemory(d.albumPages, 'vvb6inkz')).toEqual([]);
    expect(countQrMemories(d.albumPages)).toBe(9);
    expect(d.sync.base).toBe('v2');
  });
  it('a draft based on another version keeps its version (the builder asks, as it always does): only the QR comes off', async () => {
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ albumId: 'album-1', accountId: USER, albumPages: albumPages(), sync: { base: 'v0-older', key: 'k0' } }));
    await deleteMemoryEverywhere(USER, 'vvb6inkz');
    const d = JSON.parse(localStorage.getItem(DRAFT_STORAGE_KEY)!);
    expect(pagesWithMemory(d.albumPages, 'vvb6inkz')).toEqual([]);
    expect(d.sync).toEqual({ base: 'v0-older', key: 'k0' });
  });
  it('another device saved in between: it tries once more on the fresh version, never over it blindly', async () => {
    saveAlbumRow.mockImplementationOnce(async () => {
      db.albums[0].updated_at = 'v1b'; // the phone saved first
      return { success: false, conflict: { updatedAt: 'v1b' } };
    });
    const r = await deleteMemoryEverywhere(USER, 'vvb6inkz');
    expect(r.albums).toHaveLength(1);
    expect(saveAlbumRow).toHaveBeenLastCalledWith(USER, expect.objectContaining({ id: 'album-1' }), { base: 'v1b' });
  });
  it('the memory can\'t be deleted: nothing else changes', async () => {
    removeMemory.mockResolvedValueOnce(false);
    expect(await deleteMemoryEverywhere(USER, 'vvb6inkz')).toEqual({ ok: false, albums: [] });
    expect(saveAlbumRow).not.toHaveBeenCalled();
    expect(countQrMemories(db.albums[0].pages as never)).toBe(10);
  });
});
