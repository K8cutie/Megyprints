import type { SupabaseClient } from '@supabase/supabase-js';
import { ALBUM_LIST_COLUMNS, changedAgo, listMyAlbums, toAlbumRow } from '../src/lib/albums';

/** A pretend Supabase that records the query and answers with `reply`. */
function fakeClient(reply: { data: unknown; error: unknown }) {
  const calls: unknown[][] = [];
  const query = {
    select(...a: unknown[]) { calls.push(['select', ...a]); return query; },
    eq(...a: unknown[]) { calls.push(['eq', ...a]); return query; },
    order(...a: unknown[]) { calls.push(['order', ...a]); return Promise.resolve(reply); },
  };
  const client = { from(table: string) { calls.push(['from', table]); return query; } };
  return { client: client as unknown as SupabaseClient, calls };
}

describe('My albums list', () => {
  it("reads this account's albums, newest change first (as the website does)", async () => {
    const { client, calls } = fakeClient({ data: [], error: null });
    await listMyAlbums(client, 'user-1');
    expect(calls).toEqual([
      ['from', 'albums'],
      ['select', ALBUM_LIST_COLUMNS],
      ['eq', 'user_id', 'user-1'],
      ['order', 'updated_at', { ascending: false }],
    ]);
    expect(ALBUM_LIST_COLUMNS).toBe('id, title, album_size, pages, updated_at');
  });

  it('shows name, size, pages and when it changed', async () => {
    const { client } = fakeClient({
      data: [
        { id: 'a1', title: 'Beach week', album_size: '6x6', pages: new Array(42).fill({}), updated_at: '2026-10-27T10:00:00Z' },
        { id: 'a2', title: '  ', album_size: '9x9', pages: null, updated_at: null },
        { id: 'a3', title: 'Odd size', album_size: 'banana', pages: [{}], updated_at: '2026-10-01T00:00:00Z' },
      ],
      error: null,
    });
    const rows = await listMyAlbums(client, 'user-1');
    expect(rows).toEqual([
      { id: 'a1', name: 'Beach week', size: '6x6', sizeLabel: '6×6', pages: 42, updatedAt: '2026-10-27T10:00:00Z' },
      // No name → 'Untitled Album'; 9x9 (no longer made) → its stand-in 8x8.
      { id: 'a2', name: 'Untitled Album', size: '8x8', sizeLabel: '8×8', pages: 0, updatedAt: null },
      // A size the app does not know → 8x8, as the website does.
      { id: 'a3', name: 'Odd size', size: '8x8', sizeLabel: '8×8', pages: 1, updatedAt: '2026-10-01T00:00:00Z' },
    ]);
  });

  it('a failed load throws (so the screen says "couldn\'t load", not "no albums")', async () => {
    const { client } = fakeClient({ data: null, error: { message: 'offline' } });
    await expect(listMyAlbums(client, 'user-1')).rejects.toEqual({ message: 'offline' });
  });

  it('no rows is an empty list', async () => {
    const { client } = fakeClient({ data: null, error: null });
    await expect(listMyAlbums(client, 'user-1')).resolves.toEqual([]);
  });

  it('toAlbumRow keeps the id as text', () => {
    expect(toAlbumRow({ id: 12, title: 'x', album_size: '8x8', pages: [] }).id).toBe('12');
  });
});

describe('changedAgo', () => {
  const now = new Date('2026-10-28T12:00:00Z');
  it('says it in plain words', () => {
    expect(changedAgo('2026-10-28T11:59:30Z', now)).toBe('Changed just now');
    expect(changedAgo('2026-10-28T11:59:00Z', now)).toBe('Changed 1 minute ago');
    expect(changedAgo('2026-10-28T11:15:00Z', now)).toBe('Changed 45 minutes ago');
    expect(changedAgo('2026-10-28T09:00:00Z', now)).toBe('Changed 3 hours ago');
    expect(changedAgo('2026-10-27T12:00:00Z', now)).toBe('Changed 1 day ago');
    expect(changedAgo('2026-10-20T12:00:00Z', now)).toBe('Changed 8 days ago');
    expect(changedAgo('2026-08-02T12:00:00Z', now)).toBe('Changed 2 Aug 2026');
  });
  it('says nothing for no time or a broken one', () => {
    expect(changedAgo(null, now)).toBe('');
    expect(changedAgo('not a date', now)).toBe('');
  });
});
