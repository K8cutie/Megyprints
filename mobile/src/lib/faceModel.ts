/* ══════════════════════════════════════════════════════════════════════════
   GOOGLE ML KIT FACE FINDING, on the phone: com.google.mlkit:face-detection
   16.1.7, the "bundled" kind (its model is inside the app: no Google Play
   download, works with no network), called by the app's own native module
   (modules/photo-pixels) on the photo check's small copy, straight from
   memory.

   Why not a React Native wrapper library: the one tried
   (@infinitered/react-native-mlkit-face-detection 5.0.0) builds with Expo
   SDK 58, but it waits for each photo on Expo's ONE shared module thread
   (runBlocking), so every other phone call (the photo grid's gallery reads)
   queued behind it, and it reads only from a file, so each photo needed a
   JPEG copy written and deleted. tools/photo-check measured both. The few
   lines in PhotoPixelsModule.kt call ML Kit directly instead.

   Settings (in PhotoPixelsModule.kt), for still photos rather than a camera:
     • accurate mode (slower than fast mode, finds more faces in photos);
     • classification on: each eye's chance of being open (the closed-eyes
       check reads it, see phoneFaces.ts);
     • landmarks on: where each eye is;
     • smallest face 5 % of the picture's width: the photo check judges
       faces from 8 % of the picture's height (MIN_FACE_SHARE), which on a
       landscape photo is about 6 % of its width, and face centring uses any
       face the website's finder would see;
     • contours off: with contours on, ML Kit finds only one face.
   ══════════════════════════════════════════════════════════════════════════ */
import { photoPixelsAvailable, smallCopyFaces } from '../../modules/photo-pixels';
import { fromNative, type PhoneFace } from './phoneFaces';

/** Is ML Kit in this build? (Not in jest, or an older APK.) */
export const faceModelAvailable = photoPixelsAvailable;

/** What PhotoPixelsModule.kt asks ML Kit for (kept here for the reports). */
export const FACE_MODEL = {
  library: 'com.google.mlkit:face-detection:16.1.7 (bundled model)',
  performanceMode: 'accurate',
  landmarks: 'all',
  classification: 'all',
  contours: 'none',
  minFaceSize: 0.05,
} as const;

/** Nothing to load ahead: ML Kit loads its model inside the app on first use. */
export function initFaceModel(): Promise<boolean> {
  return Promise.resolve(faceModelAvailable);
}

/** The faces in the photo at `uri`, found on its `w` × `h` small copy, in that copy's pixels. */
export async function findFacesIn(uri: string, w: number, h: number): Promise<PhoneFace[]> {
  if (!faceModelAvailable) return [];
  return (await smallCopyFaces(uri, w, h)).map(fromNative);
}
