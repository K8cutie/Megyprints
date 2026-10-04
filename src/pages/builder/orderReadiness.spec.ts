import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { checkOrderReadiness, readinessMessage, PLACEHOLDER_TEXT } from './orderReadiness';
import { getTemplatesForAlbum } from './pageTemplates';
import type { AlbumPage, TextElement } from './types';

/* ══════════════════════════════════════════════════════════════════════════
   BEFORE YOU ORDER (1-star testers, 2026-10-04: the Rule-Breaker paid to
   print "Double-tap to edit"; the Perfectionist's 4 empty photo frames went to
   print as big blank areas — no warning anywhere). Order now says what would
   print blank, once: "Show me" or "Order anyway".
   ══════════════════════════════════════════════════════════════════════════ */

const tmpl = (name: string) => getTemplatesForAlbum('8x8').find((t) => t.name === name)!;
const page = (over: Partial<AlbumPage>): AlbumPage =>
  ({ id: 'p', layout: 'freeform', size: '8x8', background: { type: 'solid', solid: '#fff' }, photos: [], textElements: [], ...over } as AlbumPage);
const text = (t: string, boxIndex?: number) => ({ id: `t-${t}`, text: t, boxIndex } as TextElement);
const solo = tmpl('Full Bleed') ?? getTemplatesForAlbum('8x8').find((t) => t.slots.length === 1 && !(t.textSlots?.length))!;

describe('checkOrderReadiness — what would print blank', () => {
  it('the Rule-Breaker\'s page: 1 photo, 2 empty frames, an empty box and "Double-tap to edit"', () => {
    const t = tmpl('Three Squares, Box Bottom Left');
    expect(t.slots).toHaveLength(3);
    const r = checkOrderReadiness([page({ templateId: solo.id, slotFills: [0] }), page({ templateId: t.id, slotFills: [1, null, null], textElements: [text(PLACEHOLDER_TEXT)] })]);
    expect(r).toEqual({ emptyFrames: 2, emptyBoxes: t.textSlots?.length ?? 0, placeholderTexts: 1, blankPages: 0, firstPage: 1 });
  });

  it('a page with nothing on it is a blank page', () => {
    const r = checkOrderReadiness([page({ templateId: solo.id, slotFills: [0] }), page({ templateId: solo.id, slotFills: [null] }), page({})]);
    expect(r.blankPages).toBe(2);
    expect(r.firstPage).toBe(1);
  });

  it('a frame holding a QR or text, a filled box, real text → nothing to warn about', () => {
    const t = tmpl('Three Squares, Box Bottom Left');
    const r = checkOrderReadiness([page({ templateId: t.id, slotFills: [0, 1, 2], textElements: [text('Hong Kong 2026', 0)] })]);
    expect(r).toEqual({ emptyFrames: 0, emptyBoxes: 0, placeholderTexts: 0, blankPages: 0, firstPage: null });
    expect(readinessMessage(r)).toBeNull();
  });
});

describe('readinessMessage — one plain sentence', () => {
  it('lists what is blank, worst first', () => {
    expect(readinessMessage({ emptyFrames: 4, emptyBoxes: 1, placeholderTexts: 1, blankPages: 2, firstPage: 1 }))
      .toBe(`Before you order: your album has 2 blank pages, 4 empty photo frames, 1 empty text box and 1 text still saying "${PLACEHOLDER_TEXT}". They print exactly as they look.`);
    expect(readinessMessage({ emptyFrames: 1, emptyBoxes: 0, placeholderTexts: 0, blankPages: 0, firstPage: 3 }))
      .toBe('Before you order: your album has 1 empty photo frame. They print exactly as they look.');
  });
});

describe('wired in (source guards)', () => {
  const src = readFileSync(resolve(__dirname, 'BuilderPreview.tsx'), 'utf8');
  it('Order asks first; only "Order anyway" goes on with blanks', () => {
    expect(src).toMatch(/const warning = readinessMessage\(readiness\);\s*if \(warning && !anyway\) \{ setNotReady\(warning\); return; \}/);
    expect(src).toMatch(/onClick=\{\(\) => handleOrder\(true\)\} data-testid="order-not-ready-anyway"/);
  });
  it('no Order button passes its click event as "anyway"', () => {
    expect(src).not.toMatch(/onClick=\{handleOrder\}/);
    expect(src).not.toMatch(/onOrder=\{handleOrder\}/);
  });
  it('"boxes waiting" and the warning count boxes the same way (one count)', () => {
    expect(src).toMatch(/const waitingBoxes = readiness\.emptyBoxes;/);
  });
});
