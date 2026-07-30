import type { PageTemplate, TemplateMargin, TextSlot, AlbumSizePreset } from './types';
import type { PhotoRatio } from './photoAnalyzer';
import { fill, ALBUM_INCHES, gutterFrac } from './templateKit';

/** ══════════════════════════════════════════════════════════════════════════
 *  8×6 (landscape) / 6×8 (portrait) — page layouts.
 *
 *  6×8 IS 8×6 ROTATED: every layout is authored ONCE in landscape terms and
 *  transposed, with each ratio flipped (4:3↔3:4, 3:2↔2:3, 1:1↔1:1). One shape,
 *  both sizes, no drift.
 *
 *  ── The rule that shapes everything here ──────────────────────────────────
 *  ONLY ratios real cameras produce: 4:3/3:4 (phone), 3:2/2:3 (DSLR), 1:1.
 *  16:9 and 9:16 are BANNED. The first version of this file used them to make
 *  three-column and two-row grids fit, and every photo that landed in one lost
 *  a quarter of itself — pages of cropped faces and legs. If a tiling only
 *  works by introducing a panoramic slot, the tiling is wrong for this page.
 *
 *  ── How 35 layouts fit inside that rule ───────────────────────────────────
 *  Naively, a 4:3 page has almost no valid tilings: halve the short side and
 *  you get 8×3" (8:3); take thirds and you get 2.67×6" (4:9). Both unusable.
 *
 *  The move is to stop letting the GRID choose the cell size. Give the combo
 *  box the leftover, and the photo cells become free to be whatever ratio we
 *  want — the box absorbs the remainder instead of the photos being stretched
 *  to fill it. That is what unlocks the dense shapes:
 *
 *      two 4:3 stacked      → 3.96×2.97" each, box takes the 4.04" column
 *      two 1:1 side by side → 3.97" squares, band takes the 2.03" strip
 *      two 3:4 side by side → 3.97×5.29", band takes the 0.71" strip
 *      3:2 across the page  → 8×5.33", band takes the 0.67" strip
 *
 *  And the 3-up works because a 2:3 hero leaves EXACTLY a 4:3 pair beside it
 *  (both real ratios, no box needed) — while a 3:4 hero over a band leaves a
 *  3:2 pair. Two genuinely different 3-photo pages.
 *
 *  Those hero 3-ups MIX ratios, which routes them through the generator's
 *  mixed-template pass — dealt at most once or twice per moment group, so an
 *  album still reads as duos page after page. The SINGLE-ratio trios below
 *  (grid-with-box + three-columns) are what the ratio-by-ratio dealer can
 *  actually rotate into the 1/2/3 page rhythm.
 *
 *  Every frame ≥ 2.00" on its short side; every photo cell within 0.8% of a
 *  real ratio (most are exact); a PHOTO_GUTTER_MM gutter between adjacent
 *  photos; boxes sit flush (a box is part of the page, not a neighbour).
 *  ══════════════════════════════════════════════════════════════════════════ */

const ZERO: TemplateMargin = { top: 0, bottom: 0, left: 0, right: 0 };
const PREFIX: Record<string, string> = { '8x6': 't86', '6x8': 't68' };

const FLIP: Record<PhotoRatio, PhotoRatio> = {
  '4:3': '3:4', '3:4': '4:3', '3:2': '2:3', '2:3': '3:2', '16:9': '9:16', '9:16': '16:9', '1:1': '1:1',
};
const orientOf = (r: PhotoRatio): PageTemplate['orientation'] =>
  r === '3:2' || r === '4:3' || r === '16:9' ? 'landscape' : r === '1:1' ? 'square' : 'portrait';

interface Names { land: string; port: string }

/** RETIRED — the scrapped panoramic-slot set (16:9/9:16). Still BUILT, with NO
 *  album sizes, purely so albums already saved against these ids keep resolving
 *  and rendering (one real album carries 97 such pages). They can never be
 *  selected or dealt again. Delete only once nothing references them. */
function retiredFirstSet(size: AlbumSizePreset): PageTemplate[] {
  const idp = PREFIX[size] ?? 't' + size.replace(/\D/g, '');
  const landscape = ALBUM_INCHES[size].w > ALBUM_INCHES[size].h;
  const long = Math.max(ALBUM_INCHES[size].w, ALBUM_INCHES[size].h);
  const short = Math.min(ALBUM_INCHES[size].w, ALBUM_INCHES[size].h);
  const gA = gutterFrac(long), gB = gutterFrac(short);
  const R = (r: PhotoRatio) => (landscape ? r : FLIP[r]);
  const rect = (a: number, b: number, aL: number, bL: number, r: PhotoRatio) =>
    (landscape ? fill(a, b, aL, bL, R(r)) : fill(b, a, bL, aL, R(r)));
  const bx = (a: number, b: number, aL: number, bL: number): TextSlot => ({
    id: 'combo', x: landscape ? a : b, y: landscape ? b : a,
    width: landscape ? aL : bL, height: landscape ? bL : aL,
    align: 'center', placeholder: 'Tap to add',
  });
  const t = (s: string, name: string, cat: PageTemplate['category'], tr: PhotoRatio,
             slots: PageTemplate['slots'], textSlots?: TextSlot[]): PageTemplate => ({
    id: `${idp}-${s}`, name, category: cat, slotCount: slots.length, margin: ZERO,
    orientation: orientOf(R(tr)), targetRatio: R(tr), albumSizes: [], // ← retired
    fullBleed: true, slots, ...(textSlots ? { textSlots } : {}),
  });
  const halfA = 1 / 2 - gA / 2, secondA = 1 / 2 + gA / 2;
  const halfB = 1 / 2 - gB / 2, secondB = 1 / 2 + gB / 2;
  const BIG = 4.5 / 8, BOX_BAND = 1.5 / 6, PHOTO_BAND = 1 - BOX_BAND, THIRD = 2 / 3;
  const col3 = (1 - 2 * gA) / 3;
  return [
    t('fb-solo', 'Full Page', 'single', '4:3', [rect(0, 0, 1, 1, '4:3')]),
    t('fb-solo-box-second', 'Portrait + Box Right', 'single', '3:4', [rect(0, 0, BIG, 1, '3:4')], [bx(BIG, 0, 1 - BIG, 1)]),
    t('fb-solo-box-first', 'Portrait + Box Left', 'single', '3:4', [rect(1 - BIG, 0, BIG, 1, '3:4')], [bx(0, 0, 1 - BIG, 1)]),
    t('fb-wide-box-below', 'Wide + Box Below', 'single', '16:9', [rect(0, 0, 1, PHOTO_BAND, '16:9')], [bx(0, PHOTO_BAND, 1, BOX_BAND)]),
    t('fb-wide-box-above', 'Wide + Box Above', 'single', '16:9', [rect(0, BOX_BAND, 1, PHOTO_BAND, '16:9')], [bx(0, 0, 1, BOX_BAND)]),
    t('fb-duo', 'Two Portraits', 'duo', '2:3', [rect(0, 0, halfA, 1, '2:3'), rect(secondA, 0, halfA, 1, '2:3')]),
    t('fb-duo-big-first', 'Big Left', 'duo', '3:4', [rect(0, 0, BIG, 1, '3:4'), rect(BIG + gA, 0, 1 - BIG - gA, 1, '9:16')]),
    t('fb-duo-big-second', 'Big Right', 'duo', '3:4', [rect(1 - BIG, 0, BIG, 1, '3:4'), rect(0, 0, 1 - BIG - gA, 1, '9:16')]),
    t('fb-duo-wide-box-second', 'Two Wide + Box Right', 'duo', '16:9',
      [rect(0, 0, THIRD, halfB, '16:9'), rect(0, secondB, THIRD, halfB, '16:9')], [bx(THIRD, 0, 1 - THIRD, 1)]),
    t('fb-duo-wide-box-first', 'Two Wide + Box Left', 'duo', '16:9',
      [rect(1 - THIRD, 0, THIRD, halfB, '16:9'), rect(1 - THIRD, secondB, THIRD, halfB, '16:9')], [bx(0, 0, 1 - THIRD, 1)]),
    t('fb-trio-hero-first', 'Hero Left', 'trio', '2:3',
      [rect(0, 0, halfA, 1, '2:3'), rect(secondA, 0, halfA, halfB, '4:3'), rect(secondA, secondB, halfA, halfB, '4:3')]),
    t('fb-trio-hero-second', 'Hero Right', 'trio', '2:3',
      [rect(secondA, 0, halfA, 1, '2:3'), rect(0, 0, halfA, halfB, '4:3'), rect(0, secondB, halfA, halfB, '4:3')]),
    t('fb-trio-cols-box-below', 'Three Tall + Box Below', 'trio', '9:16',
      [rect(0, 0, col3, PHOTO_BAND, '9:16'), rect(col3 + gA, 0, col3, PHOTO_BAND, '9:16'), rect(2 * (col3 + gA), 0, col3, PHOTO_BAND, '9:16')],
      [bx(0, PHOTO_BAND, 1, BOX_BAND)]),
    t('fb-trio-cols-box-above', 'Three Tall + Box Above', 'trio', '9:16',
      [rect(0, BOX_BAND, col3, PHOTO_BAND, '9:16'), rect(col3 + gA, BOX_BAND, col3, PHOTO_BAND, '9:16'), rect(2 * (col3 + gA), BOX_BAND, col3, PHOTO_BAND, '9:16')],
      [bx(0, 0, 1, BOX_BAND)]),
  ];
}

export function buildRectTemplates(size: AlbumSizePreset): PageTemplate[] {
  const idp = PREFIX[size] ?? 't' + size.replace(/\D/g, '');
  const id = (s: string) => `${idp}-${s}`;
  const landscape = ALBUM_INCHES[size].w > ALBUM_INCHES[size].h;
  const long = Math.max(ALBUM_INCHES[size].w, ALBUM_INCHES[size].h);   // 8"
  const short = Math.min(ALBUM_INCHES[size].w, ALBUM_INCHES[size].h);  // 6"
  const gA = gutterFrac(long);   // gutter across the long side
  const gB = gutterFrac(short);  // gutter across the short side

  const R = (r: PhotoRatio) => (landscape ? r : FLIP[r]);
  /** `a` runs along the page's LONG side, `b` along the SHORT side. */
  const rect = (a: number, b: number, aL: number, bL: number, r: PhotoRatio) =>
    (landscape ? fill(a, b, aL, bL, R(r)) : fill(b, a, bL, aL, R(r)));
  const box = (a: number, b: number, aL: number, bL: number): TextSlot => ({
    id: 'combo', x: landscape ? a : b, y: landscape ? b : a,
    width: landscape ? aL : bL, height: landscape ? bL : aL,
    align: 'center', placeholder: 'Tap to add',
  });
  const t = (s: string, n: Names, cat: PageTemplate['category'], tr: PhotoRatio,
             slots: PageTemplate['slots'], textSlots?: TextSlot[]): PageTemplate => ({
    id: id(s), name: landscape ? n.land : n.port, category: cat, slotCount: slots.length,
    margin: ZERO, orientation: orientOf(R(tr)), targetRatio: R(tr), albumSizes: [size],
    fullBleed: true, slots, ...(textSlots ? { textSlots } : {}),
  });

  // ── Split fractions ──────────────────────────────────────────────────────
  const halfA = (1 - gA) / 2, secondA = halfA + gA;   // long side, halved
  const halfB = (1 - gB) / 2, secondB = halfB + gB;   // short side, halved
  // A 4:3 cell on a 4:3 page takes the SAME fraction of both axes — so a
  // half-height cell in the left column is `halfB` wide as well.
  const quadA = halfB;                       // 3.96" — width of a 4:3 half-cell
  const sqB = halfA * (long / short);        // 0.662 — height of a square whose
                                             // width is half the long side
  const tallB = halfA * (long / short) / 0.75;   // 0.882 — same, at 3:4
  const wideB = (short === 0 ? 0 : (long / 1.5) / short); // 0.889 — 3:2 across the page
  const heroB = (long / 2) / 0.75 / short;   // 0.889 — a half-width 3:4 hero
  const pairB = (heroB - gB) / 2;            // 0.440 — the 3:2 pair beside it
  const col3 = (1 - 2 * gA) / 3;             // 2.63" — a third of the long side
  const col34B = (col3 * long / 0.75) / short;    // 0.584 — height of a 3:4 column
  const col23B = (col3 * long / (2 / 3)) / short; // 0.657 — height of a 2:3 column
  const sqA = halfB * short / long;          // 0.371 — width of a half-short square
  const sqBandX = 2 * sqA + gA;              // 0.750 — a square 2×2's full width
  const ptA = halfB * 0.75 * short / long;   // 0.278 — width of a half-short 3:4 cell
  const ptBandX = 2 * ptA + gA;              // 0.564 — a portrait 2×2's full width
  const q32B = (halfA * long / 1.5) / short; // 0.441 — height of a half-long 3:2 cell

  return [
    /* ── 1 photo ──────────────────────────────────────────────────────────
       The whole sheet, or a photo at its true ratio with the box taking the
       remainder — which is how a PORTRAIT or SQUARE photo gets a full-bleed
       home on a landscape page without being stretched to fit it. */
    t('solo', { land: 'Full Page', port: 'Full Page' }, 'single', '4:3',
      [rect(0, 0, 1, 1, '4:3')]),

    t('solo-34-box-r', { land: 'Portrait + Box Right', port: 'Landscape + Box Below' }, 'single', '3:4',
      [rect(0, 0, 4.5 / 8, 1, '3:4')], [box(4.5 / 8, 0, 1 - 4.5 / 8, 1)]),
    t('solo-34-box-l', { land: 'Portrait + Box Left', port: 'Landscape + Box Above' }, 'single', '3:4',
      [rect(1 - 4.5 / 8, 0, 4.5 / 8, 1, '3:4')], [box(0, 0, 1 - 4.5 / 8, 1)]),

    t('solo-sq-box-r', { land: 'Square + Box Right', port: 'Square + Box Below' }, 'single', '1:1',
      [rect(0, 0, short / long, 1, '1:1')], [box(short / long, 0, 1 - short / long, 1)]),
    t('solo-sq-box-l', { land: 'Square + Box Left', port: 'Square + Box Above' }, 'single', '1:1',
      [rect(1 - short / long, 0, short / long, 1, '1:1')], [box(0, 0, 1 - short / long, 1)]),

    t('solo-23-box-r', { land: 'Tall + Box Right', port: 'Wide + Box Below' }, 'single', '2:3',
      [rect(0, 0, 0.5, 1, '2:3')], [box(0.5, 0, 0.5, 1)]),
    t('solo-23-box-l', { land: 'Tall + Box Left', port: 'Wide + Box Above' }, 'single', '2:3',
      [rect(0.5, 0, 0.5, 1, '2:3')], [box(0, 0, 0.5, 1)]),

    // A 3:2 spans the full width and leaves a slim caption strip.
    t('solo-32-band-b', { land: 'Wide + Band Below', port: 'Tall + Band Right' }, 'single', '3:2',
      [rect(0, 0, 1, wideB, '3:2')], [box(0, wideB, 1, 1 - wideB)]),
    t('solo-32-band-a', { land: 'Wide + Band Above', port: 'Tall + Band Left' }, 'single', '3:2',
      [rect(0, 1 - wideB, 1, wideB, '3:2')], [box(0, 0, 1, 1 - wideB)]),

    /* ── 2 photos ─────────────────────────────────────────────────────────
       The only clean pure-photo split is the long side (two 2:3). Everything
       denser needs the box to take the leftover — which is exactly what lets
       the cells be 4:3 / 1:1 / 3:4 instead of 8:3 slivers. */
    t('duo-tall', { land: 'Two Tall', port: 'Two Wide' }, 'duo', '2:3', [
      rect(0, 0, halfA, 1, '2:3'),
      rect(secondA, 0, halfA, 1, '2:3'),
    ]),

    t('duo-43-box-r', { land: 'Two Wide + Box Right', port: 'Two Tall + Box Below' }, 'duo', '4:3', [
      rect(0, 0, quadA, halfB, '4:3'),
      rect(0, secondB, quadA, halfB, '4:3'),
    ], [box(quadA, 0, 1 - quadA, 1)]),
    t('duo-43-box-l', { land: 'Two Wide + Box Left', port: 'Two Tall + Box Above' }, 'duo', '4:3', [
      rect(1 - quadA, 0, quadA, halfB, '4:3'),
      rect(1 - quadA, secondB, quadA, halfB, '4:3'),
    ], [box(0, 0, 1 - quadA, 1)]),

    t('duo-sq-band-b', { land: 'Two Squares + Band Below', port: 'Two Squares + Band Right' }, 'duo', '1:1', [
      rect(0, 0, halfA, sqB, '1:1'),
      rect(secondA, 0, halfA, sqB, '1:1'),
    ], [box(0, sqB, 1, 1 - sqB)]),
    t('duo-sq-band-a', { land: 'Two Squares + Band Above', port: 'Two Squares + Band Left' }, 'duo', '1:1', [
      rect(0, 1 - sqB, halfA, sqB, '1:1'),
      rect(secondA, 1 - sqB, halfA, sqB, '1:1'),
    ], [box(0, 0, 1, 1 - sqB)]),

    t('duo-34-band-b', { land: 'Two Portraits + Band Below', port: 'Two Landscapes + Band Right' }, 'duo', '3:4', [
      rect(0, 0, halfA, tallB, '3:4'),
      rect(secondA, 0, halfA, tallB, '3:4'),
    ], [box(0, tallB, 1, 1 - tallB)]),
    t('duo-34-band-a', { land: 'Two Portraits + Band Above', port: 'Two Landscapes + Band Left' }, 'duo', '3:4', [
      rect(0, 1 - tallB, halfA, tallB, '3:4'),
      rect(secondA, 1 - tallB, halfA, tallB, '3:4'),
    ], [box(0, 0, 1, 1 - tallB)]),

    /* ── 3 photos ─────────────────────────────────────────────────────────
       A half-width 2:3 hero leaves EXACTLY a 4:3 pair beside it — no box
       needed, and every cell a real ratio. Drop the hero to 3:4 over a band
       and the pair becomes 3:2: a second, genuinely different 3-up. */
    t('trio-hero-l', { land: 'Hero Left', port: 'Hero Top' }, 'trio', '2:3', [
      rect(0, 0, 0.5, 1, '2:3'),
      rect(0.5 + gA, 0, 0.5 - gA, halfB, '4:3'),
      rect(0.5 + gA, secondB, 0.5 - gA, halfB, '4:3'),
    ]),
    t('trio-hero-r', { land: 'Hero Right', port: 'Hero Bottom' }, 'trio', '2:3', [
      rect(0.5, 0, 0.5, 1, '2:3'),
      rect(0, 0, 0.5 - gA, halfB, '4:3'),
      rect(0, secondB, 0.5 - gA, halfB, '4:3'),
    ]),

    t('trio-hero-band-l', { land: 'Hero Left + Band', port: 'Hero Top + Band' }, 'trio', '3:4', [
      rect(0, 0, 0.5, heroB, '3:4'),
      rect(0.5 + gA, 0, 0.5 - gA, pairB, '3:2'),
      rect(0.5 + gA, pairB + gB, 0.5 - gA, pairB, '3:2'),
    ], [box(0, heroB, 1, 1 - heroB)]),
    t('trio-hero-band-r', { land: 'Hero Right + Band', port: 'Hero Bottom + Band' }, 'trio', '3:4', [
      rect(0.5, 0, 0.5, heroB, '3:4'),
      rect(0, 0, 0.5 - gA, pairB, '3:2'),
      rect(0, pairB + gB, 0.5 - gA, pairB, '3:2'),
    ], [box(0, heroB, 1, 1 - heroB)]),

    /* ── 3 photos, SINGLE ratio ───────────────────────────────────────────
       Quarters of a 4:3 page are themselves 4:3 (within 0.25% once the house
       gutter is taken), so a 2×2 grid with the combo box in one quadrant
       holds three exact-ratio photos — and the box corner gives four
       genuinely different looks. Three portrait columns across the long side
       leave a real band for the box: 3:4 columns a deep one, 2:3 columns a
       shallow one. These are the only same-ratio 3-ups the page geometry
       allows (a box-free one would need a sub-floor or off-ratio cell). */
    t('trio-grid-box-tl', { land: 'Trio Grid, Box Top Left', port: 'Trio Grid, Box Top Left' }, 'trio', '4:3', [
      rect(secondA, 0, halfA, halfB, '4:3'),
      rect(0, secondB, halfA, halfB, '4:3'),
      rect(secondA, secondB, halfA, halfB, '4:3'),
    ], [box(0, 0, secondA, secondB)]),
    t('trio-grid-box-tr', { land: 'Trio Grid, Box Top Right', port: 'Trio Grid, Box Bottom Left' }, 'trio', '4:3', [
      rect(0, 0, halfA, halfB, '4:3'),
      rect(0, secondB, halfA, halfB, '4:3'),
      rect(secondA, secondB, halfA, halfB, '4:3'),
    ], [box(halfA, 0, 1 - halfA, secondB)]),
    t('trio-grid-box-bl', { land: 'Trio Grid, Box Bottom Left', port: 'Trio Grid, Box Top Right' }, 'trio', '4:3', [
      rect(0, 0, halfA, halfB, '4:3'),
      rect(secondA, 0, halfA, halfB, '4:3'),
      rect(secondA, secondB, halfA, halfB, '4:3'),
    ], [box(0, halfB, secondA, 1 - halfB)]),
    t('trio-grid-box-br', { land: 'Trio Grid, Box Bottom Right', port: 'Trio Grid, Box Bottom Right' }, 'trio', '4:3', [
      rect(0, 0, halfA, halfB, '4:3'),
      rect(secondA, 0, halfA, halfB, '4:3'),
      rect(0, secondB, halfA, halfB, '4:3'),
    ], [box(halfA, halfB, 1 - halfA, 1 - halfB)]),

    t('trio-34-cols-b', { land: 'Three Portraits + Band Below', port: 'Three Landscapes + Band Right' }, 'trio', '3:4', [
      rect(0, 0, col3, col34B, '3:4'),
      rect(col3 + gA, 0, col3, col34B, '3:4'),
      rect(2 * (col3 + gA), 0, col3, col34B, '3:4'),
    ], [box(0, col34B, 1, 1 - col34B)]),
    t('trio-34-cols-a', { land: 'Three Portraits + Band Above', port: 'Three Landscapes + Band Left' }, 'trio', '3:4', [
      rect(0, 1 - col34B, col3, col34B, '3:4'),
      rect(col3 + gA, 1 - col34B, col3, col34B, '3:4'),
      rect(2 * (col3 + gA), 1 - col34B, col3, col34B, '3:4'),
    ], [box(0, 0, 1, 1 - col34B)]),

    t('trio-23-cols-b', { land: 'Three Tall + Band Below', port: 'Three Wide + Band Right' }, 'trio', '2:3', [
      rect(0, 0, col3, col23B, '2:3'),
      rect(col3 + gA, 0, col3, col23B, '2:3'),
      rect(2 * (col3 + gA), 0, col3, col23B, '2:3'),
    ], [box(0, col23B, 1, 1 - col23B)]),
    t('trio-23-cols-a', { land: 'Three Tall + Band Above', port: 'Three Wide + Band Left' }, 'trio', '2:3', [
      rect(0, 1 - col23B, col3, col23B, '2:3'),
      rect(col3 + gA, 1 - col23B, col3, col23B, '2:3'),
      rect(2 * (col3 + gA), 1 - col23B, col3, col23B, '2:3'),
    ], [box(0, 0, 1, 1 - col23B)]),

    /* ── 4 photos ─────────────────────────────────────────────────────────
       The full 2×2: the trio grids' quadrant fractions with a photo in the
       fourth corner instead of the box. Quarters of a 4:3 page are 4:3
       themselves, so this is the one dense page the geometry allows with NO
       box — which also makes it the only multi layout the caption cadence
       can deal for this ratio while a box is on cooldown. Cells clear the
       2" floor even after the 0.5" binding reserve shaves the spine column
       (3.72×2.97" on 8×6, 2.72×3.97" on 6×8). */
    t('quad-grid', { land: 'Quad Grid', port: 'Quad Grid' }, 'quad', '4:3', [
      rect(0, 0, halfA, halfB, '4:3'),
      rect(secondA, 0, halfA, halfB, '4:3'),
      rect(0, secondB, halfA, halfB, '4:3'),
      rect(secondA, secondB, halfA, halfB, '4:3'),
    ]),

    /* The other three same-ratio 4-ups. Half-short cells (2.97") stacked two
       high leave width over, so squares and portraits go 2×2 with a SIDE box
       taking the remainder — 2.0" for squares, 3.5" for portraits (which is
       what hands the 6×8's landscape queue its quad, since 3:4 flips to 4:3
       there). 3:2 cells are the transpose: half-long wide (3.97"), two rows
       fill all but a 0.65" strip — the same slim band the 3:2 solo uses. */
    t('quad-sq-box-r', { land: 'Quad Squares + Box Right', port: 'Quad Squares + Box Below' }, 'quad', '1:1', [
      rect(0, 0, sqA, halfB, '1:1'),
      rect(sqA + gA, 0, sqA, halfB, '1:1'),
      rect(0, secondB, sqA, halfB, '1:1'),
      rect(sqA + gA, secondB, sqA, halfB, '1:1'),
    ], [box(sqBandX, 0, 1 - sqBandX, 1)]),
    t('quad-sq-box-l', { land: 'Quad Squares + Box Left', port: 'Quad Squares + Box Above' }, 'quad', '1:1', [
      rect(1 - sqBandX, 0, sqA, halfB, '1:1'),
      rect(1 - sqBandX + sqA + gA, 0, sqA, halfB, '1:1'),
      rect(1 - sqBandX, secondB, sqA, halfB, '1:1'),
      rect(1 - sqBandX + sqA + gA, secondB, sqA, halfB, '1:1'),
    ], [box(0, 0, 1 - sqBandX, 1)]),

    t('quad-34-box-r', { land: 'Quad Portraits + Box Right', port: 'Quad Landscapes + Box Below' }, 'quad', '3:4', [
      rect(0, 0, ptA, halfB, '3:4'),
      rect(ptA + gA, 0, ptA, halfB, '3:4'),
      rect(0, secondB, ptA, halfB, '3:4'),
      rect(ptA + gA, secondB, ptA, halfB, '3:4'),
    ], [box(ptBandX, 0, 1 - ptBandX, 1)]),
    t('quad-34-box-l', { land: 'Quad Portraits + Box Left', port: 'Quad Landscapes + Box Above' }, 'quad', '3:4', [
      rect(1 - ptBandX, 0, ptA, halfB, '3:4'),
      rect(1 - ptBandX + ptA + gA, 0, ptA, halfB, '3:4'),
      rect(1 - ptBandX, secondB, ptA, halfB, '3:4'),
      rect(1 - ptBandX + ptA + gA, secondB, ptA, halfB, '3:4'),
    ], [box(0, 0, 1 - ptBandX, 1)]),

    t('quad-32-band-b', { land: 'Quad Grid 3:2 + Band Below', port: 'Quad Grid 2:3 + Band Right' }, 'quad', '3:2', [
      rect(0, 0, halfA, q32B, '3:2'),
      rect(secondA, 0, halfA, q32B, '3:2'),
      rect(0, q32B + gB, halfA, q32B, '3:2'),
      rect(secondA, q32B + gB, halfA, q32B, '3:2'),
    ], [box(0, 2 * q32B + gB, 1, 1 - 2 * q32B - gB)]),
    t('quad-32-band-a', { land: 'Quad Grid 3:2 + Band Above', port: 'Quad Grid 2:3 + Band Left' }, 'quad', '3:2', [
      rect(0, 1 - 2 * q32B - gB, halfA, q32B, '3:2'),
      rect(secondA, 1 - 2 * q32B - gB, halfA, q32B, '3:2'),
      rect(0, 1 - q32B, halfA, q32B, '3:2'),
      rect(secondA, 1 - q32B, halfA, q32B, '3:2'),
    ], [box(0, 0, 1, 1 - 2 * q32B - gB)]),

    // Resolvable-but-unselectable ids from the scrapped panoramic set.
    ...retiredFirstSet(size),
  ];
}
