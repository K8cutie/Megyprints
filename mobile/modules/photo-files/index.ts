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

interface PhotoFilesNative {
  describe(uris: string[]): Promise<PickedFileInfo[]>;
  release(uris: string[]): Promise<number>;
  keptCount(): number;
  srgbCopy(source: string, target: string): Promise<SrgbCopyResult>;
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
