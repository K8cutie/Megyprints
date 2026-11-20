/* ══════════════════════════════════════════════════════════════════════════
   WHY THIS TEST: memory videos are shrunk to HEVC when the phone can make it
   (owner, 2026-11-21: "HEVC is low risk so lets do it"): about a third less
   space for the same look. A phone whose HEVC fails still gets today's H.264,
   and a shrink stopped on purpose stays stopped.
   ══════════════════════════════════════════════════════════════════════════ */
const mockCalls: Record<string, unknown>[] = [];
const mockNative = {
  fail: [] as string[],
  shrink: jest.fn(async (_i: string, _o: string, opts: Record<string, unknown>) => {
    mockCalls.push(opts);
    const err = mockNative.fail.shift();
    if (err) throw Object.assign(new Error(err), { code: err });
    return { uri: 'file:///out.mp4', size: 10, codec: opts.hevcBitrate ? 'hevc' : 'h264' };
  }),
  addListener: () => ({ remove() {} }),
};
jest.mock('expo', () => ({ requireOptionalNativeModule: () => mockNative }));

import { HEVC_BITRATES, QUALITY_TARGETS } from '../src/lib/memories/clips';

// Loaded after the stand-in above exists (imports are hoisted above it).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { shrinkVideo } = require('../modules/video-shrink') as typeof import('../modules/video-shrink');

beforeEach(() => { mockCalls.length = 0; mockNative.fail = []; });

it('asks for HEVC at the app\'s bitrate, with H.264 as the fallback figure', async () => {
  const r = await shrinkVideo('in.mp4', 'file:///out.mp4', { ...QUALITY_TARGETS.standard, hevcBitrate: HEVC_BITRATES.standard });
  expect(r.codec).toBe('hevc');
  expect(mockCalls).toEqual([{ shortEdge: 720, videoBitrate: 2_200_000, frameRate: 30, hevcBitrate: 1_500_000 }]);
});

it('HEVC fails on this phone: H.264 at today\'s bitrate', async () => {
  mockNative.fail = ['ERR_SHRINK'];
  const r = await shrinkVideo('in.mp4', 'file:///out.mp4', { ...QUALITY_TARGETS.hd, hevcBitrate: HEVC_BITRATES.hd });
  expect(r.codec).toBe('h264');
  expect(mockCalls).toEqual([
    { shortEdge: 1080, videoBitrate: 4_500_000, frameRate: 30, hevcBitrate: 3_000_000 },
    { shortEdge: 1080, videoBitrate: 4_500_000, frameRate: 30 },
  ]);
});

it('stopped on purpose: no second try', async () => {
  mockNative.fail = ['ERR_CANCELLED'];
  await expect(shrinkVideo('in.mp4', 'file:///out.mp4', { ...QUALITY_TARGETS.standard, hevcBitrate: HEVC_BITRATES.standard })).rejects.toThrow('ERR_CANCELLED');
  expect(mockCalls).toHaveLength(1);
});

it('a third less than today for the same look', () => {
  expect(HEVC_BITRATES.standard / QUALITY_TARGETS.standard.bitrate).toBeCloseTo(0.68, 2);
  expect(HEVC_BITRATES.hd / QUALITY_TARGETS.hd.bitrate).toBeCloseTo(0.67, 2);
});
