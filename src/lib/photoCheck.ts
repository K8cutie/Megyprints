/* ══════════════════════════════════════════════════════════════════════════
   photoCheck — Megy's free photo check: blurry shots, repeats (burst / near-
   identical shots) and closed eyes. Everything here is plain arithmetic on
   pixels the PHONE already has: no upload, no AI bill (₱0 per album).

   The pixels come from photoCheckRunner (a small decode of each photo). This
   file is pure so every rule is unit-tested:
     • sharpness = how strong the edges are in the photo's SHARPEST areas (a
       4×4 grid of tiles, the 80th-percentile tile). A plain sky or wall in a
       sharp photo doesn't drag it down; a missed-focus or shaky shot has no
       sharp area anywhere.
     • a 64-bit "difference hash" fingerprint: two shots of the same moment
       differ in a few bits, different photos in many.
     • eyes closed, from the 68-point face landmarks (eye aspect ratio).

   Owner, 2026-10-04: Megy SUGGESTS leaving the weak ones out and the customer
   decides with one tap. Closed eyes alone never gets a photo suggested out (it
   may be the only photo of Lola); it picks the keeper inside a set of repeats
   and keeps a photo off the full pages.
   ══════════════════════════════════════════════════════════════════════════ */

/** What the check found for one photo. Stored on the photo (tiny), so it is
 *  done once per photo even across reloads. */
export interface PhotoCheck {
  v: 1;
  /** Edge strength in the sharpest areas (higher = sharper). */
  sharp: number;
  /** 64-bit difference hash, 16 hex chars. */
  hash: string;
  /** Faces large enough to judge (null when face checking was unavailable). */
  faces: number | null;
  /** A clearly visible face has both eyes shut. */
  eyesClosed: boolean;
  /** The face pass ran (faces stays null when the face models couldn't load). */
  facesTried?: boolean;
}

/** The long side the runner decodes to for sharpness. Big enough that a
 *  missed focus or a shake still shows as soft edges. */
export const CHECK_LONG_SIDE = 800;

/** Luma of an RGBA pixel buffer. */
export function grayscale(rgba: Uint8ClampedArray | Uint8Array, w: number, h: number): Float32Array {
  const g = new Float32Array(w * h);
  for (let i = 0, p = 0; i < g.length; i++, p += 4) g[i] = 0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2];
  return g;
}

/** Edge strength in the photo's sharpest areas: the variance of the Laplacian
 *  in each tile of a `tiles`×`tiles` grid, 80th percentile across tiles. */
export function tileSharpness(gray: Float32Array, w: number, h: number, tiles = 4): number {
  if (w < 3 || h < 3) return 0;
  const tw = Math.floor(w / tiles), th = Math.floor(h / tiles);
  if (tw < 3 || th < 3) return 0;
  const vars: number[] = [];
  for (let ty = 0; ty < tiles; ty++) {
    for (let tx = 0; tx < tiles; tx++) {
      let sum = 0, sum2 = 0, n = 0;
      const x0 = Math.max(1, tx * tw), x1 = Math.min(w - 1, (tx + 1) * tw);
      const y0 = Math.max(1, ty * th), y1 = Math.min(h - 1, (ty + 1) * th);
      for (let y = y0; y < y1; y++) {
        const row = y * w;
        for (let x = x0; x < x1; x++) {
          const i = row + x;
          const lap = gray[i - 1] + gray[i + 1] + gray[i - w] + gray[i + w] - 4 * gray[i];
          sum += lap; sum2 += lap * lap; n++;
        }
      }
      if (n > 0) { const m = sum / n; vars.push(sum2 / n - m * m); }
    }
  }
  if (!vars.length) return 0;
  vars.sort((a, b) => a - b);
  return vars[Math.min(vars.length - 1, Math.floor(vars.length * 0.8))];
}

/** 64-bit difference hash: shrink to 9×8 by area averaging, then one bit per
 *  "is this cell brighter than its right neighbour". */
export function dHash(gray: Float32Array, w: number, h: number): string {
  const cols = 9, rows = 8;
  const cells = new Float32Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    const y0 = Math.floor((r * h) / rows), y1 = Math.max(y0 + 1, Math.floor(((r + 1) * h) / rows));
    for (let c = 0; c < cols; c++) {
      const x0 = Math.floor((c * w) / cols), x1 = Math.max(x0 + 1, Math.floor(((c + 1) * w) / cols));
      let s = 0, n = 0;
      for (let y = y0; y < y1 && y < h; y++) for (let x = x0; x < x1 && x < w; x++) { s += gray[y * w + x]; n++; }
      cells[r * cols + c] = n ? s / n : 0;
    }
  }
  let hex = '';
  for (let r = 0; r < rows; r++) {
    let byte = 0;
    for (let c = 0; c < 8; c++) byte = (byte << 1) | (cells[r * cols + c] > cells[r * cols + c + 1] ? 1 : 0);
    hex += byte.toString(16).padStart(2, '0');
  }
  return hex;
}

/** Differing bits between two 16-hex-char hashes (64 when unreadable). */
export function hamming(a: string, b: string): number {
  if (!a || !b || a.length !== 16 || b.length !== 16) return 64;
  let d = 0;
  for (let i = 0; i < 16; i += 2) {
    let x = parseInt(a.slice(i, i + 2), 16) ^ parseInt(b.slice(i, i + 2), 16);
    while (x) { d += x & 1; x >>= 1; }
  }
  return d;
}

type Pt = { x: number; y: number };
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

/** Eye aspect ratio from the 6 eye landmarks (p1..p6, corner to corner): low
 *  when the eye is shut. */
export function eyeAspectRatio(p: Pt[]): number {
  if (p.length < 6) return 1;
  const across = dist(p[0], p[3]);
  return across > 0 ? (dist(p[1], p[5]) + dist(p[2], p[4])) / (2 * across) : 1;
}

/** Below this, an eye counts as shut. Open eyes measure ~0.25–0.35. */
export const EYE_CLOSED_EAR = 0.19;
/** Faces smaller than this share of the photo's height are too small to judge. */
export const MIN_FACE_SHARE = 0.08;

/** Does a clearly visible face have BOTH eyes shut? `landmarks` are the 68
 *  face points (36–41 left eye, 42–47 right eye). */
export function eyesClosedIn(faces: { boxHeight: number; landmarks: Pt[] }[], imageHeight: number): boolean {
  return faces.some((f) => {
    if (f.landmarks.length < 48 || f.boxHeight < imageHeight * MIN_FACE_SHARE) return false;
    const left = eyeAspectRatio(f.landmarks.slice(36, 42));
    const right = eyeAspectRatio(f.landmarks.slice(42, 48));
    return left < EYE_CLOSED_EAR && right < EYE_CLOSED_EAR;
  });
}

/* ── Album-level rules ─────────────────────────────────────────────────── */

export interface CheckablePhoto {
  id: string;
  width: number;
  height: number;
  capturedAt?: number | null;
  check?: PhotoCheck;
  /** The customer said keep it: never suggested again. */
  kept?: boolean;
  /** Left out of the album (the customer accepted the suggestion). */
  leftOut?: boolean;
}

/** A photo is blurry when its sharpness is below BOTH the absolute floor and a
 *  share of the album's typical (median) sharpness: one soft shot among sharp
 *  ones stands out, and a whole album shot in dim light isn't all flagged. */
export const BLUR_ABS = 40;
export const BLUR_REL = 0.3;
/** Fingerprints this close are the same shot (out of 64 bits). */
export const REPEAT_BITS = 10;
/** …and must be taken within this long of each other when the times are known. */
export const REPEAT_WINDOW_MS = 120_000;
/** Without capture times, only very close fingerprints count. */
export const REPEAT_BITS_NO_TIME = 6;

/** Landscape, portrait or square (within 5 %); 'unknown' before measuring. */
export const photoOrientation = (p: { width: number; height: number }) =>
  p.width === 0 || p.height === 0 ? 'unknown' : p.width > p.height * 1.05 ? 'land' : p.height > p.width * 1.05 ? 'port' : 'sq';
const orientationOf = photoOrientation;

/** Are these two shots of the same moment (the repeat rule, pairwise)? */
export function areRepeats(a: CheckablePhoto, b: CheckablePhoto): boolean {
  if (!a.check?.hash || !b.check?.hash || orientationOf(a) !== orientationOf(b)) return false;
  const timed = typeof a.capturedAt === 'number' && typeof b.capturedAt === 'number';
  if (timed && Math.abs((a.capturedAt as number) - (b.capturedAt as number)) > REPEAT_WINDOW_MS) return false;
  return hamming(a.check.hash, b.check.hash) <= (timed ? REPEAT_BITS : REPEAT_BITS_NO_TIME);
}

export function medianSharpness(photos: CheckablePhoto[]): number {
  const s = photos.map((p) => p.check?.sharp).filter((x): x is number => typeof x === 'number').sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
}

export function isBlurry(p: CheckablePhoto, median: number): boolean {
  const s = p.check?.sharp;
  return typeof s === 'number' && s < BLUR_ABS && s < median * BLUR_REL;
}

/** How good a shot this is, 0–1: sharpness against the album, and no shut eyes. */
export function photoQuality(p: CheckablePhoto, median: number): number {
  if (!p.check) return 0.5; // not checked yet: neutral
  const rel = median > 0 ? Math.min(1, p.check.sharp / (median * 1.5)) : 0.5;
  return Math.max(0, Math.min(1, (isBlurry(p, median) ? 0 : 0.3 + 0.7 * rel) - (p.check.eyesClosed ? 0.5 : 0)));
}

/** Sets of repeats: shots whose fingerprints are within REPEAT_BITS (and taken
 *  within REPEAT_WINDOW_MS when both times are known; within
 *  REPEAT_BITS_NO_TIME when they're not), same orientation. Linked in chains
 *  (A≈B, B≈C → one set). Only sets of 2+. */
export function findRepeats(photos: CheckablePhoto[]): string[][] {
  const ps = photos.filter((p) => p.check?.hash);
  const parent = new Map(ps.map((p) => [p.id, p.id]));
  const root = (id: string): string => { let r = id; while (parent.get(r) !== r) r = parent.get(r)!; parent.set(id, r); return r; };
  for (let i = 0; i < ps.length; i++) {
    for (let j = i + 1; j < ps.length; j++) {
      if (areRepeats(ps[i], ps[j])) parent.set(root(ps[i].id), root(ps[j].id));
    }
  }
  const sets = new Map<string, string[]>();
  for (const p of ps) { const r = root(p.id); sets.set(r, [...(sets.get(r) ?? []), p.id]); }
  return [...sets.values()].filter((s) => s.length > 1);
}

export interface LeaveOutSuggestion {
  /** Soft / shaky shots. */
  blurry: string[];
  /** Repeats: every shot of a set except the best one. */
  repeats: string[];
  /** For each suggested repeat, the shot Megy keeps instead. */
  keeperOf: Record<string, string>;
}

/** What Megy suggests leaving out. Photos the customer kept, or already left
 *  out, are never suggested; a blurry shot inside a set of repeats is listed
 *  once, as blurry. */
export function suggestLeaveOut(photos: CheckablePhoto[]): LeaveOutSuggestion {
  const live = photos.filter((p) => !p.leftOut);
  const median = medianSharpness(live);
  const blurry = new Set(live.filter((p) => !p.kept && isBlurry(p, median)).map((p) => p.id));
  const byId = new Map(live.map((p) => [p.id, p]));
  const repeats: string[] = [];
  const keeperOf: Record<string, string> = {};
  for (const set of findRepeats(live)) {
    const members = set.map((id) => byId.get(id)!);
    // The keeper: the best shot of the set. Shots within 5 % of each other are
    // a tie (two frames of the same moment), and a tie keeps the earlier one:
    // the first taken, else the first uploaded. A photo the customer KEPT is
    // never suggested, but keeping one never pushes the others out — "keep
    // this" means "I want this one too", so it can't make the sharp original
    // the one to drop.
    const order = new Map(live.map((p, i) => [p.id, i]));
    const band = (p: CheckablePhoto) => Math.floor(photoQuality(p, median) * 20);
    const keeper = [...members].sort((a, b) => band(b) - band(a)
        || (a.capturedAt ?? Infinity) - (b.capturedAt ?? Infinity)
        || order.get(a.id)! - order.get(b.id)!)[0];
    for (const p of members) {
      if (p.id === keeper.id || p.kept || blurry.has(p.id)) continue;
      repeats.push(p.id);
      keeperOf[p.id] = keeper.id;
    }
  }
  return { blurry: [...blurry], repeats, keeperOf };
}

/* ── Scheduling: which photo to check next ─────────────────────────────── */

export type CheckStage = 'basic' | 'faces';

/** The next photo to check, in two passes:
 *    1. 'basic' (blur + fingerprint, ~20 ms) for every measured photo;
 *    2. 'faces' (closed eyes) — the members of a set of repeats first, because
 *       that picks which shot Megy keeps; then every other photo, for the
 *       full pages. Left-out photos are skipped; `tried` holds what already
 *       ran (or failed) this visit, so nothing loops. */
export function nextCheckJob(
  photos: CheckablePhoto[], tried: ReadonlySet<string>,
  /** False on a device without fast (WebGL) face detection: there each face
   *  pass blocks the screen for about a second, so only the repeats get one. */
  facesForAll = true,
): { id: string; stage: CheckStage } | null {
  const live = photos.filter((p) => !p.leftOut && p.width > 0 && p.height > 0);
  const basic = live.find((p) => !p.check && !tried.has(`basic:${p.id}`));
  if (basic) return { id: basic.id, stage: 'basic' };
  const needsFaces = (p: CheckablePhoto) => !!p.check && p.check.faces === null && !p.check.facesTried && !tried.has(`faces:${p.id}`);
  const inRepeats = new Set(findRepeats(live).flat());
  const first = live.find((p) => inRepeats.has(p.id) && needsFaces(p)) ?? (facesForAll ? live.find(needsFaces) : undefined);
  return first ? { id: first.id, stage: 'faces' } : null;
}

/** The check is ready to suggest: every measured photo has its basic check and
 *  every member of a set of repeats has had its face pass (so the keeper is
 *  the right one). The face pass on the other photos goes on quietly. */
export function checkIsReady(photos: CheckablePhoto[]): boolean {
  const live = photos.filter((p) => !p.leftOut && p.width > 0 && p.height > 0);
  if (live.some((p) => !p.check)) return false;
  const inRepeats = new Set(findRepeats(live).flat());
  return live.every((p) => !inRepeats.has(p.id) || p.check!.faces !== null || !!p.check!.facesTried);
}

/** How far the basic check is: photos checked / photos to check. */
export function checkProgress(photos: CheckablePhoto[]): { done: number; total: number } {
  const live = photos.filter((p) => !p.leftOut);
  return { done: live.filter((p) => p.check).length, total: live.length };
}
