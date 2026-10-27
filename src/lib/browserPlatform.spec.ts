// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
// Face finding loads TensorFlow, which none of this needs.
vi.mock('../pages/builder/faceDetection', () => ({ initFaceApi: async () => {}, detectFaceCenter: async () => null }));
vi.mock('./photoCheckRunner', () => ({ checkPhoto: async () => null, facesForAllPhotos: () => false }));

import { browserBuilderPlatform } from './browserPlatform';
import { HEIC_CONVERTING_PREVIEW } from './heicRules';
import type { PickedPhoto } from '../shared/platform';

/* ══════════════════════════════════════════════════════════════════════════
   THE WEBSITE'S DEVICE PIECES keep the website's own rules (2.0 native app,
   Phase 0b review). The builder now asks the platform which saved photo URLs
   must be found again in the photo store, and the photo pieces take any
   PickedPhoto (the app hands in its own kind), so these pin the website:
     • the reload rule is exactly the one the builder had (only a blob: URL,
       dead with the old tab, is reloaded);
     • a photo that isn't a File is refused with a plain error (a rejected
       promise for the async pieces, which the builder already catches),
       never a TypeError from deep inside the browser.
   Test photos are made-up bytes, never real pictures.
   ══════════════════════════════════════════════════════════════════════════ */

const { photos } = browserBuilderPlatform;
const notAFile: PickedPhoto = { name: 'beach.jpg', size: 5, type: 'image/jpeg' };
const realCreate = URL.createObjectURL;
afterEach(() => { URL.createObjectURL = realCreate; });

describe('the website reloads only blob: URLs from the photo store (as before)', () => {
  it('a blob: URL dies with the tab: reloaded', () => {
    expect(photos.urlNeedsReload('blob:https://megyprints.com/1b2c')).toBe(true);
  });
  it('anything else is kept as it is', () => {
    expect(photos.urlNeedsReload('https://megyprints.com/sample-photos/megy-sample-03.jpg')).toBe(false);
    expect(photos.urlNeedsReload(HEIC_CONVERTING_PREVIEW)).toBe(false);
    expect(photos.urlNeedsReload('data:image/jpeg;base64,AAAA')).toBe(false);
  });
});

describe('website photos must be Files', () => {
  it('a File is shown from a blob: URL, as before', () => {
    URL.createObjectURL = (() => 'blob:test/1') as typeof URL.createObjectURL;
    expect(photos.previewUrlOf(new File([new Uint8Array([1, 2, 3])], 'beach.jpg', { type: 'image/jpeg' }))).toBe('blob:test/1');
  });
  it('anything else is refused with a plain error, not a TypeError from inside the browser', async () => {
    URL.createObjectURL = (() => { throw new Error('the browser was reached'); }) as typeof URL.createObjectURL;
    expect(() => photos.previewUrlOf(notAFile)).toThrow(/Website photos must be Files/);
    // The async pieces reject (the builder catches those), never throw.
    let thrown: unknown = null;
    let pending: Promise<unknown>[] = [];
    try {
      pending = [photos.toAlbumPhoto(notAFile), photos.getImageDimensions(notAFile), photos.captureTime(notAFile)];
    } catch (e) { thrown = e; }
    expect(thrown).toBeNull();
    for (const p of pending) await expect(p).rejects.toThrow(/Website photos must be Files/);
  });
});
