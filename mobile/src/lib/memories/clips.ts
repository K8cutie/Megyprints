/* ══════════════════════════════════════════════════════════════════════════
   MEMORY VIDEOS ON THE PHONE (the website's src/lib/memoryClips.ts).

   The customer picks a video for a page's QR. It is checked (length, size,
   kind), KEPT on the phone under the QR's code, and the QR is placed at once.
   It is shrunk in the background (modules/video-shrink: one H.264 MP4 at the
   album's quality, as the website's videoTranscode.ts) while they keep
   building. At checkout every kept video is uploaded to the public
   `memory-clips` bucket as `<code>.<ext>`, and its memory row is made. The
   phone keeps its copy until the order is paid (an order that expires unpaid
   loses its cloud copy, and a new order uploads it again from here).

   The website keeps its rules in a file that also holds browser-only code
   (IndexedDB, the browser's video encoder), so the app keeps this copy.
   test/clips.test.ts runs the website's own functions beside these: the same
   answers, the same words, the same storage calls.

   makeClipStore takes the phone's parts (files, a small index, the storage
   client, the shrinker) so tests run it with stand-ins; clipStore.ts builds
   it with the real ones.
   ══════════════════════════════════════════════════════════════════════════ */

/* ── The rules (memoryClips.ts, word for word) ─────────────────────────── */

export const MAX_CLIP_SECONDS = 120;
/** Largest file accepted from the picker (before shrinking). */
export const MAX_INPUT_BYTES = 400 * 1024 * 1024;
/** Largest object the bucket accepts. */
export const MAX_CLIP_BYTES = 100 * 1024 * 1024;
export const CLIP_BUCKET = 'memory-clips';

export const CLIP_EXT_BY_MIME: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
  'video/x-m4v': 'm4v',
};
export const CLIP_EXTS = ['mp4', 'mov', 'webm', 'm4v'] as const;
export type ClipExt = (typeof CLIP_EXTS)[number];
export type ClipQuality = 'standard' | 'hd';

/** videoTranscode.ts QUALITY_TARGETS. */
export const QUALITY_TARGETS: Record<ClipQuality, { longEdge: number; shortEdge: number; bitrate: number; label: string }> = {
  standard: { longEdge: 1280, shortEdge: 720, bitrate: 2_200_000, label: '720p' },
  hd: { longEdge: 1920, shortEdge: 1080, bitrate: 4_500_000, label: '1080p' },
};

export function clipExtFor(file: { type?: string; name?: string }): ClipExt | null {
  const byMime = CLIP_EXT_BY_MIME[(file.type || '').toLowerCase()];
  if (byMime) return byMime as ClipExt;
  const m = (file.name || '').toLowerCase().match(/\.([a-z0-9]+)$/);
  const ext = m?.[1];
  return ext && (CLIP_EXTS as readonly string[]).includes(ext) ? (ext as ClipExt) : null;
}

export function clipMimeFor(ext: ClipExt): string {
  return Object.entries(CLIP_EXT_BY_MIME).find(([, e]) => e === ext)?.[0] ?? 'video/mp4';
}

export function clipObjectPath(code: string, ext: ClipExt): string {
  return `${code}.${ext}`;
}

export function publicClipUrl(code: string, ext: ClipExt, base: string): string {
  return `${base.replace(/\/+$/, '')}/storage/v1/object/public/${CLIP_BUCKET}/${clipObjectPath(code, ext)}`;
}

export function versionedClipUrl(code: string, ext: ClipExt, version: number, base: string): string {
  return `${publicClipUrl(code, ext, base)}?v=${Math.max(0, Math.floor(version))}`;
}

export function checkClipMeta(meta: { size: number; durationSec: number | null; ext: ClipExt | null }):
  { ok: true } | { ok: false; error: string } {
  if (!meta.ext) return { ok: false, error: 'Please choose a video file (MP4, MOV, WebM or M4V).' };
  if (meta.size > MAX_INPUT_BYTES) {
    return { ok: false, error: `That video is ${Math.round(meta.size / 1024 / 1024)} MB — too large to process on a phone. Trim it, or record at a lower quality.` };
  }
  if (meta.durationSec != null && meta.durationSec > MAX_CLIP_SECONDS + 0.5) {
    const mins = Math.floor(MAX_CLIP_SECONDS / 60);
    return { ok: false, error: `That video is ${Math.round(meta.durationSec)} seconds — memories are up to ${mins} minute${mins === 1 ? '' : 's'}. Trim it to the best moment.` };
  }
  return { ok: true };
}

/** memoryClips.ts MissingClipError: videos neither on this phone nor in the cloud. */
export class MissingClipError extends Error {
  readonly codes: string[];
  constructor(codes: string[]) {
    super(codes.length === 1
      ? 'One of your memory videos is no longer saved. Open your album and choose that video again.'
      : `${codes.length} of your memory videos are no longer saved. Open your album and choose those videos again.`);
    this.name = 'MissingClipError';
    this.codes = codes;
  }
}

/** Order.tsx missingClipMessage: which pages hold the videos that are gone. */
export function missingClipMessage(pages: { qrFills?: ({ code: string } | null)[] | null; textSlotQr?: ({ code: string } | null)[] | null }[], codes: string[]): string {
  const at = pages.flatMap((p, i) =>
    [...(p.qrFills ?? []), ...(p.textSlotQr ?? [])].some((f) => !!f && codes.includes(f.code)) ? [i + 1] : []);
  if (!at.length) return new MissingClipError(codes).message;
  const where = at.length === 1 ? `page ${at[0]}` : `pages ${at.slice(0, -1).join(', ')} and ${at[at.length - 1]}`;
  return `The memory video on ${where} is no longer saved. Open your album and choose the video again for the QR on ${where}, then order.`;
}

/** uploadClip's words for a video still too big after shrinking. */
export const tooBigToUpload = (size: number) =>
  `One of your memory videos is ${Math.round(size / 1024 / 1024)} MB, which is too large to upload from this device. Replace it with a shorter clip.`;
export const uploadFailed = (message: string) => `Could not upload your memory video (${message || 'storage error'}).`;
export const checkFailed = (message: string) => `Could not check your memory video (${message || 'storage error'}).`;

/* ── Kept on the phone ─────────────────────────────────────────────────── */

/** A kept video (memoryClips.ts StagedClip; the file is on the phone at `uri`). */
export interface StagedClip {
  code: string;
  ext: ClipExt;
  /** The video file on the phone (file://…, in the app's own folder). */
  uri: string;
  size: number;
  durationSec: number | null;
  name: string;
  stagedAt: number;
  quality?: ClipQuality;
  /** Shrinking has run (or was given up on). */
  transcoded?: boolean;
  /** It has been in the bucket (a hint: checkout asks the bucket again). */
  uploaded?: boolean;
  /** It replaces what the code pointed at before: upload over it, re-point the row. */
  replace?: boolean;
}

type StorageError = { message: string; statusCode?: string | number; error?: string } | null;

/** The phone's parts the store works with. */
export interface ClipDeps {
  /** The small index of kept videos (AsyncStorage on the phone). */
  readIndex(): Promise<Record<string, StagedClip>>;
  writeIndex(index: Record<string, StagedClip>): Promise<void>;
  /** Files in the app's own folder. */
  files: {
    /** Copy a picked video into the app's folder; returns its new uri. */
    keep(from: string, name: string): Promise<string>;
    remove(uri: string): Promise<void>;
    exists(uri: string): boolean;
    size(uri: string): number;
    bytes(uri: string): Promise<Uint8Array>;
    /** Where a shrunk copy of `code` is written. */
    shrunkPath(code: string, stagedAt: number): string;
  };
  /** The shrinker (modules/video-shrink); null when this APK has none. */
  shrink: ((input: string, output: string, quality: ClipQuality, onProgress: (f: number) => void) => Promise<{ uri: string; size: number }>) | null;
  /** The storage client (supabase.storage). */
  storage: {
    from(bucket: string): {
      upload(path: string, body: ArrayBuffer, opts: { contentType: string; upsert: boolean; cacheControl: string }): Promise<{ error: StorageError }>;
      list(prefix: string, opts: { search: string; limit: number }): Promise<{ data: { name?: string }[] | null; error: StorageError }>;
    };
  };
  /** supabase.rpc, for my_paid_memory_codes. */
  rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: unknown }>;
}

/** storageUpload.ts isAlreadyExists (lib/checkout/storage.ts keeps the app's copy). */
function alreadyThere(e: StorageError): boolean {
  if (!e) return false;
  const code = String(e.statusCode ?? '');
  return code === '409' || /already exists|duplicate/i.test(`${e.message} ${e.error ?? ''}`);
}

export type ClipUploadPhase = 'compress' | 'upload';
export type ClipUploadProgress = (done: number, total: number, phase: ClipUploadPhase) => void;

export function makeClipStore(d: ClipDeps) {
  // One write at a time, so two quick changes can't lose each other.
  let indexChain: Promise<unknown> = Promise.resolve();
  const edit = (fn: (index: Record<string, StagedClip>) => void): Promise<void> => {
    const p = indexChain.then(async () => {
      const index = await d.readIndex();
      fn(index);
      await d.writeIndex(index);
    });
    indexChain = p.catch(() => undefined);
    return p;
  };

  async function getStagedClip(code: string): Promise<StagedClip | null> {
    await indexChain;
    const c = (await d.readIndex())[code];
    if (!c) return null;
    // The file went (the phone cleared the app's files): not kept any more.
    return d.files.exists(c.uri) ? c : null;
  }

  async function listStagedCodes(): Promise<string[]> {
    await indexChain;
    return Object.keys(await d.readIndex());
  }

  /** Keep a picked video under its QR's code (stageClip). */
  async function stageClip(clip: Omit<StagedClip, 'stagedAt' | 'uri'> & { from: string }): Promise<StagedClip> {
    const prior = (await d.readIndex())[clip.code];
    const stagedAt = Math.max(Date.now(), (prior?.stagedAt ?? 0) + 1);
    // A new name each time, so a video replaced while the old one was being
    // shrunk can never be mistaken for it.
    const uri = await d.files.keep(clip.from, `${clip.code}-${stagedAt}.${clip.ext}`);
    if (prior && prior.uri !== uri) await d.files.remove(prior.uri).catch(() => {});
    const { from: _from, ...rest } = clip;
    void _from;
    const kept: StagedClip = { ...rest, uri, stagedAt };
    await edit((index) => { index[clip.code] = kept; });
    void startTranscode(clip.code);
    return kept;
  }

  async function markClipUploaded(code: string): Promise<void> {
    await edit((index) => { if (index[code]) index[code] = { ...index[code], uploaded: true }; });
  }

  async function removeStagedClip(code: string): Promise<void> {
    const c = (await d.readIndex())[code];
    await edit((index) => { delete index[code]; });
    if (c) await d.files.remove(c.uri).catch(() => {});
  }

  /* Shrinking, in the background (startTranscode). Never throws: on any
     failure the original is kept, so checkout still has something to upload. */
  const inflight = new Map<string, Promise<void>>();
  const progressByCode = new Map<string, number>();

  function clipTranscodeProgress(code: string): number | null {
    return progressByCode.get(code) ?? null;
  }

  function startTranscode(code: string): Promise<void> {
    const running = inflight.get(code);
    if (running) return running;
    const job = (async () => {
      const clip = await getStagedClip(code);
      if (!clip || clip.transcoded || clip.uploaded) return;
      if (!d.shrink) {
        await edit((index) => { if (index[code]) index[code] = { ...index[code], transcoded: true }; }).catch(() => {});
        return;
      }
      progressByCode.set(code, 0);
      try {
        const out = await d.shrink(clip.uri, d.files.shrunkPath(code, clip.stagedAt), clip.quality ?? 'standard', (f) => progressByCode.set(code, f));
        // Only take it if it helped: an already small video can come out bigger.
        const better = out.size > 0 && out.size < clip.size;
        const latest = (await getStagedClip(code)) ?? clip;
        if (latest.stagedAt !== clip.stagedAt) {
          // Replaced while it was shrinking: the new video is shrunk next.
          await d.files.remove(out.uri).catch(() => {});
          return;
        }
        await edit((index) => {
          if (!index[code]) return;
          index[code] = better
            ? { ...index[code], uri: out.uri, ext: 'mp4', size: out.size, transcoded: true }
            : { ...index[code], transcoded: true };
        });
        if (better) await d.files.remove(clip.uri).catch(() => {});
        else await d.files.remove(out.uri).catch(() => {});
      } catch {
        await edit((index) => { if (index[code]) index[code] = { ...index[code], transcoded: true }; }).catch(() => {});
      } finally {
        progressByCode.delete(code);
        inflight.delete(code);
      }
    })();
    inflight.set(code, job);
    return job;
  }

  /** ensureClipsTranscoded: finish shrinking everything before an upload. */
  async function ensureClipsTranscoded(codes: string[], onProgress?: (done: number, total: number) => void): Promise<void> {
    const pending: string[] = [];
    for (const code of [...new Set(codes)]) {
      const clip = await getStagedClip(code);
      if (clip && !clip.transcoded && !clip.uploaded) pending.push(code);
    }
    const total = pending.length;
    if (!total) return;
    let done = 0;
    onProgress?.(0, total);
    for (const code of pending) {
      await startTranscode(code);
      onProgress?.(++done, total);
    }
  }

  /** uploadClip: `<code>.<ext>`; one already there counts as done. */
  async function uploadClip(clip: StagedClip): Promise<void> {
    const size = d.files.size(clip.uri) || clip.size;
    if (size > MAX_CLIP_BYTES) throw new Error(tooBigToUpload(size));
    const bytes = await d.files.bytes(clip.uri);
    const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const { error } = await d.storage.from(CLIP_BUCKET).upload(clipObjectPath(clip.code, clip.ext), body, {
      contentType: clipMimeFor(clip.ext),
      upsert: !!clip.replace,
      cacheControl: '31536000',
    });
    if (!error || alreadyThere(error)) return;
    throw new Error(uploadFailed(error.message));
  }

  /** clipInBucket: asked with list(), which reads Storage's own table. */
  async function clipInBucket(code: string, ext?: ClipExt): Promise<boolean> {
    const { data, error } = await d.storage.from(CLIP_BUCKET).list('', { search: code, limit: 20 });
    if (error) throw new Error(checkFailed(error.message));
    const names = (data ?? []).map((o) => o?.name).filter((n): n is string => typeof n === 'string');
    return ext ? names.includes(clipObjectPath(code, ext)) : names.some((n) => n.startsWith(`${code}.`));
  }

  // Uploads run one at a time app-wide (serializeUploads).
  let uploadChain: Promise<unknown> = Promise.resolve();
  function serializeUploads<T>(run: () => Promise<T>): Promise<T> {
    const p = uploadChain.then(run, run);
    uploadChain = p.catch(() => undefined);
    return p;
  }

  async function runUploadStagedClips(codes: string[], onProgress?: ClipUploadProgress): Promise<{ uploaded: string[]; replaced: string[] }> {
    const unique = [...new Set(codes)];
    await ensureClipsTranscoded(unique, (dn, t) => onProgress?.(dn, t, 'compress'));
    const stagedByCode = new Map<string, StagedClip>();
    for (const c of await Promise.all(unique.map((code) => getStagedClip(code)))) if (c) stagedByCode.set(c.code, c);
    const total = stagedByCode.size;
    let done = 0;
    onProgress?.(0, total, 'upload');
    const uploaded: string[] = [];
    const replaced: string[] = [];
    const missing: string[] = [];
    for (const code of unique) {
      const clip = stagedByCode.get(code);
      if (!clip) {
        if (!(await clipInBucket(code))) missing.push(code);
        continue;
      }
      const needsUpload = !clip.uploaded || !(await clipInBucket(code, clip.ext));
      if (needsUpload) await uploadClip(clip);
      await markClipUploaded(clip.code);
      uploaded.push(clip.code);
      if (clip.replace) replaced.push(clip.code);
      onProgress?.(++done, total, 'upload');
    }
    if (missing.length) throw new MissingClipError(missing);
    return { uploaded, replaced };
  }

  /** uploadStagedClips: shrink what is left, then upload every kept video. */
  function uploadStagedClips(codes: string[], onProgress?: ClipUploadProgress) {
    return serializeUploads(() => runUploadStagedClips(codes, onProgress));
  }

  /** findMissingClips: neither on this phone nor in the cloud. */
  async function findMissingClips(codes: string[]): Promise<string[]> {
    const missing: string[] = [];
    for (const code of [...new Set(codes)]) {
      if (await getStagedClip(code)) continue;
      if (!(await clipInBucket(code))) missing.push(code);
    }
    return missing;
  }

  /** stagedClipQuality: the tier this album's kept videos were made for. */
  async function stagedClipQuality(codes: string[]): Promise<ClipQuality | null> {
    const clips = (await Promise.all([...new Set(codes)].map((c) => getStagedClip(c)))).filter((c): c is StagedClip => !!c);
    if (!clips.length) return null;
    return clips.some((c) => c.quality === 'hd') ? 'hd' : 'standard';
  }

  async function stagedClipBytes(codes: string[]): Promise<number> {
    const clips = await Promise.all([...new Set(codes)].map((c) => getStagedClip(c).catch(() => null)));
    return clips.reduce((n, c) => n + (c?.size ?? 0), 0);
  }

  /** freePaidStagedClips: the phone's copies of videos whose order is paid. */
  async function freePaidStagedClips(): Promise<number> {
    const staged = (await Promise.all((await listStagedCodes()).map((c) => getStagedClip(c))))
      .filter((c): c is StagedClip => !!c && c.uploaded === true);
    if (!staged.length) return 0;
    try {
      const { data, error } = await d.rpc('my_paid_memory_codes', { p_codes: staged.slice(0, 500).map((c) => c.code) });
      if (error || !Array.isArray(data)) return 0;
      const paid = new Set(data.filter((c): c is string => typeof c === 'string'));
      let freed = 0;
      for (const clip of staged) {
        if (!paid.has(clip.code)) continue;
        if (!(await clipInBucket(clip.code, clip.ext))) continue;
        await removeStagedClip(clip.code);
        freed += 1;
      }
      return freed;
    } catch {
      return 0;
    }
  }

  return {
    getStagedClip, listStagedCodes, stageClip, markClipUploaded, removeStagedClip,
    startTranscode, clipTranscodeProgress, ensureClipsTranscoded,
    uploadClip, clipInBucket, uploadStagedClips, findMissingClips,
    stagedClipQuality, stagedClipBytes, freePaidStagedClips,
  };
}

export type ClipStore = ReturnType<typeof makeClipStore>;
