import type { PageTemplate } from './types';

/** ══════════════════════════════════════════════════════════════════════════
 *  8×6″ LANDSCAPE — page layouts (CLEAN SLATE, authored one at a time)
 *
 *  8×6 is a 4:3 landscape page (8 wide, 6 tall). It is listed in
 *  PER_SIZE_AUTHORED, so the tiled generator, the legacy hand-made block and the
 *  gap-fillers emit NOTHING selectable for it — this file is the single source of
 *  truth for what the builder can deal on an 8×6.
 *
 *  While this array is EMPTY the size is not offered in any size picker
 *  (albumSizeOptions drops a size with zero layouts) — that is intentional, the
 *  same state 6×6 was in during its rebuild.
 *
 *  ── The numbers that govern an 8×6 layout ──────────────────────────────────
 *  Page 8.00 × 6.00". Safe area (0.04 margin each side) = 7.36 × 5.52".
 *  FULL BLEED spends the whole 8.00 × 6.00".
 *  Print floor: every frame's SHORT side must be ≥ 2.00".
 *
 *  Full-bleed splits that clear the floor (page is 6" tall):
 *    1-up  whole page                        8×6    → 4:3  ✓
 *    2-up  vertical split      two 4×6       4×6    → 2:3  ✓ (portrait pair)
 *          horizontal split    two 8×3       8×3    → ✗ 3.0" ok but 8:3 is no
 *                                             camera ratio (would crop hard)
 *    3-up  thirds (vertical)   three 2.67×6  2.67×6 → ✓ 2.67" clears the floor
 *          hero 4×6 + two 4×3  4×6 / 4×3     2:3 + 4:3 ✓ (mixed-ratio hero trio)
 *    4-up  2×2 quadrants       four 4×3      4×3    → 4:3 ✓ (exact camera ratio)
 *    6-up  3×2 grid            six 2.67×3    2.67×3 → ~8:9, near-square crop
 *  Composition dictates the ratio — pick splits whose forced ratio lands on a
 *  real camera ratio (4:3 / 3:4 / 2:3 / 3:2 / 1:1), else the photo gets cropped.
 *  ══════════════════════════════════════════════════════════════════════════ */

export const TEMPLATES_8X6: PageTemplate[] = [];
