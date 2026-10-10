import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/* ══════════════════════════════════════════════════════════════════════════
   THE GUEST CAMERA (0044). A guest scans the table QR, joins with a name and
   shares photos and short videos straight into the event. The database is
   the guard; these lock the phone's side to it: the same numbers, the same
   file names, the same order (begin → upload exactly those → ready), and a
   retry that never overwrites a file.
   ══════════════════════════════════════════════════════════════════════════ */

const h = vi.hoisted(() => ({
  calls: [] as unknown[][],
  begun: null as unknown,
  uploadError: null as { message: string } | null,
  readyData: true as unknown,
}));
vi.mock('./supabase', () => ({
  supabaseConfigured: true,
  supabase: {
    rpc: async (name: string, args: unknown) => {
      h.calls.push(['rpc', name, args]);
      if (name === 'event_media_begin') return { data: h.begun, error: null };
      if (name === 'event_media_ready') return { data: h.readyData, error: null };
      if (name === 'event_join') return { data: { guest_id: 'g-1', token: 'tok-1' }, error: null };
      return { data: null, error: null };
    },
    storage: {
      from: (bucket: string) => ({
        upload: async (name: string, body: Blob, opts: unknown) => { h.calls.push(['upload', bucket, name, body, opts]); return { error: h.uploadError }; },
        getPublicUrl: (name: string) => ({ data: { publicUrl: `https://x.supabase.co/storage/v1/object/public/${bucket}/${name}` } }),
      }),
    },
  },
}));
const copies = vi.hoisted(() => ({
  original: new Blob(['o'], { type: 'image/jpeg' }),
  view: new Blob(['v'], { type: 'image/jpeg' }),
  thumb: new Blob(['t'], { type: 'image/jpeg' }),
}));
vi.mock('./eventImage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./eventImage')>()),
  makePhotoCopies: async () => ({ ...copies, width: 3600, height: 2400 }),
  videoFacts: async () => ({ thumb: copies.thumb, durationS: 12.345, width: 1080, height: 1920 }),
}));
vi.mock('./videoTranscode', () => ({ transcodeSupported: () => false, transcodeToMp4: vi.fn() }));

import {
  EVENT_PHOTOS_PER_GUEST, EVENT_VIDEOS_PER_GUEST, EVENT_VIDEO_MAX_BYTES, EVENT_VIDEO_MAX_SECONDS,
  guestLink, screenLink, eventMediaUrl, originalName, readPass, savePass, forgetPass, joinEvent,
  sharePhoto, shareVideo, videoProblem, cameraErrorMessage,
} from './eventCamera';
import { fitWithin, PRINT_MAX, VIEW_MAX, THUMB_MAX } from './eventImage';

const sql = readFileSync(resolve(__dirname, '../../supabase/migrations/0044_event_camera.sql'), 'utf8');

const g = globalThis as unknown as { localStorage?: unknown };
let store: Record<string, string>;
beforeEach(() => {
  h.calls = []; h.uploadError = null; h.readyData = true;
  store = {};
  g.localStorage = {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => { store[k] = String(v); },
    removeItem: (k: string) => { delete store[k]; },
  };
});
afterEach(() => { delete g.localStorage; });

describe('the numbers are the database’s', () => {
  it('photos and videos per guest match 0044', () => {
    expect(sql).toMatch(new RegExp(`event_photos_per_guest\\(\\)\\s+returns integer language sql immutable set search_path = '' as \\$\\$ select ${EVENT_PHOTOS_PER_GUEST} \\$\\$`));
    expect(sql).toMatch(new RegExp(`event_videos_per_guest\\(\\)\\s+returns integer language sql immutable set search_path = '' as \\$\\$ select ${EVENT_VIDEOS_PER_GUEST} \\$\\$`));
  });
  it('a video can be no bigger than the event-media bucket takes', () => {
    expect(sql).toContain(`values ('event-media', 'event-media', true, ${EVENT_VIDEO_MAX_BYTES},`);
  });
  it('the print master fits the private bucket’s 20 MB, as a JPEG', () => {
    expect(sql).toContain("values ('event-originals', 'event-originals', false, 20971520, array['image/jpeg'])");
  });
});

describe('links and file names', () => {
  it('a table card opens the guest page for that table (HashRouter)', () => {
    expect(guestLink('z6gi3xzg', 5, 'https://megyprints.vercel.app')).toBe('https://megyprints.vercel.app/#/e/z6gi3xzg?t=5');
    expect(guestLink('z6gi3xzg', null, 'https://megyprints.vercel.app')).toBe('https://megyprints.vercel.app/#/e/z6gi3xzg');
    expect(screenLink('z6gi3xzg', 'k3y', 'https://megyprints.vercel.app')).toBe('https://megyprints.vercel.app/#/e/z6gi3xzg/screen?k=k3y');
  });
  it('names files exactly as event_media_objects() does', () => {
    for (const piece of [`'/' || p_id::text || '.jpg'`, `'/' || p_id::text || '-v.jpg'`, `'/' || p_id::text || '-t.jpg'`, `'/' || p_id::text || '.' || p_ext`]) {
      expect(sql).toContain(piece);
    }
    expect(eventMediaUrl('b1', 'm1', 'view')).toMatch(/\/event-media\/b1\/m1-v\.jpg$/);
    expect(eventMediaUrl('b1', 'm1', 'thumb')).toMatch(/\/event-media\/b1\/m1-t\.jpg$/);
    expect(eventMediaUrl('b1', 'm1', 'video', 'mov')).toMatch(/\/event-media\/b1\/m1\.mov$/);
    expect(originalName('b1', 'm1')).toBe('b1/m1.jpg');
  });
  it('photo copies never upscale, and keep the shape', () => {
    expect(fitWithin(4000, 3000, PRINT_MAX)).toEqual({ width: 3600, height: 2700 });
    expect(fitWithin(3000, 4000, VIEW_MAX)).toEqual({ width: 900, height: 1200 });
    expect(fitWithin(800, 600, THUMB_MAX)).toEqual({ width: 400, height: 300 });
    expect(fitWithin(300, 200, PRINT_MAX)).toEqual({ width: 300, height: 200 });
  });
});

describe('the pass this phone holds', () => {
  it('joining saves the pass for that event only; forgetting clears it', async () => {
    const pass = await joinEvent('abc12345', '  Tita Lorna ', 3, true);
    expect(pass).toEqual({ token: 'tok-1', guestId: 'g-1', name: 'Tita Lorna', table: 3 });
    expect(h.calls[0]).toEqual(['rpc', 'event_join', { p_code: 'abc12345', p_name: 'Tita Lorna', p_table: 3, p_kids_ok: true }]);
    expect(readPass('abc12345')).toEqual(pass);
    expect(readPass('other123')).toBeNull();
    forgetPass('abc12345');
    expect(readPass('abc12345')).toBeNull();
  });
  it('a broken pass reads as none (they join again)', () => {
    store['megy-event-guest:abc12345'] = '{not json';
    expect(readPass('abc12345')).toBeNull();
    savePass('abc12345', { token: 't', guestId: 'g', name: 'A', table: null });
    expect(readPass('abc12345')?.token).toBe('t');
  });
});

describe('sharing', () => {
  const BEGUN_PHOTO = {
    media_id: 'm1', booking_id: 'b1',
    objects: [
      { bucket: 'event-originals', name: 'b1/m1.jpg' },
      { bucket: 'event-media', name: 'b1/m1-v.jpg' },
      { bucket: 'event-media', name: 'b1/m1-t.jpg' },
    ],
  };
  it('a photo: begin → the three files the database named, create-only → ready', async () => {
    h.begun = BEGUN_PHOTO;
    const stages: string[] = [];
    const id = await sharePhoto('abc12345', 'tok', new File(['x'], 'a.jpg', { type: 'image/jpeg' }), (s) => stages.push(s));
    expect(id).toBe('m1');
    expect(stages).toEqual(['preparing', 'uploading', 'done']);
    expect(h.calls.map((c) => c.slice(0, 3))).toEqual([
      ['rpc', 'event_media_begin', { p_code: 'abc12345', p_token: 'tok', p_kind: 'photo', p_ext: 'jpg', p_bytes: 1, p_width: 3600, p_height: 2400, p_duration: null }],
      ['upload', 'event-originals', 'b1/m1.jpg'],
      ['upload', 'event-media', 'b1/m1-v.jpg'],
      ['upload', 'event-media', 'b1/m1-t.jpg'],
      ['rpc', 'event_media_ready', { p_code: 'abc12345', p_token: 'tok', p_media_id: 'm1' }],
    ]);
    const uploads = h.calls.filter((c) => c[0] === 'upload');
    expect(uploads.map((c) => c[3])).toEqual([copies.original, copies.view, copies.thumb]);
    for (const u of uploads) expect(u[4]).toMatchObject({ upsert: false, contentType: 'image/jpeg' });
  });
  it('a retry that finds the file already there goes on; any other upload failure stops before ready', async () => {
    h.begun = BEGUN_PHOTO;
    h.uploadError = { message: 'The resource already exists' };
    await expect(sharePhoto('abc12345', 'tok', new File(['x'], 'a.jpg'))).resolves.toBe('m1');
    h.calls = [];
    h.uploadError = { message: 'Failed to fetch' };
    await expect(sharePhoto('abc12345', 'tok', new File(['x'], 'a.jpg'))).rejects.toThrow('Your upload stopped. Check your connection and try again.');
    expect(h.calls.some((c) => c[1] === 'event_media_ready')).toBe(false);
  });
  it('ready that says no is an error, not a silent success', async () => {
    h.begun = BEGUN_PHOTO;
    h.readyData = false;
    await expect(sharePhoto('abc12345', 'tok', new File(['x'], 'a.jpg'))).rejects.toThrow('Your upload didn’t finish. Try again.');
  });
  it('a video: the poster goes to -t.jpg, the video to its own name, with its type', async () => {
    h.begun = { media_id: 'm2', booking_id: 'b1', objects: [{ bucket: 'event-media', name: 'b1/m2-t.jpg' }, { bucket: 'event-media', name: 'b1/m2.mov' }] };
    const file = new File(['video'], 'clip.MOV', { type: 'video/quicktime' });
    await shareVideo('abc12345', 'tok', file);
    expect(h.calls[0]).toEqual(['rpc', 'event_media_begin', { p_code: 'abc12345', p_token: 'tok', p_kind: 'video', p_ext: 'mov', p_bytes: 5, p_width: 1080, p_height: 1920, p_duration: 12.35 }]);
    const uploads = h.calls.filter((c) => c[0] === 'upload');
    expect(uploads.map((c) => [c[2], c[3], (c[4] as { contentType: string }).contentType])).toEqual([
      ['b1/m2-t.jpg', copies.thumb, 'image/jpeg'],
      ['b1/m2.mov', file, 'video/quicktime'],
    ]);
  });
  it('a video that’s wrong is refused before anything uploads, in words', () => {
    expect(videoProblem({ type: 'video/x-msvideo', name: 'a.avi', size: 10 }, 5)).toMatch(/MP4 or MOV/);
    expect(videoProblem({ type: 'video/mp4', name: 'a.mp4', size: 10 }, EVENT_VIDEO_MAX_SECONDS + 5)).toBe(`Videos here are up to ${EVENT_VIDEO_MAX_SECONDS} seconds. Trim it in your gallery, then add it again.`);
    expect(videoProblem({ type: 'video/mp4', name: 'a.mp4', size: 10 }, EVENT_VIDEO_MAX_SECONDS)).toBe('');
    expect(videoProblem({ type: '', name: 'IMG_0001.m4v', size: 10 }, null)).toBe('');
  });
  it('the database’s own sentences reach the guest as they are', () => {
    expect(cameraErrorMessage({ code: 'EV024', message: 'You’ve shared 20 photos, the most for each guest.' })).toBe('You’ve shared 20 photos, the most for each guest.');
    expect(cameraErrorMessage({ code: '42501', message: '' })).toBe('Something went wrong. Please try again.');
  });
});
