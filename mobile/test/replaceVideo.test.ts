/* "Replace video" (src/lib/memories/replaceVideo.ts): checked, uploaded over
   the old one, the memory pointed at a new address (the website's steps);
   a video over the bucket's 100 MB is shrunk on the phone first (HD). */
import { replaceMemoryVideo, NOT_REPOINTED, type ReplaceDeps } from '../src/lib/memories/replaceVideo';

const BASE = 'https://example.supabase.co';
function deps(over: Partial<ReplaceDeps> = {}) {
  const log: unknown[] = [];
  const d: ReplaceDeps = {
    upload: async (c) => { log.push(['upload', c]); },
    shrink: async (input, target) => { log.push(['shrink', input, target]); return { uri: 'file:///small.mp4', size: 60_000_000 }; },
    relink: async (code, dest) => { log.push(['relink', code, dest]); return true; },
    supabaseUrl: BASE,
    now: () => 1700,
    ...over,
  };
  return { d, log };
}
const v = (size: number, name = 'IMG.MOV', type = 'video/quicktime') => ({ uri: 'file:///picked.mov', name, size, type, durationSec: 40 });

it('a video under 100 MB: sent as picked, over the old one; a new address', async () => {
  const { d, log } = deps();
  expect(await replaceMemoryVideo('abcd2345', v(50_000_000), d)).toEqual({ ok: true, text: 'Video replaced ✓ — same QR, new memory', destination: `${BASE}/storage/v1/object/public/memory-clips/abcd2345.mov?v=1700` });
  expect(log).toEqual([
    ['upload', { code: 'abcd2345', ext: 'mov', uri: 'file:///picked.mov', size: 50_000_000, replace: true }],
    ['relink', 'abcd2345', `${BASE}/storage/v1/object/public/memory-clips/abcd2345.mov?v=1700`],
  ]);
});

it('over 100 MB: shrunk to HD first, sent as MP4', async () => {
  const { d, log } = deps();
  const r = await replaceMemoryVideo('abcd2345', v(250_000_000), d);
  expect(r).toEqual(expect.objectContaining({ ok: true, destination: `${BASE}/storage/v1/object/public/memory-clips/abcd2345.mp4?v=1700` }));
  expect(log[0]).toEqual(['shrink', 'file:///picked.mov', { longEdge: 1920, shortEdge: 1080, bitrate: 4_500_000, label: '1080p' }]);
  expect(log[1]).toEqual(['upload', expect.objectContaining({ ext: 'mp4', uri: 'file:///small.mp4', size: 60_000_000 })]);
});

it('the checks, an upload that fails, a QR that can\'t be re-pointed: the website\'s words', async () => {
  expect(await replaceMemoryVideo('abcd2345', { ...v(10), durationSec: 200 }, deps().d)).toEqual({ ok: false, text: 'That video is 200 seconds — memories are up to 2 minutes. Trim it to the best moment.' });
  expect(await replaceMemoryVideo('abcd2345', v(10), deps({ upload: async () => { throw new Error('Could not upload your memory video (offline).'); } }).d)).toEqual({ ok: false, text: 'Could not upload your memory video (offline).' });
  expect(await replaceMemoryVideo('abcd2345', v(10), deps({ relink: async () => false }).d)).toEqual({ ok: false, text: NOT_REPOINTED });
});
