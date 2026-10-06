import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TEXT_LINE_HEIGHT, CAPTION_PAD_X, FABRIC_FONT_SIZE_MULT, FABRIC_LINE_HEIGHT } from './wordArt';

/* ══════════════════════════════════════════════════════════════════════════
   A CAPTION BREAKS AND SPACES ITS LINES THE SAME ON SCREEN AS ON PAPER
   (1-star testers round 3; both confirmed by the checker):
   - the Print Inspector: "Beach days are the best days" sat on ONE line in
     the editor and the preview and printed as "Beach days are the best" /
     "days". Print wraps inside a 4% margin each side; the preview and the
     editor used the box's full width, so a line near the box width broke
     earlier on paper.
   - the Perfectionist: after "Make it fit (size 30)" the caption fitted in the
     preview but overflowed in the editor (its top line under the photo, the
     last word cut off). Fabric draws a line fontSize × lineHeight × 1.13 tall,
     so lineHeight 1.25 there spaced lines 13% wider than the preview and print.
   One margin and one rhythm, in every renderer.
   ══════════════════════════════════════════════════════════════════════════ */

const src = (f: string) => readFileSync(resolve(__dirname, f), 'utf8');

describe('one margin, one rhythm', () => {
  it('the numbers: 4% each side, lines 1.25 apart', () => {
    expect(CAPTION_PAD_X).toBe(0.04);
    expect(TEXT_LINE_HEIGHT).toBe(1.25);
    expect(FABRIC_LINE_HEIGHT * FABRIC_FONT_SIZE_MULT).toBeCloseTo(TEXT_LINE_HEIGHT, 10);
  });
  it('Fabric\'s own line multiplier is the one the editor corrects for', () => {
    const fabric = readFileSync(resolve(__dirname, '../../../node_modules/fabric/dist/fabric.js'), 'utf8');
    expect(Number(/_fontSizeMult:\s*([\d.]+)/.exec(fabric)?.[1])).toBe(FABRIC_FONT_SIZE_MULT);
  });
});

describe('every renderer wraps a caption inside the margin', () => {
  it('print: bound captions and text in a photo slot', () => {
    const p = src('printPipeline.ts');
    expect(p).toContain('const pad = slot.w * CAPTION_PAD_X;');
    expect(p).toContain('const pad = w * CAPTION_PAD_X;');
  });
  it('the fit check ("Too long for this box", "Make it fit")', () => {
    expect(src('textFit.ts')).toContain('const pad = box.w * CAPTION_PAD_X;');
  });
  it('the preview: both caption spans pad by the same share', () => {
    const p = src('BuilderPreview.tsx');
    expect(p).toContain("boxSizing: 'border-box', paddingLeft: boxW * CAPTION_PAD_X, paddingRight: boxW * CAPTION_PAD_X");
    expect(p).toContain("boxSizing: 'border-box', paddingLeft: slotW * CAPTION_PAD_X, paddingRight: slotW * CAPTION_PAD_X");
  });
  it('the editor: the same margin and print\'s rhythm in Fabric\'s terms', () => {
    const e = src('useCanvasEngine.ts');
    expect(e).toContain('left: slotRect ? slotRect.left + slotRect.width * CAPTION_PAD_X : text.x,');
    expect(e).toContain('width: slotRect ? slotRect.width * (1 - 2 * CAPTION_PAD_X) : (text.width ?? autoWidth),');
    expect(e).toContain('left: sx + sw * CAPTION_PAD_X,');
    expect(e).toContain('width: sw * (1 - 2 * CAPTION_PAD_X),');
    expect(e.match(/lineHeight: FABRIC_LINE_HEIGHT,/g)).toHaveLength(2);
    expect(e).not.toMatch(/lineHeight: TEXT_LINE_HEIGHT/);
  });
  it('no renderer keeps its own copy of the margin', () => {
    for (const f of ['printPipeline.ts', 'textFit.ts', 'BuilderPreview.tsx', 'useCanvasEngine.ts']) {
      expect(src(f), f).not.toMatch(/\.w \* 0\.04|w \* 0\.04;|width \* 0\.04/);
    }
  });
});
