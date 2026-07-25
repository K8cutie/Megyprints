import type { PageTemplate, TemplateMargin, TextSlot, AlbumSizePreset } from './types';
import type { PhotoRatio } from './photoAnalyzer';
import { fill, ALBUM_INCHES, gutterFrac } from './templateKit';

/** ══════════════════════════════════════════════════════════════════════════
 *  4:3 RECT ALBUM LAYOUTS — one builder for 8×6 (landscape) and 6×8 (portrait).
 *
 *  6×8 IS 8×6 ROTATED, so every layout is authored ONCE in landscape terms and
 *  transposed for the portrait size: the axes swap and each ratio flips
 *  (4:3↔3:4, 3:2↔2:3, 16:9↔9:16). Add a shape here and both sizes get it.
 *
 *  ── House rules ───────────────────────────────────────────────────────────
 *  • FULL BLEED always — every layout tiles the whole 8.00 × 6.00" sheet, no
 *    margins. Nothing is wasted.
 *  • A 1mm printed GUTTER between adjacent photos (never between a photo and a
 *    combo box — the box reads as part of the page, not a neighbouring photo).
 *  • MAX 3 photos per page.
 *  • Every frame's short side ≥ 2.00" (the print floor), and every frame lands
 *    on a real camera ratio — exactly where the geometry allows, otherwise
 *    within a few percent (crop budget is 16%; nothing here exceeds ~4%).
 *
 *  ── Why these shapes, and what is deliberately absent ─────────────────────
 *  Splits of the SHORT side fail on their own: two 8×3 cells are 8:3 and three
 *  8×2 are 4:1 — no camera ratio, so they would crop a third off every photo.
 *  Three equal COLUMNS are 4:9 (2.67×6), narrower than 9:16, so they fail too.
 *
 *  A combo box RESCUES both cases by shortening the photo band: the same three
 *  columns over a 1.5" box are 2.64×4.5 = 9:16, and two rows beside a 2.67"
 *  box are 5.33×2.98 = 16:9. That is why the denser shapes here all carry a box
 *  — it is what makes them printable, not decoration.
 *
 *  A full-bleed SINGLE must match the page aspect (cropSafe tests whether the
 *  slot covers the whole sheet), which is why "Full Page" is 4:3 / 3:4.
 *  ══════════════════════════════════════════════════════════════════════════ */

const ZERO: TemplateMargin = { top: 0, bottom: 0, left: 0, right: 0 };
const PREFIX: Record<string, string> = { '8x6': 't86', '6x8': 't68' };

/** Rotating the page rotates every photo in it. */
const FLIP: Record<PhotoRatio, PhotoRatio> = {
  '4:3': '3:4', '3:4': '4:3', '3:2': '2:3', '2:3': '3:2', '16:9': '9:16', '9:16': '16:9', '1:1': '1:1',
};

const orientOf = (r: PhotoRatio): PageTemplate['orientation'] =>
  r === '3:2' || r === '4:3' || r === '16:9' ? 'landscape' : r === '1:1' ? 'square' : 'portrait';

/** Both names for a layout: how it reads on the landscape page, and on the
 *  portrait one (where the same composition stands up on its end). */
interface Names { land: string; port: string }

export function buildRectTemplates(size: AlbumSizePreset): PageTemplate[] {
  const idp = PREFIX[size] ?? 't' + size.replace(/\D/g, '');
  const id = (suffix: string) => `${idp}-${suffix}`;
  const landscape = ALBUM_INCHES[size].w > ALBUM_INCHES[size].h;
  const long = Math.max(ALBUM_INCHES[size].w, ALBUM_INCHES[size].h);   // 8"
  const short = Math.min(ALBUM_INCHES[size].w, ALBUM_INCHES[size].h);  // 6"

  /** The shared photo gutter, per axis, so it prints the same width on both. */
  const gA = gutterFrac(long);
  const gB = gutterFrac(short);

  const R = (r: PhotoRatio) => (landscape ? r : FLIP[r]);
  /** Place a rect in PAGE fractions. `a` runs along the LONG side of the page,
   *  `b` along the SHORT side; the portrait size gets the transpose for free. */
  const rect = (a: number, b: number, aLen: number, bLen: number, ratio: PhotoRatio) =>
    (landscape ? fill(a, b, aLen, bLen, R(ratio)) : fill(b, a, bLen, aLen, R(ratio)));
  const box = (a: number, b: number, aLen: number, bLen: number, i = 0): TextSlot => ({
    id: i === 0 ? 'combo' : `combo-${i}`,
    x: landscape ? a : b, y: landscape ? b : a,
    width: landscape ? aLen : bLen, height: landscape ? bLen : aLen,
    align: 'center', placeholder: 'Tap to add',
  });

  const tmpl = (
    suffix: string, names: Names, category: PageTemplate['category'],
    targetRatio: PhotoRatio, slots: PageTemplate['slots'], textSlots?: TextSlot[],
  ): PageTemplate => ({
    id: id(suffix), name: landscape ? names.land : names.port, category,
    slotCount: slots.length, margin: ZERO, orientation: orientOf(R(targetRatio)),
    targetRatio: R(targetRatio), albumSizes: [size], fullBleed: true, slots,
    ...(textSlots ? { textSlots } : {}),
  });

  // Split fractions used repeatedly.
  const halfA = 1 / 2 - gA / 2, secondA = 1 / 2 + gA / 2; // long-side halves
  const halfB = 1 / 2 - gB / 2, secondB = 1 / 2 + gB / 2; // short-side halves
  const BIG = 4.5 / 8;              // 4.5" of the 8" long side → an exact 3:4
  const BOX_BAND = 1.5 / 6;         // 1.5" caption band off the short side
  const PHOTO_BAND = 1 - BOX_BAND;  // 4.5" of photo above it
  const THIRD = 2 / 3;              // 5.33" photo column beside a 2.67" box
  const col3 = (1 - 2 * gA) / 3;    // one of three columns, gutters removed

  return [
    /* ── 1 photo ─────────────────────────────────────────────────────────── */
    // The whole sheet. Only crop-safe full-bleed single (matches page aspect).
    tmpl('fb-solo', { land: 'Full Page', port: 'Full Page' }, 'single', '4:3',
      [rect(0, 0, 1, 1, '4:3')]),

    // 4.5" photo at an EXACT 3:4, the 3.46" remainder is the combo box.
    tmpl('fb-solo-box-second', { land: 'Portrait + Box Right', port: 'Landscape + Box Below' }, 'single', '3:4',
      [rect(0, 0, BIG, 1, '3:4')], [box(BIG, 0, 1 - BIG, 1)]),
    tmpl('fb-solo-box-first', { land: 'Portrait + Box Left', port: 'Landscape + Box Above' }, 'single', '3:4',
      [rect(1 - BIG, 0, BIG, 1, '3:4')], [box(0, 0, 1 - BIG, 1)]),

    // Full-width 16:9 over a 1.5" band — the wide look the page can't do alone.
    tmpl('fb-wide-box-below', { land: 'Wide + Box Below', port: 'Tall + Box Right' }, 'single', '16:9',
      [rect(0, 0, 1, PHOTO_BAND, '16:9')], [box(0, PHOTO_BAND, 1, BOX_BAND)]),
    tmpl('fb-wide-box-above', { land: 'Wide + Box Above', port: 'Tall + Box Left' }, 'single', '16:9',
      [rect(0, BOX_BAND, 1, PHOTO_BAND, '16:9')], [box(0, 0, 1, BOX_BAND)]),

    /* ── 2 photos ────────────────────────────────────────────────────────── */
    // Equal split of the long side: two exact 2:3 portraits.
    tmpl('fb-duo', { land: 'Two Portraits', port: 'Two Landscapes' }, 'duo', '2:3', [
      rect(0, 0, halfA, 1, '2:3'),
      rect(secondA, 0, halfA, 1, '2:3'),
    ]),
    // Unequal split: an exact 3:4 beside a 9:16 sliver — a different rhythm.
    tmpl('fb-duo-big-first', { land: 'Big Left', port: 'Big Top' }, 'duo', '3:4', [
      rect(0, 0, BIG, 1, '3:4'),
      rect(BIG + gA, 0, 1 - BIG - gA, 1, '9:16'),
    ]),
    tmpl('fb-duo-big-second', { land: 'Big Right', port: 'Big Bottom' }, 'duo', '3:4', [
      rect(1 - BIG, 0, BIG, 1, '3:4'),
      rect(0, 0, 1 - BIG - gA, 1, '9:16'),
    ]),
    // Two stacked 16:9 beside the box — impossible without the box (8×3 = 8:3).
    tmpl('fb-duo-wide-box-second', { land: 'Two Wide + Box Right', port: 'Two Tall + Box Below' }, 'duo', '16:9', [
      rect(0, 0, THIRD, halfB, '16:9'),
      rect(0, secondB, THIRD, halfB, '16:9'),
    ], [box(THIRD, 0, 1 - THIRD, 1)]),
    tmpl('fb-duo-wide-box-first', { land: 'Two Wide + Box Left', port: 'Two Tall + Box Above' }, 'duo', '16:9', [
      rect(1 - THIRD, 0, THIRD, halfB, '16:9'),
      rect(1 - THIRD, secondB, THIRD, halfB, '16:9'),
    ], [box(0, 0, 1 - THIRD, 1)]),

    /* ── 3 photos ────────────────────────────────────────────────────────── */
    // Half-page hero + two stacked quarters: hero 2:3, pair 4:3, both exact.
    tmpl('fb-trio-hero-first', { land: 'Hero Left', port: 'Hero Top' }, 'trio', '2:3', [
      rect(0, 0, halfA, 1, '2:3'),
      rect(secondA, 0, halfA, halfB, '4:3'),
      rect(secondA, secondB, halfA, halfB, '4:3'),
    ]),
    tmpl('fb-trio-hero-second', { land: 'Hero Right', port: 'Hero Bottom' }, 'trio', '2:3', [
      rect(secondA, 0, halfA, 1, '2:3'),
      rect(0, 0, halfA, halfB, '4:3'),
      rect(0, secondB, halfA, halfB, '4:3'),
    ]),
    // Three columns over a band. As bare columns these are 4:9 and unprintable;
    // the 1.5" box shortens them to 2.64×4.5 = 9:16, and they work.
    tmpl('fb-trio-cols-box-below', { land: 'Three Tall + Box Below', port: 'Three Wide + Box Right' }, 'trio', '9:16', [
      rect(0, 0, col3, PHOTO_BAND, '9:16'),
      rect(col3 + gA, 0, col3, PHOTO_BAND, '9:16'),
      rect(2 * (col3 + gA), 0, col3, PHOTO_BAND, '9:16'),
    ], [box(0, PHOTO_BAND, 1, BOX_BAND)]),
    tmpl('fb-trio-cols-box-above', { land: 'Three Tall + Box Above', port: 'Three Wide + Box Left' }, 'trio', '9:16', [
      rect(0, BOX_BAND, col3, PHOTO_BAND, '9:16'),
      rect(col3 + gA, BOX_BAND, col3, PHOTO_BAND, '9:16'),
      rect(2 * (col3 + gA), BOX_BAND, col3, PHOTO_BAND, '9:16'),
    ], [box(0, 0, 1, BOX_BAND)]),
  ];
}
