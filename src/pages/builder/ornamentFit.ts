/* WHERE AN ORNAMENT SITS IN ITS SLOT. Moved out of ornaments.ts (whose
   pick-time rasterizer needs the browser) so the 2.0 app draws a graphic at
   the same spot and size (src/shared/sharedModules.ts); ornaments.ts
   re-exports it, so the website imports it as before. */

/** Centered square fit for an ornament inside a slot cell, with breathing-room
 *  padding. Shared by ALL THREE renderers (PageView, Fabric, print) so an
 *  ornament can never desync between them — the ornament analog of qrRect(). */
export function ornamentFit(sx: number, sy: number, sw: number, sh: number, pad = 0.82) {
  const side = Math.min(sw, sh) * pad;
  return { dx: sx + (sw - side) / 2, dy: sy + (sh - side) / 2, side };
}
