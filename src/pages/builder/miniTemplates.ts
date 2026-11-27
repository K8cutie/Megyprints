/* ═══════════════════════════════════════════════════════════════════════════
   THE MEGY MINI'S OWN LAYOUTS (owner, 2026-11-17: "im trying to avoid pages
   with lots of free spaces since the pages for mini are very few").

   The Mini has 16 pages, so every page is photos edge to edge: no word boxes
   and no white mats (the 6x8 album's layouts it used before, re-cut for A5,
   left an empty box on about half its pages). Words can still go ON a photo.

   Every frame is an A-shape. An A5 page halved is an A6 landscape frame;
   halved again, an A7 portrait frame; again, an A8 small landscape frame. A
   sheet of paper keeps its shape when it is halved (√2), so every frame is
   one of two shapes, about 1.41 wide or 0.71 tall, and a phone (4:3) or a
   camera (3:2) photo loses at most about 6% to the frame:

       Full page (A5)            1 portrait
       Two landscapes            2 A6
       Landscape over two        A6 over two A7 (and the other way up)
         portraits
       Four portraits            four A7
       Landscape over portrait   A6 over an A7 and two A8 (and the other way up)
         + two small
       Landscape over four small A6 over four A8

   A-shapes alone can't fill every roll: whatever the mix, a page of them
   keeps (photos − 1 + landscape frames) a multiple of 3, so two rolls in three
   would need a photo cut to half its size to fill 16 pages. ONE layout
   breaks that: a landscape over a portrait and a landscape side by side
   (THIRD_ROW below), in four ways round. Its frames are not A-shapes, but a
   phone photo loses about 13% to them (the sides of its landscapes), so a
   roll that has two landscapes and a portrait to spare never needs a cut.

   Frames meet with the house gutter (PHOTO_GUTTER_MM) and run to every edge
   of the page, the staple fold included (binding: the Mini has no spine
   allowance). Megy deals them with its own page planner (miniPlanner.ts),
   which fills all the pages; the old A5 layouts stay only so a Mini made
   before still opens (templatesA5.ts).
   ═══════════════════════════════════════════════════════════════════════════ */
import type { PageTemplate, PhotoRatio, TemplateMargin, TemplateSlot } from './types';
import { fill, gutterFrac } from './templateKit';

const MINI = '5.8x8.3' as const;
/** Megy Magazine's A4 (lib/megyMini) takes the same layouts: they are fractions
 *  of the page, and A4 is A5's shape, so its frames are the same, only bigger
 *  (the gaps too). Measured on A5, so the Megy Mini's pages stay exactly as
 *  they were. */
const A4 = '8.3x11.7' as const;
const W_IN = 148 / 25.4;
const H_IN = 210 / 25.4;
const ZERO: TemplateMargin = { top: 0, bottom: 0, left: 0, right: 0 };

/** The ratio a landscape frame (A6, A8: 1.41) and a portrait frame (A7, the
 *  page: 0.71) declare: the camera ratio nearest their shape. */
export const MINI_WIDE: PhotoRatio = '3:2';
export const MINI_TALL: PhotoRatio = '2:3';

// Fractions of the page: gutters across (gx) and down (gy).
const gx = gutterFrac(W_IN);
const gy = gutterFrac(H_IN);
const halfW = (1 - gx) / 2;      // an A7's width
const halfH = (1 - gy) / 2;      // an A6's (and an A7's) height
const quarterH = (halfH - gy) / 2; // an A8's height
const right = halfW + gx;
const lower = halfH + gy;

const wide = (x: number, y: number, w: number, h: number): TemplateSlot => fill(x, y, w, h, MINI_WIDE);
const tall = (x: number, y: number, w: number, h: number): TemplateSlot => fill(x, y, w, h, MINI_TALL);

/** What a planner needs of a layout: its frames' shapes, in frame order. */
export type MiniFrame = 'L' | 'P';

function t(id: string, name: string, category: PageTemplate['category'], target: PhotoRatio, slots: TemplateSlot[]): PageTemplate {
  return {
    id, name, category, slotCount: slots.length, margin: ZERO,
    orientation: target === MINI_TALL ? 'portrait' : 'landscape',
    targetRatio: target, albumSizes: [MINI, A4], fullBleed: true, slots,
  };
}

/** A landscape frame across a half (top or bottom). */
const halfWide = (y: number) => wide(0, y, 1, halfH);
/** Two portrait frames side by side across a half. */
const twoTall = (y: number) => [tall(0, y, halfW, halfH), tall(right, y, halfW, halfH)];
/** A portrait frame on the left of a half, two small landscapes stacked on its right. */
const tallAndTwoSmall = (y: number) => [tall(0, y, halfW, halfH), wide(right, y, halfW, quarterH), wide(right, y + quarterH + gy, halfW, quarterH)];
/** Four small landscapes in a half, two by two. */
const fourSmall = (y: number) => [
  wide(0, y, halfW, quarterH), wide(right, y, halfW, quarterH),
  wide(0, y + quarterH + gy, halfW, quarterH), wide(right, y + quarterH + gy, halfW, quarterH),
];

/* THIRD_ROW: the row is 80 mm high; in it a 54 mm portrait (2.1 in, over
   the 2 in print floor) and a 92.5 mm landscape; the landscape above or below
   takes the rest of the page (148 x 128.5 mm). Shapes 1.15 / 0.68 / 1.16. */
const NEAR_WIDE: PhotoRatio = '4:3';
const rowH = 80 / 210;
const bigH = 1 - rowH - gy;
const rowLow = bigH + gy;
const rowP = 54 / 148;
const rowL = 1 - rowP - gx;
const bigWide = (y: number) => fill(0, y, 1, bigH, NEAR_WIDE);
const rowPL = (y: number) => [tall(0, y, rowP, rowH), fill(rowP + gx, y, rowL, rowH, NEAR_WIDE)];
const rowLP = (y: number) => [fill(0, y, rowL, rowH, NEAR_WIDE), tall(rowL + gx, y, rowP, rowH)];

export const MINI_TEMPLATES: PageTemplate[] = [
  t('mini-full', 'Full Page', 'single', MINI_TALL, [tall(0, 0, 1, 1)]),
  t('mini-ll', 'Two Landscapes', 'duo', MINI_WIDE, [halfWide(0), halfWide(lower)]),
  t('mini-l-pp', 'Landscape Over Two Portraits', 'trio', MINI_WIDE, [halfWide(0), ...twoTall(lower)]),
  t('mini-pp-l', 'Two Portraits Over Landscape', 'trio', MINI_WIDE, [...twoTall(0), halfWide(lower)]),
  t('mini-pppp', 'Four Portraits', 'quad', MINI_TALL, [...twoTall(0), ...twoTall(lower)]),
  t('mini-l-pll', 'Landscape Over Portrait + Two Small', 'quad', MINI_WIDE, [halfWide(0), ...tallAndTwoSmall(lower)]),
  t('mini-pll-l', 'Portrait + Two Small Over Landscape', 'quad', MINI_WIDE, [...tallAndTwoSmall(0), halfWide(lower)]),
  t('mini-l-llll', 'Landscape Over Four Small', 'quint', MINI_WIDE, [halfWide(0), ...fourSmall(lower)]),
  // A landscape over (or under) a row of a portrait and a landscape.
  t('mini-l-pl', 'Landscape Over Portrait + Landscape', 'trio', NEAR_WIDE, [bigWide(0), ...rowPL(rowLow)]),
  t('mini-l-lp', 'Landscape Over Landscape + Portrait', 'trio', NEAR_WIDE, [bigWide(0), ...rowLP(rowLow)]),
  t('mini-pl-l', 'Portrait + Landscape Over Landscape', 'trio', NEAR_WIDE, [...rowPL(0), bigWide(rowH + gy)]),
  t('mini-lp-l', 'Landscape + Portrait Over Landscape', 'trio', NEAR_WIDE, [...rowLP(0), bigWide(rowH + gy)]),
];

/** Each Mini layout's frames, landscape or portrait, in frame order. */
export function miniFrames(template: PageTemplate): MiniFrame[] {
  return template.slots.map((s) => ((s.ratio ?? template.targetRatio) === MINI_TALL ? 'P' : 'L'));
}

export const isMiniTemplateId = (id: string | null | undefined): boolean =>
  !!id && MINI_TEMPLATES.some((tm) => tm.id === id);
