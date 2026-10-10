import type { CSSProperties } from 'react';
import type { TemplateSlot } from './types';

/* ══════════════════════════════════════════════════════════════════════════
   MASKS (owner, 2026-09-13, Studio): a shape or an edge treatment on ONE
   photo. The photo underneath is untouched; the frame's box is untouched
   (so every Studio guardrail still holds). ONE module, three renderers:
     • BuilderPreview (DOM)   → slotShapeStyle() reads the applied slot
     • useCanvasEngine (Fabric) → clip objects / a feathered offscreen image
     • printPipeline (print)  → applySlotClip() / featherAlpha()
   A mask suppresses the photo's frame/border (like the heart shape already
   did) so a shape never carries a rectangular outline in one renderer and
   none in another.
   ══════════════════════════════════════════════════════════════════════════ */

export type MaskId =
  | 'none' | 'soft' | 'fade-bottom'
  | 'circle' | 'oval' | 'rounded' | 'arch' | 'leaf' | 'scallop'
  | 'hexagon' | 'octagon' | 'diamond' | 'ticket' | 'cloud'
  | 'heart' | 'star'
  | 'brushed' | 'deckle' | 'frost'
  | 'torn' | 'pinking' | 'stamp' | 'wavy' | 'paint' | 'watercolor' | 'halftone';

export const MASKS: { id: MaskId; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'soft', label: 'Soft edge' },
  { id: 'fade-bottom', label: 'Fade down' },
  { id: 'circle', label: 'Circle' },
  { id: 'oval', label: 'Oval' },
  { id: 'rounded', label: 'Rounded' },
  { id: 'arch', label: 'Arch' },
  { id: 'leaf', label: 'Leaf' },
  { id: 'scallop', label: 'Scallop' },
  { id: 'hexagon', label: 'Hexagon' },
  { id: 'octagon', label: 'Octagon' },
  { id: 'diamond', label: 'Diamond' },
  { id: 'ticket', label: 'Cut corners' },
  { id: 'cloud', label: 'Cloud' },
  { id: 'heart', label: 'Heart' },
  { id: 'star', label: 'Star' },
  { id: 'brushed', label: 'Brushed edge' },
  { id: 'deckle', label: 'Deckle edge' },
  { id: 'frost', label: 'Frost' },
  // Owner, 2026-10-07, from the numbered mask-ideas sheet: "i like all the
  // edges add them" (28–34).
  { id: 'torn', label: 'Torn paper' },
  { id: 'pinking', label: 'Pinking shears' },
  { id: 'stamp', label: 'Postage stamp' },
  { id: 'wavy', label: 'Wavy edge' },
  { id: 'paint', label: 'Paint stroke' },
  { id: 'watercolor', label: 'Watercolor splash' },
  { id: 'halftone', label: 'Halftone dots' },
];

/** Textured edges: an alpha PNG (white = photo, transparent = page) stretched
 *  over the frame. ONE asset per edge, used by the DOM (mask-image), the Fabric
 *  editor and the print pipeline (destination-in). Generated once, checked
 *  in under public/masks — 1800² so a full-page frame still prints clean.
 *  Organic edges only: an even pattern (teeth, holes, dots) would stretch out
 *  of round on a wide frame, so those are PATH_SHAPES drawn at the frame's
 *  real size instead. */
export const TEXTURE_MASKS = ['brushed', 'deckle', 'frost', 'torn', 'paint', 'watercolor'] as const;
export type TextureMask = typeof TEXTURE_MASKS[number];
export function isTextureMask(v: unknown): v is TextureMask {
  return typeof v === 'string' && (TEXTURE_MASKS as readonly string[]).includes(v);
}
export function maskTextureUrl(id: TextureMask): string {
  return `/masks/${id}.png`;
}

/** Edges that also PAINT: an RGBA PNG drawn over the photo before the alpha
 *  cut — torn paper's white rim (white outside the inner tear; the outer tear
 *  then trims it). Drawn after the filter, so the rim stays white. */
const TEXTURE_OVERLAYS: Partial<Record<TextureMask, string>> = { torn: 'torn-rim' };
export function maskOverlayUrl(id: TextureMask): string | null {
  const o = TEXTURE_OVERLAYS[id];
  return o ? `/masks/${o}.png` : null;
}

/** How far in an edge hides or covers the photo, as a fraction of the frame,
 *  MEASURED from the assets/paths (scratchpad edges/finish.py, 2026-10-07 —
 *  the old single "16%" overstated deckle (6%) and frost (9%) and understated
 *  brushed). Only edges that reach far enough to cut into a face are listed;
 *  the Studio tells the customer when they pick one. */
const EDGE_BITE: Partial<Record<MaskId, number>> = {
  brushed: 0.2, frost: 0.1, torn: 0.09, paint: 0.25, watercolor: 0.35, halftone: 0.22,
};
/** The line the Studio shows when an edge is picked (null = nothing to warn about). */
export function edgeGuardMessage(id: MaskId | 'none'): string | null {
  if (id === 'none') return null;
  if (id === 'paint') return `Paint stroke shows a band across the middle and hides up to ${Math.round(EDGE_BITE.paint! * 100)}% at the top and bottom — keep faces in the middle.`;
  const b = EDGE_BITE[id];
  return b ? `This edge reaches up to ${Math.round(b * 100)}% in from the sides — keep faces away from the edge.` : null;
}

const textureCache = new Map<string, Promise<HTMLImageElement>>();
function loadMaskImage(url: string): Promise<HTMLImageElement> {
  let p = textureCache.get(url);
  if (!p) {
    p = new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`mask image ${url} failed to load`));
      img.src = url;
    });
    textureCache.set(url, p);
  }
  return p;
}
export function loadMaskTexture(id: TextureMask): Promise<HTMLImageElement> {
  return loadMaskImage(maskTextureUrl(id));
}
/** The edge's overlay (torn paper's rim), or null when it has none. */
export function loadMaskOverlay(id: TextureMask): Promise<HTMLImageElement | null> {
  const u = maskOverlayUrl(id);
  return u ? loadMaskImage(u) : Promise.resolve(null);
}

/** Canvas: paint the edge's overlay (if any) over the drawn pixels, then
 *  multiply their alpha by the texture — both stretched to the box. */
export function applyTextureAlpha(ctx: CanvasRenderingContext2D, tex: CanvasImageSource, x: number, y: number, w: number, h: number, overlay?: CanvasImageSource | null): void {
  ctx.save();
  if (overlay) ctx.drawImage(overlay, x, y, w, h);
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(tex, x, y, w, h);
  ctx.restore();
}

/** DOM: the same texture as a CSS mask. */
export function textureMaskCss(id: TextureMask): CSSProperties {
  const u = `url("${maskTextureUrl(id)}")`;
  return {
    WebkitMaskImage: u, maskImage: u,
    WebkitMaskSize: '100% 100%', maskSize: '100% 100%',
    WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat',
  } as CSSProperties;
}
/** DOM: the overlay as a layer over the photo, inside the masked frame (so
 *  the frame's texture mask trims it exactly as the canvas does). Null when
 *  the edge has none. */
export function textureOverlayCss(id: TextureMask): CSSProperties | null {
  const u = maskOverlayUrl(id);
  return u ? { position: 'absolute', inset: 0, pointerEvents: 'none', backgroundImage: `url("${u}")`, backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat' } : null;
}

/** Shapes drawn from ONE path generator (maskPathD) in every renderer. */
export const PATH_SHAPES = ['leaf', 'scallop', 'hexagon', 'octagon', 'diamond', 'ticket', 'cloud', 'pinking', 'stamp', 'wavy', 'halftone'] as const;
export type PathShape = typeof PATH_SHAPES[number];
export function isPathShape(v: unknown): v is PathShape {
  return typeof v === 'string' && (PATH_SHAPES as readonly string[]).includes(v);
}

/** The soft edge's width as a fraction of the frame's shorter side. */
export const SOFT_FEATHER = 0.10;
/** Rounded mask corner radius in design px (the template's own radius wins). */
export const ROUNDED_MASK_RADIUS = 28;

export type FeatherSide = 'all' | 'bottom';
export type AppliedSlot<T extends TemplateSlot> = T & { feather?: number; featherSide?: FeatherSide; texture?: TextureMask; masked?: boolean };

/** The slot the renderers should draw: the mask overrides the template shape.
 *  Absent / 'none' returns the slot untouched. */
export function applyMask<T extends TemplateSlot>(slot: T, mask?: MaskId | null): AppliedSlot<T> {
  if (!mask || mask === 'none') return slot;
  if (mask === 'soft') return { ...slot, shape: 'rectangle', borderRadius: undefined, feather: SOFT_FEATHER, featherSide: 'all', masked: true };
  if (mask === 'fade-bottom') return { ...slot, shape: 'rectangle', borderRadius: undefined, feather: SOFT_FEATHER * 2.5, featherSide: 'bottom', masked: true };
  if (isTextureMask(mask)) return { ...slot, shape: 'rectangle', borderRadius: undefined, texture: mask, masked: true };
  if (mask === 'rounded') return { ...slot, shape: 'rounded', borderRadius: slot.borderRadius || ROUNDED_MASK_RADIUS, masked: true };
  return { ...slot, shape: mask, masked: true };
}

export function isMaskId(v: unknown): v is MaskId {
  return typeof v === 'string' && MASKS.some((m) => m.id === v);
}

/* ── Arch: a rectangle whose top is a half-ellipse ───────────────────────── */
export function archRy(w: number, h: number): number { return Math.min(w / 2, h * 0.6); }

/** SVG path of an arch in a w×h box, origin top-left (DOM clip-path, print). */
export function archPath(w: number, h: number): string {
  const ry = archRy(w, h);
  return `M 0 ${h} L 0 ${ry} A ${w / 2} ${ry} 0 0 1 ${w} ${ry} L ${w} ${h} Z`;
}

/** The same arch with its origin at the box centre (Fabric clip objects). */
export function archPathCentered(w: number, h: number): string {
  const ry = archRy(w, h);
  const x0 = -w / 2, y0 = -h / 2;
  return `M ${x0} ${y0 + h} L ${x0} ${y0 + ry} A ${w / 2} ${ry} 0 0 1 ${x0 + w} ${y0 + ry} L ${x0 + w} ${y0 + h} Z`;
}

/* ── Path shapes: ONE generator, offset + size supplied by the renderer
   (DOM: 0,0,w,h in the element; Fabric: -w/2,-h/2 around the centre;
   print: the slot's page px). Points are authored in a unit box. ────────── */
type Pt = [number, number];
/** 3-decimal coordinates: short paths, and no 6e-17 noise from cos/sin. */
const n3 = (v: number) => String(Math.round(v * 1000) / 1000);
const poly = (pts: Pt[], x0: number, y0: number, w: number, h: number) =>
  'M ' + pts.map(([px, py]) => `${n3(x0 + px * w)} ${n3(y0 + py * h)}`).join(' L ') + ' Z';
const OCT = 0.29, TICKET = 0.1;

/* ── Patterned edges (owner's picks 29–31, 34): sized from the frame's
   SHORTER side, in the frame's real units — so teeth, holes and dots stay
   square/round on a wide frame, and the count per side is a whole number
   (corners land clean). Every renderer passes its own w×h at the same
   ratio, so all three get the same count. ────────────────────────────────── */
export const EDGE_PATTERN = {
  pinkTooth: 0.05, pinkDepth: 0.025,  // a 90° zigzag
  stampPitch: 0.055, stampHole: 0.021, // perforations: hole radius
  wavePeriod: 0.12, waveDepth: 0.024,
  dotPitch: 0.045, dotBand: 0.22,      // halftone: dots dissolve over the outer 22%
};
/** The four sides, clockwise from the top-left: start, direction, inward normal, length. */
const sidesOf = (w: number, h: number) => [
  { sx: 0, sy: 0, dx: 1, dy: 0, nx: 0, ny: 1, len: w },
  { sx: w, sy: 0, dx: 0, dy: 1, nx: -1, ny: 0, len: h },
  { sx: w, sy: h, dx: -1, dy: 0, nx: 0, ny: -1, len: w },
  { sx: 0, sy: h, dx: 0, dy: -1, nx: 1, ny: 0, len: h },
];
/** Walk the edge clockwise; `segs(len)` points per side, `inset(k, n)` pushes
 *  point k of n in from the edge. k = 0 is the corner, on the edge. */
function edgeWalk(x0: number, y0: number, w: number, h: number, segs: (len: number) => number, inset: (k: number, n: number) => number): string {
  const out: string[] = [];
  for (const s of sidesOf(w, h)) {
    const n = segs(s.len);
    for (let k = 0; k < n; k++) {
      const a = (s.len * k) / n, d = inset(k, n);
      out.push(`${n3(x0 + s.sx + s.dx * a + s.nx * d)} ${n3(y0 + s.sy + s.dy * a + s.ny * d)}`);
    }
  }
  return 'M ' + out.join(' L ') + ' Z';
}
function pinkingPath(x0: number, y0: number, w: number, h: number): string {
  const u = Math.min(w, h), E = EDGE_PATTERN;
  // two points per tooth (peak on the edge, valley in), so every side ends on a valley
  return edgeWalk(x0, y0, w, h, (len) => 2 * Math.max(2, Math.round(len / (E.pinkTooth * u))), (k) => (k % 2 ? E.pinkDepth * u : 0));
}
function wavyPath(x0: number, y0: number, w: number, h: number): string {
  const u = Math.min(w, h), E = EDGE_PATTERN, STEPS = 12;
  return edgeWalk(x0, y0, w, h, (len) => STEPS * Math.max(2, Math.round(len / (E.wavePeriod * u))),
    (k) => (E.waveDepth * u * (1 - Math.cos((2 * Math.PI * k) / STEPS))) / 2);
}
function stampPath(x0: number, y0: number, w: number, h: number): string {
  const u = Math.min(w, h), E = EDGE_PATTERN, r = E.stampHole * u;
  const at = (s: ReturnType<typeof sidesOf>[number], a: number) => `${n3(x0 + s.sx + s.dx * a)} ${n3(y0 + s.sy + s.dy * a)}`;
  let d = `M ${n3(x0)} ${n3(y0)}`;
  for (const s of sidesOf(w, h)) {
    const n = Math.max(3, Math.round(s.len / (E.stampPitch * u)));
    for (let k = 0; k < n; k++) {
      const c = ((k + 0.5) * s.len) / n;
      // a half-hole bitten INTO the photo: clockwise walk, so sweep 0 bulges inward
      d += ` L ${at(s, c - r)} A ${n3(r)} ${n3(r)} 0 0 0 ${at(s, c + r)}`;
    }
    d += ` L ${at(s, s.len)}`;
  }
  return d + ' Z';
}
function halftonePath(x0: number, y0: number, w: number, h: number): string {
  const u = Math.min(w, h), E = EDGE_PATTERN;
  const p = E.dotPitch * u, band = E.dotBand * u, rMax = 0.6 * p;
  // the solid middle, clockwise like every dot below (nonzero fill = union)
  let d = `M ${n3(x0 + band)} ${n3(y0 + band)} L ${n3(x0 + w - band)} ${n3(y0 + band)} L ${n3(x0 + w - band)} ${n3(y0 + h - band)} L ${n3(x0 + band)} ${n3(y0 + h - band)} Z`;
  // a dot grid centred on the frame (symmetric, so the Fabric clip centres true)
  const ix = Math.floor(w / 2 / p), iy = Math.floor(h / 2 / p);
  for (let j = -iy; j <= iy; j++) {
    for (let i = -ix; i <= ix; i++) {
      const cx = w / 2 + i * p, cy = h / 2 + j * p;
      const out = Math.hypot(Math.max(band - cx, 0, cx - (w - band)), Math.max(band - cy, 0, cy - (h - band)));
      const inside = Math.min(cx - band, w - band - cx, cy - band, h - band - cy);
      if (out === 0 && inside > rMax) continue; // fully under the solid middle
      let r = rMax * (1 - out / (band * 0.95));
      r = Math.min(r, cx, w - cx, cy, h - cy); // never past the frame
      if (r < 0.12 * p) continue;
      const X = x0 + cx, Y = y0 + cy;
      d += ` M ${n3(X + r)} ${n3(Y)} A ${n3(r)} ${n3(r)} 0 1 1 ${n3(X - r)} ${n3(Y)} A ${n3(r)} ${n3(r)} 0 1 1 ${n3(X + r)} ${n3(Y)} Z`;
    }
  }
  return d;
}

export function maskPathD(shape: PathShape, x0: number, y0: number, w: number, h: number): string {
  const P = (px: number, py: number) => `${n3(x0 + px * w)} ${n3(y0 + py * h)}`;
  switch (shape) {
    case 'pinking': return pinkingPath(x0, y0, w, h);
    case 'stamp': return stampPath(x0, y0, w, h);
    case 'wavy': return wavyPath(x0, y0, w, h);
    case 'halftone': return halftonePath(x0, y0, w, h);
    case 'hexagon': return poly([[0.5, 0], [1, 0.25], [1, 0.75], [0.5, 1], [0, 0.75], [0, 0.25]], x0, y0, w, h);
    case 'octagon': return poly([[OCT, 0], [1 - OCT, 0], [1, OCT], [1, 1 - OCT], [1 - OCT, 1], [OCT, 1], [0, 1 - OCT], [0, OCT]], x0, y0, w, h);
    case 'diamond': return poly([[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]], x0, y0, w, h);
    case 'ticket': return poly([[TICKET, 0], [1 - TICKET, 0], [1, TICKET], [1, 1 - TICKET], [1 - TICKET, 1], [TICKET, 1], [0, 1 - TICKET], [0, TICKET]], x0, y0, w, h);
    case 'leaf': return `M ${P(0.5, 0)} C ${P(1.05, 0.25)} ${P(1.05, 0.75)} ${P(0.5, 1)} C ${P(-0.05, 0.75)} ${P(-0.05, 0.25)} ${P(0.5, 0)} Z`;
    case 'scallop': {
      // 12 lobes around a circle: points on r=0.46, each lobe bulges to r=0.56.
      const n = 12, r = 0.46, bulge = 0.56;
      const at = (a: number, rad: number): Pt => [0.5 + rad * Math.cos(a), 0.5 + rad * Math.sin(a)];
      let d = '';
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2, am = (a0 + a1) / 2;
        const [sx, sy] = at(a0, r), [mx, my] = at(am, bulge), [ex, ey] = at(a1, r);
        d += (i === 0 ? `M ${P(sx, sy)} ` : '') + `Q ${P(mx, my)} ${P(ex, ey)} `;
      }
      return d + 'Z';
    }
    case 'cloud':
      return `M ${P(0.22, 0.86)} C ${P(0.04, 0.86)} ${P(0.02, 0.6)} ${P(0.18, 0.55)} C ${P(0.08, 0.36)} ${P(0.3, 0.2)} ${P(0.42, 0.34)} `
        + `C ${P(0.48, 0.1)} ${P(0.82, 0.14)} ${P(0.8, 0.4)} C ${P(1.0, 0.42)} ${P(1.0, 0.82)} ${P(0.78, 0.86)} Z`;
  }
}

/* ── Star: one generator for the three renderers (the DOM used to draw a
   different star from the print) ─────────────────────────────────────────── */
export function starPoints(cx: number, cy: number, outerR: number, innerRatio = 0.4, spikes = 5): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? outerR : outerR * innerRatio;
    const a = (i * Math.PI) / spikes - Math.PI / 2;
    pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return pts;
}

/** CSS polygon() for a star filling a square box, in percentages. */
export function starPolygonCss(): string {
  return `polygon(${starPoints(50, 50, 50).map((p) => `${p.x.toFixed(2)}% ${p.y.toFixed(2)}%`).join(', ')})`;
}

/* ── Soft edge ───────────────────────────────────────────────────────────── */
/** DOM: a feathered rectangle — all four edges (two intersecting gradient
 *  masks) or the bottom edge only (one gradient). */
export function featherEdgeCss(feather: number, w: number, h: number, side: FeatherSide = 'all'): CSSProperties {
  const f = Math.max(1, Math.round(feather * Math.min(w, h)));
  if (side === 'bottom') {
    const g = `linear-gradient(to bottom, #000 0px, #000 calc(100% - ${f}px), rgba(0,0,0,0) 100%)`;
    return { WebkitMaskImage: g, maskImage: g } as CSSProperties;
  }
  const gx = `linear-gradient(to right, rgba(0,0,0,0) 0px, #000 ${f}px, #000 calc(100% - ${f}px), rgba(0,0,0,0) 100%)`;
  const gy = `linear-gradient(to bottom, rgba(0,0,0,0) 0px, #000 ${f}px, #000 calc(100% - ${f}px), rgba(0,0,0,0) 100%)`;
  return {
    WebkitMaskImage: `${gx}, ${gy}`,
    maskImage: `${gx}, ${gy}`,
    WebkitMaskComposite: 'source-in',
    maskComposite: 'intersect',
  } as CSSProperties;
}

/** Canvas (Fabric offscreen + print): multiply the drawn pixels' alpha by the
 *  same gradients (destination-in keeps only what both keep). */
export function featherAlpha(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, feather: number, side: FeatherSide = 'all'): void {
  const f = Math.max(1, feather * Math.min(w, h));
  ctx.save();
  ctx.globalCompositeOperation = 'destination-in';
  if (side === 'bottom') {
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(Math.max(0, 1 - f / h), 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
    ctx.restore();
    return;
  }
  const gx = ctx.createLinearGradient(x, 0, x + w, 0);
  gx.addColorStop(0, 'rgba(0,0,0,0)'); gx.addColorStop(Math.min(0.5, f / w), 'rgba(0,0,0,1)');
  gx.addColorStop(Math.max(0.5, 1 - f / w), 'rgba(0,0,0,1)'); gx.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gx; ctx.fillRect(x, y, w, h);
  const gy = ctx.createLinearGradient(0, y, 0, y + h);
  gy.addColorStop(0, 'rgba(0,0,0,0)'); gy.addColorStop(Math.min(0.5, f / h), 'rgba(0,0,0,1)');
  gy.addColorStop(Math.max(0.5, 1 - f / h), 'rgba(0,0,0,1)'); gy.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gy; ctx.fillRect(x, y, w, h);
  ctx.restore();
}
