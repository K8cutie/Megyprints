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

export type MaskId = 'none' | 'soft' | 'circle' | 'oval' | 'rounded' | 'arch' | 'heart' | 'star';

export const MASKS: { id: MaskId; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'soft', label: 'Soft edge' },
  { id: 'circle', label: 'Circle' },
  { id: 'oval', label: 'Oval' },
  { id: 'rounded', label: 'Rounded' },
  { id: 'arch', label: 'Arch' },
  { id: 'heart', label: 'Heart' },
  { id: 'star', label: 'Star' },
];

/** The soft edge's width as a fraction of the frame's shorter side. */
export const SOFT_FEATHER = 0.10;
/** Rounded mask corner radius in design px (the template's own radius wins). */
export const ROUNDED_MASK_RADIUS = 28;

export type AppliedSlot<T extends TemplateSlot> = T & { feather?: number; masked?: boolean };

/** The slot the renderers should draw: the mask overrides the template shape.
 *  Absent / 'none' returns the slot untouched. */
export function applyMask<T extends TemplateSlot>(slot: T, mask?: MaskId | null): AppliedSlot<T> {
  if (!mask || mask === 'none') return slot;
  if (mask === 'soft') return { ...slot, shape: 'rectangle', borderRadius: undefined, feather: SOFT_FEATHER, masked: true };
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
/** DOM: a feathered rectangle via two intersecting gradient masks. */
export function featherEdgeCss(feather: number, w: number, h: number): CSSProperties {
  const f = Math.max(1, Math.round(feather * Math.min(w, h)));
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
 *  same two gradients (destination-in keeps only what both keep). */
export function featherAlpha(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, feather: number): void {
  const f = Math.max(1, feather * Math.min(w, h));
  ctx.save();
  ctx.globalCompositeOperation = 'destination-in';
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
