/* ══════════════════════════════════════════════════════════════════════════
   WHY THIS TEST: "Replace video" (src/lib/memories/replaceVideo.ts) puts a new
   video behind the same printed QR. Every replacement is shrunk first, like a
   new video (owner, 2026-11-21: "Keep, fix it"): before, only one over the
   bucket's limit was, so a 2-minute phone video (about 116 MB) went up as
   recorded and the free plan's 50 MB cap refused it. Then it is uploaded over
   the old one and the memory points at a new address (the website's steps).
   ══════════════════════════════════════════════════════════════════════════ */
import { replaceLimits, replaceMemoryVideo, NO_ORDER_LIMITS, NOT_REPOINTED, UPLOADING_VIDEO, type ReplaceDeps } from '../src/lib/memories/replaceVideo';

const BASE = 'https://example.supabase.co';
const HD_HEVC = { longEdge: 1920, shortEdge: 1080, bitrate: 4_500_000, label: '1080p', hevcBitrate: 3_000_000 };
function deps(over: Partial<ReplaceDeps> = {}, shrunkSize = 47_000_000) {
  const log: unknown[] = [];
  const d: ReplaceDeps = {
    upload: async (c) => { log.push(['upload', c]); },
    shrink: async (input, target, onProgress) => {
      log.push(['shrink', input, target]);
      onProgress(0.5);
      return { uri: 'file:///small.mp4', size: shrunkSize };
    },
    relink: async (code, dest) => { log.push(['relink', code, dest]); return true; },
    supabaseUrl: BASE,
    now: () => 1700,
    ...over,
  };
  return { d, log };
}
const v = (size: number, name = 'IMG.MOV', type = 'video/quicktime') => ({ uri: 'file:///picked.mov', name, size, type, durationSec: 110 });
const clipUrl = (ext: string) => `${BASE}/storage/v1/object/public/memory-clips/abcd2345.${ext}?v=1700`;

it('a 2-minute phone video (116 MB, over the free plan\'s 50 MB): shrunk to HD first, sent as MP4, a new address', async () => {
  const { d, log } = deps();
  const steps: string[] = [];
  expect(await replaceMemoryVideo('abcd2345', v(116_000_000), d, (t) => steps.push(t)))
    .toEqual({ ok: true, text: 'Video replaced ✓ — same QR, new memory', destination: clipUrl('mp4') });
  expect(log).toEqual([
    ['shrink', 'file:///picked.mov', HD_HEVC],
    ['upload', { code: 'abcd2345', ext: 'mp4', uri: 'file:///small.mp4', size: 47_000_000, replace: true }],
    ['relink', 'abcd2345', clipUrl('mp4')],
  ]);
  // The customer sees how far it has got.
  expect(steps).toEqual(['Preparing the video… 0%', 'Preparing the video… 50%', UPLOADING_VIDEO]);
});

it('a small video is shrunk too (every replacement, like a new video)', async () => {
  const { d, log } = deps({}, 8_000_000);
  await replaceMemoryVideo('abcd2345', v(20_000_000), d);
  expect(log[0]).toEqual(['shrink', 'file:///picked.mov', HD_HEVC]);
  expect(log[1]).toEqual(['upload', expect.objectContaining({ ext: 'mp4', size: 8_000_000 })]);
});

it('made at the quality the album\'s videos were paid for: a Standard album\'s video at Standard', async () => {
  // On the emulator (no HEVC chip) an always-HD 110 s video came out 64 MB,
  // over the free plan's 50 MB; at Standard it is about 35 MB on any phone.
  const { d, log } = deps({ limits: async () => ({ quality: 'standard', maxSeconds: 120 }) });
  await replaceMemoryVideo('abcd2345', v(116_000_000), d);
  expect(log[0]).toEqual(['shrink', 'file:///picked.mov', { longEdge: 1280, shortEdge: 720, bitrate: 2_200_000, label: '720p', hevcBitrate: 1_500_000 }]);
  // The quality can't be read: HD, never less than was paid for.
  const failing = deps({ limits: async () => { throw new Error('offline'); } });
  await replaceMemoryVideo('abcd2345', v(116_000_000), failing.d);
  expect(failing.log[0]).toEqual(['shrink', 'file:///picked.mov', HD_HEVC]);
});

it('replaceLimits: the quality and length the orders printing this QR paid for', () => {
  const snap = (code: string) => ({ pages: [{ qrFills: [{ code, kind: 'clip', destination: 'x' }] }] });
  const std = { hd_memories: false, status: 'delivered', album_snapshot: snap('abcd2345') };
  const hd = { hd_memories: true, status: 'paid', album_snapshot: snap('abcd2345') };
  // Quality: HD when one paid for HD; Standard when none did.
  expect(replaceLimits([std], 'abcd2345')).toEqual({ quality: 'standard', maxSeconds: 120 });
  expect(replaceLimits([std, hd], 'abcd2345').quality).toBe('hd');
  expect(replaceLimits([std, { ...hd, status: 'cancelled' }], 'abcd2345').quality).toBe('standard');
  // Length: the longest any paid for (0067's orders.video_minutes); absent (before 0067) or 2 = 2 minutes.
  expect(replaceLimits([{ ...std, video_minutes: 3 }], 'abcd2345').maxSeconds).toBe(180);
  expect(replaceLimits([{ ...std, video_minutes: 3 }, { ...hd, video_minutes: 5 }], 'abcd2345').maxSeconds).toBe(300);
  expect(replaceLimits([{ ...std, video_minutes: null }, { ...hd, video_minutes: 2 }], 'abcd2345').maxSeconds).toBe(120);
  expect(replaceLimits([std, { ...hd, video_minutes: 5, status: 'cancelled' }], 'abcd2345').maxSeconds).toBe(120);
  // No order prints this QR, or none read: HD, and 2 minutes (never more than was paid for).
  expect(replaceLimits([{ ...hd, video_minutes: 5, album_snapshot: snap('zzzz9999') }, { ...std, album_snapshot: snap('zzzz9999') }], 'abcd2345')).toEqual(NO_ORDER_LIMITS);
  expect(replaceLimits(null, 'abcd2345')).toEqual({ quality: 'hd', maxSeconds: 120 });
});

it('as long as the album paid for: a 4-minute video on a 5-minute album goes in; on a 2-minute album it is refused', async () => {
  const long = { ...v(200_000_000), durationSec: 240 };
  const five = deps({ limits: async () => ({ quality: 'standard', maxSeconds: 300 }) });
  expect(await replaceMemoryVideo('abcd2345', long, five.d)).toEqual(expect.objectContaining({ ok: true }));
  const three = deps({ limits: async () => ({ quality: 'standard', maxSeconds: 180 }) });
  expect(await replaceMemoryVideo('abcd2345', long, three.d)).toEqual({ ok: false, text: 'That video is 240 seconds — memories are up to 3 minutes. Trim it to the best moment.' });
  const two = deps({ limits: async () => ({ quality: 'hd', maxSeconds: 120 }) });
  expect(await replaceMemoryVideo('abcd2345', long, two.d)).toEqual({ ok: false, text: 'That video is 240 seconds — memories are up to 2 minutes. Trim it to the best moment.' });
  expect(two.log).toEqual([]);
  // The orders can't be read: up to 2 minutes.
  const offline = deps({ limits: async () => { throw new Error('offline'); } });
  expect(await replaceMemoryVideo('abcd2345', long, offline.d)).toEqual(expect.objectContaining({ ok: false }));
});

it('the shrunk copy is no smaller, the shrink fails, or this app has no shrinker: sent as picked', async () => {
  const notSmaller = deps({}, 30_000_000);
  expect(await replaceMemoryVideo('abcd2345', v(30_000_000), notSmaller.d)).toEqual(expect.objectContaining({ ok: true, destination: clipUrl('mov') }));
  expect(notSmaller.log[1]).toEqual(['upload', { code: 'abcd2345', ext: 'mov', uri: 'file:///picked.mov', size: 30_000_000, replace: true }]);

  const fails = deps({ shrink: async () => { throw new Error('ERR_SHRINK'); } });
  expect(await replaceMemoryVideo('abcd2345', v(30_000_000), fails.d)).toEqual(expect.objectContaining({ ok: true, destination: clipUrl('mov') }));

  const none = deps({ shrink: null });
  const steps: string[] = [];
  expect(await replaceMemoryVideo('abcd2345', v(30_000_000), none.d, (t) => steps.push(t))).toEqual(expect.objectContaining({ ok: true }));
  expect(steps).toEqual([UPLOADING_VIDEO]);
});

it('the checks, an upload that fails, a QR that can\'t be re-pointed: the website\'s words', async () => {
  expect(await replaceMemoryVideo('abcd2345', { ...v(10), durationSec: 200 }, deps().d)).toEqual({ ok: false, text: 'That video is 200 seconds — memories are up to 2 minutes. Trim it to the best moment.' });
  expect(await replaceMemoryVideo('abcd2345', v(10), deps({ upload: async () => { throw new Error('Could not upload your memory video (offline).'); } }).d)).toEqual({ ok: false, text: 'Could not upload your memory video (offline).' });
  expect(await replaceMemoryVideo('abcd2345', v(10), deps({ relink: async () => false }).d)).toEqual({ ok: false, text: NOT_REPOINTED });
});
