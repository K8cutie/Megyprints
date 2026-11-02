/* ══════════════════════════════════════════════════════════════════════════
   ADDING, CHANGING AND REMOVING A VIDEO MEMORY (src/editor/memories/
   memoryFlow.ts), the website's AddQrModal steps:
     • the code: the website's alphabet and way (qrMemory.ts mintCode), a
       new one when the phone already keeps a video under it;
     • a picked video: the website's checks and words;
     • a new memory: the QR picture of the code's address, the video kept
       under the code with the album's quality, the fill the website makes;
     • a change: the same code and QR; it replaces the cloud's copy unless
       the old video was never sent; remove: the kept video goes too;
     • the album's quality: locked once it has a video memory.
   ══════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import type { AlbumPage, QrFill } from '@web/pages/builder/types';
import { albumQuality, changeMemory, checkPicked, CODE_ALPHABET, mintCode, newMemory, removeMemory, safeHost, type FlowDeps, type PickedVideo } from '../src/editor/memories/memoryFlow';
import type { StagedClip } from '../src/lib/memories/clips';

const REPO = path.resolve(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const BASE = 'https://example.supabase.co';

function fakeStore(kept: Record<string, Partial<StagedClip>> = {}) {
  const staged: Record<string, unknown>[] = [];
  const removed: string[] = [];
  return {
    staged, removed,
    getStagedClip: async (code: string) => (kept[code] ? ({ code, ...kept[code] } as StagedClip) : null),
    stageClip: async (c: Record<string, unknown>) => { staged.push(c); return c as never; },
    removeStagedClip: async (code: string) => { removed.push(code); },
    listStagedCodes: async () => Object.keys(kept),
    stagedClipQuality: async (codes: string[]) => (codes.some((c) => kept[c]?.quality === 'hd') ? 'hd' as const : codes.length ? 'standard' as const : null),
  };
}

function deps(store = fakeStore(), bytes: number[][] = []): FlowDeps & { store: ReturnType<typeof fakeStore> } {
  let n = 0;
  return {
    store,
    randomBytes: (len) => Uint8Array.from(bytes[n++] ?? Array.from({ length: len }, (_, i) => i)),
    qrPicture: (url) => `data:image/png;base64,QR(${url})`,
    supabaseUrl: BASE,
    now: () => 1_700_000_000_000,
  };
}

const video: PickedVideo = { uri: 'file:///cache/ImagePicker/VID_1.mp4', name: 'VID_1.mp4', size: 30 * 1024 * 1024, type: 'video/mp4', durationSec: 42 };

describe('the code is the website\'s', () => {
  it('the alphabet and the way it is drawn (qrMemory.ts mintCode)', () => {
    const src = read('src/lib/qrMemory.ts');
    expect(src).toContain(`const ALPHABET = '${CODE_ALPHABET}';`);
    expect(src).toContain('for (let i = 0; i < len; i++) out += ALPHABET[bytes[i] % ALPHABET.length];');
    expect(src).toContain('export function mintCode(len = 8): string {');
    expect(mintCode(() => Uint8Array.from([0, 1, 31, 32, 33, 255, 100, 7]))).toBe('ab9ab9eh');
    for (let i = 0; i < 50; i++) expect(mintCode((n) => Uint8Array.from({ length: n }, () => Math.floor(Math.random() * 256)))).toMatch(/^[a-z2-9]{8}$/);
  });
});

describe('a picked video', () => {
  it('checked as the website checks it, in its words', () => {
    expect(checkPicked(video)).toEqual({ ok: true, ext: 'mp4', durationSec: 42 });
    expect(checkPicked({ ...video, type: '', name: 'VID.MOV' })).toEqual({ ok: true, ext: 'mov', durationSec: 42 });
    expect(checkPicked({ ...video, durationSec: 150 })).toEqual({ ok: false, error: 'That video is 150 seconds — memories are up to 2 minutes. Trim it to the best moment.' });
    expect(checkPicked({ ...video, type: 'image/jpeg', name: 'a.jpg' })).toEqual({ ok: false, error: 'Please choose a video file (MP4, MOV, WebM or M4V).' });
    expect(checkPicked({ ...video, size: 500 * 1024 * 1024 })).toEqual({ ok: false, error: 'That video is 500 MB — too large to process on a phone. Trim it, or record at a lower quality.' });
    expect(checkPicked({ ...video, durationSec: null })).toEqual({ ok: true, ext: 'mp4', durationSec: null });
  });
});

describe('a new memory ("Place QR")', () => {
  it('the website\'s fill: its code, its address, its QR picture, the video\'s address in the cloud', async () => {
    const d = deps();
    const fill = await newMemory(video, { ext: 'mp4', durationSec: 42 }, 'hd', d);
    expect(fill).toEqual({
      code: 'abcdefgh', destination: `${BASE}/storage/v1/object/public/memory-clips/abcdefgh.mp4`,
      qrPngDataUrl: 'data:image/png;base64,QR(https://megyprints.vercel.app/m/abcdefgh)',
      memoryUrl: 'https://megyprints.vercel.app/m/abcdefgh', createdAt: 1_700_000_000_000, kind: 'clip', clipExt: 'mp4',
    });
    expect(d.store.staged).toEqual([{ code: 'abcdefgh', ext: 'mp4', from: video.uri, size: video.size, durationSec: 42, name: 'VID_1.mp4', quality: 'hd' }]);
    // The website's fill has the same fields (AddQrModal confirm).
    const modal = read('src/pages/builder/AddQrModal.tsx');
    expect(modal).toContain('code, destination: publicClipUrl(code, meta.ext), qrPngDataUrl, memoryUrl: memUrl,');
    expect(modal).toContain("createdAt: Date.now(), kind: 'clip', clipExt: meta.ext,");
  });

  it('a code the phone already keeps a video under: a new one', async () => {
    const d = deps(fakeStore({ abcdefgh: { ext: 'mp4' } }), [[0, 1, 2, 3, 4, 5, 6, 7], [8, 9, 10, 11, 12, 13, 14, 15]]);
    expect((await newMemory(video, { ext: 'mp4', durationSec: 42 }, 'standard', d)).code).toBe('ijkmnpqr');
  });
});

describe('a change ("Use this video") and "Remove"', () => {
  const initial: QrFill = {
    code: 'abcd2345', destination: `${BASE}/storage/v1/object/public/memory-clips/abcd2345.mov`, qrPngDataUrl: 'data:QR', memoryUrl: 'https://megyprints.vercel.app/m/abcd2345',
    createdAt: 1, kind: 'clip', clipExt: 'mov',
  };

  it('the same code and printed QR, the new video\'s address', async () => {
    const d = deps(fakeStore({ abcd2345: { quality: 'hd', uploaded: false } }));
    const fill = await changeMemory(initial, video, { ext: 'mp4', durationSec: 42 }, 'standard', d);
    expect(fill).toEqual({ ...initial, clipExt: 'mp4', destination: `${BASE}/storage/v1/object/public/memory-clips/abcd2345.mp4` });
    expect(d.store.staged[0]).toEqual(expect.objectContaining({ code: 'abcd2345', quality: 'hd', replace: false }));
  });

  it('replaces the cloud\'s copy when the old video was sent, when it isn\'t on this phone, or when it was a link', async () => {
    for (const [kept, init, replace] of [
      [{ abcd2345: { uploaded: true } }, initial, true],
      [{}, initial, true],
      [{ abcd2345: { uploaded: false } }, { ...initial, kind: 'link' as const }, true],
      [{ abcd2345: { uploaded: false } }, initial, false],
    ] as const) {
      const d = deps(fakeStore(kept as never));
      await changeMemory(init, video, { ext: 'mp4', durationSec: 42 }, 'standard', d);
      expect(d.store.staged[0].replace).toBe(replace);
    }
    const modal = read('src/pages/builder/AddQrModal.tsx');
    expect(modal).toContain("replace: initial.kind !== 'clip' || !!prior?.uploaded || !prior,");
  });

  it('"Remove" drops the kept video', async () => {
    const d = deps();
    await removeMemory(initial, d);
    await removeMemory(null, d);
    expect(d.store.removed).toEqual(['abcd2345']);
  });

  it('an old link memory says its site', () => {
    expect(safeHost('https://www.youtube.com/watch?v=1')).toBe('youtube.com');
    expect(safeHost('not a link')).toBe('a link');
  });
});

describe('the album\'s quality', () => {
  const page = (fills: (Partial<QrFill> | null)[]): AlbumPage => ({ qrFills: fills } as unknown as AlbumPage);
  it('open until the album has a video memory; then the kept videos\' tier', async () => {
    expect(await albumQuality([page([null])], fakeStore())).toEqual({ locked: false, tier: null });
    expect(await albumQuality([page([{ code: 'abcd2345', kind: 'clip' }])], fakeStore())).toEqual({ locked: true, tier: null });
    expect(await albumQuality([page([{ code: 'abcd2345', kind: 'link' }])], fakeStore({ abcd2345: { quality: 'hd' } }))).toEqual({ locked: true, tier: 'hd' });
    // Another album's kept video doesn't lock this one.
    expect(await albumQuality([page([null])], fakeStore({ zzzz9999: { quality: 'hd' } }))).toEqual({ locked: false, tier: null });
  });
});
