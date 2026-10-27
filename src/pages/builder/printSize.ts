import type { AlbumSizePreset } from './types';
import { ALBUM_SIZES } from './types';
import { getCanvasDimensions } from './layouts';

/* ══════════════════════════════════════════════════════════════════════════
   PRINT SIZE: how big a page is in the print file (300 DPI). Moved out of
   printPipeline.ts so the 2.0 app draws its pages at the same size
   (src/shared/sharedModules.ts); printPipeline.ts re-exports all of it.
   ══════════════════════════════════════════════════════════════════════════ */

/** Print resolution in DPI (dots per inch) */
export const PRINT_DPI = 300;

/** Multiplier for 300 DPI export relative to UI canvas.
 *  UI dimensions come from the SAME getCanvasDimensions the Fabric editor uses
 *  — this file used to carry its own hand-copied size switch (stale values,
 *  '9x9' missing entirely), which the structural audit flagged as the #1
 *  drift copy in the repo. Never re-introduce a local size table here. */
export function getPrintMultiplier(albumSize: AlbumSizePreset): number {
  const uiSize = getCanvasDimensions(albumSize);
  const printSize = getPrintDimensions(albumSize);
  // Use the larger dimension to determine scale
  const scale = Math.max(
    printSize.width / uiSize.width,
    printSize.height / uiSize.height,
  );
  return Math.ceil(scale);
}

/** Print dimensions in pixels at 300 DPI.
 *  ALBUM_SIZES already stores the print pixel size at 300 DPI
 *  (e.g. an 8" side = 8 × 300 = 2400px), so we return it directly. */
export function getPrintDimensions(albumSize: AlbumSizePreset) {
  const config = ALBUM_SIZES.find((s) => s.preset === albumSize);
  if (!config) return { width: 2400, height: 2400 };
  return { width: config.width, height: config.height };
}
