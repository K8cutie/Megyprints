/* ── v2 · Fit a photo to a slot ─────────────────────────────────────────────
   The image adapts to the layout, never the reverse (owner's rule, 2026-09-10).

   A slot of a different ratio than the photo crops it (object-fit: cover). The
   question this module answers is not "do the ratios match" but "does the
   photo's SUBJECT survive the crop, and how much of the photo is lost doing
   it". That number lets a square photo enter a rectangular layout when its
   subject sits safely inside the window — and refuses when it doesn't, which
   is what the old face-centre point could never say (it returned a midpoint,
   so a group spanning the frame was cropped through its edges).

   Everything here is pure geometry in normalised image space (0..1). The only
   place pixels appear is `designPxOffset`, which converts the chosen window
   into the DESIGN-PIXEL pan the three renderers already read from
   `slotOffsetsX/Y`. Scale is deliberately left at 1: the renderers disagree on
   what `slotScales` means (Fabric: absolute; DOM/print: multiplier), so v2 pans
   only — a subject that needs zoom to fit is a subject that doesn't fit. */

import { getRatioValue, type PhotoRatio } from '../../pages/builder/photoAnalyzer';

/** A region of the photo in normalised coordinates (0,0 top-left → 1,1). */
export interface Rect { x: number; y: number; w: number; h: number }
export type SubjectBox = Rect;

/** Below this the crop is "not safe": part of the subject is cut. Start at
 *  0.92 and tune from the defect log (customers re-panning after auto-place). */
export const FIT_THRESHOLD = 0.92;
/** How much a harsh crop is penalised even when the subject survives — a
 *  square in 16:9 loses 44% of its area and reads as zoomed. Small on purpose:
 *  it orders gentle crops ahead of harsh ones without forbidding harsh ones. */
export const SEVERITY_WEIGHT = 0.15;

const clamp01 = (n: number, max: number) => Math.max(0, Math.min(max, n));
/** Clamp to 0..1 and absorb float noise at the ends, so "the whole subject
 *  survived" is exactly 1 rather than 0.9999999999999997. */
const snap01 = (n: number): number => (n > 1 - 1e-9 ? 1 : n < 1e-9 ? 0 : n);
/** Drop the sign off a negative zero (−0 from `-(0) * w`). */
const nz = (n: number): number => (n === 0 ? 0 : n);

/** The fraction of the photo that stays visible when it covers a slot of
 *  `slotAspect` (width/height): one axis is fully visible, the other is
 *  cropped. Same ratio → the whole photo. */
export function coverWindow(photoAspect: number, slotAspect: number): { w: number; h: number } {
  if (!(photoAspect > 0) || !(slotAspect > 0)) return { w: 1, h: 1 };
  if (photoAspect > slotAspect) return { w: slotAspect / photoAspect, h: 1 };
  return { w: 1, h: photoAspect / slotAspect };
}

/** Place the visible window so it contains the subject when it can, centred on
 *  the subject otherwise — never letting the window leave the photo. */
export function bestWindow(subject: Rect, vis: { w: number; h: number }): Rect {
  const cx = subject.x + subject.w / 2;
  const cy = subject.y + subject.h / 2;
  return {
    x: clamp01(cx - vis.w / 2, 1 - vis.w),
    y: clamp01(cy - vis.h / 2, 1 - vis.h),
    w: vis.w,
    h: vis.h,
  };
}

export function overlapArea(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

export interface FitResult {
  /** 0..1 — fraction of the subject's area still visible at the best pan. */
  survival: number;
  /** 0..1 — fraction of the photo's area the crop throws away. */
  severity: number;
  /** survival × (1 − SEVERITY_WEIGHT × severity). The number the engine ranks by. */
  fit: number;
  /** The visible window in photo coordinates at the best pan. */
  window: Rect;
}

/** How well a photo with this subject fits a slot of this aspect. */
export function fitSubject(subject: Rect, photoAspect: number, slotAspect: number): FitResult {
  const vis = coverWindow(photoAspect, slotAspect);
  const window = bestWindow(subject, vis);
  const subjectArea = subject.w * subject.h;
  const survival = snap01(subjectArea > 0 ? overlapArea(window, subject) / subjectArea : 1);
  const severity = snap01(1 - vis.w * vis.h);
  return { survival, severity, fit: snap01(survival * (1 - SEVERITY_WEIGHT * severity)), window };
}

export function fitAtRatio(subject: Rect, photoAspect: number, ratio: PhotoRatio): FitResult {
  return fitSubject(subject, photoAspect, getRatioValue(ratio));
}

/** Is the crop into this slot safe? */
export function fitsSlot(subject: Rect, photoAspect: number, slotAspect: number, threshold = FIT_THRESHOLD): boolean {
  return fitSubject(subject, photoAspect, slotAspect).fit >= threshold;
}

/** When we know nothing about the subject (no faces, no people) assume it
 *  sits in the middle 60%. Landscapes, food and objects crop fine on that
 *  assumption; a portrait of a person never reaches here because the person
 *  detector finds them. */
export const UNKNOWN_SUBJECT: Rect = { x: 0.2, y: 0.2, w: 0.6, h: 0.6 };

/** Convert the chosen window into the pan the renderers read. Offsets are in
 *  DESIGN PIXELS on the authoring canvas (see printPipeline: "Offsets are
 *  stored in DESIGN px"), applied to the photo drawn cover-fit inside a slot of
 *  `slotWpx × slotHpx`. A positive Y moves the photo DOWN, revealing its top. */
export function designPxOffset(
  window: Rect,
  photoAspect: number,
  slotWpx: number,
  slotHpx: number,
): { offsetX: number; offsetY: number } {
  if (!(photoAspect > 0) || !(slotWpx > 0) || !(slotHpx > 0)) return { offsetX: 0, offsetY: 0 };
  const slotAspect = slotWpx / slotHpx;
  let drawW: number;
  let drawH: number;
  if (photoAspect > slotAspect) { drawH = slotHpx; drawW = drawH * photoAspect; }
  else { drawW = slotWpx; drawH = drawW / photoAspect; }
  const offsetX = -((window.x + window.w / 2) - 0.5) * drawW;
  const offsetY = -((window.y + window.h / 2) - 0.5) * drawH;
  // Sub-pixel noise from the arithmetic is meaningless on a 750-px canvas.
  return { offsetX: nz(Math.round(offsetX * 10) / 10), offsetY: nz(Math.round(offsetY * 10) / 10) };
}

/** The measurement the whole branch is justified by: of these photos (each
 *  with a subject and an aspect), what fraction can safely enter a slot of
 *  `slotAspect`? Run it over a real pool before building anything further. */
export function unlockRate(
  photos: { subject: Rect | null; aspect: number }[],
  slotAspect: number,
  threshold = FIT_THRESHOLD,
): { unlocked: number; total: number; rate: number } {
  const total = photos.length;
  if (!total) return { unlocked: 0, total: 0, rate: 0 };
  let unlocked = 0;
  for (const p of photos) {
    if (fitsSlot(p.subject ?? UNKNOWN_SUBJECT, p.aspect, slotAspect, threshold)) unlocked++;
  }
  return { unlocked, total, rate: unlocked / total };
}
