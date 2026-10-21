/* ══════════════════════════════════════════════════════════════════════════
   photoQuotes — "Write a line for this photo" (owner, 2026-10-21).
   The quote picker's lines are written for the album's occasion; these are
   written for the photos on the page. Claude Haiku looks at small copies and
   writes lines; api/photo-quotes.mjs keeps the 3 the album may print.

   The ONE time a photo leaves the device while designing, and only on that tap:
   each photo is shrunk to 512 px here first (~350 tokens to Haiku, ~₱0.02 a
   tap), and nothing is kept on the way (Privacy.tsx). Signed in only: the
   endpoint costs money per tap.
   ══════════════════════════════════════════════════════════════════════════ */

import type { AlbumPage, AlbumSizePreset, UploadedPhoto } from '../pages/builder/types';
import { captionBoxSize, type Box, type CaptionStyle } from '../pages/builder/textFit';
import { HEIC_CONVERTING_PREVIEW } from './heicPhoto';
import { photoIsHere } from './photoPresence';
import { supabase } from './supabase';

/** The endpoint takes 1–6 photos (api/photo-quotes.mjs MAX_PHOTOS): every
 *  frame the busiest layout has. The line is for the PAGE (owner, 2026-10-21:
 *  "the quote should actually base it on the photo/s on the page"). */
export const MAX_PAGE_PHOTOS = 6;
/** Longest side of the copy that is sent. */
export const PHOTO_QUOTE_PX = 512;

/** ALL the photos ON this page that are on this device: photo frames first,
 *  then photos in caption boxes; each once, at most 6. A photo still turning
 *  from HEIC into JPEG has no picture yet, so it's left out. */
export function pagePhotoUrls(page: AlbumPage | null | undefined, photos: UploadedPhoto[]): string[] {
  if (!page) return [];
  const seen = new Set<number>();
  const urls: string[] = [];
  for (const f of [...(page.slotFills ?? []), ...(page.textSlotFills ?? [])]) {
    if (typeof f !== 'number' || f < 0 || seen.has(f)) continue;
    seen.add(f);
    const p = photos[f];
    if (!photoIsHere(p) || p.previewUrl === HEIC_CONVERTING_PREVIEW) continue;
    urls.push(p.previewUrl);
    if (urls.length >= MAX_PAGE_PHOTOS) break;
  }
  return urls;
}

/** The quote box a line is written for, and the style its line prints in: the
 *  line already there, or a picked quote's default (size 28, italic). The
 *  picker sizes the lines to it (textFit.quoteRoom) and checks they fit. */
export interface QuoteBox { box: Box; style: CaptionStyle }
export function quoteBoxFor(page: AlbumPage | null | undefined, boxIndex: number, albumSize: AlbumSizePreset, pageIndex: number): QuoteBox | null {
  if (!page) return null;
  const box = captionBoxSize(page, boxIndex, albumSize, pageIndex);
  if (!box) return null;
  const t = page.textElements?.find((e) => e.boxIndex === boxIndex);
  return { box, style: { fontSize: t?.fontSize ?? 28, fontFamily: t?.fontFamily ?? '"Playfair Display", serif', bold: t?.bold ?? false, italic: true } };
}

/** A photo as a small JPEG, base64 without the data: prefix. */
export async function shrinkPhoto(url: string, max = PHOTO_QUOTE_PX): Promise<string> {
  const img = new Image();
  img.decoding = 'async';
  img.src = url;
  await img.decode();
  const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.naturalWidth * k));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * k));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no canvas');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.8).replace(/^data:image\/jpeg;base64,/, '');
}

/** Spy-able in specs (jsdom can't decode an image), like heicConverters. */
export const photoQuoteDeps = { shrink: shrinkPhoto };

export type PhotoQuotesResult =
  | { lines: string[]; left?: number }
  | { error: 'sign_in' | 'limit_user' | 'limit_all' | 'refused' | 'failed' };

/** Ask for lines written for these photos, at most `maxChars` long (the room
 *  of the box they're for, textFit.quoteRoom). Never throws: every way it can
 *  end is a result the picker has words for. */
export async function writeLinesForPhotos(urls: string[], theme: string, avoid: string[] = [], maxChars?: number): Promise<PhotoQuotesResult> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { error: 'sign_in' };
  try {
    const photos = await Promise.all(urls.slice(0, MAX_PAGE_PHOTOS).map((u) => photoQuoteDeps.shrink(u)));
    const r = await fetch('/api/photo-quotes', {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ photos, theme, avoid, ...(maxChars ? { maxChars } : {}) }),
    });
    const body = await r.json().catch(() => ({}));
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
