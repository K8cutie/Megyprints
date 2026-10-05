// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { albumContentKey, decideSync, readSyncRecord, writeSyncRecord, SYNC_STORAGE_KEY, type SyncRecord } from './albumSyncRecord';
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
      album({ sizePreset: '9x9' }),
      album({ pages: [{ id: 'p1', templateId: 't88-fb-quad-grid-gap', slotFills: [0, null, null, null] }] as unknown as AlbumData['pages'] }),
      album({ photos: [{ id: 'ph0', name: 'a.jpg', leftOut: true }] }),
      album({ coverFront: { id: 'cover', background: { type: 'solid', solid: '#000' }, textElements: [] } }),
    ];
    for (const c of changed) expect(albumContentKey(serializeAlbum(c))).not.toBe(base);
  });
});

describe('decideSync', () => {
  const rec: SyncRecord = { albumId: 'a1', base: 'v1', key: 'K1' };
  const at = (iso: string) => Date.parse(iso);
  it('the cloud is still this device\'s version: in sync', () => {
    expect(decideSync({ rec, cloudUpdatedAt: 'v1', cloudKey: 'K9', localKey: 'K2', localEditedAt: 0 })).toBe('in-sync');
  });
  it('moved on, nothing changed here: take the cloud\'s', () => {
    expect(decideSync({ rec, cloudUpdatedAt: 'v2', cloudKey: 'K9', localKey: 'K1', localEditedAt: 0 })).toBe('take-cloud');
  });
  it('moved on AND changed here: ask', () => {
    expect(decideSync({ rec, cloudUpdatedAt: 'v2', cloudKey: 'K9', localKey: 'K2', localEditedAt: 0 })).toBe('conflict');
  });
  it('moved on to what this device has (or sent as it closed): its own work, adopt', () => {
    expect(decideSync({ rec, cloudUpdatedAt: 'v2', cloudKey: 'K2', localKey: 'K2', localEditedAt: 0 })).toBe('ours');
    expect(decideSync({ rec: { ...rec, sentKey: 'K3' }, cloudUpdatedAt: 'v2', cloudKey: 'K3', localKey: 'K4', localEditedAt: 0 })).toBe('ours');
  });
  it('no known version (a draft from before): cloud saved after the last change here asks, else this one is kept', () => {
    const cloudAt = '2026-10-05T01:30:00.000000+00:00';
    expect(decideSync({ rec: null, cloudUpdatedAt: cloudAt, cloudKey: 'K9', localKey: 'K2', localEditedAt: at('2026-10-05T01:00:00Z') })).toBe('conflict');
    expect(decideSync({ rec: null, cloudUpdatedAt: cloudAt, cloudKey: 'K9', localKey: 'K2', localEditedAt: at('2026-10-05T02:00:00Z') })).toBe('keep-local');
    expect(decideSync({ rec: { albumId: 'a1', base: null, key: '', sentKey: 'K5' }, cloudUpdatedAt: cloudAt, cloudKey: 'K9', localKey: 'K2', localEditedAt: 0 })).toBe('conflict');
  });
});

describe('the record on this device', () => {
  beforeEach(() => localStorage.clear());
  it('per album, read back as written', () => {
    writeSyncRecord({ albumId: 'a1', base: 'v1', key: 'K1' });
    writeSyncRecord({ albumId: 'a2', base: 'v7', key: 'K7' });
    expect(readSyncRecord('a1')).toMatchObject({ base: 'v1', key: 'K1' });
    expect(readSyncRecord('a2')).toMatchObject({ base: 'v7', key: 'K7' });
    expect(readSyncRecord('a3')).toBeNull();
    expect(readSyncRecord(undefined)).toBeNull();
  });
  it('keeps the 30 most recent albums', () => {
    for (let i = 0; i < 35; i++) writeSyncRecord({ albumId: `a${i}`, base: 'v', key: 'k', at: i } as SyncRecord);
    expect(Object.keys(JSON.parse(localStorage.getItem(SYNC_STORAGE_KEY)!))).toHaveLength(30);
  });
  it('garbage in storage reads as no record', () => {
    localStorage.setItem(SYNC_STORAGE_KEY, '{nope');
    expect(readSyncRecord('a1')).toBeNull();
    localStorage.setItem(SYNC_STORAGE_KEY, JSON.stringify([1, 2]));
    expect(readSyncRecord('a1')).toBeNull();
  });
});
