import { describe, it, expect } from 'vitest';
import { applyMask, archPath, archPathCentered, starPoints, starPolygonCss, featherEdgeCss, isMaskId, MASKS, SOFT_FEATHER, PATH_SHAPES, maskPathD, isPathShape, TEXTURE_MASKS, maskTextureUrl, textureMaskCss, isTextureMask, maskOverlayUrl, textureOverlayCss, edgeGuardMessage, EDGE_PATTERN } from './masks';
import { existsSync } from 'node:fs';
import { slotShapeStyle } from './slotShapeStyle';
import type { TemplateSlot } from './types';

/* STUDIO masks (owner, 2026-09-13): one module, three renderers. */
const slot = { id: 's', x: 0.1, y: 0.1, width: 0.5, height: 0.4, ratio: '1:1' } as unknown as TemplateSlot;

describe('applyMask', () => {
  it('none / absent leaves the slot alone', () => {
    expect(applyMask(slot, null)).toBe(slot);
    expect(applyMask(slot, 'none')).toBe(slot);
  });
  it('a shape mask overrides the template shape and marks the slot masked (frames off)', () => {
    for (const m of ['circle', 'oval', 'arch', 'heart', 'star'] as const) {
      const a = applyMask(slot, m);
      expect(a.shape).toBe(m);
      expect(a.masked).toBe(true);
      expect(a.feather).toBeUndefined();
    }
  });
  it('every path shape becomes the slot shape, generated from one path with the renderer\'s own offset', () => {
    for (const sh of PATH_SHAPES) {
      expect(applyMask(slot, sh).shape).toBe(sh);
      const dom = maskPathD(sh, 0, 0, 200, 100);
      const fabric = maskPathD(sh, -100, -50, 200, 100);
      const print = maskPathD(sh, 1000, 2000, 200, 100);
      expect(dom.startsWith('M ')).toBe(true);
      expect(dom.trim().endsWith('Z')).toBe(true);
      // the same path, only translated: strip numbers and the skeletons match
      const skel = (d: string) => d.replace(/-?\d+(\.\d+)?/g, '#');
      expect(skel(fabric)).toBe(skel(dom));
      expect(skel(print)).toBe(skel(dom));
      expect(isPathShape(sh)).toBe(true);
    }
    expect(isPathShape('circle')).toBe(false);
    expect(MASKS.length).toBe(26);
  });
  it('textured edges: one PNG per edge, checked in, used as a CSS mask and stretched to the frame', () => {
    for (const t of TEXTURE_MASKS) {
      expect(isTextureMask(t)).toBe(true);
      expect(existsSync(`public${maskTextureUrl(t)}`), t).toBe(true);
      const a = applyMask(slot, t);
      expect(a.texture).toBe(t);
      expect(a.shape).toBe('rectangle');
      expect(a.masked).toBe(true);
      const css = textureMaskCss(t) as Record<string, unknown>;
      expect(String(css.maskImage)).toContain(`/masks/${t}.png`);
      expect(css.maskSize).toBe('100% 100%');
    }
    expect(isTextureMask('circle')).toBe(false);
  });
  it('fade-bottom feathers one edge only', () => {
    const a = applyMask(slot, 'fade-bottom');
    expect(a.featherSide).toBe('bottom');
    const css = featherEdgeCss(a.feather!, 200, 300, 'bottom');
    expect(String((css as Record<string, unknown>).maskImage)).toMatch(/^linear-gradient\(to bottom/);
    expect((css as Record<string, unknown>).maskComposite).toBeUndefined();
  });
  it('soft keeps the rectangle and adds the feather; rounded gets a radius', () => {
    const soft = applyMask(slot, 'soft');
    expect(soft.shape).toBe('rectangle');
    expect(soft.feather).toBe(SOFT_FEATHER);
    const rounded = applyMask(slot, 'rounded');
    expect(rounded.shape).toBe('rounded');
    expect(rounded.borderRadius).toBeGreaterThan(0);
  });
  it('isMaskId guards stored strings', () => {
    expect(MASKS.map((m) => m.id).every(isMaskId)).toBe(true);
    expect(isMaskId('torn-paper')).toBe(false);
    expect(isMaskId(null)).toBe(false);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   THE OWNER'S EDGES (2026-10-07, from the numbered mask-ideas sheet: "i like
   all the edges add them" — 28 Torn paper, 29 Pinking shears, 30 Postage
   stamp, 31 Wavy edge, 32 Paint stroke, 33 Watercolor splash, 34 Halftone
   dots). Organic edges are stretched PNGs; patterned ones are drawn at the
   frame's real size so teeth, holes and dots never stretch out of round.
   ══════════════════════════════════════════════════════════════════════════ */
describe('the owner\'s edges', () => {
  const EDGES = ['torn', 'pinking', 'stamp', 'wavy', 'paint', 'watercolor', 'halftone'] as const;
  const nums = (d: string) => (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
  // the end point of every segment: L x y, and A rx ry rot large sweep x y
  const ends = (d: string) => {
    const out: [number, number][] = [];
    for (const m of d.matchAll(/([MLA])\s*([^MLAZ]*)/g)) {
      const v = nums(m[2]);
      out.push(m[1] === 'A' ? [v[5], v[6]] : [v[0], v[1]]);
    }
    return out;
  };

  it('all seven are in the Mask list with the names from the sheet', () => {
    const labels = Object.fromEntries(MASKS.map((m) => [m.id, m.label]));
    expect(EDGES.map((e) => labels[e])).toEqual(['Torn paper', 'Pinking shears', 'Postage stamp', 'Wavy edge', 'Paint stroke', 'Watercolor splash', 'Halftone dots']);
    for (const e of EDGES) expect(isMaskId(e)).toBe(true);
    for (const e of EDGES) expect(applyMask(slot, e).masked).toBe(true);
  });

  it('torn paper paints a white rim: an overlay PNG, checked in, drawn over the photo inside the mask', () => {
    expect(maskOverlayUrl('torn')).toBe('/masks/torn-rim.png');
    expect(existsSync('public/masks/torn-rim.png')).toBe(true);
    const css = textureOverlayCss('torn') as Record<string, unknown>;
    expect(String(css.backgroundImage)).toContain('/masks/torn-rim.png');
    expect(css.backgroundSize).toBe('100% 100%');
    expect(css.pointerEvents).toBe('none');
    // the other textured edges paint nothing
    for (const t of TEXTURE_MASKS.filter((t) => t !== 'torn')) {
      expect(maskOverlayUrl(t)).toBeNull();
      expect(textureOverlayCss(t)).toBeNull();
    }
  });

  it('pinking / wavy: corners sit on the frame corners and nothing reaches past the frame', () => {
    for (const sh of ['pinking', 'wavy'] as const) {
      for (const [w, h] of [[200, 200], [600, 200], [120, 400]]) {
        const pts = ends(maskPathD(sh, 0, 0, w, h));
        for (const [x, y] of pts) {
          expect(x, sh).toBeGreaterThanOrEqual(-0.001); expect(x, sh).toBeLessThanOrEqual(w + 0.001);
          expect(y, sh).toBeGreaterThanOrEqual(-0.001); expect(y, sh).toBeLessThanOrEqual(h + 0.001);
        }
        for (const c of [[0, 0], [w, 0], [w, h], [0, h]]) expect(pts.some(([x, y]) => x === c[0] && y === c[1]), `${sh} ${w}×${h} corner ${c}`).toBe(true);
      }
    }
  });

  it('pinking teeth, stamp holes and wavy waves keep their size on a wide frame (3× as many along a 3× side)', () => {
    const topCount = (sh: 'pinking' | 'stamp' | 'wavy', w: number, h: number) => {
      const d = maskPathD(sh, 0, 0, w, h);
      if (sh === 'stamp') return ends(d).filter(([, y], i, a) => y === 0 && a[i - 1]?.[1] === 0).length; // arcs along the top
      return ends(d).filter(([, y]) => y === 0).length;
    };
    for (const sh of ['pinking', 'stamp', 'wavy'] as const) {
      const sq = topCount(sh, 300, 300), wide = topCount(sh, 900, 300);
      expect(wide / sq, sh).toBeGreaterThan(2.7);
      expect(wide / sq, sh).toBeLessThan(3.3);
    }
    // a stamp hole is the same radius on both (a stretched PNG would make it 3× wide)
    const radius = (d: string) => Number(d.match(/A (-?\d+(\.\d+)?)/)![1]);
    expect(radius(maskPathD('stamp', 0, 0, 900, 300))).toBe(radius(maskPathD('stamp', 0, 0, 300, 300)));
    expect(radius(maskPathD('stamp', 0, 0, 300, 300))).toBeCloseTo(EDGE_PATTERN.stampHole * 300, 2);
  });

  it('the phone, the editor and print get the same teeth: same frame shape at any size → same count', () => {
    for (const sh of ['pinking', 'stamp', 'wavy', 'halftone'] as const) {
      const skel = (d: string) => d.replace(/-?\d+(\.\d+)?/g, '#');
      const phone = maskPathD(sh, 0, 0, 180, 120);          // a preview frame
      const editor = maskPathD(sh, -270, -180, 540, 360);   // the Fabric clip, centred
      const print = maskPathD(sh, 300, 600, 1800, 1200);    // the 300-dpi page
      expect(skel(editor), sh).toBe(skel(phone));
      expect(skel(print), sh).toBe(skel(phone));
    }
  });

  it('halftone: a solid middle, dots that shrink toward the edge, none past the frame, all wound one way (they add, never cut holes)', () => {
    const w = 600, h = 400, d = maskPathD('halftone', 0, 0, w, h);
    const dots = [...d.matchAll(/M (-?[\d.]+) (-?[\d.]+) A ([\d.]+) [\d.]+ 0 1 1 (-?[\d.]+) (-?[\d.]+) A [\d.]+ [\d.]+ 0 1 (\d)/g)]
      .map((m) => ({ cx: (Number(m[1]) + Number(m[4])) / 2, cy: Number(m[2]), r: Number(m[3]), sweep: m[6] }));
    expect(dots.length).toBeGreaterThan(100);
    for (const t of dots) {
      expect(t.cx - t.r).toBeGreaterThanOrEqual(-0.01); expect(t.cx + t.r).toBeLessThanOrEqual(w + 0.01);
      expect(t.cy - t.r).toBeGreaterThanOrEqual(-0.01); expect(t.cy + t.r).toBeLessThanOrEqual(h + 0.01);
      expect(t.sweep).toBe('1');
    }
    // nearer the edge → smaller
    const edgeDist = (t: { cx: number; cy: number }) => Math.min(t.cx, w - t.cx, t.cy, h - t.cy);
    const near = dots.filter((t) => edgeDist(t) < 30), far = dots.filter((t) => edgeDist(t) > 60 && edgeDist(t) < 80);
    expect(Math.max(...near.map((t) => t.r))).toBeLessThan(Math.min(...far.map((t) => t.r)));
    // the solid middle is the first subpath, wound clockwise like the dots
    const core = nums(d.split(' M ')[0]);
    const band = EDGE_PATTERN.dotBand * Math.min(w, h);
    expect(core.slice(0, 4)).toEqual([band, band, w - band, band]);
    // symmetric about the frame's centre, so the editor's clip centres true
    const xs = dots.map((t) => t.cx);
    expect(Math.min(...xs) + Math.max(...xs)).toBeCloseTo(w, 1);
  });

  it('the Studio warns only for edges that reach a face, with the measured number', () => {
    expect(edgeGuardMessage('brushed')).toMatch(/20%/);
    expect(edgeGuardMessage('watercolor')).toMatch(/35%/);
    expect(edgeGuardMessage('halftone')).toMatch(/22%/);
    expect(edgeGuardMessage('torn')).toMatch(/9%/);
    expect(edgeGuardMessage('paint')).toMatch(/top and bottom/);
    for (const m of ['deckle', 'pinking', 'stamp', 'wavy', 'circle', 'none'] as const) expect(edgeGuardMessage(m), m).toBeNull();
  });
});

describe('the shapes are the same in every renderer', () => {
  it('arch: the DOM/print path and the Fabric centred path describe the same arch', () => {
    const d = archPath(200, 300);
    const c = archPathCentered(200, 300);
    expect(d).toContain('A 100 100');
    expect(c).toContain('A 100 100');
    expect(d.startsWith('M 0 300')).toBe(true);
    expect(c.startsWith('M -100 150')).toBe(true);
  });
  it('star: one generator; the CSS polygon is the same 10 points in percent', () => {
    const pts = starPoints(50, 50, 50);
    expect(pts).toHaveLength(10);
    expect(pts[0]).toEqual({ x: 50, y: 0 });
    expect(starPolygonCss()).toContain('50.00% 0.00%');
  });
  it('the DOM shape style draws arch, star and the soft edge from the module', () => {
    const arch = slotShapeStyle({ ...(slot as object), shape: 'arch' } as never, 200, 300);
    expect(String(arch.style.clipPath)).toContain(archPath(200, 300));
    const star = slotShapeStyle({ ...(slot as object), shape: 'star' } as never, 200, 300);
    expect(star.style.clipPath).toBe(starPolygonCss());
    const soft = slotShapeStyle({ ...(slot as object), shape: 'rectangle', feather: SOFT_FEATHER } as never, 200, 300);
    expect(String((soft.style as Record<string, unknown>).maskImage)).toContain('linear-gradient');
  });
  it('the feather is the same width for CSS and canvas: 10% of the shorter side', () => {
    const css = featherEdgeCss(SOFT_FEATHER, 200, 300);
    expect(String((css as Record<string, unknown>).maskImage)).toContain('#000 20px');
  });
});
