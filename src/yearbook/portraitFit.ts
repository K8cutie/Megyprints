/* ── Same head size, same eye line, for every portrait ───────────────────────
   Photographers never crop 300 students identically. This moves and zooms
   each portrait's crop (never stretches or edits the face — the Lifetouch
   lesson) so that, in the printed frame:
   • the distance between the eyes is the same for everyone, which makes the
     heads the same size (head ≈ half the frame height);
   • the eyes sit on the same line, 36% down, centred left-right.
   When a photo is cropped too tight to reach that size, or the face is too
   close to the edge, it gets the closest possible crop and a "tight crop"
   flag so the adviser can ask the photographer for a looser file. */
import { HEAD, PORTRAIT_ASPECT } from './geometry';
import type { FaceGeom } from './types';

export interface Crop { x: number; y: number; w: number; h: number }

export interface PortraitFit {
  /** Source rectangle in the photo, in photo pixels. */
  crop: Crop;
  /** The head (with room for hair) inside the frame, as 0–1 of the frame. Null when no face. */
  head: { x0: number; y0: number; x1: number; y1: number } | null;
  /** Eye midpoint inside the frame, 0–1. Null when no face. */
  eyes: { x: number; y: number } | null;
  tight: boolean;
}

/** Eye gap the fit aims for, as a fraction of the frame HEIGHT. */
export const TARGET_EYE_GAP = HEAD.heightFrac / HEAD.headPerEyeGap;

/** Biggest face in the photo (the student, not someone in the background). */
export function mainFace(faces: FaceGeom[]): FaceGeom | null {
  if (!faces.length) return null;
  return faces.reduce((a, b) => (b.box.w * b.box.h > a.box.w * a.box.h ? b : a));
}

export function fitPortrait(width: number, height: number, face: FaceGeom | null, aspect = PORTRAIT_ASPECT): PortraitFit {
  const W = width, H = height;
  if (!face) {
    // No face found: a centred cover crop, nudged up a little (heads are high).
    let cw = W, ch = W / aspect;
    if (ch > H) { ch = H; cw = H * aspect; }
    const x = (W - cw) / 2;
    const y = Math.min(Math.max(0, H * 0.45 - ch / 2), H - ch);
    return { crop: { x, y, w: cw, h: ch }, head: null, eyes: null, tight: false };
  }

  const lx = face.leftEye.x * W, ly = face.leftEye.y * H, rx = face.rightEye.x * W, ry = face.rightEye.y * H;
  const ex = (lx + rx) / 2, ey = (ly + ry) / 2;
  let gap = Math.hypot(rx - lx, ry - ly);
  // Implausible landmarks (profile, glasses glare): fall back to the face box.
  const boxH = face.box.h * H;
  if (!(gap > boxH * 0.2 && gap < boxH * 0.7)) gap = boxH * 0.4;

  let ch = gap / TARGET_EYE_GAP, cw = ch * aspect;
  let tight = false;
  const s = Math.min(1, W / cw, H / ch);
  if (s < 1) { cw *= s; ch *= s; if (s < 0.92) tight = true; }

  const wantX = ex - cw * 0.5, wantY = ey - ch * HEAD.eyeYFrac;
  const x = Math.min(Math.max(0, wantX), W - cw);
  const y = Math.min(Math.max(0, wantY), H - ch);
  if (Math.abs(x - wantX) > cw * 0.06 || Math.abs(y - wantY) > ch * 0.06) tight = true;

  const crop = { x, y, w: cw, h: ch };
  const bx = face.box.x * W, by = face.box.y * H, bw = face.box.w * W;
  // face-api's box runs roughly brows→chin; hair and ears sit outside it.
  const head = {
    x0: (bx - bw * 0.12 - x) / cw,
    x1: (bx + bw * 1.12 - x) / cw,
    y0: (by - boxH * 0.45 - y) / ch,
    y1: (by + boxH - y) / ch,
  };
  return { crop, head, eyes: { x: (ex - x) / cw, y: (ey - y) / ch }, tight };
}

/** Does a square badge (frame-relative rect) touch the head? */
export function badgeHitsHead(fit: PortraitFit, badge: { x0: number; y0: number; x1: number; y1: number }): boolean {
  const h = fit.head;
  if (!h) return false;
  return badge.x0 < h.x1 && badge.x1 > h.x0 && badge.y0 < h.y1 && badge.y1 > h.y0;
}
