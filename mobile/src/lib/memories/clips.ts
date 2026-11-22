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

import { uploadTimeLimitMs } from '../checkout/storage';

/* ── The rules (memoryClips.ts, word for word) ─────────────────────────── */

export const MAX_CLIP_SECONDS = 120;
/** Largest file accepted from the picker (before shrinking). The APP's own:
 *  the website reads a video into memory (400 MB), the phone's shrinker
 *  (modules/video-shrink, Media3) reads it as it goes, so a 5-minute phone
 *  video (about 640 MB at 1080p) fits. */
export const MAX_INPUT_BYTES = 1024 * 1024 * 1024;
/** Largest object the bucket accepts (200 MB from 0067). */
export const MAX_CLIP_BYTES = 200 * 1024 * 1024;
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

/** THE APP'S OWN (owner, 2026-11-21: "HEVC is low risk so lets do it"): the
 *  phone makes HEVC (H.265) when it can, at these bitrates, for the same look
 *  in about a third less space; a phone that can't makes H.264 at
 *  QUALITY_TARGETS as before. Measured (VMAF, a real "Moving Up" clip and a
 *  fast-camera version, 720p): H.264 2.2 Mbps 90.7 / 89.0, HEVC 1.5 Mbps
 *  92.0 / 96.3. Phone encoders are less efficient than the PC's, so not the
 *  1.2 Mbps the PC needed. HD keeps the same third off (4.5 → 3.0). */
export const HEVC_BITRATES: Record<ClipQuality, number> = {
  standard: 1_500_000,
  hd: 3_000_000,
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

export function checkClipMeta(
  meta: { size: number; durationSec: number | null; ext: ClipExt | null },
  /** The longest allowed: 2 minutes, or 5 when the price list sells longer
   *  videos (pricing.ts maxVideoSecondsOf, 0067). */
  maxSeconds: number = MAX_CLIP_SECONDS,
): { ok: true } | { ok: false; error: string } {
  if (!meta.ext) return { ok: false, error: 'Please choose a video file (MP4, MOV, WebM or M4V).' };
  if (meta.size > MAX_INPUT_BYTES) {
    return { ok: false, error: `That video is ${Math.round(meta.size / 1024 / 1024)} MB — too large to process on a phone. Trim it, or record at a lower quality.` };
  }
  if (meta.durationSec != null && meta.durationSec > maxSeconds + 0.5) {
    const mins = Math.floor(maxSeconds / 60);
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

/* ── What the server takes (MP-2026-9M5572U, 2026-11-22) ──────────────────
   The bucket says 100 MB (200 MB from 0067), but the live Supabase project
   itself takes at most 50 MB a file on its plan (checked 2026-11-21), and
   refuses more with a 400 before the file is in. A Megy Mini's second video
   was over it: the order was made, its cover sent, then every try stopped at
   that video, so its pages were never made. So before the order is made, a
   video over the cap is shrunk once more at a bitrate that fits, and one
   that still doesn't fit stops checkout BEFORE any order exists, naming its
   page. Raise the cap here if the project's plan changes. */

/** The most one upload may be: the live project's own per-file limit. */
export const SERVER_UPLOAD_CAP_BYTES = 50 * 1024 * 1024;
/** What a video over the cap is shrunk to fit in: room for the sound and the
 *  file's own parts, which the bitrate doesn't count. */
export const FIT_TARGET_BYTES = 46 * 1024 * 1024;
/** Below this picture bitrate a 720p video turns to blocks: no fit then. */
export const MIN_FIT_BITRATE = 600_000;
const FIT_AUDIO_BITRATE = 128_000;

/** The picture bitrate that makes a video `seconds` long fit in `bytes` with
 *  its sound; null when its length is unknown or no usable bitrate fits. */
export function fitBitrate(seconds: number | null | undefined, bytes: number = FIT_TARGET_BYTES): number | null {
  if (!seconds || !Number.isFinite(seconds) || seconds <= 0) return null;
  const video = Math.floor((bytes * 8) / seconds) - FIT_AUDIO_BITRATE;
  return video >= MIN_FIT_BITRATE ? video : null;
}

/** Storage's answer for a file over the limit (HTTP 400 or 413, with
 *  statusCode "413" in its body). Trying it again never helps. */
export function isTooLargeError(e: { message?: string; statusCode?: string | number; status?: number; error?: string } | null | undefined): boolean {
  if (!e) return false;
  if (String(e.statusCode ?? '') === '413' || e.status === 413) return true;
  return /payload too large|exceeded the maximum allowed size|entity too large/i.test(`${e.message ?? ''} ${e.error ?? ''}`);
}

/** Memory videos too big to send, even shrunk. */
export class ClipTooBigError extends Error {
  readonly clips: { code: string; size: number }[];
  constructor(clips: { code: string; size: number }[]) {
    super(clips.length === 1
      ? tooBigToUpload(clips[0].size)
      : `${clips.length} of your memory videos are too large to upload from this device. Replace them with shorter clips.`);
    this.name = 'ClipTooBigError';
    this.clips = clips;
  }
}

/** Which pages hold the videos too big to send, and what to do. */
export function tooBigClipMessage(pages: { qrFills?: ({ code: string } | null)[] | null; textSlotQr?: ({ code: string } | null)[] | null }[], clips: { code: string; size: number }[]): string {
  const codes = clips.map((c) => c.code);
  const at = pages.flatMap((p, i) =>
    [...(p.qrFills ?? []), ...(p.textSlotQr ?? [])].some((f) => !!f && codes.includes(f.code)) ? [i + 1] : []);
  if (!at.length) return new ClipTooBigError(clips).message;
  const where = at.length === 1 ? `page ${at[0]}` : `pages ${at.slice(0, -1).join(', ')} and ${at[at.length - 1]}`;
  const mb = Math.round(Math.max(...clips.map((c) => c.size)) / 1024 / 1024);
  const cap = Math.round(SERVER_UPLOAD_CAP_BYTES / 1024 / 1024);
  return clips.length === 1
    ? `The memory video on ${where} is ${mb} MB, too big to send (we can take up to ${cap} MB). Open your album and choose a shorter video for the QR on ${where}, then order.`
    : `The memory videos on ${where} are too big to send (we can take up to ${cap} MB each). Open your album and choose shorter videos for those QRs, then order.`;
}

/** The shrinker a fit was tried with: 2 = HDR videos tone-mapped (or read as
 *  normal). A video tried with an older one is tried again. */
export const FIT_VERSION = 2;
const fitDone = (c: { fitTried?: boolean | number }) => (c.fitTried === true ? 1 : Number(c.fitTried) || 0) >= FIT_VERSION;

/** Waits between a memory video's upload tries (3 tries, like the cover). */
export const CLIP_UPLOAD_WAITS_MS = [1500, 4000];
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
  /** The FIT_VERSION a shrink to fit under the server's cap was last tried
   *  with (true: before versions). Tried again after an update brings a
   *  better shrinker (2: HDR videos), never twice with the same one. */
  fitTried?: boolean | number;
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
  /** The shrinker (modules/video-shrink); null when this APK has none. With
   *  `bitrate`, a 720p video at that picture bitrate (to fit under the cap). */
  shrink: ((input: string, output: string, quality: ClipQuality, onProgress: (f: number) => void, bitrate?: number) => Promise<{ uri: string; size: number }>) | null;
  /** The video's length in seconds (the shrinker's probe); null when unknown. */
  probeSeconds?: (uri: string) => Promise<number | null>;
  /** Waits between upload tries (default: real time). */
  wait?: (ms: number) => Promise<void>;
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

  /** A kept video over what the server takes, shrunk once more at a bitrate
   *  that fits (720p). Never throws: when it can't, the video stays as it is
   *  and checkout says it's too big before any order is made. Tried once per
   *  video (a new video for the code tries again). */
  async function fitUnderCap(code: string): Promise<void> {
    const clip = await getStagedClip(code);
    if (!clip || clip.uploaded || fitDone(clip) || !d.shrink) return;
    const size = d.files.size(clip.uri) || clip.size;
    if (size <= SERVER_UPLOAD_CAP_BYTES) return;
    const seconds = clip.durationSec ?? (await d.probeSeconds?.(clip.uri).catch(() => null)) ?? null;
    const fit = fitBitrate(seconds);
    // Never more than the album's own quality: a 40-second video needs no
    // 9 Mbps to fit, and the free plan holds 1 GB in all.
    const bitrate = fit ? Math.min(fit, QUALITY_TARGETS[clip.quality ?? 'standard'].bitrate) : null;
    let out: { uri: string; size: number } | null = null;
    if (bitrate) {
      progressByCode.set(code, 0);
      try {
        out = await d.shrink(clip.uri, d.files.shrunkPath(code, clip.stagedAt + 1), 'standard', (f) => progressByCode.set(code, f), bitrate);
      } catch {
        out = null;
      } finally {
        progressByCode.delete(code);
      }
    }
    const latest = (await getStagedClip(code)) ?? clip;
    if (latest.stagedAt !== clip.stagedAt) {
      if (out) await d.files.remove(out.uri).catch(() => {});
      return;
    }
    const fits = !!out && out.size > 0 && out.size <= SERVER_UPLOAD_CAP_BYTES;
    await edit((index) => {
      if (!index[code]) return;
      index[code] = fits
        ? { ...index[code], uri: out!.uri, ext: 'mp4', size: out!.size, transcoded: true, fitTried: FIT_VERSION }
        : { ...index[code], fitTried: FIT_VERSION };
    });
    if (fits) await d.files.remove(clip.uri).catch(() => {});
    else if (out) await d.files.remove(out.uri).catch(() => {});
  }

  /** ensureClipsTranscoded: finish shrinking everything before an upload,
   *  then fit any video still over the server's cap. */
  async function ensureClipsTranscoded(codes: string[], onProgress?: (done: number, total: number) => void): Promise<void> {
    const unique = [...new Set(codes)];
    const pending: string[] = [];
    const over: string[] = [];
    for (const code of unique) {
      const clip = await getStagedClip(code);
      if (!clip || clip.uploaded) continue;
      if (!clip.transcoded) pending.push(code);
      else if (!fitDone(clip) && (d.files.size(clip.uri) || clip.size) > SERVER_UPLOAD_CAP_BYTES) over.push(code);
    }
    const total = pending.length + over.length;
    if (!total) return;
    let done = 0;
    onProgress?.(0, total);
    for (const code of pending) {
      await startTranscode(code);
      await fitUnderCap(code);
      onProgress?.(++done, total);
    }
    for (const code of over) {
      await fitUnderCap(code);
      onProgress?.(++done, total);
    }
  }

  /** The kept videos still over what the server takes (not yet in the bucket). */
  async function tooBigClips(codes: string[]): Promise<{ code: string; size: number }[]> {
    const out: { code: string; size: number }[] = [];
    for (const code of [...new Set(codes)]) {
      const clip = await getStagedClip(code);
      if (!clip || clip.uploaded) continue;
      const size = d.files.size(clip.uri) || clip.size;
      if (size > SERVER_UPLOAD_CAP_BYTES) out.push({ code, size });
    }
    return out;
  }

  /** prepareStagedClips: shrink (and fit) every kept video now, before an
   *  order is made; the ones still too big to send come back. */
  async function prepareStagedClips(codes: string[], onProgress?: (done: number, total: number) => void): Promise<{ code: string; size: number }[]> {
    await ensureClipsTranscoded(codes, onProgress);
    return tooBigClips(codes);
  }

  const wait = d.wait ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  /** uploadClip: `<code>.<ext>`; one already there counts as done. 3 tries,
   *  each with a time limit (a dropped connection, or a 502, is often gone on
   *  the next); a file over the server's cap is never tried. */
  async function uploadClip(clip: StagedClip): Promise<void> {
    const size = d.files.size(clip.uri) || clip.size;
    if (size > SERVER_UPLOAD_CAP_BYTES) throw new ClipTooBigError([{ code: clip.code, size }]);
    const bytes = await d.files.bytes(clip.uri);
    const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    for (let attempt = 1; ; attempt++) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timedOut = new Promise<{ error: StorageError }>((done) => {
        timer = setTimeout(() => done({ error: { message: 'Upload timed out: no answer from the server' } }), uploadTimeLimitMs(size));
      });
      const { error } = await Promise.race([
        d.storage.from(CLIP_BUCKET).upload(clipObjectPath(clip.code, clip.ext), body, {
          contentType: clipMimeFor(clip.ext),
          upsert: !!clip.replace,
          cacheControl: '31536000',
        }).catch((e: unknown) => ({ error: { message: e instanceof Error ? e.message : String(e) } })),
        timedOut,
      ]).finally(() => clearTimeout(timer));
      if (!error || alreadyThere(error)) return;
      if (isTooLargeError(error)) throw new ClipTooBigError([{ code: clip.code, size }]);
      if (attempt > CLIP_UPLOAD_WAITS_MS.length) throw new Error(uploadFailed(error.message));
      await wait(CLIP_UPLOAD_WAITS_MS[attempt - 1]);
    }
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
    startTranscode, clipTranscodeProgress, ensureClipsTranscoded, fitUnderCap, tooBigClips, prepareStagedClips,
    uploadClip, clipInBucket, uploadStagedClips, findMissingClips,
    stagedClipQuality, stagedClipBytes, freePaidStagedClips,
  };
}

export type ClipStore = ReturnType<typeof makeClipStore>;
