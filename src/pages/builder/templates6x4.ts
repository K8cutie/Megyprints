import type { PageTemplate, TemplateMargin } from './types';
import type { PhotoRatio } from './photoAnalyzer';
import { fill, rsBox, STD, gutterFrac } from './templateKit';

/** ══════════════════════════════════════════════════════════════════════════
 *  6×4″ LANDSCAPE — page layouts
 *
 *  A 6×4 is a 3:2 landscape page (6 wide, 4 tall), so its tilings differ from
 *  the square set. Two hard facts shape the whole set:
 *
 *   • Only three FULL-BLEED counts hit an exact camera ratio above the 2" floor
 *     (the page is only 4" tall):
 *       1 photo  whole page          3:2  (landscape)
 *       2 photos vertical split      two 3×4" = 3:4  (portrait)
 *       3 photos hero 4×4 + two 2×2  all 1:1 (square)
 *   • BARE landscape pairs don't exist: two 3:2 photos can't stack (7.36" tall
 *     > the 4" page) and side-by-side print 1.84" (under the floor). The pair
 *     only works the way the 8×6 deck does it — 4:3 cells with the combo box
 *     taking the genuine leftover band (2.97×2.23" cells over a 1.77" band) —
 *     so every landscape 2-up here carries a box by construction. 3:2 photos
 *     reach it through the loose-ratio path (a 4:3 cell at ~11% crop).
 *
 *  Coverage by orientation / photos-per-page:
 *       landscape  1-up (full-bleed + margined) + 2-up (band duos)
 *       portrait   1-up (margined + box) + 2-up (Two Tall)
 *       square     1-up (margined + box) + 2-up (band duos)
 *  ══════════════════════════════════════════════════════════════════════════ */

const ZERO: TemplateMargin = { top: 0, bottom: 0, left: 0, right: 0 };
const GAP = gutterFrac(6); // the shared photo gutter, as a fraction of the 6" width
const orientOf = (r: PhotoRatio): PageTemplate['orientation'] =>
  r === '3:2' || r === '4:3' || r === '16:9' ? 'landscape' : r === '1:1' ? 'square' : 'portrait';

const fb = (id: string, name: string, r: PhotoRatio, slots: PageTemplate['slots']): PageTemplate =>
  ({ id, name, category: slots.length === 1 ? 'single' : slots.length === 2 ? 'duo' : 'trio',
     slotCount: slots.length, margin: ZERO, orientation: orientOf(r), targetRatio: r,
     albumSizes: ['6x4'], fullBleed: true, slots });

/* 1 photo full bleed — the whole 6×4, exact 3:2. The money shot for the native
   (landscape) orientation. */
const T64_FB_SOLO = fb('t64-fb-solo', 'Full Page', '3:2', [fill(0, 0, 1, 1, '3:2')]);

/* 2 photos full bleed — vertical split, two 3×4" portraits (3:4). */
const duoTall = (id: string, name: string, gap: number) =>
  fb(id, name, '3:4', [fill(0, 0, 1 / 2 - gap / 2, 1, '3:4'), fill(1 / 2 + gap / 2, 0, 1 / 2 - gap / 2, 1, '3:4')]);
const T64_FB_DUO_TALL = duoTall('t64-fb-duo-tall', 'Two Tall', 0);
const T64_FB_DUO_TALL_G = duoTall('t64-fb-duo-tall-gap', 'Two Tall', GAP);

/* 2 photos + combo box — the landscape and square pairs the bare-ratio math
   above rules out. Two 4:3 cells side by side print 2.97×2.23" (2.72×2.23"
   once the 0.5" spine reserve bites — still above the floor) and the box takes
   the genuine 1.77" leftover; at 1:1 the cells are 2.97" squares over a 1.03"
   band. This is what gives LANDSCAPE photos a 2-up home at all — without it a
   landscape-heavy roll deals 1/page for the whole album. */
const DUO_CELL_W = (1 - GAP) / 2;              // 2.97" — half the width, less the gutter
const DUO_43_H = (DUO_CELL_W * 6 * 0.75) / 4;  // 0.557 — that cell's 4:3 height
const DUO_11_H = (DUO_CELL_W * 6) / 4;         // 0.743 — that cell's square height
const fbBandDuo = (id: string, name: string, r: PhotoRatio, cellH: number, bandBelow: boolean): PageTemplate => {
  const y = bandBelow ? 0 : 1 - cellH, by = bandBelow ? cellH : 0;
  return { id, name, category: 'duo', slotCount: 2, margin: ZERO, orientation: orientOf(r),
    targetRatio: r, albumSizes: ['6x4'], fullBleed: true,
    slots: [fill(0, y, DUO_CELL_W, cellH, r), fill(1 / 2 + GAP / 2, y, DUO_CELL_W, cellH, r)],
    textSlots: [{ id: 'combo', x: 0, y: by, width: 1, height: 1 - cellH, align: 'center', placeholder: 'Tap to add' }] };
};
const T64_FB_DUO_LS_BAND_B = fbBandDuo('t64-fb-duo-ls-band-b', 'Two Landscapes + Band Below', '4:3', DUO_43_H, true);
const T64_FB_DUO_LS_BAND_A = fbBandDuo('t64-fb-duo-ls-band-a', 'Two Landscapes + Band Above', '4:3', DUO_43_H, false);
const T64_FB_DUO_SQ_BAND_B = fbBandDuo('t64-fb-duo-sq-band-b', 'Two Squares + Band Below', '1:1', DUO_11_H, true);
const T64_FB_DUO_SQ_BAND_A = fbBandDuo('t64-fb-duo-sq-band-a', 'Two Squares + Band Above', '1:1', DUO_11_H, false);

/* 3 photos full bleed — a 4×4 square hero + two stacked 2×2 squares, all 1:1.
   The 2×2 cells sit exactly on the 2" floor, so this takes NO gutter. */
const trioSq = (id: string, name: string, heroLeft: boolean) => {
  const heroX = heroLeft ? 0 : 1 / 3, pairX = heroLeft ? 2 / 3 : 0;
  return fb(id, name, '1:1', [
    fill(heroX, 0, 2 / 3, 1, '1:1'),
    fill(pairX, 0, 1 / 3, 1 / 2, '1:1'),
    fill(pairX, 1 / 2, 1 / 3, 1 / 2, '1:1'),
  ]);
};
const T64_FB_TRIO_HERO_LEFT = trioSq('t64-fb-trio-hero-left', 'Hero Left', true);
const T64_FB_TRIO_HERO_RIGHT = trioSq('t64-fb-trio-hero-right', 'Hero Right', false);

/* MARGINED singles — the photo at its true ratio inside the 5.52×3.68" safe
   area. Gives portrait/square a 1-up home (they can't be full-bleed on a 3:2
   page without cropping), and gives landscape a SECOND look so a landscape
   album alternates full-bleed / framed instead of repeating. */
const margined = (id: string, name: string, r: PhotoRatio): PageTemplate =>
  ({ id, name, category: 'single', slotCount: 1, margin: STD, orientation: orientOf(r),
     targetRatio: r, albumSizes: ['6x4'], slots: [rsBox(0, 0, r, 1, 1, '6x4')] });
const T64_SOLO_LANDSCAPE = margined('t64-solo-landscape', 'Single Landscape', '3:2');
const T64_SOLO_PORTRAIT = margined('t64-solo-portrait', 'Single Portrait', '3:4');
const T64_SOLO_SQUARE = margined('t64-solo-square', 'Single Square', '1:1');

/* 1 photo full bleed + combo box — the photo at its own ratio bleeds off three
   edges, the box takes the strip. Also the SECOND single-photo look portrait
   and square need: a 6×4 can't full-bleed a 3:4 or 1:1 photo edge-to-edge, so
   without these each orientation would have only its margined single and repeat
   on a 1-photo-per-page album. (Landscape already has full-bleed + margined.) */
const fbPortraitBox = (id: string, name: string, boxLeft: boolean): PageTemplate => {
  const px = boxLeft ? 1 / 2 : 0, bx = boxLeft ? 0 : 1 / 2; // photo 3×4 (3:4), box 3×4
  return { id, name, category: 'single', slotCount: 1, margin: ZERO, orientation: 'portrait',
    targetRatio: '3:4', albumSizes: ['6x4'], fullBleed: true,
    slots: [fill(px, 0, 1 / 2, 1, '3:4')],
    textSlots: [{ id: 'combo', x: bx, y: 0, width: 1 / 2, height: 1, align: 'center', placeholder: 'Tap to add' }] };
};
const fbSquareBox = (id: string, name: string, boxLeft: boolean): PageTemplate => {
  const px = boxLeft ? 1 / 3 : 0, bx = boxLeft ? 0 : 2 / 3; // photo 4×4 (1:1), box 2×4
  return { id, name, category: 'single', slotCount: 1, margin: ZERO, orientation: 'square',
    targetRatio: '1:1', albumSizes: ['6x4'], fullBleed: true,
    slots: [fill(px, 0, 2 / 3, 1, '1:1')],
    textSlots: [{ id: 'combo', x: bx, y: 0, width: 1 / 3, height: 1, align: 'center', placeholder: 'Tap to add' }] };
};
const T64_FB_PT_BOX_RIGHT = fbPortraitBox('t64-fb-pt-box-right', 'Portrait + Box Right', false);
const T64_FB_PT_BOX_LEFT = fbPortraitBox('t64-fb-pt-box-left', 'Portrait + Box Left', true);
const T64_FB_SQ_BOX_RIGHT = fbSquareBox('t64-fb-sq-box-right', 'Square + Box Right', false);
const T64_FB_SQ_BOX_LEFT = fbSquareBox('t64-fb-sq-box-left', 'Square + Box Left', true);

/** RETIRED — kept BUILT (with no album sizes) so albums already saved against
 *  these ids still resolve and render, but never selectable again. Two reasons:
 *   • `t64-fb-duo-tall` is the gutterless twin of `-gap`, and every multi-photo
 *     layout now carries the 1mm gutter.
 *   • the HERO TRIOS cannot carry one at all. Their 2×2 cells sit at EXACTLY the
 *     2.00" floor (1/3 × 6" wide, 1/2 × 4" tall), and stacking two cells plus a
 *     gutter needs 2+2+1mm = 4.04" on a page only 4.00" tall — so any gutter
 *     puts a frame under the floor. A 3-up with gutters does not exist on a 6×4;
 *     the size therefore caps at 2 photos/page. */
const RETIRED_6X4: PageTemplate[] = [T64_FB_DUO_TALL, T64_FB_TRIO_HERO_LEFT, T64_FB_TRIO_HERO_RIGHT]
  .map((t) => ({ ...t, albumSizes: [] as PageTemplate['albumSizes'] }));

export const TEMPLATES_6X4: PageTemplate[] = [
  T64_FB_SOLO,
  T64_SOLO_LANDSCAPE,
  T64_SOLO_PORTRAIT,
  T64_SOLO_SQUARE,
  T64_FB_PT_BOX_RIGHT,
  T64_FB_PT_BOX_LEFT,
  T64_FB_SQ_BOX_RIGHT,
  T64_FB_SQ_BOX_LEFT,
  T64_FB_DUO_TALL_G,
  T64_FB_DUO_LS_BAND_B,
  T64_FB_DUO_LS_BAND_A,
  T64_FB_DUO_SQ_BAND_B,
  T64_FB_DUO_SQ_BAND_A,
  ...RETIRED_6X4,
];
