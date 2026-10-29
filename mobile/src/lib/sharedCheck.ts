/* ══════════════════════════════════════════════════════════════════════════
   SHARED CODE CHECK: runs the website's real album code inside the app.

   Each line below calls a file from ../src (listed in sharedModules.ts) and
   writes down the answer. The "Shared code check" screen shows them on the
   phone, where the code runs on Hermes (React Native's JavaScript engine);
   test/sharedCheck.test.ts runs the same lines on a computer (Node, the
   engine the website's own tests use) and requires the answers in
   sharedCheckExpected.ts. The screen compares the phone's answers with
   those: "Same as on a computer" proves the two engines agree.

   No network, no photos from anyone: the album is made from 60 pretend
   photos (only their shapes and times), with a fixed seed so every run
   makes the same album. The prices use made-up rates (the real ones come
   from the server at checkout).
   ══════════════════════════════════════════════════════════════════════════ */
import { MIN_ALBUM_PHOTOS, addMoreLabel, albumPhotoCount, photosShortBy, tooFewToMakeMessage } from '@web/pages/builder/albumMinimum';
import { generateAlbum, isFullPagePhoto } from '@web/pages/builder/generateAlbum';
import { TEMPLATE_COUNT, getTemplatesForAlbum } from '@web/pages/builder/pageTemplates';
import { QUOTE_BANK } from '@web/pages/builder/quoteBank';
import type { AlbumPage, AlbumSizePreset, UploadedPhoto } from '@web/pages/builder/types';
import { DEFAULT_HOSTING_TIERS, SIZE_LABELS, priceBreakdown, priceOf, scheduleFrom, sheetsFor, type PricingModel } from '@web/lib/pricing';

export interface CheckLine {
  id: string;
  /** What was asked, in words. */
  label: string;
  /** The answer, as text (compared exactly with the computer's answer). */
  value: string;
}

export interface SharedCheckReport {
  lines: CheckLine[];
  /** How long making the album took here, in ms (not compared). */
  albumMs: number;
}

/** The seed for the pretend album (the website's tests use the same one). */
export const CHECK_SEED = 0x5eed;
export const CHECK_PHOTOS = 60;
export const CHECK_SIZE: AlbumSizePreset = '8x8';
const SIZES: AlbumSizePreset[] = ['8x8', '6x6', '8x6', '6x8', '6x4'];

/** mulberry32: the same small seeded random numbers as src/test/seededRandom.ts
 *  (integer math only, so every engine gives the same stream). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Runs `fn` with Math.random seeded, and always puts the real one back. */
export function withSeed<T>(seed: number, fn: () => T): T {
  const real = Math.random;
  Math.random = mulberry32(seed);
  try {
    return fn();
  } finally {
    Math.random = real;
  }
}

/** A phone roll: 3 landscapes to 2 portraits, a minute apart. No pictures,
 *  only the sizes and times the album maker reads. */
export function pretendRoll(n: number): UploadedPhoto[] {
  return Array.from({ length: n }, (_, i) => {
    const landscape = i % 5 < 3;
    return {
      id: `p${i}`, previewUrl: '', name: `p${i}.jpg`, type: 'image/jpeg', size: 1,
      width: landscape ? 4032 : 3024, height: landscape ? 3024 : 4032,
      capturedAt: 1_700_000_000_000 + i * 60_000,
    };
  });
}

/** FNV-1a, 32 bits: one short code for a whole album, so a single moved
 *  photo or changed layout shows as a different code. */
export function fingerprint(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** The parts of each page that decide what prints: layout and which photo
 *  goes in which box. */
export function albumFingerprint(pages: AlbumPage[]): string {
  return fingerprint(pages.map((p) => `${p.templateId ?? p.layout}:${(p.slotFills ?? []).map((f) => (f == null ? '-' : f)).join(',')}`).join('|'));
}

/** Made-up rates, only to run the price math (never shown as a price). */
const MADE_UP_MODEL: PricingModel = {
  sheet_cost: 10,
  soft_cover_cost: 20,
  soft_bind_cost: 30,
  min_pages: 40,
  price_multiple: 2,
  hosting_reserve: 5,
  hosting_tiers: DEFAULT_HOSTING_TIERS,
  hd_memories_price: 9,
  sizes: {
    '6x4': { pps: 16, hb: 100, surcharge: 0 },
    '8x6': { pps: 4, hb: 100, surcharge: 0 },
    '6x8': { pps: 4, hb: 100, surcharge: 0 },
    '6x6': { pps: 12, hb: 100, surcharge: 0 },
    '8x8': { pps: 4, hb: 100, surcharge: 0 },
    '11.5x8': { pps: 4, hb: 150, surcharge: 50 },
    '8.5x11': { pps: 4, hb: 150, surcharge: 50 },
  },
};

const now = () => (typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now());

export function runSharedChecks(): SharedCheckReport {
  const lines: CheckLine[] = [];
  const add = (id: string, label: string, value: string | number) => lines.push({ id, label, value: String(value) });

  // The 40-photo minimum (albumMinimum.ts).
  add('min-photos', 'Photos an album needs', MIN_ALBUM_PHOTOS);
  add('short-by', 'With 25 photos, how many more', photosShortBy(25));
  add('add-more', 'The button while short', addMoreLabel(photosShortBy(25)));
  add('too-few', 'What Megy says with 25 photos', tooFewToMakeMessage(25));

  // Sizes and prices (pricing.ts), on made-up rates.
  add('sizes', 'Album sizes', Object.values(SIZE_LABELS).join(', '));
  add('sheets', '52 pages, 4 to a sheet: sheets', sheetsFor(4, 40, 52));
  const schedule = scheduleFrom(MADE_UP_MODEL, MADE_UP_MODEL.price_multiple);
  add('price', 'Price math, 8×8 softcover, 52 pages (made-up rates)', priceOf(schedule, '8x8', 'soft', 52));
  const breakdown = priceBreakdown(schedule, '8x8', 'hard', 52, 9);
  add('breakdown', 'Price lines, 8×8 hardbound, 52 pages, 9 QR (made-up rates)', `${breakdown.items.length} lines, total ${breakdown.total}`);

  // Page layouts (pageTemplates.ts).
  add('templates', 'Page layouts in all', TEMPLATE_COUNT);
  add('templates-by-size', 'Page layouts for each size', SIZES.map((s) => `${s}: ${getTemplatesForAlbum(s).length}`).join(', '));

  // Quotes (quoteBank.ts).
  add('quotes', 'Quotes in the quote bank', Object.values(QUOTE_BANK).reduce((n, list) => n + list.length, 0));

  // Make an album (generateAlbum.ts), seeded.
  const photos = pretendRoll(CHECK_PHOTOS);
  const started = now();
  const pages = withSeed(CHECK_SEED, () => generateAlbum(photos, CHECK_SIZE, undefined, undefined));
  const albumMs = Math.round(now() - started);
  add('album', `Album made from ${CHECK_PHOTOS} pretend photos, ${CHECK_SIZE}, seed ${CHECK_SEED}`,
    `${pages.length} pages, ${pages.filter(isFullPagePhoto).length} full-page photos, ${albumPhotoCount(pages)} photos placed`);
  add('album-code', 'Album code (layouts and photo places)', albumFingerprint(pages));

  return { lines, albumMs };
}

/** Each line next to the computer's answer. `same` is false when they differ
 *  or the computer has no answer for it. */
export function compareWithExpected(lines: CheckLine[], expected: Record<string, string>): { line: CheckLine; same: boolean; expected?: string }[] {
  return lines.map((line) => ({ line, same: expected[line.id] === line.value, expected: expected[line.id] }));
}
