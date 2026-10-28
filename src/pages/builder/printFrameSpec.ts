// ──────────────────────────────────────────────────────────────────────────
// PRINT FRAME SPEC: the numbers the print renderer draws a photo's frame
// with (printPipeline renderSlotPhoto), in a file with no browser code, so
// the 2.0 app's page renderer draws the very same frame from the same
// numbers (src/shared/sharedModules.ts). Sizes are DESIGN px; print draws
// each one at PRINT_FRAME_PX print px (the border scale frameWidth × 300/72).
// The DOM preview and the Fabric editor keep their own CSS / Fabric forms of
// these frames (types.ts frameStyleToCss, useCanvasEngine).
// ──────────────────────────────────────────────────────────────────────────
import { PRINT_DPI } from './printSize';

/** 1 design px of frame, in print px. */
export const PRINT_FRAME_PX = PRINT_DPI / 72;

/** A canvas drop shadow: colour, blur (shadowBlur) and how far down it falls. */
export interface PrintFrameShadow { color: string; blur: number; offsetY: number }

export const PRINT_FRAME = {
  /** Matte and polaroid: a white mat this far round the photo, a polaroid's
   *  bottom deeper, drawn under the photo with its shadow. */
  mat: { color: '#FFFFFF', pad: 8, polaroidBottom: 28 },
  matteShadow: { color: 'rgba(0,0,0,0.18)', blur: 6, offsetY: 0 } as PrintFrameShadow,
  polaroidShadow: { color: 'rgba(0,0,0,0.22)', blur: 16, offsetY: 6 } as PrintFrameShadow,
  /** Shadow box: a white backing the size of the photo, casting this shadow. */
  shadowbox: { color: '#FFFFFF', shadow: { color: 'rgba(0,0,0,0.25)', blur: 14, offsetY: 4 } as PrintFrameShadow },
  /** Rounded: corner radius as a share of the photo's shorter side, and the
   *  least border line it draws (so the soft corner reads). */
  rounded: { radius: 0.1, minBorder: 3 },
  /** Thin and double: one line this wide, this far in from the photo's edge. */
  inset: { lineWidth: 1, thin: 1, double: 3 },
  /** The border line is stroked on the photo's clip path this many times its
   *  width: the clip hides the outer half. */
  borderStroke: 2,
} as const;
