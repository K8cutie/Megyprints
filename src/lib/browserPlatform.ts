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
   replacePhoto, setCoverPhoto), so a PickedPhoto here is a File.
   ══════════════════════════════════════════════════════════════════════════ */

import type { BuilderPlatform, KeyValueStore, PickedPhoto, StoredPhoto } from '../shared/platform';
import { useIndexedDBPhotos, getImageDimensions, type StoredPhoto as IndexedDBPhoto } from './useIndexedDBPhotos';
import { initFaceApi, detectFaceCenter } from '../pages/builder/faceDetection';
import { readCaptureTime } from '../pages/builder/exif';
import { toAlbumPhoto } from './heicPhoto';
import { looksHeic, HEIC_CONVERTING_PREVIEW } from './heicRules';
import { checkPhoto, facesForAllPhotos } from './photoCheckRunner';

const asFile = (photo: PickedPhoto): File => photo as File;
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
    toAlbumPhoto: (photo) => toAlbumPhoto(asFile(photo)),
    getImageDimensions: (photo) => getImageDimensions(asFile(photo)),
    captureTime: (photo) => readCaptureTime(asFile(photo)),
    previewUrlOf: (photo) => URL.createObjectURL(asFile(photo)),
    releasePreviewUrl: (url) => URL.revokeObjectURL(url),
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
