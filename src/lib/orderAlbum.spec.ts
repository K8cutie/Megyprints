import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { StoredPhoto } from './useIndexedDBPhotos';

/* ══════════════════════════════════════════════════════════════════════════
   WHICH ALBUM AN ORDER FREEZES. A customer keeps several named albums, and
   putting one away saves it, which makes it the "latest". An order that took
   the latest album could print a different album than the one on screen, so
   the order names its album by id, and "latest" is only the fallback for a
   device that knows no id at all.

   The Supabase client is an in-memory fake: it runs the query the code builds
   (eq / order / limit / maybeSingle) over rows held here, and records it.
   ══════════════════════════════════════════════════════════════════════════ */

type Row = Record<string, unknown>;

const db = vi.hoisted(() => {
  const state = {
    albums: [] as Row[],
    orders: [] as Row[],
    /** Every query the code built: table + the chain of calls. */
    queries: [] as Array<{ table: string; ops: string[] }>,
    selectError: null as string | null,
  };
  const client = {
    from(table: 'albums' | 'orders') {
      const filters: Array<[string, unknown]> = [];
      const ops: string[] = [];
      state.queries.push({ table, ops });
      let sort: { col: string; asc: boolean } | null = null;
      let cap: number | null = null;
      let inserted: Row | null = null;
      const rows = () => {
        let r = state[table].filter((row) => filters.every(([c, v]) => row[c] === v));
        if (sort) {
          const { col, asc } = sort;
          r = [...r].sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : 1) * (asc ? 1 : -1));
        }
        return cap == null ? r : r.slice(0, cap);
      };
      const q = {
        select(cols: string) { ops.push(`select(${cols})`); return q; },
        eq(col: string, v: unknown) { ops.push(`eq(${col},${String(v)})`); filters.push([col, v]); return q; },
        order(col: string, o?: { ascending?: boolean }) { ops.push(`order(${col})`); sort = { col, asc: o?.ascending !== false }; return q; },
        limit(n: number) { ops.push(`limit(${n})`); cap = n; return q; },
        insert(row: Row) {
          ops.push('insert');
          inserted = { id: `order-${state.orders.length + 1}`, order_number: 'MP-000001', status: 'pending_payment', ...row };
          state.orders.push(inserted);
          return q;
        },
        async maybeSingle() {
          if (state.selectError) return { data: null, error: { message: state.selectError } };
          const r = rows();
          if (r.length > 1) return { data: null, error: { message: 'JSON object requested, multiple rows returned' } };
          return { data: r[0] ?? null, error: null };
        },
        async single() {
          return inserted ? { data: inserted, error: null } : { data: null, error: { message: 'no row' } };
        },
      };
      return q;
    },
  };
  return { state, client };
});

vi.mock('./supabase', () => ({ supabase: db.client }));
// The PDF builders pull in the whole print pipeline; ordering doesn't use them.
vi.mock('../pages/builder/generateAlbumPdf', () => ({ generateAlbumPdf: vi.fn(), generateCoverWrapPdf: vi.fn() }));

import { resolveOrderAlbumId, assertAlbumSavedForOrder, selectOrderAlbum, AlbumNotSavedError } from './orderAlbum';
import { createOrderFromAlbum } from './orders';
import { rebuildPrintJobFromAlbum } from './printJobRebuild';
import { DRAFT_STORAGE_KEY } from './localDraft';

const ME = 'user-me';
const page = (n: number) => ({ id: `p${n}`, templateId: 't1', slotFills: [0], photos: [], textElements: [] });

// Maria's Debut is the album on screen. Boracay was put away AFTER it was last
// saved (Start a new album saves the album being left), so Boracay is "latest".
const DEBUT = {
  id: 'album-debut', user_id: ME, title: "Maria's Debut", album_size: '8x8',
  pages: [page(1), page(2)], photos: [{ id: 'ph-debut', name: 'debut.jpg' }],
  updated_at: '2026-09-29T10:00:00.000Z',
};
const BORACAY = {
  id: 'album-boracay', user_id: ME, title: 'Boracay 2026', album_size: '12x12',
  pages: [page(1), page(2), page(3)], photos: [{ id: 'ph-bora', name: 'bora.jpg' }],
  updated_at: '2026-09-29T11:00:00.000Z',
};
const SOMEONE_ELSES = { ...DEBUT, id: 'album-theirs', user_id: 'user-other', updated_at: '2026-09-29T12:00:00.000Z' };

const client = db.client as unknown as Pick<SupabaseClient, 'from'>;
const COLS = 'id, pages';

beforeEach(() => {
  db.state.albums = [DEBUT, BORACAY, SOMEONE_ELSES].map((a) => ({ ...a }));
  db.state.orders = [];
  db.state.queries = [];
  db.state.selectError = null;
});

describe('resolveOrderAlbumId — which album is being ordered', () => {
  it('the album handed over from the Preview wins', () => {
    expect(resolveOrderAlbumId({ albumId: 'a' }, { albumId: 'b' })).toBe('a');
  });
  it('after a reload wiped the hand-off, the album in this device’s draft', () => {
    expect(resolveOrderAlbumId(null, { albumId: 'b' })).toBe('b');
    expect(resolveOrderAlbumId({}, { albumId: 'b' })).toBe('b');
  });
  it('knows none when there is neither (a draft from before album ids, or none)', () => {
    expect(resolveOrderAlbumId(null, null)).toBeUndefined();
    expect(resolveOrderAlbumId({ albumId: '' }, {})).toBeUndefined();
  });
});

describe('assertAlbumSavedForOrder — a guest who signed in at checkout', () => {
  it('stops the order when this album left the builder unsaved', () => {
    expect(() => assertAlbumSavedForOrder({ albumId: 'a', saved: false }, 'a')).toThrow(AlbumNotSavedError);
  });
  it('lets it through when it was saved on the way', () => {
    expect(() => assertAlbumSavedForOrder({ albumId: 'a', saved: true }, 'a')).not.toThrow();
  });
  it('ignores a note about another album, no note, or no known album', () => {
    expect(() => assertAlbumSavedForOrder({ albumId: 'other', saved: false }, 'a')).not.toThrow();
    expect(() => assertAlbumSavedForOrder(null, 'a')).not.toThrow();
    expect(() => assertAlbumSavedForOrder({ albumId: 'a', saved: false }, undefined)).not.toThrow();
  });
});

describe('selectOrderAlbum — the row an order and its PDF read', () => {
  it('reads the named album even when another album is newer', async () => {
    const row = await selectOrderAlbum<Row>(client, { userId: ME, albumId: DEBUT.id, columns: COLS });
    expect(row?.id).toBe(DEBUT.id);
  });

  it('queries that one row by id, never by recency', async () => {
    await selectOrderAlbum(client, { userId: ME, albumId: DEBUT.id, columns: COLS });
    const ops = db.state.queries[0].ops;
    expect(ops).toContain(`eq(id,${DEBUT.id})`);
    expect(ops).toContain(`eq(user_id,${ME})`);
    expect(ops.some((o) => o.startsWith('order('))).toBe(false);
  });

  it('fails loud when the named album is gone, never falling back to the latest', async () => {
    db.state.albums = db.state.albums.filter((a) => a.id !== DEBUT.id);
    await expect(selectOrderAlbum(client, { userId: ME, albumId: DEBUT.id, columns: COLS })).rejects.toBeInstanceOf(AlbumNotSavedError);
  });

  it('fails loud for an album id from another account (a shared device)', async () => {
    await expect(selectOrderAlbum(client, { userId: ME, albumId: SOMEONE_ELSES.id, columns: COLS })).rejects.toBeInstanceOf(AlbumNotSavedError);
  });

  it('with no id known, falls back to the most recently updated album of this account', async () => {
    const row = await selectOrderAlbum<Row>(client, { userId: ME, columns: COLS });
    expect(row?.id).toBe(BORACAY.id);
    expect(db.state.queries[0].ops).toContain('order(updated_at)');
  });

  it('with no id known and no albums, returns null for the caller’s own message', async () => {
    db.state.albums = [];
    expect(await selectOrderAlbum(client, { userId: ME, columns: COLS })).toBeNull();
  });

  it('surfaces a query error', async () => {
    db.state.selectError = 'network down';
    await expect(selectOrderAlbum(client, { userId: ME, albumId: DEBUT.id, columns: COLS })).rejects.toThrow('Could not load your album: network down');
  });
});

const shipping = {
  name: 'Maria Santos',
  phone: '0917 123 4567',
  address: {
    regionCode: '', regionName: '',
    provinceCode: 'PH-00', provinceName: 'Metro Manila',
    cityCode: 'C1', cityName: 'Pateros',
    barangayCode: 'B1', barangayName: 'San Roque',
    street: '12 Rizal St', zip: '1620',
  },
};
const orderFor = (albumId?: string) => createOrderFromAlbum({
  userId: ME, albumId, specs: { material: 'matte', cover: 'softcover', size: '8x8' }, shipping, amount: 0,
});

describe('createOrderFromAlbum — the frozen snapshot', () => {
  it('freezes the album being ordered, not the latest one', async () => {
    const created = await orderFor(DEBUT.id);
    expect(created.album_id).toBe(DEBUT.id);
    const row = db.state.orders[0];
    expect(row.album_id).toBe(DEBUT.id);
    expect((row.album_snapshot as Row).title).toBe("Maria's Debut");
    expect(row.page_count).toBe(2);
    expect(row.album_size).toBe('8x8');
  });

  it('places no order when the named album is missing', async () => {
    db.state.albums = db.state.albums.filter((a) => a.id !== DEBUT.id);
    await expect(orderFor(DEBUT.id)).rejects.toBeInstanceOf(AlbumNotSavedError);
    expect(db.state.orders).toHaveLength(0);
  });

  it('with no id known, still orders the latest album (old drafts)', async () => {
    const created = await orderFor(undefined);
    expect(created.album_id).toBe(BORACAY.id);
  });

  it('with no id and no album, says so', async () => {
    db.state.albums = [];
    await expect(orderFor(undefined)).rejects.toThrow(/No saved album found/);
  });
});

describe('rebuildPrintJobFromAlbum — the PDF after the sign-in reload', () => {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
  });
  const idbGet = async (id: string): Promise<StoredPhoto | null> => ({
    id, name: `${id}.jpg`, url: `blob:${id}`, type: 'image/jpeg', size: 1, width: 10, height: 10,
  } as unknown as StoredPhoto);
  const coverFront = { id: 'cover', templateId: 't1', slotFills: [0], photos: [], textElements: [] };

  beforeEach(() => store.clear());

  it('rebuilds from the album the order froze, not the latest', async () => {
    const job = await rebuildPrintJobFromAlbum(ME, idbGet, DEBUT.id);
    expect(job?.albumId).toBe(DEBUT.id);
    expect(job?.pages).toHaveLength(2);
    expect(job?.photos[0].id).toBe('ph-debut');
  });

  it('takes the cover from the draft only when the draft is that album', async () => {
    store.set(DRAFT_STORAGE_KEY, JSON.stringify({ albumId: DEBUT.id, coverFront }));
    expect((await rebuildPrintJobFromAlbum(ME, idbGet, DEBUT.id))?.coverFront?.id).toBe('cover');

    store.set(DRAFT_STORAGE_KEY, JSON.stringify({ albumId: BORACAY.id, coverFront }));
    expect((await rebuildPrintJobFromAlbum(ME, idbGet, DEBUT.id))?.coverFront).toBeUndefined();
  });

  it('fails loud when the named album is missing', async () => {
    db.state.albums = db.state.albums.filter((a) => a.id !== DEBUT.id);
    await expect(rebuildPrintJobFromAlbum(ME, idbGet, DEBUT.id)).rejects.toBeInstanceOf(AlbumNotSavedError);
  });
});
