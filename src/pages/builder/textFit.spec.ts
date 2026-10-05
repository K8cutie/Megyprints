// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { captionBoxSize, captionFits, overflowingCaptions, longTextsMessage, type Measurer } from './textFit';
import { getTemplatesForAlbum, photoSlotCount } from './pageTemplates';
import type { AlbumPage } from './types';

/* ══════════════════════════════════════════════════════════════════════════
   TEXT THAT DOESN'T FIT ITS BOX IS SAID (1-star testers round 2, PERF2-2):
   "Kaye's first ride on Winnie the Pooh: she screamed, laughed, then begged
   to go again three more times while Lola waited outside with the ice cream
   melting in the July heat." in Cinzel at 34 — the preview cut off its first
   line and last word, the editor drew it over the photo above, and Order
   went straight to checkout.
   ══════════════════════════════════════════════════════════════════════════ */

const KAYE = "Kaye's first ride on Winnie the Pooh: she screamed, laughed, then begged to go again three more times while Lola waited outside with the ice cream melting in the July heat.";
/** A stand-in for canvas text measuring: every character 0.6 em wide. */
const fake = (): Measurer => {
  const m = { font: '', measureText: (s: string) => ({ width: s.length * 0.6 * Number(/(\d+(\.\d+)?)px/.exec(m.font)?.[1] ?? 16) }) as TextMetrics };
  return m as unknown as Measurer;
};
const boxTemplate = getTemplatesForAlbum('8x8').find((t) => photoSlotCount(t) === 3 && (t.textSlots?.length ?? 0) > 0)!;
const page = (text: string, fontSize: number): AlbumPage => ({
  id: 'p5', layout: 'freeform', size: '8x8', background: { type: 'solid', solid: '#FFFFFF' }, photos: [],
  templateId: boxTemplate.id, slotFills: [0, 1, 2],
  textElements: [{ id: 't', text, boxIndex: 0, x: 0, y: 0, rotation: 0, opacity: 1, fontSize, fontFamily: 'Cinzel, serif', color: '#2D2D2D', bold: false, italic: false, underline: false, alignment: 'center' }],
} as AlbumPage);

describe('captionFits — the renderers\' own wrap, in design px', () => {
  const box = captionBoxSize(page('x', 20), 0, '8x8', 4)!;
  it('a caption box has a real size', () => {
    expect(box.w).toBeGreaterThan(50);
    expect(box.h).toBeGreaterThan(20);
  });
  it('a short caption fits', () => {
    expect(captionFits('Mountain air and quiet hearts', { fontSize: 20 }, box, fake())).toEqual({ fits: true, fitsAt: null });
  });
  it('Kaye\'s memory at 34 doesn\'t — and the size it would fit at does', () => {
    const f = captionFits(KAYE, { fontSize: 34 }, box, fake())!;
    expect(f.fits).toBe(false);
    expect(f.fitsAt).toBeGreaterThanOrEqual(8);
    expect(f.fitsAt).toBeLessThan(34);
    expect(captionFits(KAYE, { fontSize: f.fitsAt! }, box, fake())!.fits).toBe(true);
    expect(captionFits(KAYE, { fontSize: f.fitsAt! + 1 }, box, fake())!.fits).toBe(false);
  });
  it('can\'t be measured (no canvas) → unknown, never a false alarm', () => {
    expect(captionFits(KAYE, { fontSize: 34 }, box, null)).toBeNull();
    expect(overflowingCaptions([page(KAYE, 34)], '8x8', null)).toEqual([]);
  });
});

describe('Before you order', () => {
  it('finds the page with the text that is too long', () => {
    const pages = [page('Hi', 20), page('Fine', 20), page(KAYE, 34)];
    expect(overflowingCaptions(pages, '8x8', fake())).toEqual([{ pageIndex: 2, boxIndex: 0 }]);
  });
  it('says it plainly', () => {
    expect(longTextsMessage(0)).toBe('');
    expect(longTextsMessage(1)).toBe('1 text is too long for its box: part of it is cut off in print.');
    expect(longTextsMessage(2)).toMatch(/^2 texts are too long for their boxes/);
  });
  it('the preview\'s Order says it, and "Show me" goes to the first such page (source guard)', () => {
    const src = readFileSync(resolve(__dirname, 'BuilderPreview.tsx'), 'utf8');
    expect(src).toMatch(/readinessMessage\(readiness\), longTextsMessage\(long\.length\)/);
    expect(src).toMatch(/const first = \[readiness\.firstPage, longFirstPageRef\.current\]/);
  });
  it('every caption editor is told its box (source guard)', () => {
    for (const f of ['BuilderPreview.tsx', 'BuilderEdit.tsx', 'MobileReview.tsx']) {
      expect(readFileSync(resolve(__dirname, f), 'utf8'), f).toMatch(/box=\{.*captionBoxSize\(/);
    }
  });
});

describe('the text editor says it as you type', () => {
  it('too long → the warning and "Make it fit (size N)", which sets that size', async () => {
    // A browser-like canvas for the editor's measurer.
    vi.stubGlobal('navigator', { ...navigator, userAgent: 'Chrome' });
    const m = fake();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(m as never);
    vi.resetModules();
    const { default: MobileTextEditor } = await import('./MobileTextEditor');
    const { captionBoxSize: size } = await import('./textFit');
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const box = size(page('x', 20), 0, '8x8', 4);
    act(() => { root.render(createElement(MobileTextEditor, { initial: { text: KAYE, fontSize: 34, fontFamily: 'Cinzel, serif', color: '#2D2D2D', bold: false, italic: false, underline: false, alignment: 'center' } as never, onSave: () => {}, onClose: () => {}, box })); });
    const warn = host.querySelector('[data-testid="text-too-long"]');
    expect(warn?.textContent).toMatch(/Too long for this box: part of it will be cut off in print/);
    const fitBtn = host.querySelector<HTMLButtonElement>('[data-testid="text-make-fit"]')!;
    const n = Number(/size (\d+)/.exec(fitBtn.textContent ?? '')?.[1]);
    expect(n).toBeLessThan(34);
    act(() => { fitBtn.click(); });
    expect(host.querySelector('[data-testid="text-too-long"]')).toBeNull();
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
});
