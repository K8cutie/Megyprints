import { describe, it, expect } from 'vitest';
import { clampSlotBox, clampSlotGeometry, resolveSlotBox, printSharpness, safeAreaInches, GUARD_MESSAGES } from './slotGeometry';
import { getTemplatesForAlbum } from './pageTemplates';
import { MIN_FRAME_INCHES } from './templateKit';

/* ══════════════════════════════════════════════════════════════════════════
   STUDIO GUARDRAILS (owner, 2026-09-13): a customer may move and resize any
   frame; the page may never store a frame that prints badly. Spine, safe
   area, 2" floor — same rules on every size, page side and template.
   ══════════════════════════════════════════════════════════════════════════ */
const tpl = (size: string) => getTemplatesForAlbum(size as never).find((t) => !t.fullBleed) ?? null;
const ctx = (albumSize: string, pageIndex: number, coverMode = false) => ({ albumSize, pageIndex, template: tpl(albumSize), coverMode });

describe('resolveSlotBox', () => {
  it('applies only finite numbers, keeps everything else from the template slot', () => {
    const slot = { x: 0.1, y: 0.2, width: 0.3, height: 0.4, ratio: '1:1' } as const;
    expect(resolveSlotBox(slot, null)).toBe(slot);
    expect(resolveSlotBox(slot, { x: 0.5, width: Number.NaN })).toEqual({ ...slot, x: 0.5 });
  });
});

describe('clampSlotBox', () => {
  it('a frame pushed past the SPINE edge snaps back and says so — the spine side follows the page side', () => {
    // even page (left of the spread): the spine is its RIGHT edge
    const even = clampSlotBox({ x: 0.9, y: 0.1, width: 0.4, height: 0.4 }, ctx('8x8', 0));
    expect(even.box.x + even.box.width).toBeCloseTo(1, 6);
    expect(even.reasons[0]).toBe('spine');
    // odd page (right of the spread): the spine is its LEFT edge
    const odd = clampSlotBox({ x: -0.2, y: 0.1, width: 0.4, height: 0.4 }, ctx('8x8', 1));
    expect(odd.box.x).toBe(0);
    expect(odd.reasons[0]).toBe('spine');
    // the same pushes on the OTHER side are plain trim edges
    expect(clampSlotBox({ x: -0.2, y: 0.1, width: 0.4, height: 0.4 }, ctx('8x8', 0)).reasons).toEqual(['edge']);
    expect(clampSlotBox({ x: 0.9, y: 0.1, width: 0.4, height: 0.4 }, ctx('8x8', 1)).reasons).toEqual(['edge']);
  });
  it('top and bottom are trim edges', () => {
    expect(clampSlotBox({ x: 0.1, y: -0.3, width: 0.4, height: 0.4 }, ctx('8x8', 0)).box.y).toBe(0);
    const b = clampSlotBox({ x: 0.1, y: 0.9, width: 0.4, height: 0.4 }, ctx('8x8', 0));
    expect(b.box.y + b.box.height).toBeCloseTo(1, 6);
    expect(b.reasons).toEqual(['edge']);
  });
  it('a cover panel has no spine: the inner push is just an edge', () => {
    expect(clampSlotBox({ x: 0.9, y: 0.1, width: 0.4, height: 0.4 }, ctx('8x8', 0, true)).reasons).toEqual(['edge']);
  });
  it('the 2-inch floor holds on every size, and is stated in inches', () => {
    for (const size of ['6x6', '8x8', '9x9', '8x6', '6x8', '10x10', '12x12'] as const) {
      const c = ctx(size, 0);
      if (!c.template) continue;
      const r = clampSlotBox({ x: 0.2, y: 0.2, width: 0.01, height: 0.01 }, c);
      const safe = safeAreaInches(c);
      expect(r.box.width * safe.w, `${size} width`).toBeGreaterThanOrEqual(MIN_FRAME_INCHES - 1e-9); expect(r.box.width * safe.w).toBeLessThan(MIN_FRAME_INCHES + 0.001);
      expect(r.box.height * safe.h, `${size} height`).toBeGreaterThanOrEqual(MIN_FRAME_INCHES - 1e-9);
      expect(r.reasons).toEqual(['floor']);
    }
  });
  it('a frame bigger than the safe area is capped to it', () => {
    const r = clampSlotBox({ x: -0.5, y: -0.5, width: 3, height: 3 }, ctx('8x8', 0));
    expect(r.box).toEqual({ x: 0, y: 0, width: 1, height: 1 });
  });
  it('is idempotent and never throws on garbage', () => {
    const c = ctx('8x8', 0);
    const once = clampSlotBox({ x: 0.9, y: -1, width: 0.001, height: 5 }, c);
    expect(clampSlotBox(once.box, c)).toEqual({ box: once.box, reasons: [] });
    expect(clampSlotBox({ x: Number.NaN, y: Number.POSITIVE_INFINITY, width: Number.NaN, height: -1 } as never, c).box.width).toBeGreaterThan(0);
  });
  it('a hair over the line (snapping, stroke maths) is clamped silently', () => {
    const r = clampSlotBox({ x: -0.002, y: 0.1, width: 0.4, height: 0.4 }, ctx('8x8', 1));
    expect(r.box.x).toBe(0);
    expect(r.reasons).toEqual([]);
  });
  it('a legal move is stored exactly as asked, with no reasons', () => {
    const r = clampSlotBox({ x: 0.25, y: 0.25, width: 0.5, height: 0.5 }, ctx('8x8', 0));
    expect(r).toEqual({ box: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 }, reasons: [] });
  });
});

describe('clampSlotGeometry', () => {
  it('merges a partial override onto its template slot and always stores a FULL box', () => {
    const c = ctx('8x8', 0);
    const slot = c.template!.slots[0];
    const { geom, reasons } = clampSlotGeometry(slot, { x: 0.05 }, c);
    expect(geom.x).toBeCloseTo(0.05, 6);
    expect(geom.y).toBeCloseTo(slot.y, 6);
    expect(geom.width).toBeCloseTo(slot.width, 6);
    expect(geom.height).toBeCloseTo(slot.height, 6);
    expect(reasons).toEqual([]);
  });
  it('drops rotation (no renderer prints it)', () => {
    const c = ctx('8x8', 0);
    const { geom } = clampSlotGeometry(c.template!.slots[0], { rotation: 30 }, c);
    expect('rotation' in geom).toBe(false);
  });
});

describe('printSharpness', () => {
  it('a phone photo fills a 6-inch frame sharp; a small photo stretched over it prints soft', () => {
    const c = ctx('8x8', 0);
    const big = { x: 0, y: 0, width: 0.8, height: 0.8 };
    expect(printSharpness({ width: 4032, height: 3024 }, big, c)).toBe('sharp');
    expect(printSharpness({ width: 640, height: 480 }, big, c)).toBe('soft');
    expect(printSharpness(null, big, c)).toBe('unknown');
  });
});

describe('the words', () => {
  it('every reason has a plain-language line that names the rule', () => {
    expect(GUARD_MESSAGES.spine).toMatch(/spine/);
    expect(GUARD_MESSAGES.edge).toMatch(/safe area/);
    expect(GUARD_MESSAGES.floor).toMatch(/2 inches/);
  });
});
