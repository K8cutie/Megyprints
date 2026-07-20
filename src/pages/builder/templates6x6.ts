import type { PageTemplate, TemplateMargin } from './types';
import type { PhotoRatio } from './photoAnalyzer';
import { fill, rsBox, STD } from './templateKit';

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
 *  NEVER re-add a half-and-half 2-up (two 3x6" or two 6x3"). It uses the whole
 *  sheet but crops a 2:3 photo 25% — beheading — and was deleted for that.
 *
 *  STILL MISSING: a SQUARE 2-up and any 4-photo layout. Square having no 2-up
 *  is why 80-104 square photos still leave blank pages — see the commit log.
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


/* ── 2 photos, exact ratio, combo box takes the remainder ──────────────────
   The page is still fully spent — the photos just stop at the largest size
   that keeps them ratio-true, and the combo box absorbs the leftover band
   instead of the photos being stretched into it.

     side by side  two 3.00 x 4.50" = 2:3 exact, box gets a 6.00 x 1.50" band
     stacked       two 4.50 x 3.00" = 3:2 exact, box gets a 1.50 x 6.00" column

   75% of the sheet is photo at ZERO crop. A true half-and-half 2-up would use
   100% of the sheet, but no two camera ratios tile a square (r1 + r2 = 1 has no
   solution over the ratio set), so equal halves land on 1:2 / 2:1 and cost a
   2:3 photo 25% of itself — heads and feet. That family was built and DELETED
   for exactly that reason; do not re-add it. The combo box absorbing the
   leftover band is the honest way to spend the rest of the page. */
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

/* ── 1 photo, full bleed ───────────────────────────────────────────────────
   One photo, the whole 6×6 sheet, no margin. The simplest page here and the
   only one that gives a single photo the entire page.

   IT MUST BE 1:1, and that is enforced upstream, not a preference. cropSafe in
   generateAlbum only deals a full-bleed SINGLE whose targetRatio matches the
   page aspect within ~12%: a 6×6 page is aspect 1, so 4:3 (0.288 in log terms)
   and 2:3 are both rejected. The reason is the same one that killed the
   half-and-half 2-up — a full-bleed single object-covers the WHOLE page, so an
   off-orientation photo loses a third of itself off the top and bottom.

   Orientation matching then does the rest: a 1:1 template is 'square', and the
   dealer never crosses orientation, so only square photos are ever placed here
   and they land at 0.00% crop. Portrait and landscape photos are not stranded —
   they keep the hero trios and the exact-ratio pair. If they ever want a page
   to themselves it has to be a MARGINED single (photo at its true ratio inside
   the safe area), which is a different family and not full bleed.

   This is also what re-enables the generator's hero sprinkle: heroAllowed is
   gated on singles.length > 0, which was permanently false for 6×6 while every
   layout was a multi. */
const T66_FB_SOLO: PageTemplate = {
  id: 't66-fb-solo',
  name: 'Full Page',
  category: 'single',
  slotCount: 1,
  margin: ZERO,
  orientation: 'square',
  targetRatio: '1:1',
  albumSizes: ['6x6'],
  fullBleed: true,
  slots: [fill(0, 0, 1, 1, '1:1')],
};

/* ── 1 photo, MARGINED ─────────────────────────────────────────────────────
   One photo at its true ratio inside the 5.52" safe area, page background all
   around it. The most traditional page in the set, and the only one here that
   is not full bleed.

   It exists because portrait and landscape photos CANNOT have a full-bleed
   single on a square page — covering the whole 6×6 with a 2:3 photo throws away
   a third of it off the top and bottom, and cropSafe rejects it for that
   reason. Fitting instead of filling is the only way to give those photos a
   page of their own without cutting them:

     portrait   3.68 x 5.52" = 2:3 exact
     landscape  5.52 x 3.68" = 3:2 exact

   Both are far clear of the 2" floor. NOTE these must be appended to
   PAGE_TEMPLATES after applySinglePicFullBleed, which would otherwise promote
   any single-photo template to full bleed and undo exactly this. */
const T66_SOLO_PORTRAIT: PageTemplate = {
  id: 't66-solo-portrait',
  name: 'Single Portrait',
  category: 'single',
  slotCount: 1,
  margin: STD,
  orientation: 'square',
  targetRatio: '2:3',
  albumSizes: ['6x6'],
  slots: [rsBox(0, 0, '2:3', 1, 1, '6x6')],
};

const T66_SOLO_LANDSCAPE: PageTemplate = {
  id: 't66-solo-landscape',
  name: 'Single Landscape',
  category: 'single',
  slotCount: 1,
  margin: STD,
  orientation: 'square',
  targetRatio: '3:2',
  albumSizes: ['6x6'],
  slots: [rsBox(0, 0, '3:2', 1, 1, '6x6')],
};

/* A MARGINED square single — a 5.52 x 5.52" framed print. Square photos need a
   SECOND single-photo layout: t66-fb-solo is the only other one, so an album of
   square photos at 1 photo/page would otherwise repeat the identical full-bleed
   page on every sheet (the generator cannot vary a deck of one). This gives the
   full-page / framed alternation, and it is the classic look full bleed cannot
   produce. */
const T66_SOLO_SQUARE: PageTemplate = {
  id: 't66-solo-square',
  name: 'Single Square',
  category: 'single',
  slotCount: 1,
  margin: STD,
  orientation: 'square',
  targetRatio: '1:1',
  albumSizes: ['6x6'],
  slots: [rsBox(0, 0, '1:1', 1, 1, '6x6')],
};

/* ── 1 photo FULL BLEED at its own ratio + a combo box ─────────────────────
   The photo takes the part of the page that matches its ratio and bleeds off
   three edges; the combo box takes the strip that is left.

     landscape  photo 6.00 x 4.00" = 3:2 exact, box gets 6.00 x 2.00"
     portrait   photo 4.00 x 6.00" = 2:3 exact, box gets 2.00 x 6.00"

   This is the better single for an off-orientation photo. Against the MARGINED
   single (3.68 x 5.52" floating in the safe area) the photo is 24.0 sq in
   instead of 20.3 — 18% larger — it bleeds instead of floating, AND the page
   gains a box. Both stay because they look completely different: one is a
   framed print, this one is a magazine spread.

   Same move as the square trio and the exact-ratio duo: when the page shape
   and the photo shape disagree, spend the difference on the combo box rather
   than on cropping the photo.

   NOTE this only reaches auto-generation because cropSafe now tests whether the
   photo covers the WHOLE sheet rather than whether the template is full bleed
   (see generateAlbum). By the flag alone these were rejected as if the photo
   were being stretched across the page, which is the opposite of what they do. */
const fbSoloBox = (
  id: string, name: string, axis: 'landscape' | 'portrait', boxFirst: boolean,
): PageTemplate => {
  const r: PhotoRatio = axis === 'landscape' ? '3:2' : '2:3';
  const photo = 2 / 3, box = 1 / 3;
  const photoAt = boxFirst ? box : 0;
  const boxAt = boxFirst ? 0 : photo;
  return {
    id, name, category: 'single', slotCount: 1, margin: ZERO, orientation: 'square',
    targetRatio: r, albumSizes: ['6x6'], fullBleed: true,
    slots: [axis === 'landscape'
      ? fill(0, photoAt, 1, photo, r)
      : fill(photoAt, 0, photo, 1, r)],
    textSlots: [axis === 'landscape'
      ? { id: 'combo', x: 0, y: boxAt, width: 1, height: box, align: 'center', placeholder: 'Tap to add' }
      : { id: 'combo', x: boxAt, y: 0, width: box, height: 1, align: 'center', placeholder: 'Tap to add' }],
  };
};

const T66_FB_SOLO_LS_BOX_BELOW = fbSoloBox('t66-fb-solo-ls-box-below', 'Landscape + Box Below', 'landscape', false);
const T66_FB_SOLO_LS_BOX_ABOVE = fbSoloBox('t66-fb-solo-ls-box-above', 'Landscape + Box Above', 'landscape', true);
const T66_FB_SOLO_PT_BOX_RIGHT = fbSoloBox('t66-fb-solo-pt-box-right', 'Portrait + Box Right', 'portrait', false);
const T66_FB_SOLO_PT_BOX_LEFT = fbSoloBox('t66-fb-solo-pt-box-left', 'Portrait + Box Left', 'portrait', true);

/* ── 1 photo FULL BLEED + TWO combo boxes ──────────────────────────────────
   The same page as above, but the leftover 1/3 strip is split into TWO combo
   boxes instead of one — so the strip can hold two independent things (a quote
   AND a QR, a caption AND clipart) rather than making the customer choose.

     landscape  photo 6.00 x 4.00" = 3:2   two boxes each 3.00 x 2.00"
     portrait   photo 4.00 x 6.00" = 2:3   two boxes each 2.00 x 3.00"

   The photo and the empty footprint are IDENTICAL to the single-box version —
   the strip is 1/3 of the page either way — so this costs nothing new and the
   caption cadence (which throttles box pages, not box count) treats it the
   same. It is a distinct composition, so dedupeByGeometry keeps it. */
const fbSoloTwoBox = (
  id: string, name: string, axis: 'landscape' | 'portrait', boxFirst: boolean,
): PageTemplate => {
  const r: PhotoRatio = axis === 'landscape' ? '3:2' : '2:3';
  const photo = 2 / 3, strip = 1 / 3, half = 1 / 2;
  const photoAt = boxFirst ? strip : 0;
  const stripAt = boxFirst ? 0 : photo;
  const cell = (i: number, x: number, y: number, w: number, h: number) =>
    ({ id: `combo-${i}`, x, y, width: w, height: h, align: 'center' as const, placeholder: 'Tap to add' });
  return {
    id, name, category: 'single', slotCount: 1, margin: ZERO, orientation: 'square',
    targetRatio: r, albumSizes: ['6x6'], fullBleed: true,
    slots: [axis === 'landscape'
      ? fill(0, photoAt, 1, photo, r)
      : fill(photoAt, 0, photo, 1, r)],
    textSlots: axis === 'landscape'
      ? [cell(0, 0, stripAt, half, strip), cell(1, half, stripAt, half, strip)]
      : [cell(0, stripAt, 0, strip, half), cell(1, stripAt, half, strip, half)],
  };
};

const T66_FB_SOLO_LS_TWOBOX_BELOW = fbSoloTwoBox('t66-fb-solo-ls-twobox-below', 'Landscape + Two Boxes Below', 'landscape', false);
const T66_FB_SOLO_LS_TWOBOX_ABOVE = fbSoloTwoBox('t66-fb-solo-ls-twobox-above', 'Landscape + Two Boxes Above', 'landscape', true);
const T66_FB_SOLO_PT_TWOBOX_RIGHT = fbSoloTwoBox('t66-fb-solo-pt-twobox-right', 'Portrait + Two Boxes Right', 'portrait', false);
const T66_FB_SOLO_PT_TWOBOX_LEFT = fbSoloTwoBox('t66-fb-solo-pt-twobox-left', 'Portrait + Two Boxes Left', 'portrait', true);

export const TEMPLATES_6X6: PageTemplate[] = [
  T66_FB_SOLO,
  T66_SOLO_PORTRAIT,
  T66_SOLO_LANDSCAPE,
  T66_SOLO_SQUARE,
  T66_FB_SOLO_LS_BOX_BELOW,
  T66_FB_SOLO_LS_BOX_ABOVE,
  T66_FB_SOLO_PT_BOX_RIGHT,
  T66_FB_SOLO_PT_BOX_LEFT,
  T66_FB_SOLO_LS_TWOBOX_BELOW,
  T66_FB_SOLO_LS_TWOBOX_ABOVE,
  T66_FB_SOLO_PT_TWOBOX_RIGHT,
  T66_FB_SOLO_PT_TWOBOX_LEFT,
  T66_FB_DUO_EXACT_V,
  T66_FB_DUO_EXACT_H,
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
