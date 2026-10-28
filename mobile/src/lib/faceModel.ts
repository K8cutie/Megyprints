/* ══════════════════════════════════════════════════════════════════════════
   GOOGLE ML KIT FACE FINDING, on the phone: com.google.mlkit:face-detection
   16.1.7, the "bundled" kind (its model is inside the app: no Google Play
   download, finds faces with no network), called by the app's own native
   module (modules/photo-pixels) on a copy of the photo up to
   FACE_COPY_SCALE (2) times the photo check's small copy (1600 px on the
   long side), straight from memory. Why twice: ML Kit's guide asks for
   faces of 100 × 100 px, and on the 800 px small copy only the biggest
   faces are (tools/photo-check: the phone could judge the eyes on 42 of
   the 237 faces it found there). Its answers are brought back to the small
   copy's pixels (phoneFaces.ts fromNative).

   APP SIZE: the bundled model adds about 13 MB to the app on an arm64
   phone (the face finder's native code 8.5 MB, its model files 4.3 MB, of
   which contours.tfl, 1.1 MB, is never used here), less to download
   (docs/mobile-port-plan.md has the measured numbers). The other kind,
   play-services-mlkit-face-detection, keeps the app small but has Google
   Play services download the model on the phone, so the first check can
   find no faces until it has: the owner's choice, before the store.

   PRIVACY: the photos never leave the phone. But ML Kit is not silent: it
   brings Google's usage-log uploader (com.google.android.datatransport,
   "cct"), and Google's ML Kit terms say the on-device APIs send Google
   anonymous usage and performance numbers, with device and app details.
   Before the app ships with this module: list ML Kit in the Play Data
   safety form (Google's ML Kit data-disclosure page says what to tick), and
   add it to the privacy page's service providers ("Google ML Kit: finds
   faces on your phone; your photos are never sent"). docs/mobile-port-plan.md
   has this on its list for the store.

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

/** What PhotoPixelsModule.kt asks ML Kit for, for the reports
 *  (test/faceModel.test.ts checks it against the Kotlin). */
export const FACE_MODEL = {
  library: 'com.google.mlkit:face-detection:16.1.7 (bundled model)',
  performanceMode: 'accurate',
  landmarks: 'all',
  classification: 'all',
  contours: 'none',
  minFaceSize: 0.05,
} as const;

/** ML Kit's copy is up to this many times the small copy on each side. */
export const FACE_COPY_SCALE = 2;

/** How many times the `smallWidth`-wide small copy ML Kit's copy is, for a
 *  photo `photoWidth` wide (as shown): FACE_COPY_SCALE, but never bigger
 *  than the photo itself (a bigger copy adds no detail), and never under 1. */
export function faceCopyScale(photoWidth: number, smallWidth: number): number {
  if (!(photoWidth > 0 && smallWidth > 0)) return 1;
  return Math.max(1, Math.min(FACE_COPY_SCALE, photoWidth / smallWidth));
}

/** Nothing to load ahead: ML Kit loads its model inside the app on first use. */
export function initFaceModel(): Promise<boolean> {
  return Promise.resolve(faceModelAvailable);
}

/** The faces in the photo at `uri`, found on a copy `scale` times its
 *  `w` × `h` small copy, given in the small copy's pixels. */
export async function findFacesIn(uri: string, w: number, h: number, scale = 1): Promise<PhoneFace[]> {
  if (!faceModelAvailable) return [];
  const cw = Math.max(1, Math.round(w * scale)), ch = Math.max(1, Math.round(h * scale));
  return (await smallCopyFaces(uri, cw, ch)).map((f) => fromNative(f, cw / w, ch / h));
}
