import { describe, it, expect } from 'vitest';
import { chooserListSizes, CHOOSER_TITLE } from './chooserFit';

/* ══════════════════════════════════════════════════════════════════════════
   "CLICK TO ADD:" FITS ITS BOX (1-star testers, 2026-10-04, the Gift-giver):
   on a phone, Change layout → Four Squares — "'Click to add:' is too big for
   the box. The 'C' is clipped on the left and the colon on the right in every
   empty box." The title was 15% of the box on one unwrapped line; it is now
   sized to the box's inner width, or the box shows the "+" bubble.
   ══════════════════════════════════════════════════════════════════════════ */

const OPTIONS = ['Photo', 'Quote', 'Text'];
const wide = (fs: number, chars: number) => fs * chars * 0.72; // a safe bold upper bound

describe('chooserListSizes', () => {
  it.each([96, 120, 150, 200, 300, 460])('a %ipx box: the title and the list fit inside it', (side) => {
    const s = chooserListSizes(side, side, OPTIONS);
    if (!s) return; // falls back to "+": nothing to clip
    const inner = side - 16;
    expect(wide(s.titleFs, CHOOSER_TITLE.length)).toBeLessThanOrEqual(inner + 0.01);
    expect(wide(s.listFs, 'Quote'.length + 3)).toBeLessThanOrEqual(inner + 0.01);
    expect(s.titleFs * 1.2 + 6 + OPTIONS.length * s.listFs * 1.5).toBeLessThanOrEqual(inner);
  });

  it("the tester's phone four-square box (~150px): it fits now; the old size ran past the edges", () => {
    const old = Math.max(12, Math.min(28, 150 * 0.15)) * 1.15;
    expect(wide(old, CHOOSER_TITLE.length)).toBeGreaterThan(150 - 16); // why the "C" and ":" were cut
    const s = chooserListSizes(150, 150, OPTIONS)!;
    expect(s).not.toBeNull();
    expect(wide(s.titleFs, CHOOSER_TITLE.length)).toBeLessThanOrEqual(150 - 16);
  });

  it('a big box keeps the big title (capped as before)', () => {
    expect(chooserListSizes(460, 460, OPTIONS)!.titleFs).toBeCloseTo(28 * 1.15);
  });

  it('a box too small to read it → the "+" bubble', () => {
    expect(chooserListSizes(70, 70, OPTIONS)).toBeNull();
  });
});
