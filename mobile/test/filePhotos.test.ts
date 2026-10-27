import type { DocumentPickerAsset } from 'expo-document-picker';
import { filesToPhotos } from '../src/lib/filePhotos';
import type { PickedFileInfo } from '../modules/photo-files';

jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('expo', () => ({ requireOptionalNativeModule: () => null }));

const doc = (name: string, mimeType: string | undefined, n: number): DocumentPickerAsset => ({
  uri: `content://com.android.providers.media.documents/document/image%3A${n}`,
  name,
  mimeType,
  size: 1000 + n,
  lastModified: 1_700_000_000_000 + n,
});

const info = (a: DocumentPickerAsset, over: Partial<PickedFileInfo> = {}): PickedFileInfo => ({
  uri: a.uri, kept: true, readable: true, width: 3024, height: 4032, rotation: 0, takenAt: '2026:10:26 14:03:12', takenOffset: '+08:00', ...over,
});

describe('"Choose from Files": picked files → album photos', () => {
  it('keeps each photo where it is, with its size and EXIF time', () => {
    const a = doc('IMG_1.jpg', 'image/jpeg', 1);
    const { photos, note } = filesToPhotos([a], [info(a)], 55);
    expect(note).toBe('');
    expect(photos).toEqual([{
      key: 'media:1', // Files' Images address carries Android's photo number
      source: 'files',
      uri: a.uri,
      name: 'IMG_1.jpg',
      width: 3024,
      height: 4032,
      capturedAt: Date.UTC(2026, 9, 26, 6, 3, 12),
      modifiedAt: 1_700_000_000_001,
      addedAt: 55,
      mimeType: 'image/jpeg',
      size: 1001,
    }]);
  });

  it('HEIC photos go in as they are (Android shows them), by address', () => {
    const a = doc('IMG_2.HEIC', 'image/heic', 2);
    const [p] = filesToPhotos([a], [info(a)]).photos;
    expect(p).toMatchObject({ uri: a.uri, mimeType: 'image/heic' });
  });

  it('a photo with no EXIF time sorts by its file time', () => {
    const a = doc('Screenshot.png', 'image/png', 3);
    const [p] = filesToPhotos([a], [info(a, { takenAt: null, takenOffset: null })]).photos;
    expect(p.capturedAt).toBeNull();
    expect(p.modifiedAt).toBe(1_700_000_000_003);
  });

  it('only photos go in; the website\'s own words say what was left out', () => {
    const photo = doc('a.jpg', 'image/jpeg', 4);
    const pdf = doc('menu.pdf', 'application/pdf', 5);
    const broken = doc('b.jpg', 'image/jpeg', 6);
    const noType = doc('c.heic', undefined, 7);
    const { photos, note } = filesToPhotos([photo, pdf, broken, noType], [info(photo), info(broken, { readable: false }), info(noType)]);
    expect(photos.map((p) => p.name)).toEqual(['a.jpg', 'c.heic']);
    expect(note).toBe('1 file left out: not a photo (JPG, PNG or HEIC) · 1 photo could not be opened');
  });
});
