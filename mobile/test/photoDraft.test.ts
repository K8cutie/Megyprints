import { addMoreLabel, MIN_ALBUM_PHOTOS } from '@web/pages/builder/albumMinimum';
import {
  addPhotos,
  emptyDraft,
  idsInAlbum,
  inTimeOrder,
  mediaStoreId,
  parseDraft,
  photoKey,
  photoStep,
  pickerProgress,
  removePhotos,
  serializeDraft,
  type DraftPhoto,
} from '../src/lib/photoDraft';

const photo = (n: number, over: Partial<DraftPhoto> = {}): DraftPhoto => {
  const uri = `content://media/external/images/media/${n}`;
  return {
    key: photoKey('gallery', uri),
    source: 'gallery',
    uri,
    name: `IMG_${n}.jpg`,
    width: 4000,
    height: 3000,
    capturedAt: Date.UTC(2026, 9, 1) + n * 60_000,
    modifiedAt: Date.UTC(2026, 9, 2),
    addedAt: 1,
    ...over,
  };
};

const range = (from: number, to: number) => Array.from({ length: to - from }, (_, i) => photo(from + i));

describe('the album draft: photos kept on the phone, in time order', () => {
  it('keeps photos oldest first, whatever order they were picked in', () => {
    const { draft, added } = addPhotos(emptyDraft(), [photo(3), photo(1), photo(2)], 100);
    expect(added).toBe(3);
    expect(draft.photos.map((p) => p.name)).toEqual(['IMG_1.jpg', 'IMG_2.jpg', 'IMG_3.jpg']);
    expect(draft.updatedAt).toBe(100);
  });

  it('a photo with no taken time sorts by its file time; one with neither goes last, in pick order', () => {
    const noTaken = photo(9, { capturedAt: null, modifiedAt: Date.UTC(2026, 9, 1) + 2.5 * 60_000 });
    const noTimeA = photo(10, { capturedAt: null, modifiedAt: null, addedAt: 5 });
    const noTimeB = photo(11, { capturedAt: null, modifiedAt: null, addedAt: 2 });
    const order = inTimeOrder([noTimeA, photo(3), noTaken, noTimeB, photo(1)]).map((p) => p.name);
    expect(order).toEqual(['IMG_1.jpg', 'IMG_9.jpg', 'IMG_3.jpg', 'IMG_11.jpg', 'IMG_10.jpg']);
  });

  it('never adds the same photo twice, and says how many were in already', () => {
    const first = addPhotos(emptyDraft(), range(0, 5)).draft;
    const again = addPhotos(first, [...range(3, 8), photo(7)]);
    expect(again.added).toBe(3);
    expect(again.alreadyIn).toBe(3);
    expect(again.draft.photos).toHaveLength(8);
    // Nothing new: the same draft comes back (no save needed).
    expect(addPhotos(again.draft, range(0, 2)).draft).toBe(again.draft);
  });

  it('the same photo picked from the grid and from Files goes in once', () => {
    const g = photo(1);
    const doc = 'content://com.android.providers.media.documents/document/image%3A1';
    const f: DraftPhoto = { ...photo(1), source: 'files', uri: doc, key: photoKey('files', doc) };
    expect(f.key).toBe(g.key);
    expect(g.key).toBe('media:1');
    const r = addPhotos(emptyDraft(), [f, g]);
    expect([r.added, r.alreadyIn]).toEqual([1, 1]);
    // The grid marks it "In album" whichever way it came in.
    expect([...idsInAlbum(['content://media/external/images/media/1', 'content://media/external/images/media/2'], r.draft.photos)])
      .toEqual(['content://media/external/images/media/1']);
  });

  it('Android 10: the grid ids ".../external_primary/..." still show "In album"', () => {
    // On Android 10 the grid's ids are content://media/external_primary/images/media/<n>.
    const grid = ['content://media/external_primary/images/media/1000012345', 'content://media/external_primary/images/media/7'];
    const fromGrid = addPhotos(emptyDraft(), [photo(1000012345)]).draft;
    expect([...idsInAlbum(grid, fromGrid.photos)]).toEqual([grid[0]]);
    // And a photo saved with that Android 10 address matches the grid's usual one too.
    const a10 = grid[1];
    const saved = addPhotos(emptyDraft(), [{ ...photo(7), uri: a10, key: photoKey('gallery', a10) }]).draft;
    expect([...idsInAlbum(['content://media/external/images/media/7'], saved.photos)]).toEqual(['content://media/external/images/media/7']);
    expect(idsInAlbum(grid, []).size).toBe(0);
  });

  it('a photo picked through the Downloads of Files is the same photo as in the grid', () => {
    const dl = 'content://com.android.providers.downloads.documents/document/msf%3A31';
    const f: DraftPhoto = { ...photo(31), source: 'files', uri: dl, key: photoKey('files', dl) };
    expect(f.key).toBe('media:31');
    const r = addPhotos(emptyDraft(), [photo(31), f]);
    expect([r.added, r.alreadyIn]).toEqual([1, 1]);
  });

  it("reads Android's photo number from the addresses that carry it, and only those", () => {
    expect(mediaStoreId('content://media/external/images/media/1000002512')).toBe('1000002512');
    expect(mediaStoreId('content://media/external_primary/images/media/7')).toBe('7');
    expect(mediaStoreId('content://com.android.providers.media.documents/document/image%3A1000002512')).toBe('1000002512');
    expect(mediaStoreId('content://com.android.providers.downloads.documents/document/msf%3A31')).toBe('31');
    expect(mediaStoreId('content://com.android.providers.downloads.documents/document/raw%3A%2Fstorage%2Fx.jpg')).toBeNull();
    expect(mediaStoreId('content://media/external/video/media/5')).toBeNull();
    // A photo found by browsing the phone's storage, or from Drive, is keyed by its own address.
    const storage = 'content://com.android.externalstorage.documents/document/primary%3ADCIM%2FCamera%2FIMG_1.jpg';
    expect(photoKey('files', storage)).toBe(`files:${storage}`);
  });

  it('takes photos out (they stay on the phone)', () => {
    const d = addPhotos(emptyDraft(), range(0, 4)).draft;
    const out = removePhotos(d, [photo(1).key, photo(2).key], 50);
    expect(out.photos.map((p) => p.name)).toEqual(['IMG_0.jpg', 'IMG_3.jpg']);
    expect(removePhotos(out, ['nope'])).toBe(out);
  });

  it('saves and reads back exactly, photos referenced by address (no picture data)', () => {
    const d = addPhotos(emptyDraft(), [photo(2), photo(1, { mimeType: 'image/heic', size: 2_345_678 })], 77).draft;
    const text = serializeDraft(d);
    expect(text).not.toMatch(/base64|data:/);
    expect(parseDraft(text)).toEqual(d);
  });

  it('a broken or old save gives an empty album, and bad photos are dropped one by one', () => {
    expect(parseDraft(null)).toEqual(emptyDraft());
    expect(parseDraft('{not json')).toEqual(emptyDraft());
    expect(parseDraft(JSON.stringify({ version: 0, photos: [] }))).toEqual(emptyDraft());
    const mixed = JSON.stringify({
      version: 1,
      updatedAt: 5,
      photos: [
        { source: 'gallery', uri: 'content://media/external/images/media/1', name: 'a.jpg', width: 10, height: 20, capturedAt: 3, modifiedAt: null, addedAt: 1 },
        { source: 'cloud', uri: 'https://example.com/x.jpg' },
        { source: 'files', uri: '' },
        null,
        { source: 'gallery', uri: 'content://media/external/images/media/1' },
        { source: 'files', uri: 'content://x/2', width: 'wide', capturedAt: 'today' },
      ],
    });
    const d = parseDraft(mixed);
    expect(d.photos.map((p) => p.uri)).toEqual(['content://media/external/images/media/1', 'content://x/2']);
    expect(d.photos[1]).toMatchObject({ width: 0, capturedAt: null, name: '' });
  });

  it('a saved photo takes about 220 bytes and holds no picture data', () => {
    const d = addPhotos(emptyDraft(), range(0, 2000)).draft;
    const bytes = serializeDraft(d).length;
    expect(bytes / 2000).toBeLessThan(260);
  });
});

describe('the 40-photo minimum (the website\'s own rule and words)', () => {
  it('uses the shared minimum', () => {
    expect(MIN_ALBUM_PHOTOS).toBe(40);
  });

  it('no photos: one filled button, "Pick photos", and no way on', () => {
    const s = photoStep([]);
    expect(s).toMatchObject({ count: 0, short: 40, canGoOn: false, main: 'pick', mainLabel: 'Pick photos', secondLabel: null });
    expect(s.message).toMatch(/at least 40 photos, one for every page/);
  });

  it('under 40: "Add N more photos" (the website\'s label) and no way on', () => {
    const s = photoStep(range(0, 14));
    expect(s.mainLabel).toBe(addMoreLabel(26));
    expect(s.mainLabel).toBe('Add 26 more photos');
    expect(s).toMatchObject({ count: 14, short: 26, canGoOn: false, main: 'pick', secondLabel: null });
    expect(s.message).toBe('You have 14 photos. Albums need at least 40, one for every page: add 26 more to make your album.');
    expect(photoStep(range(0, 39)).mainLabel).toBe('Add 1 more photo');
    expect(photoStep(range(0, 1)).message).toMatch(/^You have 1 photo\./);
  });

  it('40 or more: a filled "Next", and "Add more photos" beside it', () => {
    for (const n of [40, 41, 250]) {
      const s = photoStep(range(0, n));
      expect(s).toMatchObject({ count: n, short: 0, canGoOn: true, main: 'next', mainLabel: 'Next', secondLabel: 'Add more photos' });
    }
    expect(photoStep(range(0, 2517)).message).toBe('You have 2,517 photos ready. Add more, or go on to pick your cover.');
  });

  it('photos left out by the photo check do not count toward the 40', () => {
    const photos = range(0, 41).map((p, i) => (i < 3 ? { ...p, leftOut: true } : p));
    expect(photoStep(photos)).toMatchObject({ count: 38, short: 2, canGoOn: false, mainLabel: 'Add 2 more photos' });
  });

  it('the picker says how many more the album needs, counting the album and the picked photos', () => {
    expect(pickerProgress(0, 0)).toBe('Albums need at least 40 photos. Pick 40 more.');
    expect(pickerProgress(14, 12)).toBe('Albums need at least 40 photos. Pick 14 more.');
    expect(pickerProgress(14, 26)).toBe('Enough photos for an album.');
  });
});
