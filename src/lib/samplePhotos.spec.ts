import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import exifr from 'exifr';
import {
  SAMPLE_PHOTO_COUNT, SAMPLE_PHOTO_NAMES, samplePhotoName, showSamplePhotos, pickSamplePhotos,
  addSamplesLabel, fetchSamplePhotos, sampleCoverPhoto, SAMPLE_COVER_NAME, SAMPLE_ALBUM_NAME, SAMPLE_ALBUM_OCCASION,
} from './samplePhotos';
import { isAlbumNameReady } from './albumName';
import { isAlbumThemeReady } from './albumTheme';
import { TESTING_PHASE, showTesterStamp } from './testingPhase';
import { MIN_ALBUM_PHOTOS } from '../pages/builder/albumMinimum';

/* ══════════════════════════════════════════════════════════════════════════
   SAMPLE PHOTOS (owner, 2026-10-28): a tester with fewer than 40 photos makes
   up the rest with Megy's samples, in the Android app while TESTING_PHASE is
   on. These guard the files a tester downloads and the rules that pick them.
   ══════════════════════════════════════════════════════════════════════════ */

const DIR = resolve(__dirname, '../../public/sample-photos');
const file = (name: string) => readFileSync(resolve(DIR, name));

/** Width × height from a JPEG's start-of-frame marker. */
function jpegSize(buf: Buffer): { w: number; h: number } {
  let i = 2;
  while (i < buf.length) {
    const marker = buf[i + 1];
    const len = buf.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    }
    i += 2 + len;
  }
  throw new Error('no frame');
}

describe('the sample photo files', () => {
  it('48 of them, named megy-sample-01.jpg … megy-sample-48.jpg, and nothing else in the folder', () => {
    expect(SAMPLE_PHOTO_COUNT).toBe(48);
    expect(SAMPLE_PHOTO_NAMES[0]).toBe('megy-sample-01.jpg');
    expect(SAMPLE_PHOTO_NAMES[47]).toBe('megy-sample-48.jpg');
    expect(readdirSync(DIR).sort()).toEqual([...SAMPLE_PHOTO_NAMES].sort());
  });

  it('enough for a whole album on their own', () => {
    expect(SAMPLE_PHOTO_COUNT).toBeGreaterThanOrEqual(MIN_ALBUM_PHOTOS);
  });

  it('phone-sized: JPEGs at most 1600 px on the long side and under 450 KB each', () => {
    let total = 0;
    for (const name of SAMPLE_PHOTO_NAMES) {
      const buf = file(name);
      expect(buf[0] === 0xff && buf[1] === 0xd8, name).toBe(true);
      const { w, h } = jpegSize(buf);
      expect(Math.max(w, h), name).toBeLessThanOrEqual(1600);
      expect(Math.min(w, h), name).toBeGreaterThanOrEqual(900);
      expect(buf.length, name).toBeLessThan(450 * 1024);
      total += buf.length;
    }
    // A whole 40-photo album from samples is about 12 MB over 4G.
    expect(total).toBeLessThan(16 * 1024 * 1024);
  });

  it('both shapes, so every album size gets the full-page photos its 7 video memories need', () => {
    const shapes = SAMPLE_PHOTO_NAMES.map((n) => jpegSize(file(n)));
    expect(shapes.filter((s) => s.w > s.h).length).toBeGreaterThanOrEqual(12);
    expect(shapes.filter((s) => s.h > s.w).length).toBeGreaterThanOrEqual(12);
  });

  it('each was "taken" on the same day, in name order, so the album keeps the day in order', async () => {
    const times: number[] = [];
    for (const name of SAMPLE_PHOTO_NAMES) {
      const exif = await exifr.parse(file(name), ['DateTimeOriginal']);
      const when = exif?.DateTimeOriginal as Date | undefined;
      expect(when instanceof Date, name).toBe(true);
      times.push(when!.getTime());
    }
    for (let i = 1; i < times.length; i++) expect(times[i], SAMPLE_PHOTO_NAMES[i]).toBeGreaterThan(times[i - 1]);
    expect(new Set(times.map((t) => new Date(t).toDateString())).size).toBe(1);
  });

  it('carry no other metadata from where they came from (no GPS, no camera owner)', async () => {
    for (const name of SAMPLE_PHOTO_NAMES) {
      const all = await exifr.parse(file(name), { gps: true, tiff: true, exif: true, xmp: true, iptc: true });
      expect(Object.keys(all ?? {}).sort(), name).toEqual(['DateTimeOriginal', 'ExifIFDPointer'].filter((k) => k in (all ?? {})).sort());
      expect(all?.latitude, name).toBeUndefined();
    }
  });
});

describe('who sees the offer', () => {
  it('only the Android app, and only while the testing switch is on', () => {
    expect(showSamplePhotos(true, true)).toBe(true);
    expect(showSamplePhotos(false, true)).toBe(false);
    expect(showSamplePhotos(true, false)).toBe(false);
    expect(showSamplePhotos(false, false)).toBe(false);
  });

  it('shares ONE switch with the tester stamp: on now, both off together', () => {
    expect(TESTING_PHASE).toBe(true);
    expect(showSamplePhotos(true)).toBe(showTesterStamp(true));
  });
});

describe('which samples go in', () => {
  it('exactly as many as the album is short of 40', () => {
    expect(pickSamplePhotos(25, [])).toHaveLength(25);
    expect(pickSamplePhotos(40, [])).toHaveLength(40);
    expect(pickSamplePhotos(1, [])).toHaveLength(1);
  });

  it('none when nothing is short', () => {
    expect(pickSamplePhotos(0, [])).toEqual([]);
    expect(pickSamplePhotos(-3, [])).toEqual([]);
  });

  it('never one already in the album, and never the same one twice', () => {
    const inAlbum = ['IMG_0001.jpg', samplePhotoName(1), samplePhotoName(2), samplePhotoName(30)];
    const picks = pickSamplePhotos(25, inAlbum);
    expect(picks).toHaveLength(25);
    expect(new Set(picks).size).toBe(25);
    for (const p of picks) expect(inAlbum).not.toContain(p);
  });

  it('fewer when fewer are left (a tester left some samples out), none when all are in', () => {
    const allButThree = SAMPLE_PHOTO_NAMES.slice(3);
    expect(pickSamplePhotos(10, allButThree)).toEqual(SAMPLE_PHOTO_NAMES.slice(0, 3));
    expect(pickSamplePhotos(10, SAMPLE_PHOTO_NAMES)).toEqual([]);
  });

  it('spread over the whole day, so even a few mix the scenes and both shapes', () => {
    const picks = pickSamplePhotos(6, []);
    const nums = picks.map((p) => Number(p.slice(12, 14)));
    expect(nums[0]).toBe(1);
    expect(Math.max(...nums)).toBeGreaterThanOrEqual(40);
    const shapes = picks.map((p) => jpegSize(file(p)));
    expect(shapes.some((s) => s.w > s.h)).toBe(true);
    expect(shapes.some((s) => s.h > s.w)).toBe(true);
  });
});

describe("the sample album's cover", () => {
  const ph = (name: string, leftOut = false) => ({ id: name, name, leftOut });
  it('the family in the garden when it is in the album', () => {
    expect(SAMPLE_COVER_NAME).toBe('megy-sample-03.jpg');
    expect(pickSamplePhotos(40, [])).toContain(SAMPLE_COVER_NAME);
    expect(sampleCoverPhoto([ph('megy-sample-01.jpg'), ph('megy-sample-03.jpg')])?.name).toBe('megy-sample-03.jpg');
  });
  it('else the first sample, else the first photo; never a left-out one', () => {
    expect(sampleCoverPhoto([ph('IMG_1.jpg'), ph('megy-sample-07.jpg')])?.name).toBe('megy-sample-07.jpg');
    expect(sampleCoverPhoto([ph('megy-sample-03.jpg', true), ph('IMG_1.jpg')])?.name).toBe('IMG_1.jpg');
    expect(sampleCoverPhoto([])).toBeUndefined();
  });
  it('a name and an occasion that pass Step 1, and the name says it is the sample', () => {
    expect(isAlbumNameReady(SAMPLE_ALBUM_NAME)).toBe(true);
    expect(isAlbumThemeReady(SAMPLE_ALBUM_OCCASION)).toBe(true);
    expect(SAMPLE_ALBUM_NAME).toBe('Sample Album');
  });
});

describe('the button', () => {
  it('says what you get', () => {
    expect(addSamplesLabel(25)).toBe('Add 25 sample photos');
    expect(addSamplesLabel(1)).toBe('Add 1 sample photo');
  });
});

describe('getting the samples', () => {
  const okFetch = (log: string[], live = { now: 0, max: 0 }) => (async (url: string) => {
    log.push(url);
    live.now++; live.max = Math.max(live.max, live.now);
    await new Promise((r) => setTimeout(r, 5));
    live.now--;
    return new Response(new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])]), { status: 200 });
  }) as unknown as typeof fetch;

  it('from the site, as JPEG photos named after the sample', async () => {
    const log: string[] = [];
    const files = await fetchSamplePhotos(['megy-sample-03.jpg', 'megy-sample-09.jpg'], '/', okFetch(log));
    expect(log).toEqual(['/sample-photos/megy-sample-03.jpg', '/sample-photos/megy-sample-09.jpg']);
    expect(files.map((f) => [f.name, f.type, f.size])).toEqual([
      ['megy-sample-03.jpg', 'image/jpeg', 4], ['megy-sample-09.jpg', 'image/jpeg', 4],
    ]);
  });

  it('three at a time, so 40 downloads never flood a phone', async () => {
    const live = { now: 0, max: 0 };
    const files = await fetchSamplePhotos(pickSamplePhotos(40, []), '/', okFetch([], live));
    expect(files).toHaveLength(40);
    expect(live.max).toBe(3);
  });

  it('one that fails fails the batch (nothing is half added)', async () => {
    const failing = (async (url: string) => new Response('', { status: url.endsWith('09.jpg') ? 404 : 200 })) as unknown as typeof fetch;
    await expect(fetchSamplePhotos(['megy-sample-03.jpg', 'megy-sample-09.jpg'], '/', failing)).rejects.toThrow('megy-sample-09.jpg');
  });
});
