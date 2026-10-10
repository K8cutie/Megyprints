/* ══════════════════════════════════════════════════════════════════════════
   The guest camera (0044). A guest scans the QR on their table, joins with
   their name — no account, no app — and shares photos and short videos into
   the event. The database is the guard (who's a guest, how many each, which
   files may upload); this is the phone's side.

   The phone keeps the guest's token per event in localStorage (the database
   keeps only its hash). Uploads go straight to Storage: event_media_begin()
   names the files, the phone uploads exactly those, event_media_ready()
   checks they all landed.
   ══════════════════════════════════════════════════════════════════════════ */

import { supabase, supabaseConfigured } from './supabase';
import { makePhotoCopies, videoFacts } from './eventImage';
import { transcodeSupported, transcodeToMp4 } from './videoTranscode';

/** event_photos_per_guest() / event_videos_per_guest() in 0044. */
export const EVENT_PHOTOS_PER_GUEST = 20;
export const EVENT_VIDEOS_PER_GUEST = 2;
/** A guest's video, on this side (the database can't measure a video). */
export const EVENT_VIDEO_MAX_SECONDS = 30;
/** The event-media bucket's limit (0044). */
export const EVENT_VIDEO_MAX_BYTES = 50 * 1024 * 1024;
/** Videos bigger than this are shrunk on the phone first, where it can. */
export const EVENT_VIDEO_SHRINK_OVER = 20 * 1024 * 1024;

export type MediaKind = 'photo' | 'video';
export type VideoExt = 'mp4' | 'mov' | 'webm';

export interface EventPublic {
  title: string;
  event_type: string;
  event_date: string;
  kids_on: boolean;
  open: boolean;
  opens_on: string;
  closes_on: string;
  photos_per_guest: number;
  videos_per_guest: number;
  tables: number | null;
}

export interface GuestPass { token: string; guestId: string; name: string; table: number | null }

export interface FeedItem {
  id: string;
  booking_id: string;
  kind: MediaKind;
  ext: string;
  guest_name: string | null;
  table_no: number | null;
  ready_at: string;
  mine: boolean;
  hidden: boolean;
  width: number | null;
  height: number | null;
}

type DbError = { code?: string; message?: string } | null;
/** The database's own sentences (EV0xx) go to the guest as they are. */
export function cameraErrorMessage(error: DbError): string {
  if (!error) return '';
  if (error.code && /^EV\d{3}$/.test(error.code) && error.message) return error.message;
  return error.message || 'Something went wrong. Please try again.';
}

// ── Links ─────────────────────────────────────────────────────────────────

const appOrigin = () => (typeof window !== 'undefined' ? window.location.origin : 'https://megyprints.vercel.app');

/** The link on a table card (HashRouter: the route lives after #). */
export const guestLink = (code: string, table?: number | null, origin: string = appOrigin()) =>
  `${origin}/#/e/${code}${table ? `?t=${table}` : ''}`;

export const screenLink = (code: string, key: string, origin: string = appOrigin()) =>
  `${origin}/#/e/${code}/screen?k=${key}`;

/** A file in the public event-media bucket. */
export function eventMediaUrl(bookingId: string, mediaId: string, variant: 'view' | 'thumb' | 'video', ext = 'mp4'): string {
  const name = variant === 'view' ? `${bookingId}/${mediaId}-v.jpg`
    : variant === 'thumb' ? `${bookingId}/${mediaId}-t.jpg`
      : `${bookingId}/${mediaId}.${ext}`;
  return supabase.storage.from('event-media').getPublicUrl(name).data.publicUrl;
}

/** The print master's name in the private bucket (the host downloads it). */
export const originalName = (bookingId: string, mediaId: string) => `${bookingId}/${mediaId}.jpg`;

// ── The pass this phone holds ─────────────────────────────────────────────

const passKey = (code: string) => `megy-event-guest:${code}`;

export function readPass(code: string): GuestPass | null {
  try {
    const raw = localStorage.getItem(passKey(code));
    if (!raw) return null;
    const p = JSON.parse(raw) as GuestPass;
    return p && typeof p.token === 'string' && typeof p.guestId === 'string' ? p : null;
  } catch {
    return null;
  }
}

export function savePass(code: string, pass: GuestPass) {
  try { localStorage.setItem(passKey(code), JSON.stringify(pass)); } catch { /* private mode: they rejoin next time */ }
}

export function forgetPass(code: string) {
  try { localStorage.removeItem(passKey(code)); } catch { /* nothing to forget */ }
}

// ── The database ──────────────────────────────────────────────────────────

export async function eventPublic(code: string): Promise<EventPublic | null> {
  if (!supabaseConfigured) return null;
  const { data, error } = await supabase.rpc('event_public', { p_code: code });
  if (error) throw new Error(cameraErrorMessage(error));
  return (data as EventPublic | null) ?? null;
}

export async function joinEvent(code: string, name: string, table: number | null, kidsOk: boolean): Promise<GuestPass> {
  const { data, error } = await supabase.rpc('event_join', { p_code: code, p_name: name.trim(), p_table: table, p_kids_ok: kidsOk });
  if (error) throw new Error(cameraErrorMessage(error));
  const d = data as { guest_id: string; token: string };
  const pass: GuestPass = { token: d.token, guestId: d.guest_id, name: name.trim(), table };
  savePass(code, pass);
  return pass;
}

export interface GuestMe { guest_id: string; name: string; table_no: number | null; photos: number; videos: number }

/** Null: this phone's pass no longer works (removed by the host, or unknown). */
export async function guestMe(code: string, token: string): Promise<GuestMe | null> {
  const { data, error } = await supabase.rpc('event_me', { p_code: code, p_token: token });
  if (error) throw new Error(cameraErrorMessage(error));
  return (data as GuestMe | null) ?? null;
}

export async function eventFeed(code: string, token: string, before?: string | null, limit = 40): Promise<FeedItem[]> {
  const { data, error } = await supabase.rpc('event_feed', { p_code: code, p_token: token, p_before: before ?? null, p_limit: limit });
  if (error) throw new Error(cameraErrorMessage(error));
  return (data ?? []) as FeedItem[];
}

export async function deleteMyMedia(code: string, token: string, mediaId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('event_media_delete', { p_code: code, p_token: token, p_media_id: mediaId });
  if (error) throw new Error(cameraErrorMessage(error));
  return data === true;
}

// ── Sharing a photo or video ──────────────────────────────────────────────

interface Begun { media_id: string; booking_id: string; objects: { bucket: string; name: string }[] }

async function begin(code: string, token: string, kind: MediaKind, ext: string, facts: { bytes: number; width?: number; height?: number; durationS?: number }): Promise<Begun> {
  const { data, error } = await supabase.rpc('event_media_begin', {
    p_code: code, p_token: token, p_kind: kind, p_ext: ext,
    p_bytes: facts.bytes, p_width: facts.width ?? null, p_height: facts.height ?? null,
    p_duration: facts.durationS != null ? Math.round(facts.durationS * 100) / 100 : null,
  });
  if (error) throw new Error(cameraErrorMessage(error));
  return data as Begun;
}

async function put(bucket: string, name: string, body: Blob, contentType: string) {
  // Create-only: a retry that finds the file already there counts as done.
  const { error } = await supabase.storage.from(bucket).upload(name, body, { contentType, upsert: false, cacheControl: '31536000' });
  if (error && !/already exists|duplicate/i.test(error.message || '')) {
    throw new Error('Your upload stopped. Check your connection and try again.');
  }
}

async function ready(code: string, token: string, mediaId: string) {
  const { data, error } = await supabase.rpc('event_media_ready', { p_code: code, p_token: token, p_media_id: mediaId });
  if (error) throw new Error(cameraErrorMessage(error));
  if (data !== true) throw new Error('Your upload didn’t finish. Try again.');
}

export type ShareStage = 'preparing' | 'uploading' | 'done';

export async function sharePhoto(code: string, token: string, file: File, onStage?: (s: ShareStage) => void): Promise<string> {
  onStage?.('preparing');
  const c = await makePhotoCopies(file);
  const b = await begin(code, token, 'photo', 'jpg', { bytes: c.original.size, width: c.width, height: c.height });
  onStage?.('uploading');
  const body: Record<string, Blob> = {
    [`${b.booking_id}/${b.media_id}.jpg`]: c.original,
    [`${b.booking_id}/${b.media_id}-v.jpg`]: c.view,
    [`${b.booking_id}/${b.media_id}-t.jpg`]: c.thumb,
  };
  for (const o of b.objects) await put(o.bucket, o.name, body[o.name], 'image/jpeg');
  await ready(code, token, b.media_id);
  onStage?.('done');
  return b.media_id;
}

const videoExtOf = (file: { type?: string; name?: string }): VideoExt | null => {
  const t = (file.type || '').toLowerCase();
  if (t === 'video/mp4') return 'mp4';
  if (t === 'video/quicktime') return 'mov';
  if (t === 'video/webm') return 'webm';
  const m = /\.(mp4|mov|webm|m4v)$/i.exec(file.name || '');
  if (!m) return null;
  const e = m[1].toLowerCase();
  return e === 'm4v' ? 'mp4' : (e as VideoExt);
};
const VIDEO_MIME: Record<VideoExt, string> = { mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm' };

/** What's wrong with a video before anything uploads ('' = fine). */
export function videoProblem(file: { type?: string; name?: string; size: number }, durationS: number | null): string {
  if (!videoExtOf(file)) return 'That video type won’t play everywhere. Use an MP4 or MOV from your camera.';
  if (durationS != null && durationS > EVENT_VIDEO_MAX_SECONDS + 0.5) {
    return `Videos here are up to ${EVENT_VIDEO_MAX_SECONDS} seconds. Trim it in your gallery, then add it again.`;
  }
  return '';
}

export async function shareVideo(code: string, token: string, file: File, onStage?: (s: ShareStage) => void): Promise<string> {
  onStage?.('preparing');
  const facts = await videoFacts(file);
  const bad = videoProblem(file, facts.durationS);
  if (bad) throw new Error(bad);
  let body: Blob = file;
  let ext = videoExtOf(file)!;
  if (file.size > EVENT_VIDEO_SHRINK_OVER && transcodeSupported()) {
    try { body = (await transcodeToMp4(file, 'standard')).blob; ext = 'mp4'; } catch { /* keep the original */ }
  }
  if (body.size > EVENT_VIDEO_MAX_BYTES) {
    throw new Error('That video is too big to share here. Try a shorter one.');
  }
  const b = await begin(code, token, 'video', ext, { bytes: body.size, width: facts.width, height: facts.height, durationS: facts.durationS });
  onStage?.('uploading');
  for (const o of b.objects) {
    if (o.name.endsWith('-t.jpg')) await put(o.bucket, o.name, facts.thumb, 'image/jpeg');
    else await put(o.bucket, o.name, body, VIDEO_MIME[ext]);
  }
  await ready(code, token, b.media_id);
  onStage?.('done');
  return b.media_id;
}

/** "Mon DD" for the guest page's dates (Manila calendar dates, as stored). */
export function shortDate(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
}
