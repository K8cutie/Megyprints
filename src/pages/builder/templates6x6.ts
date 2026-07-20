import type { PageTemplate, TemplateMargin } from './types';
import { fill } from './templateKit';

/** ══════════════════════════════════════════════════════════════════════════
 *  6×6″ SQUARE — page layouts
 *
 *  CLEARED and being re-authored from scratch. This file is the SINGLE source
 *  of truth for 6×6 interior layouts: '6x6' is listed in PER_SIZE_AUTHORED, so
 *  the legacy hand-made block, the generated gap-fillers and the tiled
 *  generator all emit nothing for this size. What is in this array is exactly
 *  what the builder can deal, cycle through, and print.
 *
 *  While the array is empty, 6×6 is not offered in the size picker (a size with
 *  no layouts cannot be chosen) — it reappears the moment the first layout below
 *  is authored. Covers are unaffected: they live in COVER_TEMPLATES.
 *
 *  ── House rules for a 6×6 layout ─────────────────────────────────────────
 *  • Ratio-true slots. Build frames with rsBox/rsBoxExact so a slot's PRINTED
 *    aspect equals its declared `targetRatio`. The dealer matches photos to
 *    that declared ratio, so a lying slot crops silently.
 *  • Orientation is strict, ratio is loose. Every slot in one template shares
 *    the template's `targetRatio`; the dealer will place a neighbouring ratio
 *    of the SAME orientation into it (≤16% crop budget), never across.
 *  • 2" print floor. 6×6's safe area is 5.52×5.52", so a frame narrower than
 *    ~0.36 of the page prints under 2" and reads as a thumbnail. Check with
 *    meetsPrintFloor(albumSize, w, h) before shipping a dense layout.
 *  • Distinct geometry. Templates are deduped by geometry signature, so a
 *    variant that differs only by name collapses into its twin and adds no
 *    variety.
 *  • Coordinates are fractions (0–1) of the SAFE AREA, not the trim page —
 *    except on fullBleed templates, where they are fractions of the whole page.
 *  ══════════════════════════════════════════════════════════════════════════ */

/** Full-bleed templates carry NO margin — their slot fractions are of the whole
 *  trimmed page, not the safe area. */
const ZERO: TemplateMargin = { top: 0, bottom: 0, left: 0, right: 0 };

/* ── 3 photos, full bleed ──────────────────────────────────────────────────
   A hero column with two stacked beside it, all three running to the page
   edges with no gaps and no margin.

   WHY THIS SHAPE. Full bleed spends the whole 6", not the 5.52" safe area, and
   that difference is exactly what makes a 3-up possible here: three equal
   columns inside the safe area print 1.77" and miss the 2" floor, while this
   composition puts every frame at 2" or more. The proportions are not
   arbitrary either — a 2/3 column and two 1/3 half-height blocks on a square
   page are FORCED to 2:3, the DSLR portrait ratio, so every slot is an exact
   ratio match with zero crop rather than a fitted approximation:

     hero        4.00" x 6.00"  = 2:3   (2/3 x 1 of a 6" square)
     top right   2.00" x 3.00"  = 2:3   (1/3 x 1/2)
     bottom rt   2.00" x 3.00"  = 2:3

   The smallest side is 2.00" — the floor exactly, with nothing to spare. Do
   not add gutters between these frames: any gap steals from the 1/3 column and
   drops those two under the floor.

   Phone portraits (3:4) land here at ~11% crop, inside the dealer's 16% loose
   budget, so this is a genuine home for portrait photos and not just DSLR ones. */
/** Shared shape for the four full-bleed trios. The hero is always slots[0], so
 *  the lead photo of a moment lands in the big frame regardless of where that
 *  frame sits on the page. */
const fbTrio = (
  id: string, name: string, targetRatio: '2:3' | '3:2', slots: PageTemplate['slots'],
): PageTemplate => ({
  id, name, category: 'trio', slotCount: 3, margin: ZERO,
  orientation: 'square', targetRatio, albumSizes: ['6x6'], fullBleed: true, slots,
});

/* PORTRAIT PAIR — vertical 2/3 split. Hero 4×6, pair 2×3, every slot 2:3. */
const T66_FB_TRIO_HERO_LEFT = fbTrio('t66-fb-trio-hero-left', 'Full Bleed Trio — Hero Left', '2:3', [
  fill(0, 0, 2 / 3, 1, '2:3'),
  fill(2 / 3, 0, 1 / 3, 1 / 2, '2:3'),
  fill(2 / 3, 1 / 2, 1 / 3, 1 / 2, '2:3'),
]);

const T66_FB_TRIO_HERO_RIGHT = fbTrio('t66-fb-trio-hero-right', 'Full Bleed Trio — Hero Right', '2:3', [
  fill(1 / 3, 0, 2 / 3, 1, '2:3'),
  fill(0, 0, 1 / 3, 1 / 2, '2:3'),
  fill(0, 1 / 2, 1 / 3, 1 / 2, '2:3'),
]);

/* LANDSCAPE PAIR — horizontal 2/3 split. Hero 6×4, pair 3×2, every slot 3:2.
   The same tiling rotated: the pair's inches are the portrait pair's
   transposed (2×3 becomes 3×2), which is what keeps the ratio exact. */
const T66_FB_TRIO_HERO_TOP = fbTrio('t66-fb-trio-hero-top', 'Full Bleed Trio — Hero Top', '3:2', [
  fill(0, 0, 1, 2 / 3, '3:2'),
  fill(0, 2 / 3, 1 / 2, 1 / 3, '3:2'),
  fill(1 / 2, 2 / 3, 1 / 2, 1 / 3, '3:2'),
]);

const T66_FB_TRIO_HERO_BOTTOM = fbTrio('t66-fb-trio-hero-bottom', 'Full Bleed Trio — Hero Bottom', '3:2', [
  fill(0, 1 / 3, 1, 2 / 3, '3:2'),
  fill(0, 0, 1 / 2, 1 / 3, '3:2'),
  fill(1 / 2, 0, 1 / 2, 1 / 3, '3:2'),
]);

/* ── 3 SQUARE photos + a combo box, full bleed ─────────────────────────────
   A 2×2 grid with no gutters: three cells are photos, the fourth is the combo
   box (quote / your text / clipart / QR).

   This is how SQUARE photos get a 3-up on a 6×6 at all. Three squares cannot
   tile a square — that dissection does not exist — so a pure 3-photo square
   page is impossible. Giving the fourth cell to the combo box makes the grid
   close, and the box earns its place instead of being dead margin.

   Every cell is 3.00" × 3.00", exact 1:1, half an inch over the 2" floor —
   the roomiest layout in the 6x6 set. The box is a full quadrant, so a quote
   sits in real space rather than a thin caption band.

   Four variants, one per corner: with no gutters the corner placement is the
   only thing that changes the composition, and it changes it completely. */
const fbSquareTrio = (id: string, name: string, boxCorner: 'tl' | 'tr' | 'bl' | 'br'): PageTemplate => {
  const cells: Record<'tl' | 'tr' | 'bl' | 'br', [number, number]> = {
    tl: [0, 0], tr: [1 / 2, 0], bl: [0, 1 / 2], br: [1 / 2, 1 / 2],
  };
  const order: ('tl' | 'tr' | 'bl' | 'br')[] = ['tl', 'tr', 'bl', 'br'];
  const [bx, by] = cells[boxCorner];
  return {
    id, name, category: 'trio', slotCount: 3, margin: ZERO,
    orientation: 'square', targetRatio: '1:1', albumSizes: ['6x6'], fullBleed: true,
    slots: order.filter((c) => c !== boxCorner).map((c) => fill(cells[c][0], cells[c][1], 1 / 2, 1 / 2, '1:1')),
    textSlots: [{ id: 'combo', x: bx, y: by, width: 1 / 2, height: 1 / 2, align: 'center', placeholder: 'Tap to add' }],
  };
};

const T66_FB_SQ_BOX_TL = fbSquareTrio('t66-fb-sq-box-tl', 'Square Trio — Box Top Left', 'tl');
const T66_FB_SQ_BOX_TR = fbSquareTrio('t66-fb-sq-box-tr', 'Square Trio — Box Top Right', 'tr');
const T66_FB_SQ_BOX_BL = fbSquareTrio('t66-fb-sq-box-bl', 'Square Trio — Box Bottom Left', 'bl');
const T66_FB_SQ_BOX_BR = fbSquareTrio('t66-fb-sq-box-br', 'Square Trio — Box Bottom Right', 'br');

export const TEMPLATES_6X6: PageTemplate[] = [
  T66_FB_TRIO_HERO_LEFT,
  T66_FB_TRIO_HERO_RIGHT,
  T66_FB_TRIO_HERO_TOP,
  T66_FB_TRIO_HERO_BOTTOM,
  T66_FB_SQ_BOX_TL,
  T66_FB_SQ_BOX_TR,
  T66_FB_SQ_BOX_BL,
  T66_FB_SQ_BOX_BR,
];
