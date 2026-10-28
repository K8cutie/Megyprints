// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
// Face finding loads TensorFlow, which none of this needs.
vi.mock('../pages/builder/faceDetection', () => ({ initFaceApi: async () => {}, detectFaceCenter: async () => null }));
vi.mock('./photoCheckRunner', () => ({ checkPhoto: async () => null, facesForAllPhotos: () => false }));
// The canvas text measure (null under jsdom) and the website's Supabase
// client, made up, so the pieces built on them can be checked here.
const canvas = vi.hoisted(() => ({ font: '', measureText: (text: string) => ({ width: text.length * 10 }) }));
vi.mock('../pages/builder/canvasMeasurer', () => ({ defaultMeasurer: () => canvas }));
const site = vi.hoisted(() => ({
  session: null as null | { user: { id: string } },
  row: null as null | { updated_at: string },
  error: null as null | { message: string },
  asked: [] as string[],
}));
vi.mock('./supabase', () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: site.session }, error: null }) },
    from: (table: string) => {
      const chain = {
        select: (cols: string) => { site.asked.push(`${table}.select(${cols})`); return chain; },
        eq: (k: string, v: unknown) => { site.asked.push(`eq(${k}, ${String(v)})`); return chain; },
        maybeSingle: async () => ({ data: site.row, error: site.error }),
      };
      return chain;
    },
  },
}));

import { browserBuilderPlatform } from './browserPlatform';
import { captionFits } from '../pages/builder/textFit';
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

describe('the website measures captions with the canvas it always used (Phase 3a)', () => {
  it('textMeasurer() is the same canvas measure textFit falls back to', () => {
    expect(browserBuilderPlatform.textMeasurer()).toBe(canvas);
  });
  it('so a caption checked through the platform gets the same answer as before', () => {
    const box = { w: 300, h: 40 };
    const font = { fontSize: 20, fontFamily: 'DM Sans' };
    const words = 'The castle lights came on and none of us wanted this happy day to end';
    // textFit's own default (what the builder called before) and the platform's.
    const before = captionFits(words, font, box);
    expect(before).not.toBeNull(); // measured, not "can't tell"
    expect(captionFits(words, font, box, browserBuilderPlatform.textMeasurer())).toEqual(before);
  });
});

describe("the website's account pieces read lib/supabase exactly as the builder did (Phase 3a)", () => {
  afterEach(() => { site.session = null; site.row = null; site.error = null; site.asked.length = 0; });
  it('who is signed in comes from the saved session', async () => {
    await expect(browserBuilderPlatform.cloud.signedInUserId()).resolves.toBeNull();
    site.session = { user: { id: 'user-1' } };
    await expect(browserBuilderPlatform.cloud.signedInUserId()).resolves.toBe('user-1');
  });
  it("an album's version is one small read of albums.updated_at by id", async () => {
    site.row = { updated_at: '2026-10-29T01:02:03Z' };
    await expect(browserBuilderPlatform.cloud.albumVersion('album-1')).resolves.toEqual({ updatedAt: '2026-10-29T01:02:03Z' });
    expect(site.asked).toEqual(['albums.select(updated_at)', 'eq(id, album-1)']);
  });
  it('no such album is null (deleted on another device); a failed read is offline', async () => {
    await expect(browserBuilderPlatform.cloud.albumVersion('album-1')).resolves.toBeNull();
    site.error = { message: 'Failed to fetch' };
    await expect(browserBuilderPlatform.cloud.albumVersion('album-1')).resolves.toBe('offline');
  });
});
