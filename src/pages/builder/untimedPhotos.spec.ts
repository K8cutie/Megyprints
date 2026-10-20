import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { generateAlbum, groupPhotosByMoment } from './generateAlbum';
import { readPhotoTime, fileTime } from './exif';
import { DENSITY_BY_SIZE } from './densities';
import type { AlbumPage, AlbumSizePreset, UploadedPhoto } from './types';
import { seedMathRandom, mulberry32 } from '../../test/seededRandom';

seedMathRandom(); // registers the seeding hooks; each album below re-seeds explicitly

/* ══════════════════════════════════════════════════════════════════════════
   PHOTOS WITH NO CAPTURE TIME KEEP THEIR PLACE (follow-up to #156, 2026-10-20).
   A screenshot, or anything saved from Messenger, WhatsApp or Facebook (they
   strip the metadata), has no EXIF time. Those photos used to be parked in a
   trailing group after every timed photo: the ones a friend sent from the
   same party came out at the very end of the album. Now:
     1. intake falls back to the FILE's modified date when it is a real past
        date (readPhotoTime; timeSource says which it was), and
     2. a photo still without a time keeps its UPLOAD position: it goes right
        after the timed photo picked before it, in that photo's moment — the
        album comes out as if it had been taken when it was picked.
   ══════════════════════════════════════════════════════════════════════════ */

const SHAPE = { L: [4032, 3024], P: [3024, 4032], S: [1440, 1440], W: [1920, 1080] } as const;

/** A phone roll of one event, a minute between shots, picked in the order
 *  they were taken. `gaps = true`: EVERY THIRD photo has no capture time
 *  (null and undefined by turns), as if saved from Messenger; the clock still
 *  advances for it, so the same roll with `gaps = false` is the same day with
 *  every time present. */
function roll(n: number, gaps: boolean): UploadedPhoto[] {
  const rnd = mulberry32(n * 7919 + 3);
  let t = Date.UTC(2026, 9, 18, 9);
  return Array.from({ length: n }, (_, i) => {
    const r = rnd();
    const [width, height] = SHAPE[r < 0.6 ? 'P' : r < 0.88 ? 'L' : r < 0.95 ? 'S' : 'W'];
    t += 60_000;
    const untimed = gaps && i % 3 === 2;
    return {
      id: `ph-${i}`, previewUrl: '', name: `ph-${i}.jpg`, type: 'image/jpeg', size: 1, width, height,
      ...(untimed ? (i % 2 ? { capturedAt: null } : {}) : { capturedAt: t }),
    };
  });
}
const untimedOf = (photos: UploadedPhoto[]) => photos.map((p, i) => (typeof p.capturedAt === 'number' ? -1 : i)).filter((i) => i >= 0);
const fills = (p: AlbumPage) => (p.slotFills ?? []).filter((f): f is number => f != null);
const gen = (seed: number, photos: UploadedPhoto[], size: AlbumSizePreset, ppp?: number) => {
  const spy = vi.spyOn(Math, 'random').mockImplementation(mulberry32(seed));
  try { return generateAlbum(photos, size, ppp); } finally { spy.mockRestore(); }
};

/** The pages read forward (timeOrder.spec's rule): each page's EARLIEST photo
 *  was taken no earlier than the page before it started. A full-page single
 *  (a video-memory page) may be stepped a page to keep two full pages from
 *  facing, so it is held to the pages two before and two after. */
function expectForward(pages: AlbumPage[], at: string) {
  const starts = pages.map((p) => { const f = fills(p); return f.length ? Math.min(...f) : null; });
  let last = -1;
  for (const [i, p] of pages.entries()) {
    const f = fills(p);
    if (!f.length) continue;
    const first = starts[i]!;
    if (f.length === 1) {
      const before = starts[i - 2] ?? -1;
      const after = starts[i + 2] ?? Infinity;
      expect(first, `${at}: single page ${i + 1} holds photo ${first}, before page ${i - 1} started at ${before}`).toBeGreaterThanOrEqual(before);
      expect(first, `${at}: single page ${i + 1} holds photo ${first}, after page ${i + 3} starts at ${after}`).toBeLessThanOrEqual(after);
      continue;
    }
    expect(first, `${at}: page ${i + 1} starts at photo ${first}, after page ${i} started at ${last}`).toBeGreaterThanOrEqual(last);
    last = first;
  }
}

/** The untimed photos are placed EXACTLY as if they had been taken when they
 *  were picked: the album is the same, page for page, as the one built from
 *  the same roll with every time present. (The dealer reaches ahead up to
 *  TIME_ORDER_REACH photos to fill a page's frames and steps a video-memory
 *  page off a facing full page, timed or not — so "the same album" is the
 *  claim, not "the page next to its neighbour's".) */
function expectSameAlbum(pages: AlbumPage[], asIfTimed: AlbumPage[], at: string) {
  const list = (ps: AlbumPage[]) => ps.map((p, i) => `${i + 1}: ${p.templateId} [${(p.slotFills ?? []).map((f) => (f == null ? '-' : f)).join(' ')}]`);
  expect(list(pages), at).toEqual(list(asIfTimed));
}

const T = (h: number, m = 0, day = 18) => Date.UTC(2026, 9, day, h, m);
const ph = (i: number, capturedAt?: number | null): UploadedPhoto => ({
  id: `p${i}`, previewUrl: '', name: `p${i}.jpg`, type: 'image/jpeg', size: 1, width: 4032, height: 3024,
  ...(capturedAt === undefined ? {} : { capturedAt }),
});

describe('a photo with no time goes where it was picked', () => {
  it('right after the timed photo picked before it, in that photo\'s moment; before the first, if picked first', () => {
    const photos = [ph(0, null), ph(1, T(9)), ph(2), ph(3, T(9, 1)), ph(4, null), ph(5, T(10, 0, 19)), ph(6)];
    expect(groupPhotosByMoment(photos)).toEqual([[0, 1, 2, 3, 4], [5, 6]]);
  });

  it('follows the photo picked before it even when the roll was picked out of time order', () => {
    // Photo 1 was picked after photo 0 (9:05), photo 3 after photo 2 (9:00).
    const photos = [ph(0, T(9, 5)), ph(1, null), ph(2, T(9)), ph(3)];
    expect(groupPhotosByMoment(photos)).toEqual([[2, 3, 0, 1]]);
  });

  it('a roll with no times at all stays in upload order, one moment', () => {
    const photos = [ph(0), ph(1, null), ph(2)];
    expect(groupPhotosByMoment(photos)).toEqual([[0, 1, 2]]);
  });

  it('never parks the untimed photos after the last moment', () => {
    const photos = [ph(0, T(9)), ph(1, null), ph(2, T(9, 1)), ph(3, T(10, 0, 19)), ph(4, T(10, 1, 19))];
    const groups = groupPhotosByMoment(photos);
    expect(groups).toHaveLength(2);
    expect(groups[groups.length - 1]).toEqual([3, 4]);
  });

  const sizes = Object.keys(DENSITY_BY_SIZE) as AlbumSizePreset[];
  for (const size of sizes) {
    it(`${size}: a roll of 60 where every third photo has no time — pages read forward, each untimed photo where it was picked`, () => {
      const photos = roll(60, true);
      const asIfTimed = roll(60, false);
      expect(untimedOf(photos)).toHaveLength(20);
      expect(untimedOf(asIfTimed)).toHaveLength(0);
      for (const seed of [1, 2, 3]) {
        const pages = gen(seed, photos, size);
        const at = `${size}, 60 photos, auto, seed ${seed}`;
        expect(new Set(pages.flatMap(fills)).size, `${at}: placed`).toBe(60);
        expectForward(pages, at);
        expectSameAlbum(pages, gen(seed, asIfTimed, size), at);
      }
      for (const ppp of DENSITY_BY_SIZE[size]) {
        const pages = gen(1, photos, size, ppp);
        const at = `${size}, 60 photos at ${ppp} per page`;
        expect(new Set(pages.flatMap(fills)).size, `${at}: placed`).toBe(60);
        expectForward(pages, at);
        expectSameAlbum(pages, gen(1, asIfTimed, size, ppp), at);
      }
    });
  }
});

describe('the time a photo is read with (readPhotoTime)', () => {
  const now = T(12, 0, 20);
  const fixtureDir = resolve(__dirname, '../../lib/__fixtures__');
  const jpegNoExif = (lastModified: number) =>
    new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46])], 'messenger-1.jpg', { type: 'image/jpeg', lastModified });

  it('EXIF first, and says so', async () => {
    const heic = new File([readFileSync(resolve(fixtureDir, 'landscape-2026-09-12.heic'))], 'IMG_1.HEIC', { type: 'image/heic', lastModified: T(0, 0, 1) });
    const t = await readPhotoTime(heic, now);
    expect(t.timeSource).toBe('exif');
    expect(new Date(t.capturedAt!).toISOString().slice(0, 7)).toBe('2026-09');
  });

  it('a photo saved from Messenger (no EXIF): the file\'s date, marked as the file\'s', async () => {
    const saved = T(18, 30, 11);
    expect(await readPhotoTime(jpegNoExif(saved), now)).toEqual({ capturedAt: saved, timeSource: 'file' });
  });

  it('a file date that is no date — 0, in the future, or stamped just now by the picker — leaves the photo untimed', async () => {
    expect(await readPhotoTime(jpegNoExif(0), now)).toEqual({ capturedAt: null });
    expect(await readPhotoTime(jpegNoExif(now + 86_400_000), now)).toEqual({ capturedAt: null });
    expect(await readPhotoTime(jpegNoExif(now - 30_000), now)).toEqual({ capturedAt: null });
    expect(fileTime({ lastModified: Number.NaN }, now)).toBeNull();
    expect(fileTime({ lastModified: now - 10 * 60_000 }, now)).toBe(now - 10 * 60_000);
  });
});
