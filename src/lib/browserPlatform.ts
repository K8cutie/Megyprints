/* ══════════════════════════════════════════════════════════════════════════
   browserPlatform — the album builder's device pieces on the WEBSITE.

   useBuilderState asks for its device pieces through one BuilderPlatform
   (shared/platform.ts) so the 2.0 native app can pass its own. With nothing
   provided it uses this one: exactly what it called directly before (the
   browser's localStorage and sessionStorage, the IndexedDB photo store,
   face-api, the HEIC converter, the EXIF date, the photo check, the tab's
   visibility). The builder gets it through lib/defaultBuilderPlatform.

   Every piece calls the module it wraps AT CALL TIME, never when this file
   loads, so a test that mocks or stubs one (vi.mock of useIndexedDBPhotos or
   faceDetection, a stubbed globalThis.localStorage) still reaches the
   builder exactly as it did.

   The website only ever hands the builder browser Files (addPhotos,
   replacePhoto, setCoverPhoto), so a PickedPhoto here must be a File. The
   types allow any PickedPhoto (the builder is shared with the app), so each
   piece checks: anything else is refused with a plain error (a rejected
   promise for the async pieces, which the builder already catches) instead
   of a TypeError from deep inside the browser.
   ══════════════════════════════════════════════════════════════════════════ */

import type { BuilderPlatform, KeyValueStore, PickedPhoto, StoredPhoto } from '../shared/platform';
import { useIndexedDBPhotos, getImageDimensions, type StoredPhoto as IndexedDBPhoto } from './useIndexedDBPhotos';
import { initFaceApi, detectFaceCenter } from '../pages/builder/faceDetection';
import { readCaptureTime } from '../pages/builder/exif';
import { toAlbumPhoto } from './heicPhoto';
import { looksHeic, HEIC_CONVERTING_PREVIEW } from './heicRules';
import { checkPhoto, facesForAllPhotos } from './photoCheckRunner';

const NOT_A_FILE = 'Website photos must be Files: the browser pieces were handed something else.';
/** The File a website photo is; throws a plain error for anything else. */
function asFile(photo: PickedPhoto): File {
  if (typeof Blob === 'undefined' || !(photo instanceof Blob)) throw new TypeError(NOT_A_FILE);
  return photo as File;
}
/** `fn` on the File, or a rejected promise (never a throw) when it isn't one. */
function withFile<T>(photo: PickedPhoto, fn: (file: File) => Promise<T>): Promise<T> {
  let file: File;
  try { file = asFile(photo); } catch (e) { return Promise.reject(e); }
  return fn(file);
}
/** A photo from the IndexedDB store carries its bytes (blob). */
const blobOf = (photo: StoredPhoto): Blob | undefined => (photo as Partial<IndexedDBPhoto>).blob;

const browserLocalStore: KeyValueStore = {
  getItem: (key) => localStorage.getItem(key),
  setItem: (key, value) => localStorage.setItem(key, value),
  removeItem: (key) => localStorage.removeItem(key),
};

const browserSessionStore: KeyValueStore = {
  getItem: (key) => sessionStorage.getItem(key),
  setItem: (key, value) => sessionStorage.setItem(key, value),
  removeItem: (key) => sessionStorage.removeItem(key),
};

/** An <img>'s own size once it loads (the face auto-centre's photo box). */
function pictureSize(url: string): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

export const browserBuilderPlatform: BuilderPlatform = {
  deviceStore: browserLocalStore,
  sessionStore: browserSessionStore,
  usePhotoStore: () => useIndexedDBPhotos(),
  photos: {
    looksHeic: (photo) => looksHeic(photo),
    toAlbumPhoto: (photo) => withFile(photo, (file) => toAlbumPhoto(file)),
    getImageDimensions: (photo) => withFile(photo, (file) => getImageDimensions(file)),
    captureTime: (photo) => withFile(photo, (file) => readCaptureTime(file)),
    previewUrlOf: (photo) => URL.createObjectURL(asFile(photo)),
    releasePreviewUrl: (url) => URL.revokeObjectURL(url),
    // Exactly the rule the builder had: a blob: URL dies with the tab.
    urlNeedsReload: (url) => url.startsWith('blob:'),
    pictureSize,
    convertingPreview: HEIC_CONVERTING_PREVIEW,
  },
  faces: {
    init: () => initFaceApi(),
    detectFaceCenter: (url) => detectFaceCenter(url),
  },
  photoCheck: {
    available: () => typeof createImageBitmap === 'function',
    facesForAllPhotos: () => facesForAllPhotos(),
    readable: (photo) => !!blobOf(photo),
    check: (photo, width, height, opts) => checkPhoto(blobOf(photo)!, width, height, opts),
  },
  lifecycle: {
    onLeave: (fn) => {
      const onHide = () => { if (document.visibilityState === 'hidden') fn(); };
      document.addEventListener('visibilitychange', onHide);
      window.addEventListener('pagehide', onHide);
      return () => {
        document.removeEventListener('visibilitychange', onHide);
        window.removeEventListener('pagehide', onHide);
      };
    },
    onReturn: (fn) => {
      const onShow = () => { if (document.visibilityState === 'visible') fn(); };
      document.addEventListener('visibilitychange', onShow);
      window.addEventListener('focus', onShow);
      return () => {
        document.removeEventListener('visibilitychange', onShow);
        window.removeEventListener('focus', onShow);
      };
    },
  },
};
