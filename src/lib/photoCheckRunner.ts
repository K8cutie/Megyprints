/* ══════════════════════════════════════════════════════════════════════════
   photoCheckRunner — runs Megy's free photo check on ONE photo, on the phone.
   Decodes a small copy (CHECK_LONG_SIDE on the long side — never the full
   photo: a full decode of a 250-photo pick once ran a phone out of memory),
   measures sharpness and the fingerprint (photoCheck), then looks for faces
   and shut eyes with the tiny face models the app already uses. No upload,
   no AI bill. A face model that can't load just means no eye test.
   The 2.0 app does the same with its own decoding and face finder, through
   the same photoCheck functions (checkCopySize, basicCheck, faceVerdict).
   ══════════════════════════════════════════════════════════════════════════ */

import { checkCopySize, basicCheck, faceVerdict, type PhotoCheck } from './photoCheck';
import { initFaceLandmarks, detectFacesWithLandmarks, faceBackendIsFast } from '../pages/builder/faceDetection';

/** Face checks are quick here (WebGL), so every photo can have one. */
export function facesForAllPhotos(): boolean {
  return faceBackendIsFast();
}

/** Check one photo. `width`/`height` are its measured size (for the small decode). */
export async function checkPhoto(blob: Blob, width: number, height: number, opts: { faces?: boolean } = {}): Promise<PhotoCheck> {
  const { w, h } = checkCopySize(width, height);
  const bmp = await createImageBitmap(blob, { resizeWidth: w, resizeHeight: h, resizeQuality: 'medium' });
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) { bmp.close(); throw new Error('no 2d context'); }
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const result: PhotoCheck = basicCheck(ctx.getImageData(0, 0, w, h).data, w, h);
  if (opts.faces !== false && await initFaceLandmarks()) {
    const { faces, eyesClosed } = faceVerdict(await detectFacesWithLandmarks(canvas), h);
    result.faces = faces;
    result.eyesClosed = eyesClosed;
  }
  canvas.width = canvas.height = 0; // free the pixels now
  return result;
}
