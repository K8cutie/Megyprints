import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { coverTitleFit, COVER_TITLE_TOO_LONG_MESSAGE, type Measurer } from './textFit';
import type { AlbumPage } from './types';

/* ══════════════════════════════════════════════════════════════════════════
   A COVER TITLE THAT DOESN'T FIT THE FRONT IS SAID (1-star testers round 3,
   the Perfectionist and the Rule-Breaker; both confirmed by the checker):
   "Hong Kong Summer 2026: Disneyland, Ocean Park, Victoria Peak and the
   Birthday Dimsum at Tim Ho Wan" in Great Vibes 56 showed only its middle
   lines on the front (the first and last cut off), and a 240-character title
   showed less; the only note was the spine's, and Order said nothing. Now the
   cover designer says it with "Make it fit", and Order's check says it.
   ══════════════════════════════════════════════════════════════════════════ */

/** A stand-in for canvas text measuring: every character 0.6 em wide. */
const fake = (): Measurer => {
  const m = { font: '', measureText: (s: string) => ({ width: s.length * 0.6 * Number(/(\d+(\.\d+)?)px/.exec(m.font)?.[1] ?? 16) }) as TextMetrics };
  return m as unknown as Measurer;
};
const LONG = 'Hong Kong Summer 2026: Disneyland, Ocean Park, Victoria Peak and the Birthday Dimsum at Tim Ho Wan';
const RULE_BREAKER = 'Supercalifragilisticexpialidocious Hong Kong Victoria Peak Mong Kok Tsim Sha Tsui Lantau Big Buddha Star Ferry Night Market Dim Sum Extravaganza Twenty Twenty Six Edition Volume One Hundred WOOOO this is the longest title ever typed into a cover END';
const cover = (text: string, fontSize: number): AlbumPage => ({
  id: 'cover-front', layout: 'freeform', size: '8x8', background: { type: 'solid', solid: '#FFFBF7' }, photos: [],
  templateId: 'cover-hero', slotFills: [null],
  textElements: [{ id: 'ft', text, boxIndex: 0, x: 0, y: 0, rotation: 0, opacity: 1, fontSize, fontFamily: 'Great Vibes, cursive', color: '#FFFFFF', bold: false, italic: false, underline: false, alignment: 'center' }],
} as AlbumPage);

describe('does the cover title fit the front?', () => {
  it('"The Cruz Family" at 32 fits', () => {
    expect(coverTitleFit(cover('The Cruz Family', 32), '8x8', fake())).toEqual({ fits: true, fitsAt: null });
  });
  it('the Perfectionist\'s title at 56 doesn\'t, and "Make it fit" has a size that does', () => {
    const f = coverTitleFit(cover(LONG, 56), '8x8', fake())!;
    expect(f.fits).toBe(false);
    expect(f.fitsAt).toBeGreaterThanOrEqual(8);
    expect(f.fitsAt).toBeLessThan(56);
    expect(coverTitleFit(cover(LONG, f.fitsAt!), '8x8', fake())!.fits).toBe(true);
  });
  it('the Rule-Breaker\'s 240 characters don\'t fit at 32', () => {
    expect(coverTitleFit(cover(RULE_BREAKER, 32), '8x8', fake())!.fits).toBe(false);
  });
  it('on every size: the long title at 56 is caught', () => {
    for (const size of ['6x4', '6x6', '8x8', '9x9', '8x6', '6x8', '11.5x8', '8.5x11'] as const) {
      expect(coverTitleFit({ ...cover(LONG, 56), size }, size, fake())?.fits, size).toBe(false);
    }
  });
  it('no title, no cover, or no way to measure: nothing to say (never a false alarm)', () => {
    expect(coverTitleFit(cover('', 32), '8x8', fake())).toBeNull();
    expect(coverTitleFit(null, '8x8', fake())).toBeNull();
    expect(coverTitleFit(cover(LONG, 56), '8x8', null)).toBeNull();
  });
});

describe('where it is said', () => {
  it('the cover designer: under the title, with "Make it fit (size N)" (source guard)', () => {
    const src = readFileSync(resolve(__dirname, 'CoverEditor.tsx'), 'utf8');
    expect(src).toContain('const titleFit = useMemo(() => coverTitleFit(coverFront, albumSize), [coverFront, albumSize]);');
    expect(src).toContain('Too long for the front cover: part of it will be cut off in print.');
    expect(src).toContain('onClick={() => updateTitle({ fontSize: titleFit.fitsAt! })} data-testid="cover-title-make-fit"');
  });
  it('Order\'s "Before you order" check, and "Show me" opens the cover (source guard)', () => {
    const src = readFileSync(resolve(__dirname, 'BuilderPreview.tsx'), 'utf8');
    expect(src).toContain("titleCut ? COVER_TITLE_TOO_LONG_MESSAGE : ''");
    expect(src).toContain('if (coverIsBlank(coverFront) || coverTitleFit(coverFront, albumSize)?.fits === false) { setCoverOpen(true); return; }');
    expect(COVER_TITLE_TOO_LONG_MESSAGE).toBe('The cover title is too long for the front cover: part of it is cut off in print.');
  });
});
