/* ══════════════════════════════════════════════════════════════════════════
   MEMORY VIDEOS ON THE PHONE (src/lib/memories/clips.ts), held to the
   website's src/lib/memoryClips.ts:
     • the rules run beside the WEBSITE's own functions: which files are
       videos, the size and length checks and their words, the video's
       address, the words when a video is gone;
     • the storage calls (upload, "is it in the cloud?") are the website's,
       on the same stand-in storage;
     • the phone's store: a picked video is kept under its QR's code, shrunk
       (kept as picked when shrinking fails or doesn't help), uploaded at
       checkout (one already there counts; one marked uploaded but gone from
       the cloud goes up again; one neither here nor in the cloud stops
       checkout), the album's quality, and freeing paid videos.
   ══════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import * as app from '../src/lib/memories/clips';
import { makeClipStore, type ClipDeps, type StagedClip } from '../src/lib/memories/clips';

type Call = { fn: string; bucket: string; args: unknown[] };
const mockStorage: { calls: Call[]; objects: Set<string>; uploadError: { message: string; statusCode?: string } | null; listError: { message: string } | null } = {
  calls: [], objects: new Set(), uploadError: null, listError: null,
};
function mockStorageFake() {
  return {
    from(bucket: string) {
      return {
        async upload(p: string, body: unknown, opts: unknown) {
          mockStorage.calls.push({ fn: 'upload', bucket, args: [p, opts] });
          void body;
          if (mockStorage.uploadError) return { data: null, error: mockStorage.uploadError };
          mockStorage.objects.add(p);
          return { data: { path: p }, error: null };
        },
        async list(prefix: string, opts: { search: string; limit: number }) {
          mockStorage.calls.push({ fn: 'list', bucket, args: [prefix, opts] });
          if (mockStorage.listError) return { data: null, error: mockStorage.listError };
          return { data: [...mockStorage.objects].filter((n) => n.includes(opts.search)).map((name) => ({ name })), error: null };
        },
      };
    },
  };
}
jest.mock('@web/lib/supabase', () => ({ supabase: { storage: { from: (b: string) => mockStorageFake().from(b) } }, supabaseConfigured: true }));
jest.mock('@web/lib/storeSettings', () => ({ getPriceSchedule: () => null }));

type AnyFn = (...args: any[]) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
/* eslint-disable-next-line @typescript-eslint/no-require-imports */
const web = require('@web/lib/memoryClips') as Record<string, AnyFn> & Record<string, unknown>;

const REPO = path.resolve(__dirname, '..', '..');
const BASE = 'https://example.supabase.co';

beforeEach(() => {
  mockStorage.calls = [];
  mockStorage.objects = new Set();
  mockStorage.uploadError = null;
  mockStorage.listError = null;
});

describe('the rules are the website\'s', () => {
  it('the numbers, the kinds of video, the quality targets', () => {
    for (const k of ['MAX_CLIP_SECONDS', 'MAX_INPUT_BYTES', 'MAX_CLIP_BYTES', 'CLIP_BUCKET', 'CLIP_EXT_BY_MIME', 'CLIP_EXTS', 'QUALITY_TARGETS'] as const) {
      expect(app[k]).toEqual(web[k]);
    }
  });

  it('which files are videos: the same answer on many inputs', () => {
    const files = [
      { type: 'video/mp4', name: 'a.mp4' }, { type: 'VIDEO/QUICKTIME', name: 'x' }, { type: '', name: 'VID_2026.MOV' },
      { type: 'application/octet-stream', name: 'clip.m4v' }, { type: '', name: 'clip.avi' }, { type: 'video/webm' },
      { name: 'noext' }, {}, { type: 'image/jpeg', name: 'a.jpg' },
    ];
    for (const f of files) expect(app.clipExtFor(f)).toBe(web.clipExtFor(f));
    for (const e of app.CLIP_EXTS) {
      expect(app.clipMimeFor(e)).toBe(web.clipMimeFor(e));
      expect(app.clipObjectPath('abcd2345', e)).toBe(web.clipObjectPath('abcd2345', e));
      expect(app.publicClipUrl('abcd2345', e, BASE)).toBe(web.publicClipUrl('abcd2345', e, BASE));
      expect(app.versionedClipUrl('abcd2345', e, 3.7, BASE)).toBe(web.versionedClipUrl('abcd2345', e, 3.7, BASE));
    }
  });

  it('the checks and their words: the same on many inputs', () => {
    const metas = [
      { size: 10, durationSec: 30, ext: 'mp4' }, { size: 10, durationSec: null, ext: 'mov' }, { size: 10, durationSec: 5, ext: null },
      { size: 401 * 1024 * 1024, durationSec: 10, ext: 'mp4' }, { size: 10, durationSec: 120.4, ext: 'mp4' }, { size: 10, durationSec: 121, ext: 'webm' },
      { size: 400 * 1024 * 1024, durationSec: 600, ext: 'mp4' },
    ] as const;
    for (const m of metas) expect(app.checkClipMeta(m as never)).toEqual(web.checkClipMeta(m));
    expect(app.checkClipMeta({ size: 10, durationSec: 121, ext: 'mp4' })).toEqual({ ok: false, error: 'That video is 121 seconds — memories are up to 2 minutes. Trim it to the best moment.' });
  });

  it('a video that is gone: the website\'s words, and the checkout\'s with the pages named', () => {
    const W = web.MissingClipError as unknown as new (c: string[]) => Error;
    expect(new app.MissingClipError(['a']).message).toBe(new W(['a']).message);
    expect(new app.MissingClipError(['a', 'b', 'c']).message).toBe(new W(['a', 'b', 'c']).message);
    const order = fs.readFileSync(path.join(REPO, 'src/pages/Order.tsx'), 'utf8');
    expect(order).toContain("const where = pages.length === 1 ? `page ${pages[0]}` : `pages ${pages.slice(0, -1).join(', ')} and ${pages[pages.length - 1]}`;");
    expect(order).toContain('return `The memory video on ${where} is no longer saved. Open your album and choose the video again for the QR on ${where}, then order.`;');
    const pages = [{ qrFills: [null] }, { qrFills: [{ code: 'aaaa2222' }] }, { textSlotQr: [{ code: 'bbbb3333' }] }, { qrFills: [{ code: 'cccc4444' }] }];
    expect(app.missingClipMessage(pages, ['aaaa2222'])).toBe('The memory video on page 2 is no longer saved. Open your album and choose the video again for the QR on page 2, then order.');
    expect(app.missingClipMessage(pages, ['aaaa2222', 'bbbb3333', 'cccc4444'])).toBe('The memory video on pages 2, 3 and 4 is no longer saved. Open your album and choose the video again for the QR on pages 2, 3 and 4, then order.');
    expect(app.missingClipMessage(pages, ['zzzz9999'])).toBe(new W(['zzzz9999']).message);
  });

  it('the upload, "is it in the cloud?" and their words are the website\'s calls', async () => {
    const store = makeClipStore(deps(memFiles()));
    const clip: StagedClip = { code: 'abcd2345', ext: 'mp4', uri: 'file:///kept/abcd2345.mp4', size: 3, durationSec: 4, name: 'a.mp4', stagedAt: 1 };
    await web.uploadClip('abcd2345', 'mp4', new Blob([new Uint8Array(3)]), { replace: false });
    const webUpload = mockStorage.calls.splice(0);
    await store.uploadClip(clip);
    expect(mockStorage.calls).toEqual(webUpload);
    mockStorage.calls = [];
    await web.uploadClip('abcd2345', 'mp4', new Blob([new Uint8Array(3)]), { replace: true });
    const webReplace = mockStorage.calls.splice(0);
    await store.uploadClip({ ...clip, replace: true });
    expect(mockStorage.calls).toEqual(webReplace);
    // Already there: done, by both. A real failure: the same words.
    mockStorage.uploadError = { message: 'The resource already exists', statusCode: '409' };
    await expect(web.uploadClip('abcd2345', 'mp4', new Blob([new Uint8Array(3)]))).resolves.toBeUndefined();
    await expect(store.uploadClip(clip)).resolves.toBeUndefined();
    mockStorage.uploadError = { message: 'Payload too large' };
    const webErr = await web.uploadClip('abcd2345', 'mp4', new Blob([new Uint8Array(3)])).catch((e: Error) => e.message);
    await expect(store.uploadClip(clip)).rejects.toThrow(webErr);
    // In the cloud?
    mockStorage.uploadError = null;
    mockStorage.objects = new Set(['abcd2345.mp4', 'zzzz9999.mov']);
    mockStorage.calls = [];
    const answers = [await web.clipInBucket('abcd2345', 'mp4'), await web.clipInBucket('abcd2345', 'mov'), await web.clipInBucket('zzzz9999'), await web.clipInBucket('none2345')];
    const webList = mockStorage.calls.splice(0);
    expect([await store.clipInBucket('abcd2345', 'mp4'), await store.clipInBucket('abcd2345', 'mov'), await store.clipInBucket('zzzz9999'), await store.clipInBucket('none2345')]).toEqual(answers);
    expect(mockStorage.calls).toEqual(webList);
    expect(answers).toEqual([true, false, true, false]);
    mockStorage.listError = { message: 'offline' };
    const webListErr = await web.clipInBucket('abcd2345').catch((e: Error) => e.message);
    await expect(store.clipInBucket('abcd2345')).rejects.toThrow(webListErr);
  });

  it('a video still too big after shrinking: the website\'s words, nothing sent', async () => {
    const files = memFiles();
    files.sizes.set('file:///kept/big.mp4', 101 * 1024 * 1024);
    const store = makeClipStore(deps(files));
    const big = new Blob([]);
    Object.defineProperty(big, 'size', { value: 101 * 1024 * 1024 });
    const webErr = await web.uploadClip('abcd2345', 'mp4', big).catch((e: Error) => e.message);
    await expect(store.uploadClip({ code: 'abcd2345', ext: 'mp4', uri: 'file:///kept/big.mp4', size: 1, durationSec: 1, name: 'b', stagedAt: 1 })).rejects.toThrow(webErr);
    expect(mockStorage.calls).toHaveLength(0);
  });
});

/* ── The phone's store, with stand-ins ─────────────────────────────────── */

function memFiles() {
  const present = new Set<string>();
  const sizes = new Map<string, number>();
  return {
    present, sizes,
    async keep(from: string, name: string) { const uri = `file:///kept/${name}`; present.add(uri); sizes.set(uri, sizes.get(from) ?? 1000); return uri; },
    async remove(uri: string) { present.delete(uri); },
    exists: (uri: string) => present.has(uri),
    size: (uri: string) => sizes.get(uri) ?? 0,
    bytes: async (uri: string) => new Uint8Array(Math.min(sizes.get(uri) ?? 0, 16)),
    shrunkPath: (code: string, stagedAt: number) => `file:///kept/${code}-${stagedAt}-small.mp4`,
  };
}

function deps(files: ReturnType<typeof memFiles>, over: Partial<ClipDeps> = {}): ClipDeps & { index: Record<string, StagedClip>; rpcs: unknown[] } {
  const box = { index: {} as Record<string, StagedClip>, rpcs: [] as unknown[] };
  const d: ClipDeps = {
    readIndex: async () => JSON.parse(JSON.stringify(box.index)),
    writeIndex: async (i) => { box.index = JSON.parse(JSON.stringify(i)); },
    files,
    shrink: null,
    storage: mockStorageFake() as never,
    rpc: async (name, args) => { box.rpcs.push({ name, args }); return { data: [], error: null }; },
    ...over,
  };
  return Object.assign(d, { get index() { return box.index; }, rpcs: box.rpcs });
}

const picked = (code: string, over: Partial<{ ext: app.ClipExt; size: number; quality: app.ClipQuality; replace: boolean }> = {}) =>
  ({ code, ext: over.ext ?? 'mov', size: over.size ?? 1000, durationSec: 20, name: `${code}.mov`, from: `content://picked/${code}`, quality: over.quality ?? 'standard', replace: over.replace });

describe('the phone keeps a picked video under its QR\'s code', () => {
  it('kept, found again, removed with its file', async () => {
    const files = memFiles();
    const store = makeClipStore(deps(files));
    const kept = await store.stageClip(picked('abcd2345'));
    expect(kept.uri).toMatch(/^file:\/\/\/kept\/abcd2345-\d+\.mov$/);
    expect((await store.getStagedClip('abcd2345'))?.code).toBe('abcd2345');
    expect(await store.listStagedCodes()).toEqual(['abcd2345']);
    await store.removeStagedClip('abcd2345');
    expect(await store.getStagedClip('abcd2345')).toBeNull();
    expect(files.present.has(kept.uri)).toBe(false);
  });

  it('a file the phone cleared away: not kept any more', async () => {
    const files = memFiles();
    const store = makeClipStore(deps(files));
    const kept = await store.stageClip(picked('abcd2345'));
    files.present.delete(kept.uri);
    expect(await store.getStagedClip('abcd2345')).toBeNull();
  });

  it('replacing a video keeps one file for the code', async () => {
    const files = memFiles();
    const store = makeClipStore(deps(files));
    const a = await store.stageClip(picked('abcd2345'));
    const b = await store.stageClip({ ...picked('abcd2345', { ext: 'mp4' }), replace: true });
    expect(files.present.has(a.uri)).toBe(false);
    expect(files.present.has(b.uri)).toBe(true);
    expect((await store.getStagedClip('abcd2345'))?.replace).toBe(true);
  });
});

describe('shrinking (in the background; never loses the video)', () => {
  it('smaller: the shrunk MP4 is kept instead', async () => {
    const files = memFiles();
    const shrink = jest.fn(async (_i: string, out: string, _q: app.ClipQuality, onP: (f: number) => void) => { onP(0.5); files.present.add(out); files.sizes.set(out, 300); return { uri: out, size: 300 }; });
    const store = makeClipStore(deps(files, { shrink }));
    const kept = await store.stageClip(picked('abcd2345', { size: 1000, quality: 'hd' }));
    await store.startTranscode('abcd2345');
    expect(shrink.mock.calls[0].slice(0, 3)).toEqual([kept.uri, `file:///kept/abcd2345-${kept.stagedAt}-small.mp4`, 'hd']);
    const after = await store.getStagedClip('abcd2345');
    expect(after).toEqual(expect.objectContaining({ ext: 'mp4', size: 300, transcoded: true, uri: `file:///kept/abcd2345-${kept.stagedAt}-small.mp4` }));
    expect(files.present.has(kept.uri)).toBe(false);
  });

  it('not smaller, or it failed, or this APK can\'t shrink: kept as picked', async () => {
    for (const shrink of [
      async (_i: string, out: string) => ({ uri: out, size: 5000 }),
      async () => { throw new Error('codec'); },
      null,
    ]) {
      const files = memFiles();
      const store = makeClipStore(deps(files, { shrink: shrink as never }));
      const kept = await store.stageClip(picked('abcd2345', { size: 1000 }));
      await store.startTranscode('abcd2345');
      expect(await store.getStagedClip('abcd2345')).toEqual(expect.objectContaining({ uri: kept.uri, ext: 'mov', size: 1000, transcoded: true }));
    }
  });

  it('a video replaced while the old one was shrinking: the old result is dropped', async () => {
    const files = memFiles();
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const shrink = jest.fn(async (_i: string, out: string) => { await gate; files.present.add(out); return { uri: out, size: 10 }; });
    const store = makeClipStore(deps(files, { shrink }));
    await store.stageClip(picked('abcd2345'));
    const job = store.startTranscode('abcd2345');
    const b = await store.stageClip({ ...picked('abcd2345', { ext: 'mp4' }), replace: true });
    release();
    await job;
    expect((await store.getStagedClip('abcd2345'))?.uri).toBe(b.uri);
  });
});

describe('at checkout: every video in the cloud before the album is printed', () => {
  it('uploads the kept videos (shrinking first), reports progress, marks them uploaded', async () => {
    const files = memFiles();
    const store = makeClipStore(deps(files));
    await store.stageClip(picked('aaaa2222', { ext: 'mp4' }));
    await store.stageClip({ ...picked('bbbb3333', { ext: 'mp4' }), replace: true });
    const progress: unknown[] = [];
    const r = await store.uploadStagedClips(['aaaa2222', 'bbbb3333', 'aaaa2222'], (dn, t, ph) => progress.push([dn, t, ph]));
    expect(r).toEqual({ uploaded: ['aaaa2222', 'bbbb3333'], replaced: ['bbbb3333'] });
    expect(mockStorage.calls.filter((c) => c.fn === 'upload').map((c) => c.args)).toEqual([
      ['aaaa2222.mp4', { contentType: 'video/mp4', upsert: false, cacheControl: '31536000' }],
      ['bbbb3333.mp4', { contentType: 'video/mp4', upsert: true, cacheControl: '31536000' }],
    ]);
    expect(progress).toEqual([[0, 2, 'upload'], [1, 2, 'upload'], [2, 2, 'upload']]);
    expect((await store.getStagedClip('aaaa2222'))?.uploaded).toBe(true);
  });

  it('uploaded before and still in the cloud: not sent again; gone from the cloud: sent again from the phone', async () => {
    const files = memFiles();
    const store = makeClipStore(deps(files));
    await store.stageClip(picked('aaaa2222', { ext: 'mp4' }));
    await store.uploadStagedClips(['aaaa2222']);
    mockStorage.calls = [];
    await store.uploadStagedClips(['aaaa2222']);
    expect(mockStorage.calls.map((c) => c.fn)).toEqual(['list']);
    mockStorage.objects.clear(); // an order that expired unpaid lost its cloud copy
    mockStorage.calls = [];
    await store.uploadStagedClips(['aaaa2222']);
    expect(mockStorage.calls.map((c) => c.fn)).toEqual(['list', 'upload']);
  });

  it('a video neither on this phone nor in the cloud stops checkout, by name; one in the cloud is fine', async () => {
    const store = makeClipStore(deps(memFiles()));
    mockStorage.objects.add('cccc4444.mp4'); // added on the website, already uploaded
    expect(await store.findMissingClips(['cccc4444', 'dddd5555'])).toEqual(['dddd5555']);
    await expect(store.uploadStagedClips(['cccc4444', 'dddd5555'])).rejects.toEqual(new app.MissingClipError(['dddd5555']));
    await expect(store.uploadStagedClips(['cccc4444'])).resolves.toEqual({ uploaded: [], replaced: [] });
  });

  it('the album\'s quality is its kept videos\' (HD if any is HD)', async () => {
    const store = makeClipStore(deps(memFiles()));
    expect(await store.stagedClipQuality(['aaaa2222'])).toBeNull();
    await store.stageClip(picked('aaaa2222'));
    expect(await store.stagedClipQuality(['aaaa2222'])).toBe('standard');
    await store.stageClip(picked('bbbb3333', { quality: 'hd' }));
    expect(await store.stagedClipQuality(['aaaa2222', 'bbbb3333'])).toBe('hd');
    expect(await store.stagedClipBytes(['aaaa2222', 'bbbb3333', 'zzzz9999'])).toBe(2000);
  });

  it('a paid order\'s videos are freed from the phone, only when they are in the cloud', async () => {
    const files = memFiles();
    const d = deps(files, { rpc: async () => ({ data: ['aaaa2222', 'bbbb3333'], error: null }) });
    const store = makeClipStore(d);
    await store.stageClip(picked('aaaa2222', { ext: 'mp4' }));
    await store.stageClip(picked('bbbb3333', { ext: 'mp4' }));
    await store.stageClip(picked('cccc4444', { ext: 'mp4' }));
    await store.uploadStagedClips(['aaaa2222', 'bbbb3333', 'cccc4444']);
    mockStorage.objects.delete('bbbb3333.mp4'); // paid, but its cloud copy is gone: keep the phone's
    expect(await store.freePaidStagedClips()).toBe(1);
    expect(await store.listStagedCodes()).toEqual(['bbbb3333', 'cccc4444']);
  });
});
