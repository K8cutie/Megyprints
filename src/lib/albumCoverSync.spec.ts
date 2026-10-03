import { describe, it, expect, vi, afterEach } from 'vitest';
import { supabase } from './supabase';
import { serializeAlbum, deserializeAlbum, upsertAlbumRow, isMissingCoverFrontColumn, type AlbumData } from './useAlbumSync';
import { rebuildPrintJobFromAlbum } from './printJobRebuild';
import { storedCoverPage } from '../pages/builder/pageNormalize';
import type { StoredPhoto } from './useIndexedDBPhotos';

/* ══════════════════════════════════════════════════════════════════════════
   The album's FRONT COVER is saved with the album (albums.cover_front, 0036).
   It used to live only in the draft on the device, so reopening a saved album
   showed whatever cover that device's draft had — its photo slots pointing
   into another album's photo list.
   ══════════════════════════════════════════════════════════════════════════ */

// A cover as the builder keeps it: on the cover template, photo #2 in the hero
// slot, the album name in the title box, a sticker.
const cover = {
  id: 'cover-front-1727600000000',
  layout: 'freeform',
  size: '8x8',
  templateId: 'cover-hero',
  background: { type: 'solid', solid: '#1F3A5F' },
  photos: [],
  textElements: [{ id: 'cover-ft-1', text: "Maria's Debut", boxIndex: 0, x: 0, y: 0, rotation: 0, opacity: 1, fontSize: 48, color: '#FFFFFF' }],
  slotFills: [2],
  slotScales: [1.2],
  slotOffsetsX: [0.1],
  slotOffsetsY: [-0.05],
  slotGeometries: [],
  stickers: [{ uid: 'st-1', kind: 'ornament', pngDataUrl: 'data:image/png;base64,iVBORw0KGgo=', geom: { cx: 0.8, cy: 0.2, size: 0.2, rotation: 0 } }],
};

const album = (over: Partial<AlbumData> = {}): AlbumData => ({
  id: 'a1',
  title: "Maria's Debut",
  sizePreset: '8x8',
  pages: [],
  photos: [{ id: 'p0', name: 'a.jpg' }, { id: 'p1', name: 'b.jpg' }, { id: 'p2', name: 'c.jpg' }],
  ...over,
});

/** What comes back from Postgres: the row as JSON (jsonb), plus server columns. */
const throughDb = (row: Record<string, unknown>) =>
  JSON.parse(JSON.stringify({ ...row, id: 'a1', user_id: 'u1', created_at: '2026-09-29T10:00:00Z' }));

describe('cover round trip — save → albums row → load → builder', () => {
  it('the cover comes back exactly as it was saved', () => {
    const row = serializeAlbum(album({ coverFront: cover }));
    expect(row.cover_front).toEqual(cover);

    const loaded = deserializeAlbum(throughDb(row));
    expect(loaded.coverFront).toEqual(cover);

    const restored = storedCoverPage(loaded.coverFront, '8x8');
    expect(restored).toMatchObject({
      id: cover.id,
      templateId: 'cover-hero',
      background: cover.background,
      textElements: cover.textElements,
      slotFills: [2],
      slotScales: [1.2],
      slotOffsetsX: [0.1],
      slotOffsetsY: [-0.05],
      stickers: cover.stickers,
      size: '8x8',
    });
  });

  it('its photo slots still point at the same photos of the same album', () => {
    const loaded = deserializeAlbum(throughDb(serializeAlbum(album({ coverFront: cover }))));
    const restored = storedCoverPage(loaded.coverFront, '8x8');
    expect(loaded.photos?.[restored!.slotFills![0]!]?.id).toBe('p2');
  });

  it('a save with no cover to say leaves the saved one alone (no cover_front key)', () => {
    // reset() putting away a draft stored before covers were kept
    expect('cover_front' in serializeAlbum(album())).toBe(false);
  });

  it('an album saved before 0036 (or read from a database without the column) has no cover', () => {
    const row = throughDb(serializeAlbum(album()));
    expect(deserializeAlbum(row).coverFront).toBeNull();
    expect(storedCoverPage(null, '8x8')).toBeNull();
  });

  it('a cover_front that is not a page object is not restored', () => {
    for (const bad of ['cover', 42, [cover], true]) {
      expect(deserializeAlbum(throughDb({ cover_front: bad })).coverFront).toBeNull();
      expect(storedCoverPage(bad, '8x8')).toBeNull();
    }
  });

  it('snake_case fields from the database are read like the interior pages', () => {
    const restored = storedCoverPage(
      { id: 'c', template_id: 'cover-hero', slot_fills: [1], text_elements: [{ id: 't', text: 'Hi', boxIndex: 0 }] },
      '8x8',
    );
    expect(restored).toMatchObject({ templateId: 'cover-hero', slotFills: [1], textElements: [{ text: 'Hi' }] });
  });

  it('the restored cover takes the album size, and a cover with no id gets one', () => {
    const restored = storedCoverPage({ ...cover, id: undefined, size: '6x6' }, '9x9');
    expect(restored?.size).toBe('9x9');
    expect(restored?.id).toMatch(/^cover-front-/);
  });

  it('an ornament that is not a local data: image is dropped (untrusted cloud boundary)', () => {
    const restored = storedCoverPage(
      { ...cover, ornamentFills: [{ pngDataUrl: 'https://evil.example/beacon.png' }, { pngDataUrl: 'data:image/png;base64,AA' }] },
      '8x8',
    );
    expect(restored?.ornamentFills).toEqual([null, { pngDataUrl: 'data:image/png;base64,AA' }]);
  });
});

/* ── Saving to a database that doesn't have the column yet ──────────────────
   Vercel deploys on merge; `npm run db:push` runs after. PostgREST refuses the
   WHOLE write over one unknown column, so without a fallback every album save
   would fail in that window. */

type Res = { data: unknown; error: { code?: string; message: string } | null };

function fakeAlbumsTable(responses: Res[]) {
  const sent: Record<string, unknown>[] = [];
  vi.spyOn(supabase, 'from').mockImplementation(((table: string) => {
    expect(table).toBe('albums');
    return {
      upsert: (row: Record<string, unknown>, opts: unknown) => {
        expect(opts).toEqual({ onConflict: 'id' });
        sent.push(row);
        const res = responses[sent.length - 1];
        return { select: () => ({ single: async () => res }) };
      },
    };
  }) as never);
  return sent;
}

const MISSING_ON_WRITE = { code: 'PGRST204', message: "Could not find the 'cover_front' column of 'albums' in the schema cache" };

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('upsertAlbumRow', () => {
  it('saves the cover in the same write when the column exists', async () => {
    const sent = fakeAlbumsTable([{ data: { id: 'a1' }, error: null }]);
    const row = { ...serializeAlbum(album({ coverFront: cover })), user_id: 'u1', id: 'a1' };
    const res = await upsertAlbumRow(row);
    expect(res.error).toBeNull();
    expect(sent).toHaveLength(1);
    expect(sent[0].cover_front).toEqual(cover);
  });

  it('column missing: saves the album again without the cover instead of failing', async () => {
    const sent = fakeAlbumsTable([
      { data: null, error: MISSING_ON_WRITE },
      { data: { id: 'a1' }, error: null },
    ]);
    const row = { ...serializeAlbum(album({ coverFront: cover })), user_id: 'u1', id: 'a1' };
    const res = await upsertAlbumRow(row);
    expect(res.error).toBeNull();
    expect(res.data).toEqual({ id: 'a1' });
    expect(sent).toHaveLength(2);
    expect('cover_front' in sent[1]).toBe(false);
    const rest = { ...sent[0] };
    delete rest.cover_front;
    expect(sent[1]).toEqual(rest);
    expect('cover_front' in row).toBe(true); // the caller's row is not mutated
  });

  it('any other error is returned as is, not retried', async () => {
    const sent = fakeAlbumsTable([{ data: null, error: { code: '42501', message: 'new row violates row-level security policy for table "albums"' } }]);
    const res = await upsertAlbumRow({ ...serializeAlbum(album({ coverFront: cover })), id: 'a1' });
    expect(res.error?.code).toBe('42501');
    expect(sent).toHaveLength(1);
  });

  it('a missing OTHER column is not mistaken for the cover', async () => {
    const sent = fakeAlbumsTable([{ data: null, error: { code: 'PGRST204', message: "Could not find the 'title' column of 'albums' in the schema cache" } }]);
    const res = await upsertAlbumRow({ ...serializeAlbum(album({ coverFront: cover })), id: 'a1' });
    expect(res.error?.code).toBe('PGRST204');
    expect(sent).toHaveLength(1);
  });

  it('a row without a cover is never retried', async () => {
    const sent = fakeAlbumsTable([{ data: null, error: MISSING_ON_WRITE }]);
    await upsertAlbumRow({ ...serializeAlbum(album()), id: 'a1' });
    expect(sent).toHaveLength(1);
  });
});

describe('isMissingCoverFrontColumn', () => {
  it('knows both ways PostgREST says the column is not there', () => {
    expect(isMissingCoverFrontColumn(MISSING_ON_WRITE)).toBe(true);
    expect(isMissingCoverFrontColumn({ code: '42703', message: 'column albums.cover_front does not exist' })).toBe(true);
  });
  it('and nothing else', () => {
    expect(isMissingCoverFrontColumn(null)).toBe(false);
    expect(isMissingCoverFrontColumn({ code: '42703', message: 'column albums.title does not exist' })).toBe(false);
    expect(isMissingCoverFrontColumn({ code: '23514', message: 'violates check constraint "albums_cover_front_chk"' })).toBe(false);
  });
});

/* ── Print job rebuilt after the sign-in round trip at checkout ──────────────
   It builds the cover PDF from the latest saved album. Its cover used to come
   ONLY from the draft on the device — whichever album that was. */

function fakeLatestAlbum(row: Record<string, unknown>) {
  const selected: string[] = [];
  vi.spyOn(supabase, 'from').mockImplementation((() => {
    const q = {
      select: (cols: string) => { selected.push(cols); return q; },
      eq: () => q,
      order: () => q,
      limit: () => q,
      maybeSingle: async () => ({ data: row, error: null }),
    };
    return q;
  }) as never);
  return selected;
}

function draftOnDevice(draft: Record<string, unknown> | null) {
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => (k === 'megy-album-v5' && draft ? JSON.stringify(draft) : null),
  });
}

const idbGet = async (id: string): Promise<StoredPhoto | null> =>
  ({ id, name: `${id}.jpg`, url: `blob:${id}`, type: 'image/jpeg', size: 1, width: 10, height: 10 } as unknown as StoredPhoto);

const savedRow = (over: Record<string, unknown> = {}) => ({
  id: 'a1',
  album_size: '8x8',
  pages: [{ id: 'pg1', templateId: 'x', slotFills: [0] }],
  photos: [{ id: 'p0', name: 'a.jpg' }, { id: 'p1', name: 'b.jpg' }, { id: 'p2', name: 'c.jpg' }],
  ...over,
});

const otherCover = { ...cover, id: 'cover-of-another-album', slotFills: [0] };

describe('rebuildPrintJobFromAlbum — cover', () => {
  it('uses the cover saved WITH the album, over the draft on this device', async () => {
    const selected = fakeLatestAlbum(savedRow({ cover_front: JSON.parse(JSON.stringify(cover)) }));
    draftOnDevice({ albumId: 'b2', coverFront: otherCover });
    const job = await rebuildPrintJobFromAlbum('u1', idbGet, 'a1');
    expect(selected).toEqual(['*']); // never names the column (a DB without it would fail the read)
    expect(job?.coverFront).toMatchObject({ id: cover.id, slotFills: [2], size: '8x8' });
  });

  it('album saved before 0036: the draft cover, when the draft IS this album', async () => {
    fakeLatestAlbum(savedRow());
    draftOnDevice({ albumId: 'a1', coverFront: cover });
    const job = await rebuildPrintJobFromAlbum('u1', idbGet, 'a1');
    expect(job?.coverFront).toMatchObject({ id: cover.id });
  });

  it('album saved before 0036: never the cover of a DIFFERENT album in the draft', async () => {
    fakeLatestAlbum(savedRow());
    draftOnDevice({ albumId: 'b2', coverFront: otherCover });
    const job = await rebuildPrintJobFromAlbum('u1', idbGet, 'a1');
    expect(job).not.toBeNull();
    expect(job?.coverFront).toBeUndefined();
  });

  it('a draft from before album ids were kept is trusted, as it always was', async () => {
    fakeLatestAlbum(savedRow());
    draftOnDevice({ coverFront: cover });
    const job = await rebuildPrintJobFromAlbum('u1', idbGet, 'a1');
    expect(job?.coverFront).toMatchObject({ id: cover.id });
  });
});
