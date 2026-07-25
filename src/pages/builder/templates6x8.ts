import type { PageTemplate } from './types';

/** ══════════════════════════════════════════════════════════════════════════
 *  6×8″ PORTRAIT — page layouts (CLEAN SLATE, authored one at a time)
 *
 *  6×8 is a 3:4 portrait page (6 wide, 8 tall) — the 8×6 rotated. It is listed
 *  in PER_SIZE_AUTHORED, so the tiled generator, the legacy hand-made block and
 *  the gap-fillers emit NOTHING selectable for it — this file is the single
 *  source of truth for what the builder can deal on a 6×8.
 *
 *  While this array is EMPTY the size is not offered in any size picker
 *  (albumSizeOptions drops a size with zero layouts) — intentional.
 *
 *  ── The numbers that govern a 6×8 layout ───────────────────────────────────
 *  Page 6.00 × 8.00". Safe area (0.04 margin each side) = 5.52 × 7.36".
 *  FULL BLEED spends the whole 6.00 × 8.00".
 *  Print floor: every frame's SHORT side must be ≥ 2.00".
 *
 *  Full-bleed splits that clear the floor (page is 6" wide):
 *    1-up  whole page                        6×8    → 3:4  ✓
 *    2-up  horizontal split    two 6×4       6×4    → 3:2  ✓ (landscape pair)
 *          vertical split      two 3×8       3×8    → ✗ 3:8 is no camera ratio
 *    3-up  thirds (stacked)    three 6×2.67  6×2.67 → ✓ 2.67" clears the floor
 *          hero 6×4 + two 3×4  6×4 / 3×4     3:2 + 3:4 ✓ (mixed-ratio hero trio)
 *    4-up  2×2 quadrants       four 3×4      3×4    → 3:4 ✓ (exact camera ratio)
 *    6-up  2×3 grid            six 3×2.67    3×2.67 → ~9:8, near-square crop
 *  Mirror of the 8×6 math with width/height swapped — every landscape split
 *  there becomes a portrait split here.
 *  ══════════════════════════════════════════════════════════════════════════ */

export const TEMPLATES_6X8: PageTemplate[] = [];
