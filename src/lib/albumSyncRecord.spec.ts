// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { albumContentKey, decideSync, readSyncRecord, draftSyncRecord, toDraftSync, SYNC_STORAGE_KEY, type SyncRecord } from './albumSyncRecord';
import { serializeAlbum, deserializeAlbum, type AlbumData } from './useAlbumSync';

/* ══════════════════════════════════════════════════════════════════════════
   Which version of an album wins when two devices have it (TD-3). The
   builder-level story is twoDevices.spec; this is the rule itself.
   ══════════════════════════════════════════════════════════════════════════ */

const album = (over: Partial<AlbumData> = {}): AlbumData => ({
  id: 'a1',
  title: 'HK Trip',
  sizePreset: '8x8',
  pages: [{ id: 'p1', templateId: 't88-fb-solo', slotFills: [0], background: { type: 'solid', solid: '#fff' } }] as unknown as AlbumData['pages'],
  photos: [{ id: 'ph0', name: 'a.jpg', size: 1000, width: 1200, height: 1200 }],
  coverFront: { id: 'cover', background: { type: 'image', image: 'blob:http://localhost/1111' }, textElements: [] },
  coverPhoto: 'data:image/jpeg;base64,AAAA',
  ...over,
});

/** Out to the database and back, as jsonb: keys come back in its own order. */
const viaDatabase = (row: Record<string, unknown>) => {
  const reorder = (v: unknown): unknown => Array.isArray(v) ? v.map(reorder)
    : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().reverse().map((k) => [k, reorder((v as Record<string, unknown>)[k])])) : v;
  return reorder(JSON.parse(JSON.stringify({ ...row, id: 'a1', updated_at: '2026-10-05T01:00:00.123456+00:00' }))) as Record<string, unknown>;
};

describe('albumContentKey: the same album gives the same key however it travelled', () => {
  it('sent, stored as jsonb, read back and serialized again: same key', () => {
    const sent = serializeAlbum(album());
    const back = serializeAlbum(deserializeAlbum(viaDatabase(sent)));
    expect(albumContentKey(back)).toBe(albumContentKey(sent));
  });
  it('this visit\'s blob: URL for the cover photo, the thumbnail and the time saved don\'t count', () => {
    const a = serializeAlbum(album());
    const b = serializeAlbum(album({
      coverFront: { id: 'cover', background: { type: 'image', image: 'blob:http://localhost/2222' }, textElements: [] },
      coverPhoto: 'data:image/jpeg;base64,BBBB',
    }));
    expect(albumContentKey(b)).toBe(albumContentKey(a));
  });
  it('a change to a page, the name, the size, the photos or the cover does count', () => {
    const base = albumContentKey(serializeAlbum(album()));
    const changed = [
      album({ title: 'HK Trip 2026' }),
      album({ sizePreset: '6x6' }),
      album({ pages: [{ id: 'p1', templateId: 't88-fb-quad-grid-gap', slotFills: [0, null, null, null] }] as unknown as AlbumData['pages'] }),
      album({ photos: [{ id: 'ph0', name: 'a.jpg', leftOut: true }] }),
      album({ coverFront: { id: 'cover', background: { type: 'solid', solid: '#000' }, textElements: [] } }),
    ];
    for (const c of changed) expect(albumContentKey(serializeAlbum(c))).not.toBe(base);
  });
});

describe('albumContentKey on the website and in the 2.0 app (Phase 3a review)', () => {
  const coverAt = (image: string) => serializeAlbum(album({
    coverFront: { id: 'cover', background: { type: 'image', image }, textElements: [] },
  }));
  it("the website's key is exactly what it was before the app (saved records still match)", () => {
    // Worked out with the rule as it was (blob: URLs only) for this album.
    expect(albumContentKey(serializeAlbum(album()))).toBe('17e3gky2bf5');
  });
  it("the app's cover photo URI changing between opens doesn't count, and the key is the website's", () => {
    const web = albumContentKey(coverAt('blob:http://localhost/1111'));
    expect(albumContentKey(coverAt('file:///data/user/0/com.megyprints.app/files/photos/a.jpg'))).toBe(web);
    expect(albumContentKey(coverAt('file:///data/user/0/com.megyprints.app/cache/b.jpg'))).toBe(web);
    expect(albumContentKey(coverAt('content://media/external/images/media/42'))).toBe(web);
  });
  it('a URL anyone can open, or words that only start like one, still count', () => {
    const web = albumContentKey(coverAt('blob:http://localhost/1111'));
    expect(albumContentKey(coverAt('https://megyprints.com/sample-photos/megy-sample-03.jpg'))).not.toBe(web);
    const caption = (text: string) => albumContentKey(serializeAlbum(album({
      coverFront: { id: 'cover', background: { type: 'solid', solid: '#fff' }, textElements: [{ id: 't', text }] },
    } as Partial<AlbumData>)));
    expect(caption('file: our trip')).not.toBe(caption('file: our trip 2'));
  });
});

describe('decideSync', () => {
  const rec: SyncRecord = { albumId: 'a1', base: 'v1', key: 'K1' };
  it('the cloud is still this copy\'s version: in sync', () => {
    expect(decideSync({ rec, cloudUpdatedAt: 'v1', cloudKey: 'K9', localKey: 'K2' })).toBe('in-sync');
  });
  it('moved on, nothing changed here: take the cloud\'s', () => {
    expect(decideSync({ rec, cloudUpdatedAt: 'v2', cloudKey: 'K9', localKey: 'K1' })).toBe('take-cloud');
  });
  it('moved on AND changed here: ask', () => {
    expect(decideSync({ rec, cloudUpdatedAt: 'v2', cloudKey: 'K9', localKey: 'K2' })).toBe('conflict');
  });
  it('moved on to what this copy has (or sent as it closed): its own work, adopt', () => {
    expect(decideSync({ rec, cloudUpdatedAt: 'v2', cloudKey: 'K2', localKey: 'K2' })).toBe('ours');
    expect(decideSync({ rec: { ...rec, sentKey: 'K3' }, cloudUpdatedAt: 'v2', cloudKey: 'K3', localKey: 'K4' })).toBe('ours');
  });
  it('no known version and the two differ: ALWAYS ask, whatever the clocks say (Kraken: a stale phone kept its copy)', () => {
    // It used to keep this copy when this device's last change looked newer
    // than the cloud's save, and photos waking up after a reload counted as a
    // change, so every stale copy looked newer.
    expect(decideSync({ rec: null, cloudUpdatedAt: '2026-10-05T01:30:00.000000+00:00', cloudKey: 'K9', localKey: 'K2' })).toBe('conflict');
    expect(decideSync({ rec: { base: null, key: '', sentKey: 'K5' }, cloudUpdatedAt: 'v1', cloudKey: 'K9', localKey: 'K2' })).toBe('conflict');
    expect(decideSync({ rec: null, cloudUpdatedAt: 'v1', cloudKey: 'K2', localKey: 'K2' })).toBe('ours');
  });
});

describe('the record travels with the draft', () => {
  beforeEach(() => localStorage.clear());
  it('a draft\'s own record, for its own album only', () => {
    expect(draftSyncRecord('a1', { base: 'v1', key: 'K1', sentKey: 'K2' })).toEqual({ albumId: 'a1', base: 'v1', key: 'K1', sentKey: 'K2' });
    expect(draftSyncRecord('a1', { base: null, key: 'K1' })).toEqual({ albumId: 'a1', base: null, key: 'K1' });
    expect(draftSyncRecord(undefined, { base: 'v1', key: 'K1' })).toBeNull();
    expect(draftSyncRecord('a1', null)).toBeNull();
    expect(draftSyncRecord('a1', { base: 'v1' })).toBeNull();
    expect(draftSyncRecord('a1', 'nope')).toBeNull();
  });
  it('what is stored in the draft: the version, the key, a save in flight', () => {
    expect(toDraftSync({ albumId: 'a1', base: 'v1', key: 'K1', at: 5 })).toEqual({ base: 'v1', key: 'K1' });
    expect(toDraftSync({ albumId: 'a1', base: null, key: 'K1', sentKey: 'K2' })).toEqual({ base: null, key: 'K1', sentKey: 'K2' });
    expect(toDraftSync(null)).toBeNull();
  });
  it('the old per-device record is still read for a draft saved before (never written any more)', () => {
    localStorage.setItem(SYNC_STORAGE_KEY, JSON.stringify({ a1: { albumId: 'a1', base: 'v1', key: 'K1' } }));
    expect(readSyncRecord('a1', localStorage)).toMatchObject({ base: 'v1', key: 'K1' });
    expect(readSyncRecord('a2', localStorage)).toBeNull();
    expect(readSyncRecord(undefined, localStorage)).toBeNull();
  });
  it('garbage in the old store reads as no record', () => {
    localStorage.setItem(SYNC_STORAGE_KEY, '{nope');
    expect(readSyncRecord('a1', localStorage)).toBeNull();
    localStorage.setItem(SYNC_STORAGE_KEY, JSON.stringify([1, 2]));
    expect(readSyncRecord('a1', localStorage)).toBeNull();
  });
});

describe('the version is the database\'s clock, never a device\'s (0040)', () => {
  it('albums.updated_at is stamped by the server on INSERT as well as update', () => {
    const sql = readFileSync(resolve(__dirname, '../../supabase/migrations/0040_albums_insert_time.sql'), 'utf8');
    expect(sql).toMatch(/create trigger on_album_inserted\s+before insert on public\.albums\s+for each row execute procedure public\.handle_updated_at\(\)/);
  });
  it('a saved row carries no updated_at from this device', () => {
    expect('updated_at' in serializeAlbum(album())).toBe(false);
  });
});
