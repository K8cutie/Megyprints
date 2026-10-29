/* WHERE A MEMORY QR SITS IN ITS SLOT. Moved out of qrMemory.ts (which needs
   the browser's build tool and the qrcode package) so the 2.0 app draws the
   QR at the same spot and size (src/shared/sharedModules.ts); qrMemory.ts
   re-exports it, so the website imports it as before. */

/** Contain-fit a square QR centered in a slot rect. Used by ALL THREE renderers
 *  (PageView, Fabric, print) so the QR can never desync between them. */
export function qrRect(sx: number, sy: number, sw: number, sh: number) {
  const side = Math.min(sw, sh);
  return { dx: sx + (sw - side) / 2, dy: sy + (sh - side) / 2, side };
}
