import type { PageTemplate, TemplateMargin } from './types';
import type { PhotoRatio } from './photoAnalyzer';
import { fill } from './templateKit';

/** ══════════════════════════════════════════════════════════════════════════
 *  6×6″ SQUARE — page layouts
 *
 *  Being re-authored from scratch, one layout at a time. This file is the SINGLE source
 *  of truth for 6×6 interior layouts: '6x6' is listed in PER_SIZE_AUTHORED, so
 *  the legacy hand-made block, the generated gap-fillers and the tiled
 *  generator all emit nothing for this size. What is in this array is exactly
 *  what the builder can deal, cycle through, and print.
 *
 *  A size with no layouts is not offered in the size picker, so 6×6 was hidden
 *  until the first layout landed. Covers are unaffected: they live in
 *  COVER_TEMPLATES.
 *
 *  STILL MISSING: 1- and 4-photo layouts. Until a 1-up exists the QR memory
 *  badge and the generator's hero/variety valve stay unreachable here, and the
 *  density picker cannot honour 'Big & bold'. Those gaps close as the set is
 *  authored out.
 *
 *  ── House rules for a 6×6 layout ─────────────────────────────────────────
 *  • Ratio-true slots. Build frames with rsBox/rsBoxExact so a slot's PRINTED
 *    aspect equals its declared `targetRatio`. The dealer matches photos to
 *    that declared ratio, so a lying slot crops silently.
 *  • Orientation is strict, ratio is loose. Every slot in one template shares
 *    the template's `targetRatio`; the dealer will place a neighbouring ratio
 *    of the SAME orientation into it (≤16% crop budget), never across.
 *  • 2" print floor. The safe area is 5.52×5.52" but a FULL-BLEED page spends
 *    the whole 6.00", and that 8% decides whether a 1/3 column clears the
 *    floor. Check with meetsPrintFloor('6x6', w, h, { fullBleed: true }) — omit
 *    the flag on a full-bleed slot and it under-reports and falsely fails.
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

   The smallest side is 2.00" — the floor exactly, with nothing to spare. That
   is why the gutter variants below take their gap out of the HERO and never
   out of the narrow column (see trioSlots).

   Phone portraits (3:4) land here at ~11% crop, inside the dealer's 16% loose
   budget, so this is a genuine home for portrait photos and not just DSLR ones. */
/** A 1mm gutter, as a fraction of the 6" page. "Full bleed with a gutter" means
 *  the SEAMS between photos open up while the outer edges still run off the
 *  page — so the gap shows the page background as a hairline, and nothing
 *  gains an outer margin. */
const GAP = (1 / 25.4) / 6;

/** Slot geometry for the four hero trios, with or without the internal gutter.
 *
 *  WHERE THE GUTTER COMES FROM matters more than its size. The narrow column is
 *  exactly 2.00" — the print floor, with nothing spare — so taking the gap out
 *  of it would print a 1.96" frame, under the floor. The HERO absorbs the whole
 *  gutter instead: it drops 4.00" -> 3.96", which costs it 0.98% of ratio
 *  accuracy and nothing else. The pair keeps its floor-critical 2.00" edge and
 *  only loses 0.66% on the other axis. */
type TrioVariant = 'left' | 'right' | 'top' | 'bottom';

function trioSlots(v: TrioVariant, gap: number): PageTemplate['slots'] {
  const r: PhotoRatio = v === 'left' || v === 'right' ? '2:3' : '3:2';
  const heroLong = 2 / 3 - gap;   // hero pays for the gutter
  const pairShort = 1 / 3;        // untouched — this is the 2.00" edge
  const pairLong = 1 / 2 - gap / 2;
  const pairOff = 1 / 2 + gap / 2;
  switch (v) {
    case 'left': return [
      fill(0, 0, heroLong, 1, r),
      fill(2 / 3, 0, pairShort, pairLong, r),
      fill(2 / 3, pairOff, pairShort, pairLong, r),
    ];
    case 'right': return [
      fill(1 / 3 + gap, 0, heroLong, 1, r),
      fill(0, 0, pairShort, pairLong, r),
      fill(0, pairOff, pairShort, pairLong, r),
    ];
    case 'top': return [
      fill(0, 0, 1, heroLong, r),
      fill(0, 2 / 3, pairLong, pairShort, r),
      fill(pairOff, 2 / 3, pairLong, pairShort, r),
    ];
    case 'bottom': return [
      fill(0, 1 / 3 + gap, 1, heroLong, r),
      fill(0, 0, pairLong, pairShort, r),
      fill(pairOff, 0, pairLong, pairShort, r),
    ];
  }
}

/** The hero is always slots[0], so the lead photo of a moment lands in the big
 *  frame regardless of where that frame sits on the page. */
const fbTrio = (id: string, name: string, v: TrioVariant, gap: number): PageTemplate => ({
  id, name, category: 'trio', slotCount: 3, margin: ZERO, orientation: 'square',
  targetRatio: v === 'left' || v === 'right' ? '2:3' : '3:2',
  albumSizes: ['6x6'], fullBleed: true, slots: trioSlots(v, gap),
});

/* PORTRAIT PAIR — vertical 2/3 split. Hero 4×6, pair 2×3, every slot 2:3.
   LANDSCAPE PAIR — the same tiling rotated. Hero 6×4, pair 3×2, every slot 3:2
   (the portrait pair's inches transposed, which is what keeps it exact). */
const T66_FB_TRIO_HERO_LEFT = fbTrio('t66-fb-trio-hero-left', 'Hero Left', 'left', 0);
const T66_FB_TRIO_HERO_RIGHT = fbTrio('t66-fb-trio-hero-right', 'Hero Right', 'right', 0);
const T66_FB_TRIO_HERO_TOP = fbTrio('t66-fb-trio-hero-top', 'Hero Top', 'top', 0);
const T66_FB_TRIO_HERO_BOTTOM = fbTrio('t66-fb-trio-hero-bottom', 'Hero Bottom', 'bottom', 0);

const T66_FB_TRIO_HERO_LEFT_G = fbTrio('t66-fb-trio-hero-left-gap', 'Hero Left · Thin Gap', 'left', GAP);
const T66_FB_TRIO_HERO_RIGHT_G = fbTrio('t66-fb-trio-hero-right-gap', 'Hero Right · Thin Gap', 'right', GAP);
const T66_FB_TRIO_HERO_TOP_G = fbTrio('t66-fb-trio-hero-top-gap', 'Hero Top · Thin Gap', 'top', GAP);
const T66_FB_TRIO_HERO_BOTTOM_G = fbTrio('t66-fb-trio-hero-bottom-gap', 'Hero Bottom · Thin Gap', 'bottom', GAP);

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
/*  The square grid takes the gutter EVENLY on both axes, so its cells shrink
    from 3.00" to 2.980" and stay perfectly 1:1 — no ratio cost at all, and
    still nearly an inch clear of the floor. */
type Corner = 'tl' | 'tr' | 'bl' | 'br';

const fbSquareTrio = (id: string, name: string, boxCorner: Corner, gap: number): PageTemplate => {
  const near = 0, far = 1 / 2 + gap / 2, side = 1 / 2 - gap / 2;
  const cells: Record<Corner, [number, number]> = {
    tl: [near, near], tr: [far, near], bl: [near, far], br: [far, far],
  };
  const order: Corner[] = ['tl', 'tr', 'bl', 'br'];
  const [bx, by] = cells[boxCorner];
  return {
    id, name, category: 'trio', slotCount: 3, margin: ZERO,
    orientation: 'square', targetRatio: '1:1', albumSizes: ['6x6'], fullBleed: true,
    slots: order.filter((c) => c !== boxCorner).map((c) => fill(cells[c][0], cells[c][1], side, side, '1:1')),
    textSlots: [{ id: 'combo', x: bx, y: by, width: side, height: side, align: 'center', placeholder: 'Tap to add' }],
  };
};

const T66_FB_SQ_BOX_TL = fbSquareTrio('t66-fb-sq-box-tl', 'Three Squares, Box Top Left', 'tl', 0);
const T66_FB_SQ_BOX_TR = fbSquareTrio('t66-fb-sq-box-tr', 'Three Squares, Box Top Right', 'tr', 0);
const T66_FB_SQ_BOX_BL = fbSquareTrio('t66-fb-sq-box-bl', 'Three Squares, Box Bottom Left', 'bl', 0);
const T66_FB_SQ_BOX_BR = fbSquareTrio('t66-fb-sq-box-br', 'Three Squares, Box Bottom Right', 'br', 0);

const T66_FB_SQ_BOX_TL_G = fbSquareTrio('t66-fb-sq-box-tl-gap', 'Three Squares, Box Top Left · Thin Gap', 'tl', GAP);
const T66_FB_SQ_BOX_TR_G = fbSquareTrio('t66-fb-sq-box-tr-gap', 'Three Squares, Box Top Right · Thin Gap', 'tr', GAP);
const T66_FB_SQ_BOX_BL_G = fbSquareTrio('t66-fb-sq-box-bl-gap', 'Three Squares, Box Bottom Left · Thin Gap', 'bl', GAP);
const T66_FB_SQ_BOX_BR_G = fbSquareTrio('t66-fb-sq-box-br-gap', 'Three Squares, Box Bottom Right · Thin Gap', 'br', GAP);

/* ── 2 photos, full bleed, maximum area ────────────────────────────────────
   One straight cut down the middle. Each photo gets 18 sq in — half the sheet,
   and the largest two photos can be on this page.

   THIS FAMILY CANNOT BE RATIO-EXACT, and that is a property of the page, not a
   shortcut. A rectangle splits into two rectangles only by a single cut, so the
   two slot aspects must satisfy r1 + r2 = 1 (vertical cut) or 1/r1 + 1/r2 = 1
   (horizontal). No pair of camera ratios does either — verified by exhaustive
   search over the whole ratio set. Equal halves therefore land on 1:2 / 2:1,
   which is not a camera ratio at all.

   The cost, stated plainly: 9:16 is the closest real ratio, so a matched photo
   is centre-cropped 11.1%. The declared targetRatio is 9:16 / 16:9 for
   matching, but the RECT is 1:2 / 2:1, so the dealer's 16% loose budget stacks
   on top of that gap — a 2:3 photo, which the budget admits at 15.6% from 9:16,
   actually loses 25% here. Use these when the customer wants scale; the trios
   and the exact-ratio families are where zero-crop lives.

   Mirrors are pointless: swapping two equal halves is the same picture, and
   dedupeByGeometry would collapse them anyway. So two layouts, plus gap twins. */
const fbDuo = (id: string, name: string, axis: 'v' | 'h', gap: number): PageTemplate => {
  const half = 1 / 2 - gap / 2, far = 1 / 2 + gap / 2;
  const r: PhotoRatio = axis === 'v' ? '9:16' : '16:9';
  return {
    id, name, category: 'duo', slotCount: 2, margin: ZERO, orientation: 'square',
    targetRatio: r, albumSizes: ['6x6'], fullBleed: true,
    slots: axis === 'v'
      ? [fill(0, 0, half, 1, r), fill(far, 0, half, 1, r)]
      : [fill(0, 0, 1, half, r), fill(0, far, 1, half, r)],
  };
};

const T66_FB_DUO_V = fbDuo('t66-fb-duo-split-v', 'Two Tall', 'v', 0);
const T66_FB_DUO_H = fbDuo('t66-fb-duo-split-h', 'Two Wide', 'h', 0);
const T66_FB_DUO_V_G = fbDuo('t66-fb-duo-split-v-gap', 'Two Tall · Thin Gap', 'v', GAP);
const T66_FB_DUO_H_G = fbDuo('t66-fb-duo-split-h-gap', 'Two Wide · Thin Gap', 'h', GAP);

/* ── 2 photos, exact ratio, combo box takes the remainder ──────────────────
   The page is still fully spent — the photos just stop at the largest size
   that keeps them ratio-true, and the combo box absorbs the leftover band
   instead of the photos being stretched into it.

     side by side  two 3.00 x 4.50" = 2:3 exact, box gets a 6.00 x 1.50" band
     stacked       two 4.50 x 3.00" = 3:2 exact, box gets a 1.50 x 6.00" column

   75% of the sheet is photo at ZERO crop, versus 100% at up to 25% crop in the
   max-area pair above. Same trade the square trio makes, and the reason both
   families exist. */
const fbDuoExact = (id: string, name: string, axis: 'v' | 'h'): PageTemplate => {
  const r: PhotoRatio = axis === 'v' ? '2:3' : '3:2';
  const band = 1 / 4;                 // 1.50" — the combo box's share
  const photo = 1 - band;             // 4.50"
  return {
    id, name, category: 'duo', slotCount: 2, margin: ZERO, orientation: 'square',
    targetRatio: r, albumSizes: ['6x6'], fullBleed: true,
    slots: axis === 'v'
      ? [fill(0, 0, 1 / 2, photo, r), fill(1 / 2, 0, 1 / 2, photo, r)]
      : [fill(0, 0, photo, 1 / 2, r), fill(0, 1 / 2, photo, 1 / 2, r)],
    textSlots: axis === 'v'
      ? [{ id: 'combo', x: 0, y: photo, width: 1, height: band, align: 'center', placeholder: 'Tap to add' }]
      : [{ id: 'combo', x: photo, y: 0, width: band, height: 1, align: 'center', placeholder: 'Tap to add' }],
  };
};

const T66_FB_DUO_EXACT_V = fbDuoExact('t66-fb-duo-exact-v', 'Two Portraits + Box', 'v');
const T66_FB_DUO_EXACT_H = fbDuoExact('t66-fb-duo-exact-h', 'Two Landscapes + Box', 'h');

export const TEMPLATES_6X6: PageTemplate[] = [
  T66_FB_DUO_EXACT_V,
  T66_FB_DUO_EXACT_H,
  T66_FB_DUO_V,
  T66_FB_DUO_H,
  T66_FB_DUO_V_G,
  T66_FB_DUO_H_G,
  T66_FB_TRIO_HERO_LEFT,
  T66_FB_TRIO_HERO_RIGHT,
  T66_FB_TRIO_HERO_TOP,
  T66_FB_TRIO_HERO_BOTTOM,
  T66_FB_TRIO_HERO_LEFT_G,
  T66_FB_TRIO_HERO_RIGHT_G,
  T66_FB_TRIO_HERO_TOP_G,
  T66_FB_TRIO_HERO_BOTTOM_G,
  T66_FB_SQ_BOX_TL,
  T66_FB_SQ_BOX_TR,
  T66_FB_SQ_BOX_BL,
  T66_FB_SQ_BOX_BR,
  T66_FB_SQ_BOX_TL_G,
  T66_FB_SQ_BOX_TR_G,
  T66_FB_SQ_BOX_BL_G,
  T66_FB_SQ_BOX_BR_G,
];
