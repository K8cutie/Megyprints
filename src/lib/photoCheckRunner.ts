/* ══════════════════════════════════════════════════════════════════════════
   photoCheckRunner — runs Megy's free photo check on ONE photo, on the phone.
   Decodes a small copy (CHECK_LONG_SIDE on the long side — never the full
   photo: a full decode of a 250-photo pick once ran a phone out of memory),
   measures sharpness and the fingerprint (photoCheck), then looks for faces
   and shut eyes with the tiny face models the app already uses. No upload,
   no AI bill. A face model that can't load just means no eye test.
   The 2.0 app does the same with its own decoding and face finder, through
   the same photoCheck functions (checkCopySize, basicCheck, faceVerdict).

   THE LOOK PASS (lookOfPhoto): what each photo looks like (lib/photoLook),
   read by MobileNet v2 on the graphics chip (lib/mobileNet) from a 224 px
   copy. That copy is made while the 800 px one is open for the blur check
   and kept as a small JPEG (about 10 KB), so the look pass does not decode
   the photo again. It only runs where it is quick:
     • not without a fast graphics chip (the rule the face pass uses);
     • not when the model took too long to arrive (LOOK_MODEL_WAIT_MS: it
       keeps downloading, for later in the visit and the next one);
     • not when the first LOOK_GATE_PHOTOS photos took over LOOK_GATE_MS
       each on average.
   Where it doesn't run, photos have no look and the album is grouped by
   capture time alone, as before.
   ══════════════════════════════════════════════════════════════════════════ */

import { checkCopySize, basicCheck, faceVerdict, type PhotoCheck } from './photoCheck';
import { encodeLook, createLookGate } from './photoLook';
import { loadMobileNet, type MobileNet } from './mobileNet';
import { initFaceLandmarks, detectFacesWithLandmarks, faceBackendIsFast } from '../pages/builder/faceDetection';

/** Face checks are quick here (WebGL), so every photo can have one. */
export function facesForAllPhotos(): boolean {
  return faceBackendIsFast();
}

/** The side of the copy the look model reads (MobileNet's own input). */
export const LOOK_SIDE = 224;
/** The longest a photo waits for the model to arrive. */
export const LOOK_MODEL_WAIT_MS = 20_000;
/** Small copies kept for the look pass at most (about 10 KB each). */
const KEEP_SMALL = 600;

/** Each photo's 224 px copy, by photo id, until its look is read. */
const small = new Map<string, Blob>();
/** The look pass is off for this visit (the model failed, or no fast chip). */
let lookOff = false;
/** The model did not arrive in time: off until it does. */
let lookWaiting = false;
/** Too slow here (photoLook's gate: the first photos' times). */
const gate = createLookGate();
let net: Promise<MobileNet | null> | null = null;

/** The look model, or null where it can't run fast (no WebGL) or can't load. */
function lookNet(): Promise<MobileNet | null> {
  if (!net) {
    net = loadMobileNet()
      .then((m) => {
        lookWaiting = false;
        if (m.backend !== 'webgl') { lookOff = true; return null; }
        return m.net;
      })
      .catch(() => { lookOff = true; return null; });
  }
  return net;
}

/** The look pass runs here now. */
export function looksForPhotos(): boolean {
  return !lookOff && !gate.off && !lookWaiting && typeof createImageBitmap === 'function' && faceBackendIsFast();
}

/** Check one photo. `width`/`height` are its measured size (for the small
 *  decode). `lookId`: the photo's id when its look is still to be read: its
 *  224 px copy is kept for the look pass. */
export async function checkPhoto(blob: Blob, width: number, height: number, opts: { faces?: boolean; lookId?: string } = {}): Promise<PhotoCheck> {
  const { w, h } = checkCopySize(width, height);
  const bmp = await createImageBitmap(blob, { resizeWidth: w, resizeHeight: h, resizeQuality: 'medium' });
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) { bmp.close(); throw new Error('no 2d context'); }
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const result: PhotoCheck = basicCheck(ctx.getImageData(0, 0, w, h).data, w, h);
  if (opts.lookId && looksForPhotos() && !small.has(opts.lookId)) {
    await keepSmallCopy(opts.lookId, canvas).catch(() => { /* the look pass decodes the photo itself */ });
    void lookNet(); // start fetching the model while the photos are checked
  }
  if (opts.faces !== false && await initFaceLandmarks()) {
    const { faces, eyesClosed } = faceVerdict(await detectFacesWithLandmarks(canvas), h);
    result.faces = faces;
    result.eyesClosed = eyesClosed;
  }
  canvas.width = canvas.height = 0; // free the pixels now
  return result;
}

/** The whole picture squeezed to LOOK_SIDE × LOOK_SIDE (the model reads a
 *  square; the look is of everything in the frame, not a crop), as a JPEG. */
async function keepSmallCopy(id: string, from: HTMLCanvasElement): Promise<void> {
  const c = document.createElement('canvas');
  c.width = c.height = LOOK_SIDE;
  const ctx = c.getContext('2d');
  if (!ctx) return;
  ctx.imageSmoothingQuality = 'medium';
  ctx.drawImage(from, 0, 0, LOOK_SIDE, LOOK_SIDE);
  const jpeg = await new Promise<Blob | null>((resolve) => c.toBlob(resolve, 'image/jpeg', 0.9));
  c.width = c.height = 0;
  if (!jpeg) return;
  small.set(id, jpeg);
  if (small.size > KEEP_SMALL) small.delete(small.keys().next().value as string);
}

/** One photo's look (lib/photoLook's text), or null: the pass is off, the
 *  model isn't here, or the photo can't be read. Never throws. */
export async function lookOfPhoto(id: string, blob: Blob): Promise<string | null> {
  if (!looksForPhotos()) return null;
  try {
    const model = await Promise.race([
      lookNet(),
      new Promise<'late'>((resolve) => setTimeout(() => resolve('late'), LOOK_MODEL_WAIT_MS)),
    ]);
    if (model === 'late') { lookWaiting = !lookOff; return null; }
    if (!model) return null;
    const t0 = performance.now();
    const kept = small.get(id);
    small.delete(id);
    const bmp = kept
      ? await createImageBitmap(kept)
      : await createImageBitmap(blob, { resizeWidth: LOOK_SIDE, resizeHeight: LOOK_SIDE, resizeQuality: 'medium' });
    let values: ArrayLike<number>;
    try {
      const out = model.infer(bmp, true);
      try { values = await out.data(); } finally { out.dispose(); }
    } finally {
      bmp.close();
    }
    gate.took(performance.now() - t0);
    if (gate.off) small.clear();
    return encodeLook(values);
  } catch {
    return null;
  }
}

/** How the look pass went this visit (for measuring it; nothing on screen). */
export function lookPassReport(): { off: boolean; waiting: boolean; firstMs: number[]; keptCopies: number } {
  return { off: lookOff || gate.off, waiting: lookWaiting, firstMs: gate.times(), keptCopies: small.size };
}
