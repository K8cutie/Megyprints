import { describe, it, expect, vi } from 'vitest';
import { curveCentreX, curveGlyphs, curveLine, drawCurvedWordArtText, drawWordArtText, wordArtDomStyle, wordArtShadow, WORDART_GLOW_BLUR, WORDART_GLOW_PASSES, WORDART_OUTLINE_WIDTH } from './wordArt';
import { captionFits } from './textFit';
import { deriveSpine, type SpineMeasure } from './coverLayoutRules';
import { coverWrapGeometry } from './coverGeometry';
import type { AlbumPage } from './types';

/* ═══════════════════════════════════════
   WORDART ON THE COVER TITLE (owner, 2026-11-05): an outline in any colour and
   thickness, a two-colour fill, a glow, and the words on an arch, a smile or a
   wave. These are the rules every renderer reads. tools/golden holds the app's
   drawing of them to the website's print, pixel by pixel.
   ═══════════════════════════════════════ */

/** Every character 10 px wide. */
const ten = { font: '', measureText: (s: string) => ({ width: Array.from(s).length * 10 }) };

describe('a glow', () => {
  it('is a shadow with no offset, in its own colour, sized from the words, on the cover or off it', () => {
    const want = { color: '#FF8A3D', offsetX: 0, offsetY: 0, blur: WORDART_GLOW_BLUR * 60 };
    expect(wordArtShadow({ glow: '#FF8A3D', fontSize: 60 }, true)).toEqual(want);
    expect(wordArtShadow({ glow: '#FF8A3D', fontSize: 60 }, false)).toEqual(want);
  });
  it('takes the place of a switched-off shadow too', () => {
    expect(wordArtShadow({ glow: '#FF8A3D', fontSize: 60, shadow: false }, true)?.color).toBe('#FF8A3D');
  });
  it('shows in the DOM preview as a text shadow', () => {
    expect(wordArtDomStyle({ glow: '#FF8A3D', fontSize: 60 }, 1, true).textShadow?.split('#FF8A3D').length).toBe(WORDART_GLOW_PASSES + 1);
  });
  it('is cast more than once, so it shows round thin letters; the shadow only once', () => {
    const glow = fakeCanvas();
    drawWordArtText(glow.ctx, 'Hi', 0, 50, { fontSize: 20, glow: '#FF8A3D' }, 1, true);
    expect(glow.calls).toHaveLength(WORDART_GLOW_PASSES);
    const shadow = fakeCanvas();
    drawWordArtText(shadow.ctx, 'Hi', 0, 50, { fontSize: 20 }, 1, true);
    expect(shadow.calls).toHaveLength(1);
  });
});

describe('the words on a curve', () => {
  const xs = (curve: 'arch' | 'smile' | 'wave') => curveGlyphs('ABCDEFG', ten, 30, curve).glyphs;

  it('take one line: line breaks and extra spaces go', () => {
    expect(curveLine('  Our\nBeach   Days ')).toBe('Our Beach Days');
    expect(curveGlyphs('Our\nDays', ten, 30, 'arch').glyphs.map((g) => g.text).join('')).toBe('OurDays');
  });

  it('an arch: the middle letter is highest and upright, the ends lower and leaning out, both sides alike', () => {
    const g = xs('arch');
    expect(g[3].x).toBeCloseTo(0, 6);
    expect(g[3].angle).toBeCloseTo(0, 6);
    expect(g[3].y).toBeLessThan(g[0].y);
    expect(g[0].angle).toBeLessThan(0);
    expect(g[6].angle).toBeGreaterThan(0);
    expect(g[0].y).toBeCloseTo(g[6].y, 6);
    expect(g[0].x).toBeCloseTo(-g[6].x, 6);
  });

  it('a smile is the arch upside down, the middle lowest', () => {
    const arch = xs('arch');
    const smile = xs('smile');
    smile.forEach((g, i) => {
      expect(g.x).toBeCloseTo(arch[i].x, 6);
      expect(g.y).toBeCloseTo(-arch[i].y, 6);
      expect(g.angle).toBeCloseTo(-arch[i].angle, 6);
    });
    expect(smile[3].y).toBeGreaterThan(smile[0].y);
  });

  it('a wave rides up on the left and down on the right, each letter along it', () => {
    const g = xs('wave');
    expect(g[1].y).toBeLessThan(0);
    expect(g[5].y).toBeGreaterThan(0);
    expect(g[3].y).toBeCloseTo(0, 6);
    expect(g[3].angle).toBeGreaterThan(0);
  });

  it('a space takes its room and draws nothing', () => {
    const g = curveGlyphs('A B', ten, 30, 'wave').glyphs;
    expect(g.map((l) => l.text)).toEqual(['A', 'B']);
    expect(g[1].x - g[0].x).toBeCloseTo(20, 6);
  });

  it('no words draw nothing', () => {
    expect(curveGlyphs('   ', ten, 30, 'arch')).toEqual({ glyphs: [], width: 0, height: 0 });
  });

  it('is anchored as a straight line is', () => {
    expect(curveCentreX(100, 'center', 80)).toBe(100);
    expect(curveCentreX(100, 'left', 80)).toBe(140);
    expect(curveCentreX(100, 'right', 80)).toBe(60);
  });
});

describe('whether a curve fits', () => {
  const m = { font: '', measureText: (s: string) => ({ width: Array.from(s).length * 10 * (parseFloat(/(\d+(\.\d+)?)px/.exec(m.font)?.[1] ?? '20') / 20) }) };
  const box = { w: 200, h: 30 };

  it('only its width counts: taller than the box is fine, it is not clipped to it', () => {
    expect(captionFits('Hello there', { fontSize: 20, curve: 'arch' }, box, m)).toEqual({ fits: true, fitsAt: null });
  });
  it('too wide says so, with the size it fits at', () => {
    const fit = captionFits('Our wonderful year together', { fontSize: 40, curve: 'arch' }, box, m)!;
    expect(fit.fits).toBe(false);
    expect(fit.fitsAt).toBeGreaterThan(8);
    m.font = `normal normal ${fit.fitsAt}px serif`;
    expect(curveGlyphs('Our wonderful year together', m, fit.fitsAt!, 'arch').width).toBeLessThanOrEqual(200 * 0.92);
  });
});

describe('the spine stays plain', () => {
  const measure: SpineMeasure = (text, _style, size) => Array.from(text).length * size * 0.6;
  const g = coverWrapGeometry('8x8', 40, 'hardboundLinen');
  const cover = (extra: object) => ({
    id: 'c', layout: 'freeform', size: '8x8', background: { type: 'solid', solid: '#1F3A5F' }, photos: [], templateId: 'cover-plain', slotFills: [],
    textElements: [{ id: 't', boxIndex: 0, text: 'Our Days', fontSize: 64, fontFamily: 'Georgia', color: '#FFFFFF', bold: true, italic: false, underline: false, alignment: 'center', x: 0, y: 0, rotation: 0, opacity: 100, ...extra }],
  }) as unknown as AlbumPage;

  it('takes none of the second fill colour, the glow or the curve', () => {
    const { text } = deriveSpine(cover({ fillTo: '#E8772E', glow: '#FF8A3D', curve: 'arch' }), g, measure);
    expect(text.fillTo).toBeUndefined();
    expect(text.glow).toBeUndefined();
    expect(text.curve).toBeUndefined();
  });
  it('a thick outline is thin there', () => {
    expect(deriveSpine(cover({ outlineColor: '#000000', outlineWidth: 8 }), g, measure).text.outlineWidth).toBe(WORDART_OUTLINE_WIDTH);
    expect(deriveSpine(cover({ outlineColor: '#000000', outlineWidth: 2 }), g, measure).text.outlineWidth).toBe(2);
    expect(deriveSpine(cover({}), g, measure).text.outlineWidth).toBeUndefined();
  });
});

/** A canvas that writes down what is drawn, in order. */
function fakeCanvas() {
  const calls: string[] = [];
  const gradients: { stops: [number, string][]; from: number; to: number }[] = [];
  const ctx = {
    fillStyle: '#FFFFFF' as unknown, strokeStyle: '', lineWidth: 0, lineJoin: '', textAlign: 'center', shadowColor: 'transparent', shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 0,
    measureText: (s: string) => ({ width: Array.from(s).length * 10 }),
    save: vi.fn(), restore: vi.fn(), translate: vi.fn(), rotate: vi.fn(),
    createLinearGradient(_x0: number, y0: number, _x1: number, y1: number) {
      const g = { stops: [] as [number, string][], from: y0, to: y1, addColorStop(at: number, c: string) { this.stops.push([at, c]); } };
      gradients.push(g);
      return g;
    },
    fillText(t: string) { calls.push(`fill ${t} ${typeof ctx.fillStyle === 'string' ? 'plain' : 'gradient'} ${ctx.shadowColor === 'transparent' ? '' : 'shadow'}`.trim()); },
    strokeText(t: string) { calls.push(`stroke ${t} ${ctx.shadowColor === 'transparent' ? '' : 'shadow'}`.trim()); },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls, gradients };
}

describe('drawing a line', () => {
  it('a plain line makes no gradient', () => {
    const { ctx, calls, gradients } = fakeCanvas();
    drawWordArtText(ctx, 'Hi', 0, 50, { fontSize: 20 }, 2);
    expect(calls).toEqual(['fill Hi plain']);
    expect(gradients).toHaveLength(0);
  });
  it('a two-colour fill fades from the colour on the canvas, top of the line to its bottom, and leaves the colour as it was', () => {
    const { ctx, calls, gradients } = fakeCanvas();
    drawWordArtText(ctx, 'Hi', 0, 50, { fontSize: 20, fillTo: '#E8772E' }, 2);
    expect(calls).toEqual(['fill Hi gradient']);
    expect(gradients[0].stops).toEqual([[0, '#FFFFFF'], [1, '#E8772E']]);
    expect([gradients[0].from, gradients[0].to]).toEqual([30, 70]);
    expect(ctx.fillStyle).toBe('#FFFFFF');
  });
});

describe('drawing a curve', () => {
  it('all the shadows, then all the outlines, then all the fills, so no letter lies over its neighbour\'s fill', () => {
    const { ctx, calls } = fakeCanvas();
    // (save/restore are spies here, so the shadow stays on the fake: only the order is read.)
    (ctx.save as ReturnType<typeof vi.fn>).mockImplementation(() => { saved.push(ctx.shadowColor); });
    (ctx.restore as ReturnType<typeof vi.fn>).mockImplementation(() => { ctx.shadowColor = saved.pop()!; });
    const saved: string[] = [];
    drawCurvedWordArtText(ctx, 'AB', 100, 50, 20, 'center', 'arch', { fontSize: 20, outlineColor: '#000000', outlineWidth: 2 }, 1, true);
    expect(calls).toEqual(['stroke A shadow', 'stroke B shadow', 'stroke A', 'stroke B', 'fill A plain', 'fill B plain']);
  });
  it('with no outline the shadow is cast by a pass of its own, under the fills', () => {
    const { ctx, calls } = fakeCanvas();
    const saved: string[] = [];
    (ctx.save as ReturnType<typeof vi.fn>).mockImplementation(() => { saved.push(ctx.shadowColor); });
    (ctx.restore as ReturnType<typeof vi.fn>).mockImplementation(() => { ctx.shadowColor = saved.pop()!; });
    drawCurvedWordArtText(ctx, 'AB', 100, 50, 20, 'center', 'wave', { fontSize: 20, fillTo: '#E8772E' }, 1, true);
    expect(calls).toEqual(['fill A plain shadow', 'fill B plain shadow', 'fill A gradient', 'fill B gradient']);
  });
  it('each letter is drawn at its place on the curve, turned', () => {
    const { ctx } = fakeCanvas();
    drawCurvedWordArtText(ctx, 'ABC', 100, 50, 20, 'center', 'arch', { fontSize: 20, shadow: false }, 1, true);
    expect(ctx.translate).toHaveBeenCalledTimes(3);
    const mid = curveGlyphs('ABC', ctx, 20, 'arch').glyphs[1];
    expect(ctx.translate).toHaveBeenNthCalledWith(2, 100 + mid.x, 50 + mid.y);
    expect(ctx.rotate).toHaveBeenNthCalledWith(2, mid.angle);
  });
});
