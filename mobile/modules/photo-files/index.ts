/* The app's own native module for photos picked with "Choose from Files"
   (android/src/main/java/expo/modules/megyphotofiles/PhotoFilesModule.kt).
   It keeps the app's access to each picked photo, so the album can point at
   the photo where it is instead of copying it, and reads each photo's size
   and EXIF time without loading the picture. It also turns a photo into
   sRGB for a print page (srgbCopy). */
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

interface PhotoFilesNative {
  describe(uris: string[]): Promise<PickedFileInfo[]>;
  release(uris: string[]): Promise<number>;
  keptCount(): number;
  srgbCopy(source: string, target: string): Promise<SrgbCopyResult>;
  inspect?(uris: string[]): Promise<PhotoInspection[]>;
  drawableCopy?(source: string, target: string, maxSide: number): Promise<DrawableCopyResult>;
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

/** A small upright sRGB JPEG of the photo at `source`, written to the
 *  file:// address `target`, for drawing pages on screen. Null when the build
 *  has no native half. Throws when the photo can't be opened. */
export async function drawableCopy(source: string, target: string, maxSide: number): Promise<DrawableCopyResult | null> {
  if (!native || typeof native.drawableCopy !== 'function') return null;
  return native.drawableCopy(source, target, maxSide);
}
