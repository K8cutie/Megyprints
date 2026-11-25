/* ══════════════════════════════════════════════════════════════════════════
   THE PHONE'S PHOTOS (Android's photo index, MediaStore), through
   expo-media-library.

   The grid reads only what the index already knows (id, name, size, time:
   `exeForMetadata`, no file opened), in pages, newest first. Each photo's id
   is its content:// address, which the grid shows as a thumbnail and the
   album keeps as the photo's place on the phone.

   Photo access ("Allow access to photos"):
     • 'all'      the whole gallery;
     • 'limited'  Android 14+ "Allow limited access": only photos the person
                  chose. "Choose more photos" opens Android's own chooser again;
     • 'ask'      not allowed (yet). "Choose from Files" needs no permission.
   Which of these it is comes from the photo permissions themselves
   (modules/photo-files photoPermissions) when the build can read them:
   expo-media-library also counts "access media location" in its answer, so a
   person who allowed all photos before the app read photo places would look
   refused (or limited) to it.

   WHERE PHOTOS WERE TAKEN (photoPlace.ts): read for the picked photos only,
   once, when they go into the album. The first time, the app asks for
   "access media location" on its own (never for photos again).
   ══════════════════════════════════════════════════════════════════════════ */
import {
  Asset,
  AssetField,
  getPermissionsAsync,
  MediaType,
  presentPermissionsPicker,
  Query,
  requestPermissionsAsync,
  type AssetMetadata,
  type PermissionResponse,
} from 'expo-media-library';
import { askPlaceAccess, photoPermissions, photoPlaces, type PhotoPermissions } from '../../modules/photo-files';
import { photoKey, type DraftPhoto } from './photoDraft';
import { toPlace, type PhotoPlace } from './photoPlace';
import { parseExifDateTime } from './photoTime';

/** One photo in the grid. */
export interface GalleryPhoto {
  /** The photo's content:// address: its id, its thumbnail, its place. */
  id: string;
  name: string;
  /** As shown (turned photos swapped). Null when the index doesn't know. */
  width: number | null;
  height: number | null;
  /** Taken time from the index (DATE_TAKEN), ms, or null. */
  capturedAt: number | null;
  /** File last changed, ms, or null. */
  modifiedAt: number | null;
  /** What the grid sorts and groups by: taken, else changed. */
  time: number | null;
}

export type PhotoAccess =
  | { state: 'all' }
  | { state: 'limited' }
  | { state: 'ask'; canAskAgain: boolean; refused: boolean };

/** Only photos are asked for (no videos, no music). */
const PHOTOS_ONLY = ['photo'] as const;

/** Grid pages: a small first page so photos show at once, then big ones. */
export const FIRST_PAGE = 120;
export const NEXT_PAGE = 1000;

/** What a permission answer means for the grid. `asked`: this answer came
 *  from asking just now (so a no is a real "no", not "not asked yet").
 *  `held`: the photo permissions the app holds, one by one, when the build
 *  can read them; they decide all / limited, so a missing "access media
 *  location" never hides photos the person allowed. */
export function accessFrom(
  resp: Pick<PermissionResponse, 'granted' | 'canAskAgain' | 'status'> & { accessPrivileges?: string },
  asked: boolean,
  held?: PhotoPermissions | null,
): PhotoAccess {
  if (held) {
    if (held.images) return { state: 'all' };
    if (held.selected) return { state: 'limited' };
    return { state: 'ask', canAskAgain: resp.canAskAgain, refused: asked || resp.status === 'denied' };
  }
  if (resp.granted) return resp.accessPrivileges === 'limited' ? { state: 'limited' } : { state: 'all' };
  return { state: 'ask', canAskAgain: resp.canAskAgain, refused: asked || resp.status === 'denied' };
}

export async function checkPhotoAccess(): Promise<PhotoAccess> {
  return accessFrom(await getPermissionsAsync(false, [...PHOTOS_ONLY]), false, photoPermissions());
}

export async function askPhotoAccess(): Promise<PhotoAccess> {
  return accessFrom(await requestPermissionsAsync(false, [...PHOTOS_ONLY]), true, photoPermissions());
}

/** Android 14+, limited access: Android's own chooser, to add more photos. */
export async function chooseMorePhotos(): Promise<PhotoAccess> {
  try {
    await presentPermissionsPicker([...PHOTOS_ONLY]);
  } catch {
    // Older Android: no chooser. The screen also says how to allow all in Settings.
  }
  return checkPhotoAccess();
}

/** The index's facts → a grid photo. Null for anything that is not a photo. */
export function toGalleryPhoto(m: AssetMetadata): GalleryPhoto | null {
  if (m.mediaType !== MediaType.IMAGE || !m.id) return null;
  const capturedAt = m.creationTime ?? null;
  const modifiedAt = m.modificationTime ?? null;
  return {
    id: m.id,
    name: m.filename ?? '',
    width: m.width && m.width > 0 ? m.width : null,
    height: m.height && m.height > 0 ? m.height : null,
    capturedAt,
    modifiedAt,
    time: capturedAt ?? modifiedAt,
  };
}

/** One page of the phone's photos, newest taken first. */
export async function loadGalleryPage(offset: number, limit: number): Promise<GalleryPhoto[]> {
  const rows = await new Query()
    .eq(AssetField.MEDIA_TYPE, MediaType.IMAGE)
    .orderBy({ key: AssetField.CREATION_TIME, ascending: false })
    .limit(limit)
    .offset(offset)
    .exeForMetadata();
  return rows.map(toGalleryPhoto).filter((p): p is GalleryPhoto => p !== null);
}

/** Runs `work` over `items`, `limit` at a time, keeping their order. */
export async function mapLimited<T, R>(items: readonly T[], limit: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await work(items[i]);
    }
  });
  await Promise.all(runners);
  return out;
}

/** Native lookups `photosForAlbum` needs, passed in so tests can fake them. */
export interface PhotoLookups {
  /** Width and height as shown, read from the file when the index has none. */
  shape: (id: string) => Promise<{ width: number; height: number } | null>;
  /** EXIF DateTimeOriginal (or DateTimeDigitized) text, or null. */
  exifTaken: (id: string) => Promise<string | null>;
  /** Where each photo was taken (same order), null for a photo with none.
   *  Absent: places are not read. */
  places?: (ids: string[]) => Promise<(PhotoPlace | null)[]>;
}

/** Asked for "access media location" this time the app is open: asked once. */
let placeAsked = false;

/** Where the picked photos were taken. Asks for "access media location"
 *  first if photos are allowed but places are not (once per app start; the
 *  photos go in anyway, grouped by time only, if the answer is no). */
async function readPlaces(ids: string[]): Promise<(PhotoPlace | null)[]> {
  const held = photoPermissions();
  if (held && !held.place && (held.images || held.selected) && !placeAsked) {
    placeAsked = true;
    await askPlaceAccess().catch(() => false);
  }
  const read = await photoPlaces(ids).catch(() => null);
  if (read) return read.map((r) => toPlace(r.lat, r.lon));
  // No native half for it (not Android): the photo library's own reader.
  return mapLimited(ids, 4, async (id) => {
    const at = await new Asset(id).getLocation().catch(() => null);
    return at ? toPlace(at.latitude, at.longitude) : null;
  });
}

export const nativeLookups: PhotoLookups = {
  shape: async (id) => (await new Asset(id).getShape()) ?? null,
  exifTaken: async (id) => {
    const exif = await new Asset(id).getExif();
    const v = exif?.DateTimeOriginal ?? exif?.DateTimeDigitized;
    return typeof v === 'string' ? v : null;
  },
  places: readPlaces,
};

/** No EXIF to read: PNG screenshots and the like. */
const NO_EXIF = /\.(png|gif|bmp)$/i;

/**
 * Picked grid photos → album photos. Fills in what the index left out, for
 * the picked photos only (usually none):
 *   • no width/height in the index: read from the file;
 *   • no taken time in the index: read the EXIF (Android leaves DATE_TAKEN
 *     empty for EXIF times without a time zone when the file's date is more
 *     than a day off, as with old photos copied to a new phone);
 *   • where each was taken (the index never has it): read for all of them in
 *     one call. A photo with no place, or a failed read, just has none.
 */
export async function photosForAlbum(picked: readonly GalleryPhoto[], now = Date.now(), lookups: PhotoLookups = nativeLookups): Promise<DraftPhoto[]> {
  const [photos, places] = await Promise.all([
    photosWithFacts(picked, now, lookups),
    lookups.places ? lookups.places(picked.map((p) => p.id)).catch(() => null) : Promise.resolve(null),
  ]);
  return photos.map((photo, i) => {
    const location = places?.[i] ?? null;
    return location ? { ...photo, location } : photo;
  });
}

async function photosWithFacts(picked: readonly GalleryPhoto[], now: number, lookups: PhotoLookups): Promise<DraftPhoto[]> {
  return mapLimited(picked, 4, async (p): Promise<DraftPhoto> => {
    let { width, height } = p;
    let capturedAt = p.capturedAt;
    if (width == null || height == null) {
      const shape = await lookups.shape(p.id).catch(() => null);
      width = shape?.width ?? 0;
      height = shape?.height ?? 0;
    }
    if (capturedAt == null && !NO_EXIF.test(p.name)) {
      capturedAt = parseExifDateTime(await lookups.exifTaken(p.id).catch(() => null));
    }
    return {
      key: photoKey('gallery', p.id),
      source: 'gallery',
      uri: p.id,
      name: p.name,
      width: width ?? 0,
      height: height ?? 0,
      capturedAt,
      modifiedAt: p.modifiedAt,
      addedAt: now,
    };
  });
}
