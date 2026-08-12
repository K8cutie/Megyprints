/** Preview pixel dimensions for each album size.
 *  These are the rendered preview sizes — scaled to fit the screen nicely.
 *  Keyed by AlbumSizePreset so tsc FAILS here when a new size is added —
 *  this was one of the tsc-invisible size surfaces the structural audit
 *  flagged; keep the Record key typed. */

import type { AlbumSizePreset } from './types';

export const PREVIEW_DIMS: Record<AlbumSizePreset, { w: number; h: number }> = {
  '6x6':    { w: 420, h: 420 },   // square 1:1
  '8x8':    { w: 460, h: 460 },   // square 1:1
  '9x9':    { w: 500, h: 500 },   // square 1:1
  '6x4':    { w: 575, h: 383 },   // landscape 3:2
  '8x6':    { w: 560, h: 420 },   // landscape 4:3
  '6x8':    { w: 420, h: 560 },   // portrait 3:4
  '11.5x8': { w: 575, h: 400 },   // landscape ~1.44:1
  '8.5x11': { w: 440, h: 570 },   // portrait ~0.77:1
};
