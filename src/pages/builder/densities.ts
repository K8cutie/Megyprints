/**
 * densities.ts
 * ============================================================================
 * SINGLE SOURCE OF TRUTH for "how many photos per page look good at each album
 * size." Both Megy assistants (builder + home) and the wizard's size step read
 * from here, so the size guidance and the density options can never drift apart.
 */

/** Photos-per-page options offered for each album-size preset. */
export const DENSITY_BY_SIZE: Record<string, number[]> = {
  '6x4': [1, 2],
  '6x6': [1, 2],
  '8x8': [1, 2, 3, 4],
  '9x9': [1, 2, 3, 4],
  '11.5x8': [1, 2, 3, 4, 5],
  '8.5x11': [1, 2, 3, 4, 5],
};

/** Friendly name for each density count. */
export const DENSITY_LABELS: Record<number, string> = {
  1: 'Big & bold',
  2: 'Dynamic pair',
  3: 'Nice balance',
  4: 'Collage',
  5: 'Packed',
};

/** Fallback when a size isn't in the map (keeps callers crash-proof). */
export const DEFAULT_DENSITY: number[] = [1, 2, 3, 4];

/** Render the per-page range for a size as a label, e.g. "1-2" or "1-4". */
export function densityRangeLabel(sizePreset: string): string {
  const opts = DENSITY_BY_SIZE[sizePreset] ?? DEFAULT_DENSITY;
  if (opts.length === 0) return '';
  const lo = opts[0];
  const hi = opts[opts.length - 1];
  return lo === hi ? `${lo}` : `${lo}-${hi}`;
}
