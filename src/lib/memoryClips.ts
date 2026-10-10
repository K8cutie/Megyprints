/* ── Hosted living-memory CLIPS ────────────────────────────────────────────
   A QR memory used to be a pasted link (YouTube etc.), which meant uploading
   the video elsewhere first, copying a link, and signing in mid-build — nine
   steps per QR. Now the customer picks a video from their phone:

     pick file → checked (duration only) → STAGED locally in IndexedDB under
     the QR's code → QR placed at once (no sign-in) → COMPRESSED in the
     background while they keep building → at CHECKOUT, where sign-in already
     lives, every staged clip uploads to the public `memory-clips` bucket at
     `<code>.<ext>` and its memory row is created with the paid term.

   The printed QR still encodes /m/<code>; the resolver plays the clip on the
   branded page. Photos never leave the device — a memory clip must, because
   strangers scanning a printed page have to reach it. That is the one
   deliberate exception, and only at checkout.

   QUALITY TIERS (owner, 2026-09-10): STANDARD 720p is included with every
   album; HD 1080p is a one-time paid upgrade covering the album's memories
   for its whole hosting term. The tier is chosen with the FIRST memory and
   locked for the album, because each clip is encoded straight to its target —
   there is no stored original to re-encode from later.

   Pure helpers (caps, extension mapping, URL builders) live at the top so they
   can be unit-tested in node; IndexedDB, transcode and storage I/O sit below.
   Every transcode failure degrades to "keep the original file" — a memory is
   never lost to a compression problem.                                     */
import { supabase, supabaseConfigured } from './supabase';
import { isAlreadyExists } from './storageUpload';
import { getPriceSchedule } from './storeSettings';
import { transcodeToMp4, transcodeSupported, QUALITY_TARGETS, type ClipQuality } from './videoTranscode';

export type { ClipQuality };
export { QUALITY_TARGETS };

/* ── Caps (owner, 2026-09-10) ───────────────────────────────────────────────
   Real memory clips run 30 seconds to 2 minutes, so the cap is 2 minutes.
   The SOURCE cap is generous because we re-encode: what has to stay small is
   the OUTPUT, which the encoder controls. The source still has a ceiling
   because reading its audio needs the whole file in memory. */
export const MAX_CLIP_SECONDS = 120;
/** Largest file we will accept from the picker (before compression). */
export const MAX_INPUT_BYTES = 400 * 1024 * 1024;
/** Largest object the bucket accepts — the ceiling on what we upload
 *  (mirrors `file_size_limit` in migration 0030). */
export const MAX_CLIP_BYTES = 100 * 1024 * 1024;
export const CLIP_BUCKET = 'memory-clips';

/** Accepted container/mime → the extension the object is stored under. Kept
 *  small on purpose: these are what phones record and browsers play. */
export const CLIP_EXT_BY_MIME: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
  'video/x-m4v': 'm4v',
};
export const CLIP_EXTS = ['mp4', 'mov', 'webm', 'm4v'] as const;
export type ClipExt = (typeof CLIP_EXTS)[number];

/** Storage extension for a picked file, or null if we don't accept it. Falls
 *  back to the file name's extension because some Androids report a blank or
 *  generic mime for camera recordings. */
export function clipExtFor(file: { type?: string; name?: string }): ClipExt | null {
  const byMime = CLIP_EXT_BY_MIME[(file.type || '').toLowerCase()];
  if (byMime) return byMime as ClipExt;
  const m = (file.name || '').toLowerCase().match(/\.([a-z0-9]+)$/);
  const ext = m?.[1];
  return ext && (CLIP_EXTS as readonly string[]).includes(ext) ? (ext as ClipExt) : null;
}

/** The mime the object is uploaded with (the bucket allowlist is by mime). */
export function clipMimeFor(ext: ClipExt): string {
  return Object.entries(CLIP_EXT_BY_MIME).find(([, e]) => e === ext)?.[0] ?? 'video/mp4';
}

/** Object name inside the bucket — must match the storage INSERT policy's
 *  `^[a-z2-9]{4,32}\.(mp4|mov|webm|m4v)$`. */
export function clipObjectPath(code: string, ext: ClipExt): string {
  return `${code}.${ext}`;
}

const SUPABASE_URL: string = ((import.meta.env?.VITE_SUPABASE_URL as string | undefined) || '').replace(/\/+$/, '');

/** Public URL of a clip — the memory row's `destination`. Deterministic from
 *  (code, ext) so the QR can be placed BEFORE the upload happens. */
export function publicClipUrl(code: string, ext: ClipExt, base: string = SUPABASE_URL): string {
  return `${base.replace(/\/+$/, '')}/storage/v1/object/public/${CLIP_BUCKET}/${clipObjectPath(code, ext)}`;
}

/** A REPLACED clip's destination: the same object (the printed QR and the
 *  storage name never change) with a version, so every phone that played the
 *  old video — cached for a year under its URL — fetches the new one. The scan
 *  page (api/m.mjs isHostedClip) accepts exactly "?v=<digits>". */
export function versionedClipUrl(code: string, ext: ClipExt, version: number, base: string = SUPABASE_URL): string {
  return `${publicClipUrl(code, ext, base)}?v=${Math.max(0, Math.floor(version))}`;
}

/** Is this destination one of OUR hosted clips (vs a legacy link)? */
export function isHostedClipUrl(url: string, base: string = SUPABASE_URL): boolean {
  if (!base) return false;
  try {
    const u = new URL(url);
    const b = new URL(base);
    return u.origin === b.origin && u.pathname.startsWith(`/storage/v1/object/public/${CLIP_BUCKET}/`);
  } catch {
    return false;
  }
}

/** Pure part of validation — testable without a DOM. The size test is against
 *  the SOURCE cap: anything under it is compressed down before upload. */
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

/** Hosted mode is ON once the price schedule carries hosting tiers, i.e. once
 *  migration 0030 is applied — so a client deployed ahead of the migration
 *  keeps the legacy link flow instead of placing QRs it cannot upload for. */
export function hostedMemoriesEnabled(): boolean {
  const s = getPriceSchedule();
  return !!s && Array.isArray(s.hosting_tiers) && s.hosting_tiers.length > 0 && supabaseConfigured;
}

/* ── Album quality tier ─────────────────────────────────────────────────────
   Stored per album draft next to `megy-album-theme`, read at checkout for the
   HD line. Locked once the first clip is staged (see the header). */
const QUALITY_KEY = 'megy-clip-quality';

export function currentClipQuality(): ClipQuality {
  try { return localStorage.getItem(QUALITY_KEY) === 'hd' ? 'hd' : 'standard'; } catch { return 'standard'; }
}

export function setClipQuality(q: ClipQuality): void {
  try { localStorage.setItem(QUALITY_KEY, q); } catch { /* memory-only this session */ }
}

/* ── DOM: read a file's duration ──────────────────────────────────────────── */

/** Duration in seconds via a detached <video>, or null if the browser can't
 *  read it (odd container) — the size cap still applies and the bucket's mime
 *  allowlist is the backstop. */
export function probeClipDuration(file: Blob, timeoutMs = 8000): Promise<number | null> {
  return new Promise((resolve) => {
    if (typeof document === 'undefined') { resolve(null); return; }
    const v = document.createElement('video');
    const url = URL.createObjectURL(file);
    let done = false;
    const finish = (d: number | null) => {
      if (done) return;
      done = true;
      URL.revokeObjectURL(url);
      v.removeAttribute('src');
      v.load();
      resolve(d);
    };
    v.preload = 'metadata';
    v.muted = true;
    v.onloadedmetadata = () => finish(Number.isFinite(v.duration) ? v.duration : null);
    v.onerror = () => finish(null);
    setTimeout(() => finish(null), timeoutMs);
    v.src = url;
  });
}

/** Full client-side validation of a picked file. */
export async function validateClipFile(file: File): Promise<{ ok: true; ext: ClipExt; durationSec: number | null } | { ok: false; error: string }> {
  const ext = clipExtFor(file);
  const durationSec = ext ? await probeClipDuration(file) : null;
  const r = checkClipMeta({ size: file.size, durationSec, ext });
  if (!r.ok) return r;
  return { ok: true, ext: ext!, durationSec };
}

/* ── Local staging (IndexedDB) ────────────────────────────────────────────── */

const DB_NAME = 'megy-memory-clips';
const DB_VERSION = 1;
const STORE = 'clips';

export interface StagedClip {
  code: string;
  ext: ClipExt;
  blob: Blob;
  size: number;
  durationSec: number | null;
  name: string;
  stagedAt: number;
  /** The tier this clip was encoded for (locked at stage time). */
  quality?: ClipQuality;
  /** Set once compression has run (or been given up on) for this clip. */
  transcoded?: boolean;
  /** Set once the clip has been in the bucket. A hint only: an order that
   *  expires unpaid has its cloud copy removed (0042), so checkout asks the
   *  bucket again before trusting it. The phone keeps the clip until its
   *  order is PAID (freePaidStagedClips), so a reorder can upload it again. */
  uploaded?: boolean;
  /** This clip REPLACES what the code pointed at before (a prior upload, or a
   *  legacy link): upload with upsert and re-point the memory row. */
  replace?: boolean;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB unavailable')); return; }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(new Error('Failed to open the clip store'));
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (ev) => {
      const db = (ev.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'code' });
    };
  });
}

async function withStore<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('clip store error'));
    tx.oncomplete = () => db.close();
  });
}

export async function getStagedClip(code: string): Promise<StagedClip | null> {
  try { return (await withStore<StagedClip | undefined>('readonly', (s) => s.get(code))) ?? null; }
  catch { return null; }
}

/** Stage a picked clip and start compressing it in the background. The QR is
 *  placed by the caller immediately — compression never blocks the flow. */
export async function stageClip(clip: Omit<StagedClip, 'stagedAt'>): Promise<void> {
  const quality = clip.quality ?? currentClipQuality();
  await withStore('readwrite', (s) => s.put({ ...clip, quality, stagedAt: Date.now() } satisfies StagedClip));
  void startTranscode(clip.code);
}

export async function markClipUploaded(code: string): Promise<void> {
  const c = await getStagedClip(code);
  if (c) await withStore('readwrite', (s) => s.put({ ...c, uploaded: true }));
}

export async function removeStagedClip(code: string): Promise<void> {
  try { await withStore('readwrite', (s) => s.delete(code)); } catch { /* best-effort */ }
}

export async function listStagedCodes(): Promise<string[]> {
  try { return (await withStore<IDBValidKey[]>('readonly', (s) => s.getAllKeys())).map(String); }
  catch { return []; }
}

/* ── Background compression ───────────────────────────────────────────────── */

const inflight = new Map<string, Promise<void>>();
const progressByCode = new Map<string, number>();

/** 0-1 while a clip is compressing, else null. Drives the box's progress hint. */
export function clipTranscodeProgress(code: string): number | null {
  return progressByCode.get(code) ?? null;
}

/** Compress one staged clip in place. Never throws: on any failure the
 *  original file is kept and marked done, so checkout still has something to
 *  upload (the bucket's size limit is the final gate). */
function startTranscode(code: string): Promise<void> {
  const running = inflight.get(code);
  if (running) return running;

  const job = (async () => {
    const clip = await getStagedClip(code);
    if (!clip || clip.transcoded || clip.uploaded) return;
    if (!transcodeSupported()) {
      await withStore('readwrite', (s) => s.put({ ...clip, transcoded: true })).catch(() => {});
      return;
    }
    progressByCode.set(code, 0);
    try {
      const out = await transcodeToMp4(clip.blob, clip.quality ?? 'standard', (f) => progressByCode.set(code, f));
      // Only take the result if it actually helped — a tiny already-compressed
      // source can come out bigger, and shipping that would be a regression.
      const better = out.blob.size > 0 && out.blob.size < clip.blob.size;
      const latest = (await getStagedClip(code)) ?? clip;
      await withStore('readwrite', (s) => s.put(better
        ? { ...latest, blob: out.blob, ext: 'mp4' as ClipExt, size: out.blob.size, transcoded: true }
        : { ...latest, transcoded: true }));
    } catch {
      const latest = (await getStagedClip(code)) ?? clip;
      await withStore('readwrite', (s) => s.put({ ...latest, transcoded: true })).catch(() => {});
    } finally {
      progressByCode.delete(code);
      inflight.delete(code);
    }
  })();

  inflight.set(code, job);
  return job;
}

/** Finish compressing everything before an upload. Clips staged in an earlier
 *  session (a reload wiped the in-flight jobs) are started here. */
export async function ensureClipsTranscoded(
  codes: string[],
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
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

/* ── Upload (checkout, signed in) ─────────────────────────────────────────── */

/** Upload one clip to `<code>.<ext>`. Idempotent: an object that already exists
 *  (a retry after a partial checkout) counts as success. Throws on real failure
 *  so checkout can stop — a printed QR must never point at a missing clip. */
export async function uploadClip(code: string, ext: ClipExt, blob: Blob, opts: { replace?: boolean } = {}): Promise<void> {
  if (!supabaseConfigured) throw new Error('Cloud storage is not configured.');
  if (blob.size > MAX_CLIP_BYTES) {
    throw new Error(`One of your memory videos is ${Math.round(blob.size / 1024 / 1024)} MB, which is too large to upload from this device. Replace it with a shorter clip.`);
  }
  const path = clipObjectPath(code, ext);
  const { error } = await supabase.storage.from(CLIP_BUCKET).upload(path, blob, {
    contentType: clipMimeFor(ext),
    upsert: !!opts.replace,
    cacheControl: '31536000',
  });
  if (!error || isAlreadyExists(error)) return; // retry-safe
  throw new Error(`Could not upload your memory video (${error.message || 'storage error'}).`);
}

export type ClipUploadPhase = 'compress' | 'upload';
export type ClipUploadProgress = (done: number, total: number, phase: ClipUploadPhase) => void;

/* ── Single-flight ──────────────────────────────────────────────────────────
   Uploads run ONE AT A TIME app-wide. The Order page starts them the moment it
   opens (so they overlap with the customer typing an address) and the Pay tap
   starts them again as the required backstop; without this the two runs would
   race the same clips into the bucket twice. The later caller waits for the
   earlier run, then walks the set itself — finished clips are skipped, so it
   returns quickly with its OWN result (incl. `replaced`). Every waiting caller
   also hears the running caller's progress, so the Pay spinner shows real
   numbers instead of a silent wait. */
let uploadChain: Promise<unknown> = Promise.resolve();
const progressTaps = new Set<ClipUploadProgress>();
export function serializeUploads<T>(run: () => Promise<T>): Promise<T> {
  const p = uploadChain.then(run, run); // a failed earlier run never blocks the next
  uploadChain = p.catch(() => undefined);
  return p;
}
const fanOut: ClipUploadProgress = (d, t, ph) => { for (const tap of progressTaps) tap(d, t, ph); };

/** Total staged bytes for these codes (0 for anything not staged). Cheap: reads
 *  the IndexedDB records; the blobs are not copied. */
export async function stagedClipBytes(codes: string[]): Promise<number> {
  const clips = await Promise.all([...new Set(codes)].map((c) => getStagedClip(c).catch(() => null)));
  return clips.reduce((n, c) => n + (c?.size ?? 0), 0);
}

/** Compress anything still pending, then upload every staged clip referenced
 *  by these codes. Reports progress as (done, total). Skips clips already
 *  marked uploaded. Throws on the first hard failure. Serialized app-wide —
 *  see serializeUploads. */
export function uploadStagedClips(
  codes: string[],
  onProgress?: ClipUploadProgress,
): Promise<{ uploaded: string[]; replaced: string[] }> {
  if (onProgress) progressTaps.add(onProgress);
  return serializeUploads(() => runUploadStagedClips(codes, fanOut))
    .finally(() => { if (onProgress) progressTaps.delete(onProgress); });
}

/** Fire-and-forget start of the uploads (Order page open). Errors are swallowed
 *  here on purpose: the Pay tap re-runs the same set and is where a failure is
 *  shown and retried. Resolves to whether the run finished clean, and which
 *  videos are gone (neither on this phone nor in the cloud): those need the
 *  customer, not a retry or Wi-Fi. */
export function prefetchStagedClipUploads(codes: string[], onProgress?: ClipUploadProgress): Promise<{ ok: boolean; missing: string[] }> {
  if (!codes.length) return Promise.resolve({ ok: true, missing: [] });
  return uploadStagedClips(codes, onProgress).then(
    () => ({ ok: true, missing: [] }),
    (e) => {
      console.warn('[memories] early clip upload failed; the Pay tap will retry:', e);
      return { ok: false, missing: e instanceof MissingClipError ? e.codes : [] };
    });
}

/** Memory videos the album points at that are neither on this phone nor in
 *  the cloud (an expired order's video, after the phone copy was freed by the
 *  old checkout). Printing would ship a QR that plays nothing, so checkout
 *  stops and names the pages. */
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

/** Is this code's clip in the bucket right now? Asks with list(), a POST that
 *  reads Storage's own table (0034 lets the uploader see their own clips), so
 *  a removed file is gone the moment it's removed. Not exists() and not the
 *  public URL: on a public bucket those are plain reads a CDN may answer from
 *  cache after a delete (proved on a local stack: exists() even answers for
 *  another account). Throws when Storage can't answer, so checkout stops and
 *  retries rather than guessing. */
export async function clipInBucket(code: string, ext?: ClipExt): Promise<boolean> {
  if (!supabaseConfigured) throw new Error('Cloud storage is not configured.');
  const { data, error } = await supabase.storage.from(CLIP_BUCKET).list('', { search: code, limit: 20 });
  if (error) throw new Error(`Could not check your memory video (${error.message || 'storage error'}).`);
  const names = (data ?? []).map((o) => o?.name).filter((n): n is string => typeof n === 'string');
  return ext ? names.includes(clipObjectPath(code, ext)) : names.some((n) => n.startsWith(`${code}.`));
}

async function runUploadStagedClips(
  codes: string[],
  onProgress?: ClipUploadProgress,
): Promise<{ uploaded: string[]; replaced: string[] }> {
  const unique = [...new Set(codes)];
  await ensureClipsTranscoded(unique, (d, t) => onProgress?.(d, t, 'compress'));

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
      // Not on this phone: it has to be in the cloud already, or the printed
      // QR would play nothing.
      if (!(await clipInBucket(code))) missing.push(code);
      continue;
    }
    // "Uploaded" is a hint. An expired order's video is removed from the
    // cloud (0042), so check before skipping, and upload again from here.
    const needsUpload = !clip.uploaded || !(await clipInBucket(code, clip.ext));
    if (needsUpload) await uploadClip(clip.code, clip.ext, clip.blob, { replace: !!clip.replace });
    await markClipUploaded(clip.code);
    uploaded.push(clip.code);
    if (clip.replace) replaced.push(clip.code);
    onProgress?.(++done, total, 'upload');
  }
  if (missing.length) throw new MissingClipError(missing);
  return { uploaded, replaced };
}

/** The tier these codes' kept clips were encoded for: 'hd' if any is HD,
 *  'standard' if some are kept and none is, null when none is on this phone.
 *  An album's own answer, unlike currentClipQuality(), which follows whichever
 *  album was edited last (and kept clips now stay until paid, 0042). */
export async function stagedClipQuality(codes: string[]): Promise<ClipQuality | null> {
  const clips = (await Promise.all([...new Set(codes)].map((c) => getStagedClip(c)))).filter((c): c is StagedClip => !!c);
  if (!clips.length) return null;
  return clips.some((c) => c.quality === 'hd') ? 'hd' : 'standard';
}

/** The codes that are neither on this phone nor in the cloud. Checkout asks
 *  BEFORE it creates the order, so a video that's gone never leaves an unpaid
 *  order behind (each one counts toward the 3-order limit). */
export async function findMissingClips(codes: string[]): Promise<string[]> {
  const missing: string[] = [];
  for (const code of [...new Set(codes)]) {
    if (await getStagedClip(code)) continue;
    if (!(await clipInBucket(code))) missing.push(code);
  }
  return missing;
}

/** Free this phone's copies of videos whose order is PAID. Until then the copy
 *  stays, because an order that expires unpaid loses its cloud copy (0042) and
 *  a reorder uploads it again from here. Only clips already uploaded AND seen
 *  in the cloud right now, so the last copy of a video is never the one
 *  dropped (a late payment on an order whose files were already removed).
 *  Quiet on any failure (offline, 0042 not applied yet): keeping a copy is
 *  always the safe side. */
export async function freePaidStagedClips(): Promise<number> {
  if (!supabaseConfigured) return 0;
  const staged = (await Promise.all((await listStagedCodes()).map((c) => getStagedClip(c))))
    .filter((c): c is StagedClip => !!c && c.uploaded === true);
  if (!staged.length) return 0;
  try {
    const { data, error } = await supabase.rpc('my_paid_memory_codes', { p_codes: staged.slice(0, 500).map((c) => c.code) });
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
