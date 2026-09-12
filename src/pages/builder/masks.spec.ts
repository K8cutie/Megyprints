import { describe, it, expect } from 'vitest';
import { applyMask, archPath, archPathCentered, starPoints, starPolygonCss, featherEdgeCss, isMaskId, MASKS, SOFT_FEATHER } from './masks';
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
