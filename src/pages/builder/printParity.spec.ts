/** ══════════════════════════════════════════════════════════════════════════
 *  PRINT-PARITY RATCHET
 *  Born from the 2026-08-13 structural audit, which found the three renderers
 *  (BuilderPreview DOM, useCanvasEngine Fabric, printPipeline canvas) had
 *  silently drifted on 7 features, and that the size-keyed tables had shipped
 *  a size ('9x9') that two of them didn't know about.
 *
 *  These tests pin the SHARED resolvers all three renderers now build from
 *  (gradient geometry, caption alignment, free-text box width) and walk
 *  ALBUM_SIZES across every size-keyed surface. If you add a size or change a
 *  renderer convention, this file is the tripwire — fix the surface, never
 *  the assertion.
 *  ══════════════════════════════════════════════════════════════════════════ */

import { describe, it, expect } from 'vitest';
import {
  normalizeGradient,
  gradientToCss,
  linearGradientEndpoints,
  radialGradientGeom,
} from './gradient';
import { resolveTextSlotAlign, freeTextBoxWidth, TEXT_LINE_HEIGHT } from './wordArt';
import { ALBUM_SIZES } from './types';
import { getCanvasDimensions } from './layouts';
import { getPrintMultiplier, getPrintDimensions } from './printPipeline';
import { PREVIEW_DIMS } from './PreviewSizeConstants';
import { DENSITY_BY_SIZE } from './densities';
import { SIZE_ALIASES } from '../../assistant/intentParser';

/* ── Gradient: one resolver, both stored formats ─────────────────────────── */

describe('normalizeGradient', () => {
  it('passes the wizard format through (type/angle/stops)', () => {
    const g = normalizeGradient({ type: 'linear', angle: 135, stops: [{ offset: 0, color: '#111' }, { offset: 1, color: '#222' }] });
    expect(g).toEqual({ type: 'linear', angle: 135, stops: [{ offset: 0, color: '#111' }, { offset: 1, color: '#222' }] });
  });

  it('converts the legacy sidebar format (colors/position/direction keyword)', () => {
    // This shape used to CRASH the Fabric + print renderers (`stops` read unguarded).
    const g = normalizeGradient({ direction: 'to bottom', colors: [{ color: '#aaa', position: 0 }, { color: '#bbb', position: 100 }] });
    expect(g).toEqual({ type: 'linear', angle: 180, stops: [{ offset: 0, color: '#aaa' }, { offset: 1, color: '#bbb' }] });
  });

  it('maps legacy radial and unknown directions safely', () => {
    expect(normalizeGradient({ direction: 'radial', colors: [{ color: '#fff', position: 50 }] })?.type).toBe('radial');
    expect(normalizeGradient({ direction: 'sideways-ish', colors: [{ color: '#fff', position: 0 }] })?.angle).toBe(180);
  });

  it('clamps stop offsets into 0..1 and defaults wizard angle to 135', () => {
    const g = normalizeGradient({ stops: [{ offset: -2, color: '#111' }, { offset: 9, color: '#222' }] });
    expect(g?.angle).toBe(135);
    expect(g?.stops.map((s) => s.offset)).toEqual([0, 1]);
  });

  it('returns null for empty/garbage (renderers fall back to the neutral fill)', () => {
    expect(normalizeGradient(null)).toBeNull();
    expect(normalizeGradient({})).toBeNull();
    expect(normalizeGradient({ stops: [] })).toBeNull();
  });
});

describe('gradient geometry (CSS convention — what the customer approved on screen)', () => {
  const W = 200, H = 100;

  it('emits the CSS strings the DOM renderer paints', () => {
    expect(gradientToCss({ type: 'linear', angle: 135, stops: [{ offset: 0, color: '#111' }, { offset: 1, color: '#222' }] }))
      .toBe('linear-gradient(135deg, #111 0%, #222 100%)');
    expect(gradientToCss({ type: 'radial', angle: 0, stops: [{ offset: 0.5, color: '#333' }] }))
      .toBe('radial-gradient(circle, #333 50%)');
  });

  it('0° points UP, 90° RIGHT, 180° DOWN (CSS angles, clockwise from top)', () => {
    const up = linearGradientEndpoints(0, W, H);
    expect(up.x1).toBeCloseTo(up.x2);
    expect(up.y2).toBeLessThan(up.y1);

    const right = linearGradientEndpoints(90, W, H);
    expect(right.y1).toBeCloseTo(right.y2);
    expect(right.x2).toBeGreaterThan(right.x1);
    // Horizontal line spans the full box width edge-to-edge.
    expect(right.x1).toBeCloseTo(0);
    expect(right.x2).toBeCloseTo(W);

    const down = linearGradientEndpoints(180, W, H);
    expect(down.y2).toBeGreaterThan(down.y1);
  });

  it('135° sweeps toward BOTTOM-RIGHT — the print bug printed it bottom-left', () => {
    const g = linearGradientEndpoints(135, W, H);
    expect(g.x2).toBeGreaterThan(W / 2);
    expect(g.y2).toBeGreaterThan(H / 2);
    expect(g.x1).toBeLessThan(W / 2);
    expect(g.y1).toBeLessThan(H / 2);
  });

  it('radial = centered farthest-corner circle (CSS default)', () => {
    const r = radialGradientGeom(W, H);
    expect(r).toEqual({ cx: 100, cy: 50, r: Math.hypot(100, 50) });
  });
});

/* ── Text: shared resolution used by all three renderers ─────────────────── */

describe('text resolution parity', () => {
  it('caption alignment: ELEMENT wins, template is the fallback, center the default', () => {
    // Print used to resolve template-first on interior pages — a left-aligned
    // caption printed centered on any template that declares ts.align.
    expect(resolveTextSlotAlign({ alignment: 'left' }, { align: 'center' })).toBe('left');
    expect(resolveTextSlotAlign(undefined, { align: 'right' })).toBe('right');
    expect(resolveTextSlotAlign(null, null)).toBe('center');
  });

  it('free-text box width: explicit width wins, else the DOM fallback formula', () => {
    expect(freeTextBoxWidth({ width: 320, text: 'hi', fontSize: 24 })).toBe(320);
    expect(freeTextBoxWidth({ text: 'hello', fontSize: 20 })).toBe(5 * 20 * 0.6);
  });

  it('line rhythm is the shared 1.25 (Fabric default 1.16 made editor captions sit tighter)', () => {
    expect(TEXT_LINE_HEIGHT).toBe(1.25);
  });
});

/* ── Sizes: every size-keyed surface knows every size ────────────────────── */

describe('album-size surfaces (the 9x9 class of bug)', () => {
  const presets = ALBUM_SIZES.map((s) => s.preset);

  it('covers all 8 sizes (update EVERY assertion block here when adding one)', () => {
    expect(presets).toHaveLength(8);
    expect(presets).toContain('9x9');
  });

  it('editor canvas dims exist for every size and print multiplier derives from THEM', () => {
    for (const s of ALBUM_SIZES) {
      const ui = getCanvasDimensions(s.preset);
      // Every size authors at max-side 750 — the print pipeline's deleted local
      // size table claimed 576/432/etc. and was missing 9x9 entirely.
      expect(Math.max(ui.width, ui.height), s.preset).toBe(750);
      const print = getPrintDimensions(s.preset);
      const expected = Math.ceil(Math.max(print.width / ui.width, print.height / ui.height));
      expect(getPrintMultiplier(s.preset), s.preset).toBe(expected);
    }
  });

  it('PREVIEW_DIMS and DENSITY_BY_SIZE list every size, and ONLY real sizes', () => {
    for (const p of presets) {
      expect(PREVIEW_DIMS[p], `PREVIEW_DIMS missing ${p}`).toBeDefined();
      expect(DENSITY_BY_SIZE[p]?.length, `DENSITY_BY_SIZE missing ${p}`).toBeGreaterThan(0);
    }
    for (const key of Object.keys(PREVIEW_DIMS)) expect(presets).toContain(key);
    for (const key of Object.keys(DENSITY_BY_SIZE)) expect(presets).toContain(key);
  });

  it('the assistant has at least one chat alias per size (9x9 shipped without one)', () => {
    const reachable = new Set(Object.values(SIZE_ALIASES));
    for (const p of presets) {
      expect(reachable.has(p), `SIZE_ALIASES cannot reach ${p} — Megy can't set it by chat`).toBe(true);
    }
    for (const target of reachable) expect(presets).toContain(target);
  });
});
