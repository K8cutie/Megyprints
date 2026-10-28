/* ══════════════════════════════════════════════════════════════════════════
   MEGY'S PHOTO CHECK AND FACE CENTRING, ON THE PHONE: the app's PhotoChecker
   and FaceFinder for the shared album builder (src/shared/platform.ts).

   The rules are the website's own (src/lib/photoCheck.ts, faceCentre.ts):
     • blur + fingerprint: the photo's small copy (checkCopySize: 800 px on
       the long side) made by the app's native module (modules/photo-pixels)
       the way the website's browser makes it, its pixels through the shared
       basicCheck steps (then checkFrom). Same thresholds, same maths;
     • faces + closed eyes: Google ML Kit on a copy of the same size, in the
       same native module (faceModel.ts), each face mapped to what the
       shared rules read (phoneFaces.ts), then the shared faceVerdict;
     • face centring: the same ML Kit faces through the shared
       faceGroupCentre.

   Memory and the screen: at most PHONE_CHECK_AT_ONCE photos are asked of
   the phone at a time. For the blur check the native module decodes one
   whole photo at a time (as the website's browser does, a 12 MP photo is
   48 MB while it is shrunk; the small copy is about 2 MB); for faces it
   asks Android's decoder for a copy near the small copy's size (a few MB,
   no whole photo: ML Kit does not need the browser's exact pixels).
   Decoding and ML Kit run on
   Android's background threads; only the pixel maths runs on the app's
   JavaScript thread, in three steps (grayscale, sharpness, fingerprint: the
   shared functions basicCheck runs, in its order) with the screen let in
   between. The builder already checks one photo at a time, between other
   work.

   A failed face pass never fails the check: the photo just has no eye test
   (faces stays null), as on the website.

   Work is not repeated: the builder checks each photo twice (blur first,
   faces later) and centres faces when it makes the album, so the blur
   answer and the faces found are kept per photo (a few numbers each) for
   the faces pass and the centring to reuse.
   ══════════════════════════════════════════════════════════════════════════ */
import type { FaceFinder, PhotoChecker, StoredPhoto } from '@web/shared/platform';
import { checkCopySize, checkFrom, dHash, faceVerdict, grayscale, tileSharpness, type PhotoCheck } from '@web/lib/photoCheck';
import { faceGroupCentre } from '@web/pages/builder/faceCentre';
import { createLimiter } from '@web/lib/limit';
import { photoPixelsAvailable, pictureSize, smallCopyPixels } from '../../modules/photo-pixels';
import { faceModelAvailable, findFacesIn, initFaceModel } from './faceModel';
import { toCheckFace, type PhoneFace } from './phoneFaces';

/** What the checks need from the phone (passed in, so tests can fake it). */
export interface PhoneCheckDevice {
  /** The small copy can be decoded here. */
  canDecode: boolean;
  /** The photo's size as shown. */
  size(uri: string): Promise<{ width: number; height: number }>;
  /** The small copy's RGBA pixels. */
  pixels(uri: string, w: number, h: number): Promise<Uint8Array>;
  /** ML Kit on the photo's w × h small copy, or null where it is missing. */
  faces: { init(): Promise<boolean>; find(uri: string, w: number, h: number): Promise<PhoneFace[]> } | null;
}

export const nativeDevice: PhoneCheckDevice = {
  canDecode: photoPixelsAvailable,
  size: pictureSize,
  pixels: smallCopyPixels,
  faces: faceModelAvailable ? { init: initFaceModel, find: findFacesIn } : null,
};

/** Photos asked of the phone at once (the native module decodes one whole photo at a time). */
export const PHONE_CHECK_AT_ONCE = 2;
/** Photos whose answers are kept for reuse (a few numbers each). */
const KEEP = 1000;

/** The phone's own photo addresses: what the album keeps (content://) or a file. */
export const checkable = (url: string) => /^(content|file):\/\//.test(url);

/** Lets the screen draw before a stretch of JavaScript work. */
const breathe = () => new Promise<void>((r) => setTimeout(r, 0));

/** A small map that forgets its oldest entries past `max`. */
function keepLast<V>(max: number) {
  const m = new Map<string, V>();
  return {
    get: (k: string) => m.get(k),
    set: (k: string, v: V) => {
      m.delete(k);
      m.set(k, v);
      if (m.size > max) m.delete(m.keys().next().value as string);
    },
  };
}

/** The faces ML Kit found on a photo's small copy (w × h). */
interface FoundFaces { w: number; h: number; faces: PhoneFace[] }

export function createPhoneChecks(device: PhoneCheckDevice = nativeDevice): { photoCheck: PhotoChecker; faces: FaceFinder } {
  const limit = createLimiter(PHONE_CHECK_AT_ONCE);
  const basics = keepLast<PhotoCheck>(KEEP);
  const found = keepLast<FoundFaces>(KEEP);

  /** ML Kit on the photo's w × h small copy (kept per photo and size). */
  async function facesOn(url: string, w: number, h: number): Promise<FoundFaces | null> {
    if (!device.faces || !(await device.faces.init())) return null;
    const key = `${url}|${w}x${h}`;
    const known = found.get(key);
    if (known) return known;
    const finder = device.faces;
    const faces = await limit(() => finder.find(url, w, h));
    const result = { w, h, faces };
    found.set(key, result);
    // Face centring asks by address only: this is that photo's answer.
    found.set(url, result);
    return result;
  }

  const photoCheck: PhotoChecker = {
    available: () => device.canDecode,
    facesForAllPhotos: () => device.faces != null,
    readable: (photo: StoredPhoto) => checkable(photo.url),
    async check(photo, width, height, opts = {}) {
      const { w, h } = checkCopySize(width, height);
      const key = `${photo.url}|${w}x${h}`;
      let basic = basics.get(key);
      if (!basic) {
        const rgba = await limit(() => device.pixels(photo.url, w, h));
        if (rgba.length < w * h * 4) throw new Error('The photo check got fewer pixels than it asked for.');
        // basicCheck's steps, with the screen let in between (same answer).
        await breathe();
        const gray = grayscale(rgba, w, h);
        await breathe();
        const sharp = tileSharpness(gray, w, h);
        await breathe();
        basic = checkFrom(sharp, dHash(gray, w, h));
        basics.set(key, basic);
      }
      const result: PhotoCheck = { ...basic };
      if (opts.faces !== false) {
        // A face pass that fails (ML Kit's error, the phone short of memory)
        // is a photo with no eye test, as on the website, whose face finder
        // answers "no faces" when it fails: the blur answer still comes back
        // and faces stays null. The builder then marks the face pass done
        // (facesTried), so its photo check never waits on that photo.
        try {
          const f = await facesOn(photo.url, w, h);
          if (f) Object.assign(result, faceVerdict(f.faces.map(toCheckFace), h));
        } catch {
          // No eye test for this photo.
        }
      }
      return result;
    },
  };

  const faces: FaceFinder = {
    init: async () => {
      try {
        await device.faces?.init();
      } catch {
        // No model just means no faces are found.
      }
    },
    async detectFaceCenter(url) {
      if (!device.faces || !device.canDecode || !checkable(url)) return null;
      try {
        let f = found.get(url) ?? null;
        if (!f) {
          const size = await device.size(url);
          if (!(size.width > 0 && size.height > 0)) return null;
          const { w, h } = checkCopySize(size.width, size.height);
          f = await facesOn(url, w, h);
        }
        return f ? faceGroupCentre(f.faces.map((x) => x.box), f.w, f.h) : null;
      } catch {
        return null;
      }
    },
  };

  return { photoCheck, faces };
}
