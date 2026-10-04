/* ══════════════════════════════════════════════════════════════════════════
   photoCheckRunner — runs Megy's free photo check on ONE photo, on the phone.
   Decodes a small copy (CHECK_LONG_SIDE on the long side — never the full
   photo: a full decode of a 250-photo pick once ran a phone out of memory),
   measures sharpness and the fingerprint (photoCheck), then looks for faces
   and shut eyes with the tiny face models the app already uses. No upload,
   no AI bill. A face model that can't load just means no eye test.
   ══════════════════════════════════════════════════════════════════════════ */

import { CHECK_LONG_SIDE, grayscale, tileSharpness, dHash, eyesClosedIn, MIN_FACE_SHARE, type PhotoCheck } from './photoCheck';
import { initFaceLandmarks, detectFacesWithLandmarks, faceBackendIsFast } from '../pages/builder/faceDetection';

/** Face checks are quick here (WebGL), so every photo can have one. */
export function facesForAllPhotos(): boolean {
  return faceBackendIsFast();
}

/** Check one photo. `width`/`height` are its measured size (for the small decode). */
export async function checkPhoto(blob: Blob, width: number, height: number, opts: { faces?: boolean } = {}): Promise<PhotoCheck> {
  const scale = Math.min(1, CHECK_LONG_SIDE / Math.max(1, width, height));
  const w = Math.max(1, Math.round(width * scale)), h = Math.max(1, Math.round(height * scale));
  const bmp = await createImageBitmap(blob, { resizeWidth: w, resizeHeight: h, resizeQuality: 'medium' });
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) { bmp.close(); throw new Error('no 2d context'); }
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const gray = grayscale(ctx.getImageData(0, 0, w, h).data, w, h);
  const result: PhotoCheck = { v: 1, sharp: tileSharpness(gray, w, h), hash: dHash(gray, w, h), faces: null, eyesClosed: false };
  if (opts.faces !== false && await initFaceLandmarks()) {
    const faces = await detectFacesWithLandmarks(canvas);
    result.faces = faces.filter((f) => f.boxHeight >= h * MIN_FACE_SHARE).length;
    result.eyesClosed = eyesClosedIn(faces, h);
  }
  canvas.width = canvas.height = 0; // free the pixels now
  return result;
}
