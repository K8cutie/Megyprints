/* The app's own native module for photos picked with "Choose from Files"
   (android/src/main/java/expo/modules/megyphotofiles/PhotoFilesModule.kt).
   It keeps the app's access to each picked photo, so the album can point at
   the photo where it is instead of copying it, and reads each photo's size
   and EXIF time without loading the picture. It also turns a photo into
   sRGB for a print page (srgbCopy), and reads where gallery photos were taken
   (photoPlaces, with the photo permissions it needs: photoPermissions,
   askPlaceAccess). */
import { requireOptionalNativeModule } from 'expo';

/** What the module says about one picked photo. */
export interface PickedFileInfo {
  uri: string;
  /** Access kept after the app closes (Android "persistable" access). */
  kept: boolean;
  /** The photo could be opened and its size read. */
  readable: boolean;
  /** As shown: EXIF rotation already applied. 0 = unknown. */
  width: number;
  height: number;
  rotation: number;
  /** EXIF DateTimeOriginal ("2026:10:26 14:03:12"), or null. */
  takenAt: string | null;
  /** EXIF OffsetTimeOriginal ("+08:00"), or null. */
  takenOffset: string | null;
  /** Where it was taken (EXIF GPS), or null. Zeroes when Android hid it:
   *  read it through toPlace (src/lib/photoPlace.ts). Absent in older builds. */
  latitude?: number | null;
  longitude?: number | null;
}

/** The photo permissions the app holds, each on its own. */
export interface PhotoPermissions {
  /** "Allow all" (Android 13+ READ_MEDIA_IMAGES; older: READ_EXTERNAL_STORAGE). */
  images: boolean;
  /** Android 14+ "Allow limited access" (READ_MEDIA_VISUAL_USER_SELECTED). */
  selected: boolean;
  /** May read where photos were taken (ACCESS_MEDIA_LOCATION; always true before Android 10). */
  place: boolean;
}

/** Where one photo was taken, as the module read it (nulls: no place). */
export interface PhotoPlaceRead {
  uri: string;
  lat: number | null;
  lon: number | null;
}

/** What srgbCopy did with one photo. */
export interface SrgbCopyResult {
  /** false: Android 8 or older (no ImageDecoder): nothing was written. */
  supported: boolean;
  /** The colour space the photo was saved in, as Android names it ("Display P3", "sRGB IEC61966-2.1"). */
  colorSpace: string | null;
  /** Its colours had to be changed to be sRGB. */
  converted: boolean;
}

/** What inspect says about one photo (its header only, no pixels). */
export interface PhotoInspection {
  uri: string;
  /** The app can still open it (it was not deleted, its access was kept). */
  readable: boolean;
  /** The file's size in bytes. 0 = unknown. */
  size: number;
  /** As shown: EXIF rotation already applied. 0 = unknown. */
  width: number;
  height: number;
  /** The colour space it was saved in, as Android names it. Null = unknown (Android 7). */
  colorSpace: string | null;
  /** Not sRGB (Display P3, Adobe RGB…): turned into sRGB before a print page is drawn. */
  needsSrgb: boolean;
}

/** What drawableCopy wrote. */
export interface DrawableCopyResult {
  /** The photo as shown (EXIF rotation applied). */
  width: number;
  height: number;
  /** The copy's size. */
  outWidth: number;
  outHeight: number;
  colorSpace: string | null;
  /** Its colours were changed to be sRGB. */
  converted: boolean;
}

/** One photo picked in "Choose from Files" (the shape expo-document-picker gives). */
export interface PickedPhotoFile {
  uri: string;
  name: string;
  mimeType: string | null;
  size: number | null;
  lastModified: number | null;
}

interface PhotoFilesNative {
  describe(uris: string[]): Promise<PickedFileInfo[]>;
  release(uris: string[]): Promise<number>;
  keptCount(): number;
  srgbCopy(source: string, target: string): Promise<SrgbCopyResult>;
  inspect?(uris: string[]): Promise<PhotoInspection[]>;
  opensWhole?(uris: string[]): Promise<PhotoWhole[]>;
  drawableCopy?(source: string, target: string, maxSide: number): Promise<DrawableCopyResult>;
  pickPhotos?(): Promise<{ canceled: boolean; assets: PickedPhotoFile[] }>;
  photoPermissions?(): PhotoPermissions;
  askPlaceAccess?(): Promise<unknown>;
  places?(uris: string[]): Promise<PhotoPlaceRead[]>;
}

const native = requireOptionalNativeModule<PhotoFilesNative>('MegyPhotoFiles');

/** Is the native half in this build? (Not in jest, or an old APK.) */
export const photoFilesAvailable = native != null;

/** Keeps access to the picked photos and reads their size and EXIF time. */
export async function describePickedFiles(uris: string[]): Promise<PickedFileInfo[]> {
  if (!native) {
    return uris.map((uri) => ({ uri, kept: false, readable: true, width: 0, height: 0, rotation: 0, takenAt: null, takenOffset: null }));
  }
  return native.describe(uris);
}

/** Gives access back for photos that left the album. */
export async function releasePickedFiles(uris: string[]): Promise<number> {
  if (!native || uris.length === 0) return 0;
  return native.release(uris);
}

/** The photo at `source` (content:// or file://) turned into sRGB and written
 *  as a PNG to the file:// address `target` (Android's ImageDecoder). Skia on
 *  the phone draws a photo's colour numbers as they are, so a photo saved in
 *  Display P3 or Adobe RGB must go through this before it is drawn on a print
 *  page. Null when the build has no native half (jest, an old APK). */
export async function srgbCopy(source: string, target: string): Promise<SrgbCopyResult | null> {
  if (!native || typeof native.srgbCopy !== 'function') return null;
  return native.srgbCopy(source, target);
}

/** Whether each photo is still on the phone, its size as shown and its
 *  colour space, from the file's header (no pixels, no access taken). Null
 *  when the build has no native half (jest, an older APK). */
export async function inspectPhotos(uris: string[]): Promise<PhotoInspection[] | null> {
  if (!native || typeof native.inspect !== 'function') return null;
  if (uris.length === 0) return [];
  return native.inspect(uris);
}

/** Whether the whole photo opens, as the print files open it. */
export interface PhotoWhole {
  uri: string;
  /** true: it opens. false: it can't (cut off, broken, gone). null: this phone can't tell (Android 8 or older). */
  whole: boolean | null;
}

/** Each photo opened whole and small, as the print files open it (Android's
 *  ImageDecoder), so a photo cut off halfway is found before an order is
 *  saved: its header is fine, so inspectPhotos can't see it. In groups of
 *  24, saying how far it got after each group. Null when the build has no
 *  native half (jest, an older APK). */
export async function photosOpenWhole(uris: string[], onDone?: (done: number, total: number) => void): Promise<PhotoWhole[] | null> {
  if (!native || typeof native.opensWhole !== 'function') return null;
  const out: PhotoWhole[] = [];
  for (let i = 0; i < uris.length; i += 24) {
    out.push(...await native.opensWhole(uris.slice(i, i + 24)));
    onDone?.(out.length, uris.length);
  }
  return out;
}

/** A small upright sRGB JPEG of the photo at `source`, written to the
 *  file:// address `target`, for drawing pages on screen. Null when the build
 *  has no native half. Throws when the photo can't be opened. */
export async function drawableCopy(source: string, target: string, maxSide: number): Promise<DrawableCopyResult | null> {
  if (!native || typeof native.drawableCopy !== 'function') return null;
  return native.drawableCopy(source, target, maxSide);
}

/** "Choose from Files": Android's document picker for photos, many at once,
 *  opened in the phone's camera folder. Null when the build has no native
 *  half for it (jest, an older APK): then the app's older picker is used. */
export async function pickPhotoFiles(): Promise<{ canceled: boolean; assets: PickedPhotoFile[] } | null> {
  if (!native || typeof native.pickPhotos !== 'function') return null;
  return native.pickPhotos();
}

/** Which photo permissions the app holds, each on its own. Null when the
 *  build has no native half for it (jest, an older APK, not Android). */
export function photoPermissions(): PhotoPermissions | null {
  if (!native || typeof native.photoPermissions !== 'function') return null;
  try {
    return native.photoPermissions();
  } catch {
    return null;
  }
}

/** Asks for "access media location" only (never for photos again). True when
 *  the app may now read where photos were taken. */
export async function askPlaceAccess(): Promise<boolean> {
  if (!native || typeof native.askPlaceAccess !== 'function') return false;
  try {
    await native.askPlaceAccess();
  } catch {
    return false;
  }
  return photoPermissions()?.place === true;
}

/** Where each photo was taken (in the same order). Null when the build has
 *  no native half for it. */
export async function photoPlaces(uris: string[]): Promise<PhotoPlaceRead[] | null> {
  if (!native || typeof native.places !== 'function') return null;
  if (uris.length === 0) return [];
  return native.places(uris);
}
