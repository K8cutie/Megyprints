/* ── Hosted living-memory CLIPS ────────────────────────────────────────────
   A QR memory used to be a pasted link (YouTube etc.), which meant uploading
   the video elsewhere first, copying a link, and signing in mid-build — nine
   steps per QR. Now the customer picks a video from their phone:

     pick file → validated (duration/size) → STAGED locally in IndexedDB under
     the QR's code → QR placed at once (no sign-in) → at CHECKOUT, where sign-in
     already lives, every staged clip uploads to the public `memory-clips`
     bucket at `<code>.<ext>` and its memory row is created with the paid term.

   The printed QR still encodes /m/<code>; the resolver plays the clip on the
   branded page. Photos never leave the device — a memory clip must, because
   strangers scanning a printed page have to reach it. That is the one
   deliberate exception, and only at checkout.

   Pure helpers (caps, extension mapping, URL builders) live at the top so they
   can be unit-tested in node; the IndexedDB + storage I/O sits below. */
import { supabase, supabaseConfigured } from './supabase';
import { getPriceSchedule } from './storeSettings';

/* ── Caps (owner, 2026-09-09). Also enforced by the bucket's file_size_limit
   and allowed_mime_types (migration 0030) — the client check is UX. ────── */
export const MAX_CLIP_SECONDS = 60;
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

/** Pure part of validation — testable without a DOM. */
export function checkClipMeta(meta: { size: number; durationSec: number | null; ext: ClipExt | null }):
  { ok: true } | { ok: false; error: string } {
  if (!meta.ext) return { ok: false, error: 'Please choose a video file (MP4, MOV, WebM or M4V).' };
  if (meta.size > MAX_CLIP_BYTES) {
    return { ok: false, error: `That video is ${Math.round(meta.size / 1024 / 1024)} MB — the limit is ${MAX_CLIP_BYTES / 1024 / 1024} MB. Trim it or record a shorter one.` };
  }
  if (meta.durationSec != null && meta.durationSec > MAX_CLIP_SECONDS + 0.5) {
    return { ok: false, error: `That video is ${Math.round(meta.durationSec)} seconds — memories are up to ${MAX_CLIP_SECONDS} seconds. Trim it to the best moment.` };
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
  /** Set once the clip is in the bucket (kept until the order completes so a
   *  retry never re-uploads a finished clip). */
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

export async function stageClip(clip: Omit<StagedClip, 'stagedAt'>): Promise<void> {
  await withStore('readwrite', (s) => s.put({ ...clip, stagedAt: Date.now() } satisfies StagedClip));
}

export async function getStagedClip(code: string): Promise<StagedClip | null> {
  try { return (await withStore<StagedClip | undefined>('readonly', (s) => s.get(code))) ?? null; }
  catch { return null; }
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

/* ── Upload (checkout, signed in) ─────────────────────────────────────────── */

/** Upload one clip to `<code>.<ext>`. Idempotent: an object that already exists
 *  (a retry after a partial checkout) counts as success. Throws on real failure
 *  so checkout can stop — a printed QR must never point at a missing clip. */
export async function uploadClip(code: string, ext: ClipExt, blob: Blob, opts: { replace?: boolean } = {}): Promise<void> {
  if (!supabaseConfigured) throw new Error('Cloud storage is not configured.');
  const path = clipObjectPath(code, ext);
  const { error } = await supabase.storage.from(CLIP_BUCKET).upload(path, blob, {
    contentType: clipMimeFor(ext),
    upsert: !!opts.replace,
    cacheControl: '31536000',
  });
  if (!error) return;
  const msg = (error as { message?: string; statusCode?: string | number }).message || '';
  const status = String((error as { statusCode?: string | number }).statusCode ?? '');
  if (status === '409' || /already exists|duplicate/i.test(msg)) return; // retry-safe
  throw new Error(`Could not upload your memory video (${msg || 'storage error'}).`);
}

/** Upload every staged clip referenced by these fills. Reports progress as
 *  (done, total). Skips clips already marked uploaded. Throws on the first
 *  hard failure. Returns the codes it uploaded or confirmed. */
export async function uploadStagedClips(
  codes: string[],
  onProgress?: (done: number, total: number) => void,
): Promise<{ uploaded: string[]; replaced: string[] }> {
  const unique = [...new Set(codes)];
  const staged = (await Promise.all(unique.map((c) => getStagedClip(c)))).filter((c): c is StagedClip => !!c);
  const total = staged.length;
  let done = 0;
  onProgress?.(0, total);
  const uploaded: string[] = [];
  const replaced: string[] = [];
  for (const clip of staged) {
    if (!clip.uploaded) await uploadClip(clip.code, clip.ext, clip.blob, { replace: !!clip.replace });
    await markClipUploaded(clip.code);
    uploaded.push(clip.code);
    if (clip.replace) replaced.push(clip.code);
    done++;
    onProgress?.(done, total);
  }
  return { uploaded, replaced };
}
