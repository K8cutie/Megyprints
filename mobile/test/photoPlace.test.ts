/* WHERE A PHOTO WAS TAKEN, in the app (owner, 2026-11-26: "using Geo
   tracking and time taken"): read when a photo is picked, kept with the
   album being made, handed to the album builder (which keeps photos from the
   same place together), and never sent anywhere. */
import type { DocumentPickerAsset } from 'expo-document-picker';
import type { UploadedPhoto } from '@web/pages/builder/types';
import { serializeAlbum } from '@web/lib/albumCloud';
import { planScenes } from '@web/pages/builder/generateAlbum';
import { readPlace, toPlace } from '../src/lib/photoPlace';
import { readDraft, DRAFT_VERSION, type DraftPhoto } from '../src/lib/photoDraft';
import { filesToPhotos } from '../src/lib/filePhotos';
import { accessFrom, photosForAlbum, type GalleryPhoto, type PhotoLookups } from '../src/lib/gallery';
import { draftFromAlbum } from '../src/lib/draftFollowsAlbum';
import { createPhotoIntake, toPickedPhoto } from '../src/builder/appPhotos';
import type { PickedFileInfo } from '../modules/photo-files';

jest.mock('expo', () => ({ requireOptionalNativeModule: () => null }));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('expo-media-library', () => ({
  MediaType: { UNKNOWN: 'unknown', IMAGE: 'image', AUDIO: 'audio', VIDEO: 'video' },
  AssetField: { CREATION_TIME: 'creationTime', MEDIA_TYPE: 'mediaType' },
  Asset: jest.fn(),
  Query: jest.fn(),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  presentPermissionsPicker: jest.fn(),
}));

// Two places 5 km apart in Metro Manila (Intramuros, Makati).
const INTRAMUROS = { lat: 14.5906, lon: 120.9750 };
const MAKATI = { lat: 14.5547, lon: 121.0244 };

describe('a usable place', () => {
  it('real coordinates on the globe', () => {
    expect(toPlace(14.5906, 120.975)).toEqual({ lat: 14.5906, lon: 120.975 });
    expect(toPlace(-33.86, 151.21)).toEqual({ lat: -33.86, lon: 151.21 });
  });

  it('"0, 0" is a hidden or broken place, not the sea off Africa', () => {
    expect(toPlace(0, 0)).toBeNull();
  });

  it('missing, not numbers, or off the globe: none', () => {
    expect(toPlace(null, null)).toBeNull();
    expect(toPlace(undefined, 120)).toBeNull();
    expect(toPlace('14.5', '120.9')).toBeNull();
    expect(toPlace(Number.NaN, 120)).toBeNull();
    expect(toPlace(91, 120)).toBeNull();
    expect(toPlace(14, 181)).toBeNull();
  });

  it('a saved place is checked the same way', () => {
    expect(readPlace({ lat: 14.5906, lon: 120.975 })).toEqual({ lat: 14.5906, lon: 120.975 });
    expect(readPlace({ lat: 0, lon: 0 })).toBeNull();
    expect(readPlace('14.5,120.9')).toBeNull();
    expect(readPlace(null)).toBeNull();
  });
});

const draftPhoto = (n: number, over: Partial<DraftPhoto> = {}): DraftPhoto => ({
  key: `gallery:${n}`, source: 'gallery', uri: `content://media/external/images/media/${n}`, name: `IMG_${n}.jpg`,
  width: 4032, height: 3024, capturedAt: 1_764_000_000_000 + n * 60_000, modifiedAt: null, addedAt: n, ...over,
});

describe('kept with the album being made (the draft file on the phone)', () => {
  it('a photo\'s place comes back when the app opens again', () => {
    const text = JSON.stringify({ version: DRAFT_VERSION, updatedAt: 1, photos: [draftPhoto(1, { location: INTRAMUROS }), draftPhoto(2)] });
    const back = readDraft(text)!;
    expect(back.photos[0].location).toEqual(INTRAMUROS);
    expect(back.photos[1].location).toBeUndefined();
  });

  it('a broken saved place is dropped, the photo stays', () => {
    const text = JSON.stringify({ version: DRAFT_VERSION, updatedAt: 1, photos: [{ ...draftPhoto(1), location: { lat: 'x', lon: 2 } }] });
    const back = readDraft(text)!;
    expect(back.photos).toHaveLength(1);
    expect(back.photos[0].location).toBeUndefined();
  });

  it('an album opened again keeps its photos\' places (draftFromAlbum)', () => {
    const album: UploadedPhoto[] = [
      { id: 'a', previewUrl: 'content://media/external/images/media/7', name: 'IMG_7.jpg', type: 'image/jpeg', size: 1, width: 4032, height: 3024, capturedAt: 1, location: MAKATI },
      { id: 'b', previewUrl: 'content://media/external/images/media/8', name: 'IMG_8.jpg', type: 'image/jpeg', size: 1, width: 4032, height: 3024, capturedAt: 2, location: null },
    ];
    const draft = draftFromAlbum(album, () => undefined);
    expect(draft[0].location).toEqual(MAKATI);
    expect(draft[1].location).toBeUndefined();
  });
});

describe('read when photos are picked', () => {
  const gallery = (n: number): GalleryPhoto => ({
    id: `content://media/external/images/media/${n}`, name: `IMG_${n}.jpg`, width: 4032, height: 3024,
    capturedAt: 1_764_000_000_000 + n, modifiedAt: null, time: 1_764_000_000_000 + n,
  });
  const lookups = (places: PhotoLookups['places']): PhotoLookups => ({
    shape: async () => null, exifTaken: async () => null, ...(places ? { places } : {}),
  });

  it('from the gallery: every picked photo\'s place, in one call', async () => {
    const asked: string[][] = [];
    const photos = await photosForAlbum([gallery(1), gallery(2), gallery(3)], 9, lookups(async (ids) => {
      asked.push(ids);
      return [INTRAMUROS, null, MAKATI];
    }));
    expect(asked).toEqual([[gallery(1).id, gallery(2).id, gallery(3).id]]);
    expect(photos.map((p) => p.location ?? null)).toEqual([INTRAMUROS, null, MAKATI]);
  });

  it('a failed read leaves the places unknown; the photos still go in', async () => {
    const photos = await photosForAlbum([gallery(1), gallery(2)], 9, lookups(async () => { throw new Error('no'); }));
    expect(photos).toHaveLength(2);
    expect(photos.every((p) => p.location === undefined)).toBe(true);
  });

  it('from Files: the file\'s own GPS, and none when Android zeroed it', () => {
    const doc = (n: number): DocumentPickerAsset => ({ uri: `content://com.android.externalstorage.documents/document/primary%3ADCIM%2FIMG_${n}.jpg`, name: `IMG_${n}.jpg`, mimeType: 'image/jpeg', size: 9, lastModified: 1 });
    const info = (a: DocumentPickerAsset, over: Partial<PickedFileInfo>): PickedFileInfo => ({
      uri: a.uri, kept: true, readable: true, width: 4032, height: 3024, rotation: 0, takenAt: '2026:11:26 10:00:00', takenOffset: '+08:00', ...over,
    });
    const [a, b, c] = [doc(1), doc(2), doc(3)];
    const { photos } = filesToPhotos([a, b, c], [
      info(a, { latitude: INTRAMUROS.lat, longitude: INTRAMUROS.lon }),
      info(b, { latitude: 0, longitude: 0 }),
      info(c, {}),
    ], 5);
    expect(photos.map((p) => p.location ?? null)).toEqual([INTRAMUROS, null, null]);
  });
});

describe('handed to the album builder', () => {
  it('the picked photo carries its place, and the builder asks for it', async () => {
    const picked = toPickedPhoto(draftPhoto(1, { location: INTRAMUROS }));
    const intake = createPhotoIntake(async () => null);
    expect(await intake.captureLocation!(picked)).toEqual(INTRAMUROS);
    expect(await intake.captureLocation!(toPickedPhoto(draftPhoto(2)))).toBeNull();
  });

  it('two places at the same moment become two scenes (the album keeps each together)', () => {
    const at = 1_764_000_000_000;
    const photo = (id: string, t: number, location: { lat: number; lon: number } | null): UploadedPhoto => ({
      id, previewUrl: '', name: `${id}.jpg`, type: 'image/jpeg', size: 1, width: 4032, height: 3024, capturedAt: t, location,
    });
    // Three shots in Intramuros, then three in Makati, a minute apart each:
    // by time alone this is one moment.
    const withPlaces = [0, 1, 2].map((i) => photo(`i${i}`, at + i * 60_000, INTRAMUROS))
      .concat([3, 4, 5].map((i) => photo(`m${i}`, at + i * 60_000, MAKATI)));
    const scenes = planScenes(withPlaces);
    expect(new Set(['i0', 'i1', 'i2'].map((id) => scenes.get(id))).size).toBe(1);
    expect(new Set(['m3', 'm4', 'm5'].map((id) => scenes.get(id))).size).toBe(1);
    expect(scenes.get('i0')).not.toBe(scenes.get('m3'));
    // Without places (as the app was): one scene.
    const timeOnly = planScenes(withPlaces.map((p) => ({ ...p, location: null })));
    expect(new Set(withPlaces.map((p) => timeOnly.get(p.id))).size).toBe(1);
  });
});

describe('never leaves the phone', () => {
  it('the album saved to the account lists each photo without its place', () => {
    const row = serializeAlbum({
      title: 'Trip', sizePreset: '8x8', pages: [],
      photos: [{ id: 'a', name: 'IMG_1.jpg', size: 1, width: 4032, height: 3024, capturedAt: 5, location: INTRAMUROS } as never],
    });
    expect(JSON.stringify(row)).not.toMatch(/location|lat|lon|14\.59|120\.97/);
  });
});

describe('photo access with the location permission in the app', () => {
  // Expo counts "access media location" in its own answer, so a person who
  // allowed all photos before this update reads as refused (Android 13) or
  // limited (Android 14). The permissions themselves decide.
  const refusedByExpo = { granted: false, canAskAgain: true, status: 'denied' as never, accessPrivileges: 'none' };
  const limitedByExpo = { granted: true, canAskAgain: true, status: 'granted' as never, accessPrivileges: 'limited' };

  it('all photos allowed stays "all", whatever Expo says', () => {
    expect(accessFrom(refusedByExpo, false, { images: true, selected: true, place: false })).toEqual({ state: 'all' });
    expect(accessFrom(limitedByExpo, false, { images: true, selected: true, place: false })).toEqual({ state: 'all' });
  });

  it('only chosen photos is "limited"; nothing allowed asks', () => {
    expect(accessFrom(limitedByExpo, false, { images: false, selected: true, place: false })).toEqual({ state: 'limited' });
    expect(accessFrom(refusedByExpo, true, { images: false, selected: false, place: false })).toEqual({ state: 'ask', canAskAgain: true, refused: true });
  });

  it('a build that can\'t read the permissions answers as before', () => {
    expect(accessFrom({ granted: true, canAskAgain: true, status: 'granted' as never, accessPrivileges: 'all' }, false, null)).toEqual({ state: 'all' });
  });
});
