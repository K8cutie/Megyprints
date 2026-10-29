/* ══════════════════════════════════════════════════════════════════════════
   "WRITE A LINE FOR THIS PHOTO" FROM THE APP (the website's lib/photoQuotes,
   which is a browser file: it shrinks photos with a canvas and calls its own
   site by a relative address).

   Same rules as the website, same answers:
     • only for a signed-in account (the endpoint costs money per tap; a
       signed-out tap asks for the sign-in and sends nothing);
     • ALL the photos on the page that are on this phone, frames first, then
       caption boxes, each once, at most 6;
     • each sent as a small JPEG (512 px on its longest side, made by the
       phone: modules/photo-files drawableCopy), nothing kept;
     • written for the room the box has (textFit.quoteRoom, measured with
       the phone's fonts), then offered only if it fits.
   The app has no site of its own, so it calls the website's endpoint by its
   full address (PHOTO_QUOTES_URL). Tests and walks never call it: every
   piece that reaches out (the sign-in token, the photo copies, fetch) is
   handed in, and the tests hand in fakes.
   ══════════════════════════════════════════════════════════════════════════ */
import type { AlbumPage, UploadedPhoto } from '@web/pages/builder/types';
import { photoIsHere } from '@web/lib/photoPresence';

/** The website's endpoint, by its full address (the app has no site of its own). */
export const PHOTO_QUOTES_URL = 'https://megyprints.vercel.app/api/photo-quotes';
/** The endpoint takes 1–6 photos (api/photo-quotes.mjs MAX_PHOTOS). */
export const MAX_PAGE_PHOTOS = 6;
/** Longest side of the copy that is sent (lib/photoQuotes PHOTO_QUOTE_PX). */
export const PHOTO_QUOTE_PX = 512;

/** ALL the photos ON this page that are on this phone (lib/photoQuotes
 *  pagePhotoUrls): frames first, then caption boxes; each once, at most 6. */
export function pagePhotoUris(page: AlbumPage | null | undefined, photos: readonly UploadedPhoto[]): string[] {
  if (!page) return [];
  const seen = new Set<number>();
  const out: string[] = [];
  for (const f of [...(page.slotFills ?? []), ...(page.textSlotFills ?? [])]) {
    if (typeof f !== 'number' || f < 0 || seen.has(f)) continue;
    seen.add(f);
    const p = photos[f];
    if (!photoIsHere(p)) continue;
    out.push(p.previewUrl);
    if (out.length >= MAX_PAGE_PHOTOS) break;
  }
  return out;
}

export type PhotoQuotesResult =
  | { lines: string[]; left?: number }
  | { error: 'sign_in' | 'limit_user' | 'limit_all' | 'refused' | 'failed' };

export interface PhotoQuoteDeps {
  /** The signed-in account's access token, or null (signed out). */
  token(): Promise<string | null>;
  /** A photo (by its address on the phone) as a small JPEG, base64, no data: prefix. */
  shrink(uri: string): Promise<string>;
  fetch(url: string, init: { method: 'POST'; headers: Record<string, string>; body: string }): Promise<{ status: number; ok: boolean; json(): Promise<unknown> }>;
}

/** Ask for lines written for these photos (lib/photoQuotes writeLinesForPhotos,
 *  answer for answer). Never throws. */
export async function writeLinesForPhotos(deps: PhotoQuoteDeps, uris: string[], theme: string, avoid: string[] = [], maxChars?: number): Promise<PhotoQuotesResult> {
  const token = await deps.token().catch(() => null);
  if (!token) return { error: 'sign_in' };
  try {
    const photos = await Promise.all(uris.slice(0, MAX_PAGE_PHOTOS).map((u) => deps.shrink(u)));
    const r = await deps.fetch(PHOTO_QUOTES_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ photos, theme, avoid, ...(maxChars ? { maxChars } : {}) }),
    });
    const body = (await r.json().catch(() => ({}))) as { error?: unknown; reason?: unknown; lines?: unknown; left?: unknown };
    if (r.status === 401) return { error: 'sign_in' };
    if (r.status === 429) return { error: body.error === 'limit_all' ? 'limit_all' : 'limit_user' };
    if (!r.ok) return { error: 'failed' };
    if (body.reason === 'refused') return { error: 'refused' };
    const lines = Array.isArray(body.lines) ? body.lines.filter((l: unknown): l is string => typeof l === 'string') : [];
    return lines.length ? { lines, left: typeof body.left === 'number' ? body.left : undefined } : { error: 'failed' };
  } catch {
    return { error: 'failed' };
  }
}
