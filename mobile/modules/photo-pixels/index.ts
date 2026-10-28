/* The app's own native module for Megy's photo check
   (android/src/main/java/expo/modules/megyphotopixels/PhotoPixelsModule.kt).
   It makes a SMALL copy of a photo on the phone the way the website's
   browser makes it (Chrome's createImageBitmap 'medium' resize: the same
   pixels, ±1; the EXIF turn applied; sRGB), and runs Google ML Kit's face
   finder on that copy (its model inside the app: no download, no network):
     • pixels: the small copy's RGBA bytes, for the shared check rules
               (blur, repeats);
     • faces:  the faces ML Kit finds on the same small copy, in its pixels.
   Both run on Android's background threads. Jest has no native modules:
   photoPixelsAvailable is false there. */
import { requireOptionalNativeModule } from 'expo';

type Pt = { x: number; y: number };

/** One face as the module reports it (the small copy's pixels). */
export interface NativeFace {
  x: number;
  y: number;
  width: number;
  height: number;
  /** ML Kit's eye points (the person's left / right eye), when found. */
  leftEye: Pt | null;
  rightEye: Pt | null;
  /** ML Kit's chance each eye is open, 0–1; null when it could not tell. */
  leftEyeOpen: number | null;
  rightEyeOpen: number | null;
}

interface PhotoPixelsNative {
  size(uri: string): Promise<{ width: number; height: number }>;
  pixels(uri: string, width: number, height: number): Promise<Uint8Array>;
  faces(uri: string, width: number, height: number): Promise<NativeFace[]>;
}

const native = requireOptionalNativeModule<PhotoPixelsNative>('MegyPhotoPixels');

/** Is the native half in this build? (Not in jest, or an older APK.) */
export const photoPixelsAvailable = native != null;

function need(): PhotoPixelsNative {
  if (!native) throw new Error('This build of the app cannot read photos for the photo check.');
  return native;
}

/** The photo's size as shown (EXIF turn applied), read from its header. */
export function pictureSize(uri: string): Promise<{ width: number; height: number }> {
  return need().size(uri);
}

/** The small copy's pixels: `width` × `height` RGBA bytes, row by row. */
export function smallCopyPixels(uri: string, width: number, height: number): Promise<Uint8Array> {
  return need().pixels(uri, width, height);
}

/** The faces ML Kit finds on the `width` × `height` small copy. */
export function smallCopyFaces(uri: string, width: number, height: number): Promise<NativeFace[]> {
  return need().faces(uri, width, height);
}
