import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/* ══════════════════════════════════════════════════════════════════════════
   photoQuotes, the browser half of "Write a line for this photo"
   (owner, 2026-10-21). Which photos go (only that page's, only ones on this
   device, at most 4), that nothing goes without a sign-in, and that every way
   the request can end becomes words the picker can show.
   ══════════════════════════════════════════════════════════════════════════ */

const session = vi.hoisted(() => ({ token: 'user-jwt' as string | null }));
vi.mock('./supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: session.token ? { access_token: session.token } : null } }) } },
}));

import { pagePhotoUrls, writeLinesForPhotos, photoQuoteDeps, quoteBoxFor, MAX_PAGE_PHOTOS } from './photoQuotes';
import { HEIC_CONVERTING_PREVIEW } from './heicPhoto';
import type { AlbumPage, UploadedPhoto } from '../pages/builder/types';

const photo = (i: number, previewUrl = `blob:x/${i}`) => ({ id: `p${i}`, previewUrl, name: `IMG_${i}.jpg`, type: 'image/jpeg', size: 1, width: 4000, height: 3000 }) as UploadedPhoto;
const page = (slotFills: (number | null)[], textSlotFills: (number | null)[] = []) => ({ slotFills, textSlotFills } as unknown as AlbumPage);

describe('pagePhotoUrls: which photos go (ALL the page has, for a line about the page)', () => {
  const photos = [photo(0), photo(1), photo(2, ''), photo(3, HEIC_CONVERTING_PREVIEW), photo(4), photo(5), photo(6), photo(7), photo(8), photo(9)];
  it('a 6-photo layout sends all 6', () => {
    expect(MAX_PAGE_PHOTOS).toBe(6);
    expect(pagePhotoUrls(page([0, 1, 4, 5, 6, 7]), photos)).toEqual(['blob:x/0', 'blob:x/1', 'blob:x/4', 'blob:x/5', 'blob:x/6', 'blob:x/7']);
  });
  it("this page's photo frames, then its caption-box photos, each once", () => {
    expect(pagePhotoUrls(page([1, 0, 1], [4, 0]), photos)).toEqual(['blob:x/1', 'blob:x/0', 'blob:x/4']);
  });
  it('leaves out a photo not on this device and one still turning from HEIC', () => {
    expect(pagePhotoUrls(page([2, 3, 5]), photos)).toEqual(['blob:x/5']);
  });
  it('never more than 6 (frames + caption-box photos); empty frames and no page give none', () => {
    expect(pagePhotoUrls(page([0, 1, 4, 5, 6, 7], [8, 9]), photos)).toHaveLength(MAX_PAGE_PHOTOS);
    expect(pagePhotoUrls(page([null, null]), photos)).toEqual([]);
    expect(pagePhotoUrls(null, photos)).toEqual([]);
  });
});

describe('writeLinesForPhotos', () => {
  let sent: { url: string; init: RequestInit }[];
  const answer = (status: number, body: unknown) => vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    sent.push({ url, init });
    return { status, ok: status >= 200 && status < 300, json: async () => body } as Response;
  }));
  beforeEach(() => {
    sent = [];
    session.token = 'user-jwt';
    vi.spyOn(photoQuoteDeps, 'shrink').mockImplementation(async (u: string) => `small:${u}`);
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it('signed out: nothing is shrunk or sent', async () => {
    session.token = null;
    answer(200, { lines: ['x'] });
    expect(await writeLinesForPhotos(['blob:x/0'], 'Trip')).toEqual({ error: 'sign_in' });
    expect(sent).toHaveLength(0);
    expect(photoQuoteDeps.shrink).not.toHaveBeenCalled();
  });
  it('sends the SHRUNK copies with the sign-in token, the theme and the lines already offered', async () => {
    answer(200, { lines: ['Making each other laugh', 'Riding the train together', 'A castle at night'], left: 12 });
    const r = await writeLinesForPhotos(['blob:x/0', 'blob:x/1'], 'Hong Kong trip', ['Old line']);
    expect(r).toEqual({ lines: ['Making each other laugh', 'Riding the train together', 'A castle at night'], left: 12 });
    expect(sent[0].url).toBe('/api/photo-quotes');
    expect((sent[0].init.headers as Record<string, string>).Authorization).toBe('Bearer user-jwt');
    expect(JSON.parse(String(sent[0].init.body))).toEqual({ photos: ['small:blob:x/0', 'small:blob:x/1'], theme: 'Hong Kong trip', avoid: ['Old line'] });
  });
  it("sends the box's room when there is one; without it, the server's caption cap applies", async () => {
    answer(200, { lines: ['A line'] });
    await writeLinesForPhotos(['blob:x/0'], 'Trip', [], 100);
    expect(JSON.parse(String(sent[0].init.body)).maxChars).toBe(100);
    await writeLinesForPhotos(['blob:x/0'], 'Trip');
    expect(JSON.parse(String(sent[1].init.body))).not.toHaveProperty('maxChars');
  });
  it('every other ending has a name the picker has words for', async () => {
    answer(401, { error: 'sign_in' });
    expect(await writeLinesForPhotos(['blob:x/0'], '')).toEqual({ error: 'sign_in' });
    answer(429, { error: 'limit_user' });
    expect(await writeLinesForPhotos(['blob:x/0'], '')).toEqual({ error: 'limit_user' });
    answer(429, { error: 'limit_all' });
    expect(await writeLinesForPhotos(['blob:x/0'], '')).toEqual({ error: 'limit_all' });
    answer(200, { lines: [], reason: 'refused' });
    expect(await writeLinesForPhotos(['blob:x/0'], '')).toEqual({ error: 'refused' });
    answer(502, { error: 'failed' });
    expect(await writeLinesForPhotos(['blob:x/0'], '')).toEqual({ error: 'failed' });
    answer(200, { lines: [] });
    expect(await writeLinesForPhotos(['blob:x/0'], '')).toEqual({ error: 'failed' });
  });
  it('a photo that cannot be read, or no network, is "failed", never a crash', async () => {
    vi.spyOn(photoQuoteDeps, 'shrink').mockRejectedValue(new Error('decode'));
    answer(200, { lines: ['x'] });
    expect(await writeLinesForPhotos(['blob:x/0'], '')).toEqual({ error: 'failed' });
    vi.spyOn(photoQuoteDeps, 'shrink').mockResolvedValue('small');
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline'); }));
    expect(await writeLinesForPhotos(['blob:x/0'], '')).toEqual({ error: 'failed' });
  });
});

describe('quoteBoxFor: the box a line is written for, and the style it prints in', () => {
  const pg = (textElements: unknown[]) => ({ templateId: 't88-fb-sq-box-tl-gap', slotFills: [0, 1, 2], textElements } as unknown as AlbumPage);
  it("the line already in the box sets the style (its font and size print the new line)", () => {
    const q = quoteBoxFor(pg([{ boxIndex: 0, text: 'x', fontSize: 34, fontFamily: 'Lora, serif', bold: true }]), 0, '8x8', 2)!;
    expect(q.box.w).toBeGreaterThan(0);
    expect(q.style).toEqual({ fontSize: 34, fontFamily: 'Lora, serif', bold: true, italic: true });
  });
  it("an empty box: a picked quote's default, size 28 italic", () => {
    expect(quoteBoxFor(pg([]), 0, '8x8', 2)!.style).toEqual({ fontSize: 28, fontFamily: '"Playfair Display", serif', bold: false, italic: true });
  });
  it('no page, or no such box: null (the caption cap applies)', () => {
    expect(quoteBoxFor(null, 0, '8x8', 2)).toBeNull();
    expect(quoteBoxFor(pg([]), 5, '8x8', 2)).toBeNull();
  });
});
