import { accessFrom, mapLimited, photosForAlbum, toGalleryPhoto, type GalleryPhoto, type PhotoLookups } from '../src/lib/gallery';

// The native library is not in jest: only the enums gallery.ts reads.
jest.mock('expo-media-library', () => ({
  MediaType: { UNKNOWN: 'unknown', IMAGE: 'image', AUDIO: 'audio', VIDEO: 'video' },
  AssetField: { CREATION_TIME: 'creationTime', MEDIA_TYPE: 'mediaType' },
  Asset: jest.fn(),
  Query: jest.fn(),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  presentPermissionsPicker: jest.fn(),
}));

type Meta = Parameters<typeof toGalleryPhoto>[0];
const meta = (over: Partial<Meta> = {}): Meta => ({
  id: 'content://media/external/images/media/42',
  filename: 'IMG_20261026_140312.jpg',
  mediaType: 'image' as Meta['mediaType'],
  width: 3000,
  height: 4000,
  duration: null,
  creationTime: 1_761_458_592_000,
  modificationTime: 1_761_458_600_000,
  isFavorite: false,
  ...over,
});

describe('photo access', () => {
  it('all photos, or only chosen ones (Android 14 "Allow limited access")', () => {
    expect(accessFrom({ granted: true, canAskAgain: true, status: 'granted' as never, accessPrivileges: 'all' }, true)).toEqual({ state: 'all' });
    expect(accessFrom({ granted: true, canAskAgain: true, status: 'granted' as never, accessPrivileges: 'limited' }, true)).toEqual({ state: 'limited' });
  });

  it('not asked yet, refused, and refused for good (Settings only)', () => {
    expect(accessFrom({ granted: false, canAskAgain: true, status: 'undetermined' as never }, false)).toEqual({ state: 'ask', canAskAgain: true, refused: false });
    expect(accessFrom({ granted: false, canAskAgain: true, status: 'denied' as never }, true)).toEqual({ state: 'ask', canAskAgain: true, refused: true });
    expect(accessFrom({ granted: false, canAskAgain: false, status: 'denied' as never }, false)).toEqual({ state: 'ask', canAskAgain: false, refused: true });
  });
});

describe('the phone\'s photo index → grid photos', () => {
  it('keeps the content:// address as id, the shown size and both times', () => {
    expect(toGalleryPhoto(meta())).toEqual({
      id: 'content://media/external/images/media/42',
      name: 'IMG_20261026_140312.jpg',
      width: 3000,
      height: 4000,
      capturedAt: 1_761_458_592_000,
      modifiedAt: 1_761_458_600_000,
      time: 1_761_458_592_000,
    });
  });

  it('no taken time: sorts by the file time; no size: null (read later)', () => {
    const p = toGalleryPhoto(meta({ creationTime: null, width: null, height: 0 }))!;
    expect(p.time).toBe(1_761_458_600_000);
    expect(p.capturedAt).toBeNull();
    expect([p.width, p.height]).toEqual([null, null]);
  });

  it('only photos', () => {
    expect(toGalleryPhoto(meta({ mediaType: 'video' as Meta['mediaType'] }))).toBeNull();
  });
});

describe('picked grid photos → album photos', () => {
  const grid = (n: number, over: Partial<GalleryPhoto> = {}): GalleryPhoto => ({
    id: `content://media/external/images/media/${n}`,
    name: `IMG_${n}.jpg`,
    width: 4000,
    height: 3000,
    capturedAt: 1000 + n,
    modifiedAt: 5000,
    time: 1000 + n,
    ...over,
  });

  const lookups = (): PhotoLookups & { calls: string[] } => {
    const calls: string[] = [];
    return {
      calls,
      shape: async (id) => { calls.push(`shape ${id.split('/').pop()}`); return { width: 1080, height: 1920 }; },
      exifTaken: async (id) => { calls.push(`exif ${id.split('/').pop()}`); return '2019:06:01 09:30:00'; },
    };
  };

  it('kept by address, never copied; nothing extra read when the index has it all', async () => {
    const l = lookups();
    const [p] = await photosForAlbum([grid(1)], 77, l);
    expect(p).toEqual({
      key: 'media:1',
      source: 'gallery',
      uri: 'content://media/external/images/media/1',
      name: 'IMG_1.jpg',
      width: 4000,
      height: 3000,
      capturedAt: 1001,
      modifiedAt: 5000,
      addedAt: 77,
    });
    expect(l.calls).toEqual([]);
  });

  it('reads the EXIF when the index has no taken time (old photos copied to a new phone)', async () => {
    const l = lookups();
    const [p] = await photosForAlbum([grid(2, { capturedAt: null, time: 5000 })], 0, l);
    expect(p.capturedAt).toBe(new Date(2019, 5, 1, 9, 30, 0).getTime());
    expect(l.calls).toEqual(['exif 2']);
  });

  it('does not look for EXIF in a PNG screenshot; reads the size when the index has none', async () => {
    const l = lookups();
    const [p] = await photosForAlbum([grid(3, { name: 'Screenshot_20261026.png', capturedAt: null, width: null, height: null })], 0, l);
    expect(p).toMatchObject({ capturedAt: null, modifiedAt: 5000, width: 1080, height: 1920 });
    expect(l.calls).toEqual(['shape 3']);
  });

  it('a failed lookup leaves the fact unknown instead of failing the whole add', async () => {
    const failing: PhotoLookups = { shape: async () => { throw new Error('gone'); }, exifTaken: async () => { throw new Error('gone'); } };
    const [p] = await photosForAlbum([grid(4, { capturedAt: null, width: null, height: null })], 0, failing);
    expect(p).toMatchObject({ width: 0, height: 0, capturedAt: null });
  });

  it('keeps the order and runs at most 4 lookups at once', async () => {
    let running = 0;
    let most = 0;
    const out = await mapLimited(Array.from({ length: 20 }, (_, i) => i), 4, async (i) => {
      running++;
      most = Math.max(most, running);
      await new Promise((r) => setTimeout(r, 2));
      running--;
      return i * 2;
    });
    expect(out).toEqual(Array.from({ length: 20 }, (_, i) => i * 2));
    expect(most).toBe(4);
    expect(await mapLimited([], 4, async () => 1)).toEqual([]);
  });
});
