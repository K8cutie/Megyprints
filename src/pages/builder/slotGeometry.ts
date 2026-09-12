import type { SlotGeometryOverride } from './types';
import { ALBUM_INCHES, MIN_FRAME_INCHES } from './templateKit';
import { bindingEdge, marginForTemplate } from './binding';

/* ══════════════════════════════════════════════════════════════════════════
   STUDIO GEOMETRY — where a customer-moved photo frame lives, and the
   guardrails that keep it printable (owner, 2026-09-13: "put guardrails for
   users — bleed, printing limits").

   ONE space: a slot override is x / y / width / height as FRACTIONS OF THE
   SAFE AREA — exactly the space template slots are authored in — so the DOM
   preview, the Fabric editor and the print pipeline all place it with the
   same two lines of arithmetic they already use for template slots. (The
   old "container mode" wrote PERCENT OF THE CANVAS into these fields while
   the renderers read fractions of the safe area: it never worked.)

   The safe area already excludes the page margin AND the 0.5" binding
   keep-out on the spine edge, so clamping to [0, 1] is what keeps a frame out
   of the spine and off the trim. The 2" print floor is the third rule.
   Rotation is not part of the space: no renderer prints it.
   ══════════════════════════════════════════════════════════════════════════ */

export interface SlotBox { x: number; y: number; width: number; height: number }
interface Margin { top: number; bottom: number; left: number; right: number }
export interface GuardTemplate { fullBleed?: boolean; margin?: Margin }
export interface GuardContext {
  albumSize: string;
  pageIndex: number;
  template: GuardTemplate | null | undefined;
  /** A cover panel has no interior spine gutter. */
  coverMode?: boolean;
}
export type GuardReason = 'spine' | 'edge' | 'floor';

const DEFAULT_MARGIN: Margin = { top: 0.04, bottom: 0.04, left: 0.04, right: 0.04 };
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const EPS = 1e-6;
/** A push smaller than this (≈ 3 px on the editor) is silently clamped with
 *  no message: Fabric's snapping and stroke maths land a frame a hair over
 *  the line on ordinary moves, and nagging about that would teach people to
 *  ignore the real warnings. */
const TOL = 0.004;
const r6 = (v: number) => Math.round(v / EPS) * EPS;
/** Floors round UP so a stored frame is never a hair under the 2" floor. */
const ceil6 = (v: number) => Math.ceil(v / EPS - 1e-7) * EPS;

/** A template slot with its Studio override applied. Shape/ratio/etc. pass
 *  through untouched; only the four box fields can be overridden. */
export function resolveSlotBox<T extends SlotBox>(slot: T, geom?: SlotGeometryOverride | null): T {
  if (!geom) return slot;
  const out = { ...slot };
  if (num(geom.x)) out.x = geom.x;
  if (num(geom.y)) out.y = geom.y;
  if (num(geom.width)) out.width = geom.width;
  if (num(geom.height)) out.height = geom.height;
  return out;
}

/** The safe area's size in inches (page minus margin minus binding). */
export function safeAreaInches(ctx: GuardContext): { w: number; h: number; margin: Margin } {
  const size = ALBUM_INCHES[ctx.albumSize as keyof typeof ALBUM_INCHES] ?? { w: 8, h: 8 };
  const margin = marginForTemplate(ctx.template ?? null, ctx.template?.margin ?? DEFAULT_MARGIN, ctx.albumSize, ctx.pageIndex, { noBinding: ctx.coverMode });
  return { w: size.w * (1 - margin.left - margin.right), h: size.h * (1 - margin.top - margin.bottom), margin };
}

/** A box's printed size in inches. */
export function slotInches(box: SlotBox, ctx: GuardContext): { w: number; h: number } {
  const s = safeAreaInches(ctx);
  return { w: box.width * s.w, h: box.height * s.h };
}

/** THE GUARDRAILS. Never throws, never refuses: it returns the nearest
 *  printable box and says which rules moved it. Idempotent. */
export function clampSlotBox(box: SlotBox, ctx: GuardContext): { box: SlotBox; reasons: GuardReason[] } {
  const reasons = new Set<GuardReason>();
  const safe = safeAreaInches(ctx);
  const minW = Math.min(1, MIN_FRAME_INCHES / safe.w);
  const minH = Math.min(1, MIN_FRAME_INCHES / safe.h);
  let x = num(box.x) ? box.x : 0;
  let y = num(box.y) ? box.y : 0;
  let width = num(box.width) ? box.width : 1;
  let height = num(box.height) ? box.height : 1;
  if (width < minW - EPS) { if (minW - width > TOL) reasons.add('floor'); width = ceil6(minW); }
  if (height < minH - EPS) { if (minH - height > TOL) reasons.add('floor'); height = ceil6(minH); }
  if (width > 1) { if (width - 1 > TOL) reasons.add('edge'); width = 1; }
  if (height > 1) { if (height - 1 > TOL) reasons.add('edge'); height = 1; }
  const spine = ctx.coverMode ? null : bindingEdge(ctx.pageIndex);
  if (x < 0) { if (-x > TOL) reasons.add(spine === 'left' ? 'spine' : 'edge'); x = 0; }
  if (y < 0) { if (-y > TOL) reasons.add('edge'); y = 0; }
  if (x + width > 1 + EPS) { if (x + width - 1 > TOL) reasons.add(spine === 'right' ? 'spine' : 'edge'); x = 1 - width; }
  if (y + height > 1 + EPS) { if (y + height - 1 > TOL) reasons.add('edge'); y = 1 - height; }
  // The spine is the rule worth naming first, then the floor, then the trim.
  const order: GuardReason[] = ['spine', 'floor', 'edge'];
  return { box: { x: r6(Math.max(0, x)), y: r6(Math.max(0, y)), width: r6(width), height: r6(height) }, reasons: order.filter((k) => reasons.has(k)) };
}

/** Merge a (possibly partial) override onto its template slot and clamp. The
 *  result is always a FULL box, so a stored override never depends on the
 *  template's numbers again. */
export function clampSlotGeometry(slot: SlotBox, geom: SlotGeometryOverride, ctx: GuardContext): { geom: SlotGeometryOverride; reasons: GuardReason[] } {
  const merged = resolveSlotBox({ x: slot.x, y: slot.y, width: slot.width, height: slot.height }, geom);
  const { box, reasons } = clampSlotBox(merged, ctx);
  return { geom: { x: box.x, y: box.y, width: box.width, height: box.height }, reasons };
}

/** Under this, a photo stretched over its frame prints visibly soft. */
export const SOFT_PRINT_DPI = 150;

/** Will this photo print sharp in this box? Object-fit "cover" scales the
 *  photo so the SHORT side fills, so the limiting axis is the smaller of the
 *  two pixel-per-inch figures. */
export function printSharpness(photo: { width?: number; height?: number } | null | undefined, box: SlotBox, ctx: GuardContext): 'sharp' | 'soft' | 'unknown' {
  if (!photo || !photo.width || !photo.height) return 'unknown';
  const inch = slotInches(box, ctx);
  if (inch.w <= 0 || inch.h <= 0) return 'unknown';
  const dpi = Math.min(photo.width / inch.w, photo.height / inch.h);
  return dpi < SOFT_PRINT_DPI ? 'soft' : 'sharp';
}

/** What the page says when a rule moved a frame. Plain words, the reason first. */
export const GUARD_MESSAGES: Record<GuardReason, string> = {
  spine: 'Kept out of the spine — that edge is inside the binding.',
  edge: 'Kept inside the safe area — past it gets trimmed.',
  floor: 'Held at 2 inches — smaller than that does not print well.',
};
export const SOFT_MESSAGE = 'Heads up: stretched this far, this photo prints a little soft.';
