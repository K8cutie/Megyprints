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
import { readFileSync } from 'node:fs';
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
import { getTemplatesForAlbum } from './pageTemplates';
import {
  slotPhotoRect,
  slotPhotoDomBox,
  panRoom,
  faceCentrePan,
  slotDesignSize,
  type Size,
  type Rect,
} from './slotPhotoFit';

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

/* ── STUDIO frames: one resolver in all three renderers ─────────────────── */
describe('Studio slot overrides go through resolveSlotBox in every renderer', () => {
  it('BuilderPreview (DOM), useCanvasEngine (Fabric), printPipeline (print)', () => {
    for (const f of ['src/pages/builder/BuilderPreview.tsx', 'src/pages/builder/useCanvasEngine.ts', 'src/pages/builder/printPipeline.ts']) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).toContain("from './slotGeometry'");
      expect(src, f).toMatch(/resolveSlotBox\(/);
    }
    // and no renderer merges the override by hand any more
    expect(readFileSync('src/pages/builder/useCanvasEngine.ts', 'utf8')).not.toMatch(/\.\.\.rawSlot, \.\.\.geom/);
  });
  it('Studio masks come from masks.ts in every renderer, and stickers are drawn by every renderer', () => {
    const dom = readFileSync('src/pages/builder/BuilderPreview.tsx', 'utf8');
    const domShape = readFileSync('src/pages/builder/slotShapeStyle.ts', 'utf8');
    const fabric = readFileSync('src/pages/builder/useCanvasEngine.ts', 'utf8');
    const print = readFileSync('src/pages/builder/printPipeline.ts', 'utf8');
    for (const [name, src] of [['dom', dom], ['fabric', fabric], ['print', print]] as const) {
      expect(src, name).toMatch(/applyMask\(/);
      expect(src, name).toMatch(/page\.stickers/);
    }
    for (const [name, src] of [['dom-shape', domShape], ['fabric', fabric], ['print', print]] as const) {
      expect(src, name).toContain("from './masks'");
    }
    // the star and the arch are generated, never hand-drawn per renderer
    expect(print).toMatch(/starPoints\(/);
    expect(fabric).toMatch(/starPoints\(/);
    expect(domShape).toMatch(/starPolygonCss\(/);
    expect(print).toMatch(/archRy\(/);
    expect(fabric).toMatch(/archPathCentered\(/);
    expect(domShape).toMatch(/archPath\(/);
    // the path shapes (leaf, scallop, hexagon…) come from maskPathD in all three
    for (const [name, src] of [['dom-shape', domShape], ['fabric', fabric], ['print', print]] as const) {
      expect(src, name).toMatch(/maskPathD\(/);
    }
    // textured edges: the DOM masks with the texture URL, Fabric + print multiply alpha with the same asset
    expect(domShape).toMatch(/textureMaskCss\(/);
    expect(fabric).toMatch(/applyTextureAlpha\(/);
    expect(print).toMatch(/applyTextureAlpha\(/);
    // looks: the DOM uses lookCss, Fabric + print apply the same ops to pixels
    expect(dom).toMatch(/lookCss\(/);
    expect(fabric).toMatch(/applyLookPixels\(/);
    expect(print).toMatch(/applyLookPixels\(/);
  });
});

/* ── Slot photo PAN: the preview shows the crop that prints ─────────────── */
// The DOM preview pans a slot photo with CSS — the <img> keeps the slot's box,
// object-fit: cover fits the photo, object-position slides it — while print
// draws slotPhotoRect onto a canvas. These model what the browser does with
// that CSS (CSS Images 3 object-fit / object-position, CSS Values 4 clamp) and
// check that for the same stored offset the SAME part of the photo shows in
// the slot, edge to edge, in both. (Bug, 2026-10-02: the preview moved the
// photo's BOX by the pan, so at zoom 1 any pan slid the whole photo and left
// an empty strip that print never had.)
describe('slot photo pan — the preview and print show the same crop', () => {
  type Box = ReturnType<typeof slotPhotoDomBox>;

  /** Split an object-position "X Y" whose halves may hold spaces in brackets. */
  const axes = (css: string): [string, string] => {
    let depth = 0;
    for (let i = 0; i < css.length; i++) {
      if (css[i] === '(') depth++;
      else if (css[i] === ')') depth--;
      else if (css[i] === ' ' && depth === 0) return [css.slice(0, i), css.slice(i + 1)];
    }
    throw new Error(`object-position needs two axes: ${css}`);
  };

  /** One object-position axis, resolved the way the browser does: a percentage
   *  is of (box − photo); clamp(MIN, VAL, MAX) = max(MIN, min(VAL, MAX)). */
  const resolve = (token: string, basis: number): number => {
    if (token === '50%') return basis / 2;
    const m = /^clamp\(calc\(100% - ([\d.]+)px\), calc\(50% ([+-]) ([\d.]+)px\), ([\d.]+)px\)$/.exec(token);
    if (!m) throw new Error(`unexpected object-position axis: ${token}`);
    const min = basis - Number(m[1]);
    const val = basis / 2 + (m[2] === '-' ? -1 : 1) * Number(m[3]);
    const max = Number(m[4]);
    return Math.max(min, Math.min(val, max));
  };

  /** What the browser paints for the preview's slot <img>: the photo
   *  cover-fitted into the box, placed by object-position, clipped to the box.
   *  Slot-relative px. */
  const domPaint = (box: Box, img: Size) => {
    const k = Math.max(box.width / img.w, box.height / img.h);
    const w = img.w * k;
    const h = img.h * k;
    const [px, py] = axes(box.objectPosition);
    const photo = { x: box.left + resolve(px, box.width - w), y: box.top + resolve(py, box.height - h), w, h };
    return { photo, clip: { x: box.left, y: box.top, w: box.width, h: box.height } };
  };

  /** The part of the photo showing in the slot, as 0–1 fractions of the
   *  photo, and whether any of the slot is left uncovered. */
  const crop = (photo: Rect, slot: Size, clip: Rect = { x: 0, y: 0, w: slot.w, h: slot.h }) => {
    const x0 = Math.max(0, clip.x, photo.x);
    const x1 = Math.min(slot.w, clip.x + clip.w, photo.x + photo.w);
    const y0 = Math.max(0, clip.y, photo.y);
    const y1 = Math.min(slot.h, clip.y + clip.h, photo.y + photo.h);
    const e = 1e-6 * Math.max(slot.w, slot.h);
    return {
      u0: (x0 - photo.x) / photo.w, u1: (x1 - photo.x) / photo.w,
      v0: (y0 - photo.y) / photo.h, v1: (y1 - photo.y) / photo.h,
      gap: x0 > e || y0 > e || x1 < slot.w - e || y1 < slot.h - e,
    };
  };

  const PHOTOS: Size[] = [{ w: 2400, h: 1200 }, { w: 4032, h: 3024 }, { w: 3024, h: 4032 }, { w: 1080, h: 1920 }, { w: 1000, h: 1000 }];

  it('every size and photo shape, zoom ≥ 1: the same crop and no gap — pans inside, at and far past the overflow', () => {
    let cases = 0;
    for (const { preset } of ALBUM_SIZES) {
      const ui = getCanvasDimensions(preset);
      const print = getPrintDimensions(preset);
      // A phone-sized page at the printed page's shape (the editor canvas
      // rounds its short side, which is a page-size matter, not a pan one).
      const dom = { w: 358, h: (358 * print.height) / print.width };
      const toPrint = { x: print.width / ui.width, y: print.height / ui.height }; // printPipeline's printScale
      const toDom = { x: dom.w / ui.width, y: dom.h / ui.height }; // PageView's sx, sy
      for (const t of getTemplatesForAlbum(preset).slice(0, 6)) {
        t.slots.forEach((_, i) => {
          const design = slotDesignSize({ templateId: t.id }, i, preset, 1);
          if (!design) return;
          for (const img of PHOTOS) for (const zoom of [1, 1.3]) {
            const r = panRoom(img, design, zoom);
            const pans = [
              { x: 0, y: 0 },
              { x: 0.4 * r.x, y: -0.4 * r.y },
              { x: -0.85 * r.x, y: 0.85 * r.y },
              { x: r.x, y: -r.y },
              { x: 3 * r.x + 40, y: -3 * r.y - 40 }, // past the overflow → held at the photo edge
            ];
            for (const pan of pans) {
              const printSlot = { w: design.w * toPrint.x, h: design.h * toPrint.y };
              const inPrint = crop(slotPhotoRect(img, printSlot, zoom, { x: pan.x * toPrint.x, y: pan.y * toPrint.y }), printSlot);
              const domSlot = { w: design.w * toDom.x, h: design.h * toDom.y };
              const painted = domPaint(slotPhotoDomBox(domSlot, zoom, { x: pan.x * toDom.x, y: pan.y * toDom.y }), img);
              const onScreen = crop(painted.photo, domSlot, painted.clip);
              const where = `${preset} ${t.id}#${i} ${img.w}x${img.h} zoom ${zoom} pan ${pan.x.toFixed(1)},${pan.y.toFixed(1)}`;
              expect(inPrint.gap, `print gap: ${where}`).toBe(false);
              expect(onScreen.gap, `preview gap: ${where}`).toBe(false);
              for (const k of ['u0', 'u1', 'v0', 'v1'] as const) {
                expect(Math.abs(onScreen[k] - inPrint[k]), `${k}: ${where}`).toBeLessThan(1e-5);
              }
              cases++;
            }
          }
        });
      }
    }
    expect(cases).toBeGreaterThan(1000);
  });

  it('the live-proof page: a face a third of the way in lands mid-slot on the phone AND in print', () => {
    const img = { w: 2400, h: 1200 };
    const design = slotDesignSize({ templateId: 't88-fb-solo' }, 0, '8x8', 1)!;
    const pan = faceCentrePan({ x: 1 / 3, y: 0.5 }, img, design);
    const phone = 358 / 750; // MobileReview on a 390-px-wide phone: sx = sy
    const domSlot = { w: design.w * phone, h: design.h * phone };
    const painted = domPaint(slotPhotoDomBox(domSlot, 1, { x: pan.x * phone, y: pan.y * phone }), img);
    const onPhone = crop(painted.photo, domSlot, painted.clip);
    const s = 2400 / 750;
    const printSlot = { w: design.w * s, h: design.h * s };
    const inPrint = crop(slotPhotoRect(img, printSlot, 1, { x: pan.x * s, y: pan.y * s }), printSlot);
    for (const c of [onPhone, inPrint]) {
      expect(c.gap).toBe(false);
      expect((c.u0 + c.u1) / 2).toBeCloseTo(1 / 3, 5);
    }
  });

  it('at zoom 1 the pan never moves the photo BOX — it stays on the slot and the photo slides inside it', () => {
    const slot = { w: 300, h: 240 };
    for (const pan of [{ x: 80, y: 0 }, { x: -120, y: 35 }]) {
      const box = slotPhotoDomBox(slot, 1, pan);
      expect({ left: box.left, top: box.top, width: box.width, height: box.height }).toEqual({ left: 0, top: 0, width: 300, height: 240 });
      expect(box.objectPosition).not.toBe('50% 50%');
    }
    expect(slotPhotoDomBox(slot, 1, { x: 0, y: 0 }).objectPosition).toBe('50% 50%');
  });

  it('all three renderers draw from slotPhotoFit, and the face auto-centre converts into it', () => {
    const dom = readFileSync('src/pages/builder/BuilderPreview.tsx', 'utf8');
    const fabric = readFileSync('src/pages/builder/useCanvasEngine.ts', 'utf8');
    const print = readFileSync('src/pages/builder/printPipeline.ts', 'utf8');
    const state = readFileSync('src/pages/builder/useBuilderState.ts', 'utf8');
    for (const [name, src] of [['dom', dom], ['fabric', fabric], ['print', print], ['state', state]] as const) {
      expect(src, name).toContain("from './slotPhotoFit'");
    }
    expect(dom).toMatch(/slotPhotoDomBox\(/);
    expect(dom).toMatch(/objectPosition: photoBox\.objectPosition/);
    // the base `img { max-width: 100% }` rule must not hold a zoomed box to the
    // frame's width (it did: a strip opened down the right side at 130%)
    expect(dom).toMatch(/width: photoBox\.width, height: photoBox\.height,\s*maxWidth: 'none'/);
    expect(fabric).toMatch(/slotPhotoRect\(/);
    expect(print).toMatch(/slotPhotoRect\(/);
    expect(state).toMatch(/faceCentrePan\(/);
    // the raw −1…+1 offset is never written as a pan again
    expect(state).not.toMatch(/computeFaceOffset\(/);
  });
});
