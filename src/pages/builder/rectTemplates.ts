import type { PageTemplate, TemplateMargin, AlbumSizePreset } from './types';
import type { PhotoRatio } from './photoAnalyzer';
import { fill } from './templateKit';

/** ══════════════════════════════════════════════════════════════════════════
 *  4:3 RECT ALBUM LAYOUTS — one builder for 8×6 (landscape) and 6×8 (portrait).
 *
 *  6×8 IS 8×6 ROTATED, so every composition is the same one transposed: what is
 *  a column on the landscape page is a row on the portrait page, and each slot's
 *  ratio flips with it (4:3 ↔ 3:4, 2:3 ↔ 3:2). Authoring them from one builder
 *  keeps the two sizes in lockstep — add a layout once and both get it.
 *
 *  ── The geometry, and why these are the only shapes here ──────────────────
 *  Page 8.00 × 6.00" (or 6.00 × 8.00"). Full bleed spends the whole sheet.
 *  Print floor: every frame's SHORT side must be ≥ 2.00".
 *
 *    1 photo   whole page              8×6     → 4:3  ✓ exact
 *    2 photos  split the LONG side     two 4×6 → 2:3  ✓ exact (portrait pair)
 *              split the SHORT side    two 8×3 → 8:3  ✗ no camera ratio, crops hard
 *    3 photos  hero + stacked pair     4×6 hero (2:3) + two 4×3 (4:3) ✓ both exact
 *              three equal columns     2.67×6  → 4:9  ✗ narrower than 9:16
 *
 *  So the 2-up and 3-up each have exactly ONE valid tiling, and the 3-up is
 *  necessarily MIXED-ratio (a portrait hero beside two landscapes). A 3-up where
 *  all three share one ratio does not exist on a 4:3 page.
 *
 *  A full-bleed SINGLE must match the page aspect (cropSafe tests whether the
 *  slot covers the whole sheet), which is why "Full Page" is 4:3 / 3:4.
 *  ══════════════════════════════════════════════════════════════════════════ */

const ZERO: TemplateMargin = { top: 0, bottom: 0, left: 0, right: 0 };

const PREFIX: Record<string, string> = { '8x6': 't86', '6x8': 't68' };

/** The four ratios this page shape forces, named by ROLE so the transpose is
 *  a single lookup instead of a pile of ternaries. */
interface Axis {
  /** the whole sheet */
  page: PhotoRatio;
  /** half the page, split along its long side (the 2-up cell + the trio hero) */
  half: PhotoRatio;
  /** a quarter — half the long side AND half the short side (the trio pair) */
  quarter: PhotoRatio;
  landscape: boolean;
}
const AXIS: Record<string, Axis> = {
  // 8×6: page 4:3 · half = 4×6 portrait (2:3) · quarter = 4×3 (4:3)
  '8x6': { page: '4:3', half: '2:3', quarter: '4:3', landscape: true },
  // 6×8: page 3:4 · half = 6×4 landscape (3:2) · quarter = 3×4 (3:4)
  '6x8': { page: '3:4', half: '3:2', quarter: '3:4', landscape: false },
};

const orientOf = (r: PhotoRatio): PageTemplate['orientation'] =>
  r === '3:2' || r === '4:3' || r === '16:9' ? 'landscape' : r === '1:1' ? 'square' : 'portrait';

/** Build the 4:3-rect layout set for one album size (8×6 or 6×8). */
export function buildRectTemplates(size: AlbumSizePreset): PageTemplate[] {
  const idp = PREFIX[size] ?? 't' + size.replace(/\D/g, '');
  const id = (suffix: string) => `${idp}-${suffix}`;
  const A = AXIS[size];
  if (!A) return [];

  /** Place a rect in PAGE fractions, transposing for the portrait size so one
   *  set of numbers describes both. `a` runs along the page's LONG axis. */
  const rect = (a: number, b: number, aLen: number, bLen: number, ratio: PhotoRatio) =>
    (A.landscape ? fill(a, b, aLen, bLen, ratio) : fill(b, a, bLen, aLen, ratio));

  const tmpl = (
    suffix: string, name: string, category: PageTemplate['category'],
    targetRatio: PhotoRatio, slots: PageTemplate['slots'],
  ): PageTemplate => ({
    id: id(suffix), name, category, slotCount: slots.length, margin: ZERO,
    orientation: orientOf(targetRatio), targetRatio, albumSizes: [size],
    fullBleed: true, slots,
  });

  /* 1 photo — the whole sheet at the page's own ratio (the only crop-safe
     full-bleed single: an off-ratio one would behead the photo). */
  const solo = tmpl('fb-solo', 'Full Page', 'single', A.page, [rect(0, 0, 1, 1, A.page)]);

  /* 2 photos — split the LONG side. Each cell is half the page and lands on an
     exact camera ratio; the other split (8×3 cells) has no camera ratio at all. */
  const duo = tmpl('fb-duo', A.landscape ? 'Two Portraits' : 'Two Landscapes', 'duo', A.half, [
    rect(0, 0, 1 / 2, 1, A.half),
    rect(1 / 2, 0, 1 / 2, 1, A.half),
  ]);

  /* 3 photos — a half-page hero beside two stacked quarters. Mixed-ratio by
     necessity, but every slot is exact: hero 4×6 (2:3), pair 4×3 (4:3). */
  const trio = (suffix: string, name: string, heroFirst: boolean) => {
    const heroA = heroFirst ? 0 : 1 / 2;
    const pairA = heroFirst ? 1 / 2 : 0;
    return tmpl(suffix, name, 'trio', A.half, [
      rect(heroA, 0, 1 / 2, 1, A.half),
      rect(pairA, 0, 1 / 2, 1 / 2, A.quarter),
      rect(pairA, 1 / 2, 1 / 2, 1 / 2, A.quarter),
    ]);
  };

  return [
    solo,
    duo,
    trio('fb-trio-hero-first', A.landscape ? 'Hero Left' : 'Hero Top', true),
    trio('fb-trio-hero-second', A.landscape ? 'Hero Right' : 'Hero Bottom', false),
  ];
}
