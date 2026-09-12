import type { OrnamentFill, OrnamentTransform } from './types';
import { ALBUM_INCHES } from './templateKit';
import { bindingEdge } from './binding';
import { safeAreaInches, type GuardContext, type GuardReason } from './slotGeometry';

/* ══════════════════════════════════════════════════════════════════════════
   STICKERS (owner, 2026-09-13, Studio): a free graphic on the page — the
   curated ornament set, placed anywhere, dragged / resized / rotated. Its
   transform is the same centre-based page-fraction OrnamentTransform the
   caption-box graphics already use, so all three renderers draw it with the
   code they already have. The guardrails mirror the frame ones: inside the
   safe area (margin + spine keep-out), never under STICKER_MIN_INCHES.
   ══════════════════════════════════════════════════════════════════════════ */

export interface Sticker extends OrnamentFill {
  uid: string;
  geom: OrnamentTransform;
}

export const STICKER_MIN_INCHES = 0.5;
/** A new sticker's side as a fraction of the page's shorter side. */
export const STICKER_DEFAULT_FRACTION = 0.22;

const r4 = (v: number) => Math.round(v * 10000) / 10000;
const TOL = 0.004;

export function pageInches(albumSize: string): { w: number; h: number } {
  return ALBUM_INCHES[albumSize as keyof typeof ALBUM_INCHES] ?? { w: 8, h: 8 };
}

/** Where a fresh sticker lands: centred in the safe area, square, DEFAULT size. */
export function defaultStickerGeom(ctx: GuardContext): OrnamentTransform {
  const page = pageInches(ctx.albumSize);
  const { margin } = safeAreaInches(ctx);
  const sideIn = STICKER_DEFAULT_FRACTION * Math.min(page.w, page.h);
  const geom = { cx: (margin.left + (1 - margin.right)) / 2, cy: (margin.top + (1 - margin.bottom)) / 2, w: sideIn / page.w, h: sideIn / page.h, rot: 0 };
  return clampStickerGeom(geom, ctx).geom;
}

/** Keep a sticker printable: its box inside the safe area, its side at least
 *  STICKER_MIN_INCHES. Rotation is free (the printers draw it). Idempotent. */
export function clampStickerGeom(geom: OrnamentTransform, ctx: GuardContext): { geom: OrnamentTransform; reasons: GuardReason[] } {
  const reasons = new Set<GuardReason>();
  const page = pageInches(ctx.albumSize);
  const { margin } = safeAreaInches(ctx);
  const left = margin.left, right = 1 - margin.right, top = margin.top, bottom = 1 - margin.bottom;
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  let w = num(geom.w, 0.2), h = num(geom.h, 0.2), cx = num(geom.cx, 0.5), cy = num(geom.cy, 0.5);
  const rot = ((num(geom.rot, 0) % 360) + 360) % 360;
  // floor: the shorter printed side
  const minW = STICKER_MIN_INCHES / page.w, minH = STICKER_MIN_INCHES / page.h;
  if (w < minW - 1e-9 || h < minH - 1e-9) {
    const k = Math.max(minW / Math.max(w, 1e-9), minH / Math.max(h, 1e-9));
    if (k > 1 + TOL) reasons.add('floor');
    w *= k; h *= k;
  }
  // cap: never larger than the safe area
  const maxW = right - left, maxH = bottom - top;
  if (w > maxW || h > maxH) {
    const k = Math.min(maxW / w, maxH / h);
    if (k < 1 - TOL) reasons.add('edge');
    w *= k; h *= k;
  }
  const spine = ctx.coverMode ? null : bindingEdge(ctx.pageIndex);
  if (cx - w / 2 < left) { if (left - (cx - w / 2) > TOL) reasons.add(spine === 'left' ? 'spine' : 'edge'); cx = left + w / 2; }
  if (cx + w / 2 > right) { if (cx + w / 2 - right > TOL) reasons.add(spine === 'right' ? 'spine' : 'edge'); cx = right - w / 2; }
  if (cy - h / 2 < top) { if (top - (cy - h / 2) > TOL) reasons.add('edge'); cy = top + h / 2; }
  if (cy + h / 2 > bottom) { if (cy + h / 2 - bottom > TOL) reasons.add('edge'); cy = bottom - h / 2; }
  const order: GuardReason[] = ['spine', 'floor', 'edge'];
  return { geom: { cx: r4(cx), cy: r4(cy), w: r4(w), h: r4(h), rot: Math.round(rot * 10) / 10 }, reasons: order.filter((k) => reasons.has(k)) };
}

export function newStickerUid(): string {
  return `stk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}
