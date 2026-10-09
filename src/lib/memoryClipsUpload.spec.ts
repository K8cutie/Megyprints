import { describe, it, expect, vi, beforeEach } from 'vitest';

/* ══════════════════════════════════════════════════════════════════════════
   Checkout's memory-video step after 0042. An order that expires unpaid has
   its cloud video removed, so:
     · "uploaded" on the phone's copy is only a hint: checkout asks the bucket
       and uploads again when the file is gone;
     · a video that is neither on the phone nor in the bucket stops checkout
       (MissingClipError), because the printed QR would play nothing;
     · checkout finds a gone video BEFORE it creates the order, so no unpaid
       order is left behind for it;
     · the phone frees its copy only for videos on a PAID order, only copies
       that are already up (a replacement waiting to upload is kept), and only
       while the cloud really has the file (never the last copy).
   The bucket check is list(), proved against a real local Storage in
   scripts/expire-orders-local-e2e.mjs (S1–S4, N16).
   ══════════════════════════════════════════════════════════════════════════ */

const h = vi.hoisted(() => ({
  bucket: new Set<string>(),
  uploads: [] as string[],
  listError: null as null | { message: string },
  rpc: vi.fn(),
}));

vi.mock('./supabase', () => ({
  supabaseConfigured: true,
  supabase: {
    rpc: (...a: unknown[]) => h.rpc(...a),
    storage: {
      from: () => ({
        list: async (_folder: string, opts: { search: string }) => (h.listError
          ? { data: null, error: h.listError }
          : { data: [...h.bucket].filter((n) => n.includes(opts.search)).map((name) => ({ name })), error: null }),
        upload: async (path: string) => {
          h.uploads.push(path);
          if (h.bucket.has(path)) return { data: null, error: { message: 'The resource already exists', statusCode: '409' } };
          h.bucket.add(path);
          return { data: { path }, error: null };
        },
      }),
    },
  },
}));

/** A tiny IndexedDB: one store keyed by code, callbacks on a microtask. */
const idb = new Map<string, Record<string, unknown>>();
function request<T>(fn: () => T) {
  const r: { result?: T; error?: unknown; onsuccess?: () => void; onerror?: () => void } = {};
  queueMicrotask(() => { try { r.result = fn(); r.onsuccess?.(); } catch (e) { r.error = e; r.onerror?.(); } });
  return r;
}
const store = {
  get: (k: string) => request(() => idb.get(k)),
  put: (v: Record<string, unknown>) => request(() => { idb.set(v.code as string, v); return v.code; }),
  delete: (k: string) => request(() => { idb.delete(k); }),
  getAllKeys: () => request(() => [...idb.keys()]),
};
const db = {
  objectStoreNames: { contains: () => true },
  createObjectStore: () => store,
  close: () => {},
  transaction: () => {
    const tx: { objectStore: () => typeof store; oncomplete?: () => void } = { objectStore: () => store };
    queueMicrotask(() => queueMicrotask(() => tx.oncomplete?.()));
    return tx;
  },
};
(globalThis as unknown as { indexedDB: unknown }).indexedDB = { open: () => request(() => db) };

const { uploadStagedClips, prefetchStagedClipUploads, freePaidStagedClips, findMissingClips, stagedClipQuality, MissingClipError } = await import('./memoryClips');

const stage = (code: string, over: Record<string, unknown> = {}) => idb.set(code, {
  code, ext: 'mp4', blob: new Blob(['video']), size: 5, durationSec: 3, name: `${code}.mp4`,
  stagedAt: 0, transcoded: true, ...over,
});

beforeEach(() => {
  idb.clear(); h.bucket.clear(); h.uploads.length = 0; h.listError = null; h.rpc.mockReset();
});

describe('uploading at checkout', () => {
  it('a fresh copy on the phone is uploaded and marked', async () => {
    stage('k7m2p9qz');
    await uploadStagedClips(['k7m2p9qz']);
    expect(h.uploads).toEqual(['k7m2p9qz.mp4']);
    expect(idb.get('k7m2p9qz')?.uploaded).toBe(true);
  });
  it('marked uploaded and still in the bucket: not sent again', async () => {
    stage('k7m2p9qz', { uploaded: true });
    h.bucket.add('k7m2p9qz.mp4');
    await uploadStagedClips(['k7m2p9qz']);
    expect(h.uploads).toEqual([]);
  });
  it('marked uploaded but removed from the bucket (its order expired): uploaded again from the phone', async () => {
    stage('k7m2p9qz', { uploaded: true });
    await uploadStagedClips(['k7m2p9qz']);
    expect(h.uploads).toEqual(['k7m2p9qz.mp4']);
    expect(h.bucket.has('k7m2p9qz.mp4')).toBe(true);
  });
  it('not on the phone but in the bucket: fine', async () => {
    h.bucket.add('w4n8r2ta.mov');
    await expect(uploadStagedClips(['w4n8r2ta'])).resolves.toEqual({ uploaded: [], replaced: [] });
  });
  it('neither on the phone nor in the bucket: checkout stops and names the codes', async () => {
    stage('k7m2p9qz');
    const run = uploadStagedClips(['k7m2p9qz', 'w4n8r2ta', 'p3q4r5s6']);
    await expect(run).rejects.toBeInstanceOf(MissingClipError);
    await expect(run).rejects.toMatchObject({ codes: ['w4n8r2ta', 'p3q4r5s6'] });
    // The one that WAS on the phone still went up.
    expect(h.bucket.has('k7m2p9qz.mp4')).toBe(true);
  });
  it('a code that only prefixes another file does not count as there', async () => {
    h.bucket.add('w4n8r2taxx.mp4');
    await expect(uploadStagedClips(['w4n8r2ta'])).rejects.toBeInstanceOf(MissingClipError);
  });
  it('Storage cannot answer: checkout stops (never guesses)', async () => {
    stage('k7m2p9qz', { uploaded: true });
    h.listError = { message: 'network' };
    await expect(uploadStagedClips(['k7m2p9qz'])).rejects.toThrow(/Could not check your memory video/);
    expect(h.uploads).toEqual([]);
  });
});

describe('the early upload (Order page open)', () => {
  it('a gone video comes back as missing, so the page asks for it instead of blaming the Wi-Fi', async () => {
    stage('onphone2');
    expect(await prefetchStagedClipUploads(['onphone2', 'gonegone'])).toEqual({ ok: false, missing: ['gonegone'] });
  });
  it('a network failure is just a failure (the Pay tap retries)', async () => {
    stage('onphone2', { uploaded: true });
    h.listError = { message: 'network' };
    expect(await prefetchStagedClipUploads(['onphone2'])).toEqual({ ok: false, missing: [] });
  });
  it('all there: ok', async () => {
    stage('onphone2');
    expect(await prefetchStagedClipUploads(['onphone2'])).toEqual({ ok: true, missing: [] });
  });
});

describe('the album\'s own video tier', () => {
  it('HD if any of its kept clips is HD, standard if none is, nothing if none is kept', async () => {
    stage('stdclip2', { quality: 'standard' });
    stage('hdclip22', { quality: 'hd' });
    expect(await stagedClipQuality(['stdclip2', 'hdclip22'])).toBe('hd');
    expect(await stagedClipQuality(['stdclip2'])).toBe('standard');
    expect(await stagedClipQuality(['notkept2'])).toBeNull();
  });
});

describe('checking before the order exists', () => {
  it('names only the videos that are neither on the phone nor in the cloud', async () => {
    stage('onphone2');
    h.bucket.add('incloud2.mp4');
    expect(await findMissingClips(['onphone2', 'incloud2', 'gonegone', 'gonegone'])).toEqual(['gonegone']);
  });
  it('Storage cannot answer: it throws rather than guessing', async () => {
    h.listError = { message: 'network' };
    await expect(findMissingClips(['gonegone'])).rejects.toThrow(/Could not check your memory video/);
  });
});

describe('freeing the phone\'s copies', () => {
  it('only copies on a PAID order, and only ones already up', async () => {
    stage('paidup22', { uploaded: true });
    stage('unpaid22', { uploaded: true });
    stage('paidnew2', { uploaded: false });
    h.bucket.add('paidup22.mp4');
    h.rpc.mockResolvedValue({ data: ['paidup22', 'paidnew2'], error: null });
    expect(await freePaidStagedClips()).toBe(1);
    expect([...idb.keys()].sort()).toEqual(['paidnew2', 'unpaid22']);
    expect(h.rpc).toHaveBeenCalledWith('my_paid_memory_codes', { p_codes: ['paidup22', 'unpaid22'] });
  });
  it('paid, but the cloud copy is gone (paid late, after the cleanup): the phone keeps the last copy', async () => {
    stage('paidlate', { uploaded: true });
    h.rpc.mockResolvedValue({ data: ['paidlate'], error: null });
    expect(await freePaidStagedClips()).toBe(0);
    expect(idb.has('paidlate')).toBe(true);
  });
  it('nothing kept on the phone: no request at all', async () => {
    expect(await freePaidStagedClips()).toBe(0);
    expect(h.rpc).not.toHaveBeenCalled();
  });
  it('the database can\'t answer (offline, 0042 not applied yet): keeps everything', async () => {
    stage('paidup22', { uploaded: true });
    h.rpc.mockResolvedValue({ data: null, error: { message: 'function does not exist' } });
    expect(await freePaidStagedClips()).toBe(0);
    expect(idb.has('paidup22')).toBe(true);
  });
});
