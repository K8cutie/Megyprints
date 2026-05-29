/** Preview pixel dimensions for each album size.
 *  These are the rendered preview sizes — scaled to fit the screen nicely. */

export const PREVIEW_DIMS: Record<string, { w: number; h: number }> = {
  '6x6':    { w: 420, h: 420 },
  '8x8':    { w: 460, h: 460 },
  '10x10':  { w: 500, h: 500 },
  '12x12':  { w: 540, h: 540 },
  '8x10':   { w: 460, h: 575 },
  '8x11':   { w: 440, h: 570 },
  '11x14':  { w: 460, h: 585 },
  'a4':     { w: 450, h: 636 },
  'a5':     { w: 420, h: 596 },
  '10x8':   { w: 575, h: 460 },
  '11x8':   { w: 570, h: 440 },
  '14x11':  { w: 585, h: 460 },
  'a4l':    { w: 636, h: 450 },
  'custom': { w: 460, h: 575 },
};
