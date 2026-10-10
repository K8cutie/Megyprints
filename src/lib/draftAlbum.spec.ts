// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { albumDataFromDraft, draftAlbumForAccount } from './draftAlbum';
import { saveDraftToAccount } from './draftAccountSave';
import { supabase } from './supabase';
import { DRAFT_STORAGE_KEY } from './localDraft';

/* ══════════════════════════════════════════════════════════════════════════
   A GUEST WHO SIGNS UP AT CHECKOUT GETS THEIR ORDER (1-star testers,
   2026-10-04: "After signing up at checkout, Place order refuses the album
   and sends the guest back to the builder" — and that detour wiped their
   address). Checkout now saves the device's draft to the new account itself.
   ══════════════════════════════════════════════════════════════════════════ */

const draft = (over: Record<string, unknown> = {}) => localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({
  albumId: 'album-1', title: 'Guest HK Trip', albumSize: '6x8', accountId: null,
  albumPages: Array.from({ length: 40 }, (_, i) => ({ id: `p${i}`, slotFills: [i] })),
  uploadedPhotos: [{ id: 'a', name: 'a.jpg', previewUrl: 'blob:x', leftOut: true, kept: true, check: { v: 1, sharp: 5, hash: 'ff' } }, { id: 'b', name: 'b.jpg' }],
  coverFront: { id: 'cover' },
  ...over,
}));

beforeEach(() => localStorage.clear());

describe('albumDataFromDraft — the draft as the album row', () => {
  it('id, name, size, pages, cover, and photo metadata (never the photo bytes)', () => {
    draft();
    const a = albumDataFromDraft(JSON.parse(localStorage.getItem(DRAFT_STORAGE_KEY)!));
    expect(a).toMatchObject({ id: 'album-1', title: 'Guest HK Trip', sizePreset: '6x8', coverFront: { id: 'cover' } });
    expect(a.pages).toHaveLength(40);
    expect(a.photos).toEqual([{ id: 'a', name: 'a.jpg', check: { v: 1, sharp: 5, hash: 'ff' }, kept: true, leftOut: true }, { id: 'b', name: 'b.jpg' }]);
    expect(JSON.stringify(a)).not.toContain('blob:');
  });
});

describe('draftAlbumForAccount — only a guest\'s draft, or this account\'s', () => {
  it('a guest draft (no account yet) can be saved to the account that just signed up', () => {
    draft();
    expect(draftAlbumForAccount('user-1', 'album-1')?.id).toBe('album-1');
  });
  it('this account\'s own draft too', () => {
    draft({ accountId: 'user-1' });
    expect(draftAlbumForAccount('user-1', 'album-1')).not.toBeNull();
  });
  it('NEVER another account\'s album left on a shared device', () => {
    draft({ accountId: 'someone-else' });
    expect(draftAlbumForAccount('user-1', 'album-1')).toBeNull();
  });
  it('not a different album, an empty one, or a missing draft', () => {
    draft();
    expect(draftAlbumForAccount('user-1', 'album-2')).toBeNull();
    draft({ albumPages: [] });
    expect(draftAlbumForAccount('user-1', 'album-1')).toBeNull();
    localStorage.removeItem(DRAFT_STORAGE_KEY);
    expect(draftAlbumForAccount('user-1', 'album-1')).toBeNull();
  });
});

describe('checkout saves it instead of sending the guest away (source guard)', () => {
  const src = readFileSync(resolve(__dirname, '../pages/Order.tsx'), 'utf8');
  it('an unsaved hand-over is saved to the new account before ordering', () => {
    expect(src).toMatch(/if \(albumId && handoff\?\.albumId === albumId && !handoff\.saved\) await saveDraftToAccount\(albumId\);/);
  });
  it('an album missing from the account is saved, then ordered (once)', () => {
    expect(src).toMatch(/e instanceof AlbumNotSavedError\) \|\| !albumId \|\| !\(await saveDraftToAccount\(albumId\)\)\) throw e;\s*created = await orderIt\(\);/);
  });
  it('the builder\'s own reset saves a leaving draft through the same shape', () => {
    expect(readFileSync(resolve(__dirname, '../pages/builder/useBuilderState.ts'), 'utf8')).toMatch(/albumDataFromDraft\(stored as StoredDraft\)/);
  });
});

/* ── Checkout saves the draft the way the builder does (Kraken, 2026-10-05) ──
   It used to upsert blindly: no version, no occasion or photos-per-page, and
   the draft stayed "nobody's", so the next account on the device took it
   over. Now: on the draft's version (or as a new row), never over a newer
   copy, the whole row, and the draft is stamped with the account and the
   version it now has. */
describe('saveDraftToAccount', () => {
  type Call = { op: string; row?: Record<string, unknown>; eqs: [string, unknown][] };
  let calls: Call[];
  let reply: (c: Call) => { data: unknown; error: unknown };
  beforeEach(() => {
    calls = [];
    reply = (c) => c.op === 'insert' ? { data: { id: 'album-1', updated_at: 'v1' }, error: null } : { data: [], error: null };
    vi.spyOn(supabase, 'from').mockImplementation((() => {
      const c: Call = { op: 'select', eqs: [] };
      const done = () => { calls.push(c); return Promise.resolve(reply(c)); };
      const api: Record<string, unknown> = {
        insert: (row: Record<string, unknown>) => { c.op = 'insert'; c.row = row; return api; },
        update: (row: Record<string, unknown>) => { c.op = 'update'; c.row = row; return api; },
        select: () => api,
        eq: (k: string, v: unknown) => { c.eqs.push([k, v]); return api; },
        single: done,
        maybeSingle: done,
        then: (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => done().then(ok, bad),
      };
      return api;
    }) as never);
  });
  afterEach(() => vi.restoreAllMocks());

  it('a guest\'s draft: a NEW row with the occasion and photos-per-page, then the draft is this account\'s, on that version', async () => {
    draft({ photosPerPage: 2 });
    localStorage.setItem('megy-album-theme', 'Vacation');
    expect(await saveDraftToAccount('user-1', 'album-1')).toBe('saved');
    expect(calls.map((c) => c.op)).toEqual(['insert']);
    expect(calls[0].row).toMatchObject({ id: 'album-1', user_id: 'user-1', occasion: 'Vacation', photos_per_page: 2, title: 'Guest HK Trip' });
    expect('updated_at' in calls[0].row!).toBe(false);
    const d = JSON.parse(localStorage.getItem(DRAFT_STORAGE_KEY)!);
    expect(d.accountId).toBe('user-1');
    expect(d.sync).toEqual({ base: 'v1', key: expect.any(String) });
  });

  it('a draft that has a version saves ONTO that version', async () => {
    draft({ accountId: 'user-1', sync: { base: 'v1', key: 'K1' } });
    reply = (c) => c.op === 'update' ? { data: [{ id: 'album-1', updated_at: 'v2' }], error: null } : { data: null, error: null };
    expect(await saveDraftToAccount('user-1', 'album-1')).toBe('saved');
    expect(calls[0]).toMatchObject({ op: 'update', eqs: [['id', 'album-1'], ['updated_at', 'v1']] });
    expect(JSON.parse(localStorage.getItem(DRAFT_STORAGE_KEY)!).sync.base).toBe('v2');
  });

  it('the account\'s copy changed on another device since: nothing written, "conflict" (the builder asks)', async () => {
    draft({ accountId: 'user-1', sync: { base: 'v1', key: 'K1' } });
    reply = (c) => c.op === 'update' ? { data: [], error: null } : { data: { id: 'album-1', updated_at: 'v9' }, error: null };
    expect(await saveDraftToAccount('user-1', 'album-1')).toBe('conflict');
    expect(JSON.parse(localStorage.getItem(DRAFT_STORAGE_KEY)!).sync).toEqual({ base: 'v1', key: 'K1' });
  });

  it('another account\'s draft: nothing is sent', async () => {
    draft({ accountId: 'someone-else' });
    expect(await saveDraftToAccount('user-1', 'album-1')).toBe('failed');
    expect(calls).toEqual([]);
  });
});
