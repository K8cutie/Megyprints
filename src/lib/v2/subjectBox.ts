/* ── v2 · Where is the subject, and how good is the photo? ─────────────────
   The one part of fit-to-layout an algorithm cannot do. Everything downstream
   (fit score, assignment, deferral, hero pick) is arithmetic on what this
   returns for each photo.

   WHY A BOX, NOT THE OLD CENTRE POINT: `faceDetection.ts` computed the union
   of every face and returned only its midpoint, so a group spanning the frame
   was "centred" and cropped through the people at both ends. Centring
   guarantees nothing about inclusion; a box does.

   WHY PEOPLE FIRST, FACES SECOND: a face at the edge of a class photo is
   thirty pixels wide and easy to miss, and a missed face SHRINKS the box —
   which makes a crop look safe when it isn't (worse than today). The person
   that face belongs to is a tall, easy detection regardless of face size, and
   it runs head-to-feet, so feet count too (the original complaint: crops cut
   "the head or the feet"). Faces then widen the box for hair and hats.

   TWO-PASS GUARD: when the first face pass finds three or more, run again at
   the larger input size — only group photos pay for the second pass.

   QUALITY, SAME PASS: sharpness (Laplacian variance) and exposure clipping
   are read off the same downscaled canvas, so curation Layer 0 (which photo
   gets the spread) costs no extra image decode.

   All on-device, ₱0 per album. Runs at UPLOAD time in the background, two
   photos at a time (the transcode pattern), on a ≤512-px downscale, cached by
   photo id — so generation never waits on a model beyond a short budget.
   Every failure degrades to "no subject", which the engine treats as the old
   behaviour for that photo. TensorFlow is imported lazily, exactly as the
   theme detector already does, so it stays out of the main bundle. */

import * as faceapi from 'face-api.js';
import type { ObjectDetection } from '@tensorflow-models/coco-ssd';
import { initFaceApi } from '../../pages/builder/faceDetection';
import { fitsSlot, unlockRate, UNKNOWN_SUBJECT, type Rect } from './fit';

export type SubjectSource = 'person' | 'faces' | 'none';

export interface Quality {
  /** Variance of the Laplacian on a 128-px grey thumbnail. Higher = sharper. */
  sharpness: number;
  /** Fraction of pixels crushed to black or blown to white. */
  clipping: number;
}

export interface Subject {
  /** Normalised 0..1 box, or null when nothing was found. */
  box: Rect | null;
  source: SubjectSource;
  faces: number;
  persons: number;
  quality: Quality;
}

/** Long edge the photo is downscaled to before detection. */
const ANALYSIS_EDGE = 512;
/** TinyFaceDetector input sizes (multiples of 32). */
const FACE_INPUT = 320;
const FACE_INPUT_WIDE = 512;
const FACE_SCORE = 0.3;
/** Second face pass triggers at this many faces from the first. */
const WIDE_PASS_AT = 3;
const PERSON_SCORE = 0.4;
/** Headroom around a face box as fractions of that face's size: hair above,
 *  shoulders below, ears to the sides. Used when no person box exists. */
const FACE_PAD = { top: 0.6, bottom: 1.2, side: 0.4 };
/** Photos analysed concurrently in the background. Two keeps a mid-range
 *  phone responsive while the customer keeps building. */
const CONCURRENCY = 2;

const NO_QUALITY: Quality = { sharpness: 0, clipping: 0 };
const NONE: Subject = { box: null, source: 'none', faces: 0, persons: 0, quality: NO_QUALITY };

const cache = new Map<string, Subject>();
const inflight = new Map<string, Promise<Subject>>();

/* ── Reads ───────────────────────────────────────────────────────────────── */

/** Synchronous read for generation — only what has already been computed. */
export function getSubject(photoId: string): Subject | undefined {
  return cache.get(photoId);
}

/** index → subject box for photos whose subject is KNOWN (non-null). The
 *  engine keys photos by index, so this is the shape generateAlbum takes. */
export function subjectBoxesByIndex(photos: readonly { id: string }[]): Record<number, Rect> {
  const out: Record<number, Rect> = {};
  photos.forEach((p, i) => {
    const s = cache.get(p.id);
    if (s?.box) out[i] = s.box;
  });
  return out;
}

/** Curation Layer 0 — a 0..1 "deserves the spread" score per photo, relative
 *  to this album: sharpness normalised by the album's sharpest, a bonus for
 *  people (an album is about its people), a penalty for clipped exposure. */
export function heroScoresByIndex(photos: readonly { id: string }[]): Record<number, number> {
  let maxSharp = 0;
  for (const p of photos) {
    const s = cache.get(p.id);
    if (s && s.quality.sharpness > maxSharp) maxSharp = s.quality.sharpness;
  }
  const out: Record<number, number> = {};
  photos.forEach((p, i) => {
    const s = cache.get(p.id);
    if (!s) return;
    const sharp = maxSharp > 0 ? s.quality.sharpness / maxSharp : 0;
    const people = Math.min(1, s.faces / 2) * 0.3 + (s.persons > 0 ? 0.1 : 0);
    out[i] = Math.max(0, Math.min(1, sharp * 0.6 + people - s.quality.clipping * 0.5));
  });
  return out;
}

export function subjectStats(photos: readonly { id: string }[]): { known: number; none: number; pending: number } {
  let known = 0;
  let none = 0;
  let pending = 0;
  for (const p of photos) {
    const s = cache.get(p.id);
    if (!s) pending++;
    else if (s.box) known++;
    else none++;
  }
  return { known, none, pending };
}

export function forgetSubject(photoId: string): void { cache.delete(photoId); }
export function clearSubjects(): void { cache.clear(); inflight.clear(); queue.length = 0; }

/* ── Detection ───────────────────────────────────────────────────────────── */

function loadScaled(url: string): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const scale = Math.min(1, ANALYSIS_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      const ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) { reject(new Error('no 2d context')); return; }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas);
    };
    img.onerror = () => reject(new Error('image failed to load'));
    img.src = url;
  });
}

let cocoPromise: Promise<ObjectDetection | null> | null = null;
/** Lazy, once. TensorFlow and the model load on first use (dynamic import,
 *  like themeDetector). A failed load — offline, blocked — yields null and the
 *  pipeline continues on faces alone. */
function cocoModel(): Promise<ObjectDetection | null> {
  if (!cocoPromise) {
    cocoPromise = (async () => {
      try {
        await import('@tensorflow/tfjs');
        const cocoSsd = await import('@tensorflow-models/coco-ssd');
        return await cocoSsd.load({ base: 'lite_mobilenet_v2' });
      } catch (e) {
        console.warn('[v2/subject] person detector unavailable:', e instanceof Error ? e.message : e);
        return null;
      }
    })();
  }
  return cocoPromise;
}

async function faceBoxes(canvas: HTMLCanvasElement, inputSize: number): Promise<Rect[]> {
  const W = canvas.width;
  const H = canvas.height;
  const dets = await faceapi.detectAllFaces(
    canvas,
    new faceapi.TinyFaceDetectorOptions({ inputSize, scoreThreshold: FACE_SCORE }),
  );
  return (dets ?? []).map((d) => ({ x: d.box.x / W, y: d.box.y / H, w: d.box.width / W, h: d.box.height / H }));
}

async function personBoxes(canvas: HTMLCanvasElement): Promise<Rect[]> {
  const model = await cocoModel();
  if (!model) return [];
  const W = canvas.width;
  const H = canvas.height;
  const preds = await model.detect(canvas);
  return preds
    .filter((p) => p.class === 'person' && p.score >= PERSON_SCORE)
    .map((p) => ({ x: p.bbox[0] / W, y: p.bbox[1] / H, w: p.bbox[2] / W, h: p.bbox[3] / H }));
}

/** Sharpness and clipping from a 128-px grey thumbnail of the analysis canvas. */
function measureQuality(canvas: HTMLCanvasElement): Quality {
  try {
    const side = 128;
    const scale = Math.min(1, side / Math.max(canvas.width, canvas.height));
    const w = Math.max(3, Math.round(canvas.width * scale));
    const h = Math.max(3, Math.round(canvas.height * scale));
    const small = document.createElement('canvas');
    small.width = w;
    small.height = h;
    const ctx = small.getContext('2d', { alpha: false });
    if (!ctx) return NO_QUALITY;
    ctx.drawImage(canvas, 0, 0, w, h);
    const { data } = ctx.getImageData(0, 0, w, h);
    const grey = new Float32Array(w * h);
    let clipped = 0;
    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      const g = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      grey[p] = g;
      if (g < 8 || g > 247) clipped++;
    }
    // Laplacian variance: mean of squares minus square of mean over the interior.
    let sum = 0;
    let sumSq = 0;
    let n = 0;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const c = y * w + x;
        const lap = 4 * grey[c] - grey[c - 1] - grey[c + 1] - grey[c - w] - grey[c + w];
        sum += lap;
        sumSq += lap * lap;
        n++;
      }
    }
    const mean = n ? sum / n : 0;
    const variance = n ? sumSq / n - mean * mean : 0;
    return { sharpness: Math.max(0, variance), clipping: grey.length ? clipped / grey.length : 0 };
  } catch {
    return NO_QUALITY;
  }
}

function union(rects: Rect[]): Rect {
  const x0 = Math.min(...rects.map((r) => r.x));
  const y0 = Math.min(...rects.map((r) => r.y));
  const x1 = Math.max(...rects.map((r) => r.x + r.w));
  const y1 = Math.max(...rects.map((r) => r.y + r.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

function padFace(f: Rect): Rect {
  return {
    x: f.x - f.w * FACE_PAD.side,
    y: f.y - f.h * FACE_PAD.top,
    w: f.w * (1 + 2 * FACE_PAD.side),
    h: f.h * (1 + FACE_PAD.top + FACE_PAD.bottom),
  };
}

function clampRect(r: Rect): Rect {
  const x = Math.max(0, r.x);
  const y = Math.max(0, r.y);
  const x1 = Math.min(1, r.x + r.w);
  const y1 = Math.min(1, r.y + r.h);
  return { x, y, w: Math.max(0, x1 - x), h: Math.max(0, y1 - y) };
}

/** Detect the subject and measure quality for one photo. */
export async function detectSubject(url: string): Promise<Subject> {
  const canvas = await loadScaled(url);
  const quality = measureQuality(canvas);
  await initFaceApi();

  let faces = await faceBoxes(canvas, FACE_INPUT);
  if (faces.length >= WIDE_PASS_AT) {
    // A group: the edge faces are small. Look again at higher resolution and
    // keep whichever pass saw more — a missed edge face is the dangerous miss.
    const wide = await faceBoxes(canvas, FACE_INPUT_WIDE);
    if (wide.length > faces.length) faces = wide;
  }
  const persons = await personBoxes(canvas);

  if (persons.length) {
    // Head-to-feet from the person boxes, widened by any faces the person
    // model clipped (hair, hats) so the head is never the thing that's cut.
    const box = clampRect(union(faces.length ? [...persons, ...faces.map(padFace)] : persons));
    return { box, source: 'person', faces: faces.length, persons: persons.length, quality };
  }
  if (faces.length) {
    return { box: clampRect(union(faces.map(padFace))), source: 'faces', faces: faces.length, persons: 0, quality };
  }
  return { ...NONE, quality };
}

/** Compute (once) and cache the subject for a photo. Never throws. */
export function ensureSubject(photoId: string, url: string): Promise<Subject> {
  const hit = cache.get(photoId);
  if (hit) return Promise.resolve(hit);
  const running = inflight.get(photoId);
  if (running) return running;
  const job = detectSubject(url)
    .catch((e) => {
      console.warn('[v2/subject] detection failed for', photoId, e instanceof Error ? e.message : e);
      return { ...NONE };
    })
    .then((s) => { cache.set(photoId, s); return s; })
    .finally(() => inflight.delete(photoId));
  inflight.set(photoId, job);
  return job;
}

/* ── Background queue (upload time) ──────────────────────────────────────── */

const queue: { id: string; url: string }[] = [];
let workers = 0;

function drain(): void {
  while (workers < CONCURRENCY && queue.length) {
    const next = queue.shift()!;
    workers++;
    void ensureSubject(next.id, next.url).finally(() => { workers--; drain(); });
  }
}

/** Queue a freshly uploaded photo. Detection runs in the background, two at a
 *  time, while the customer keeps working. */
export function queueSubject(photoId: string, url: string): void {
  if (typeof document === 'undefined') return;
  if (cache.has(photoId) || inflight.has(photoId) || queue.some((q) => q.id === photoId)) return;
  queue.push({ id: photoId, url });
  drain();
}

/** Before generation: make sure every photo is at least queued, then wait for
 *  detection to finish — up to a budget. Whatever is still unknown after the
 *  budget simply follows the old rules for this generation; the results land
 *  in the cache for the next one. */
export async function whenSubjectsReady(
  photos: readonly { id: string; url: string }[],
  budgetMs = 10_000,
): Promise<{ known: number; none: number; pending: number }> {
  for (const p of photos) queueSubject(p.id, p.url);
  const deadline = Date.now() + budgetMs;
  const pendingOf = () => photos.filter((p) => !cache.has(p.id));
  while (pendingOf().length && Date.now() < deadline) {
    const running = [...inflight.values()];
    if (running.length) {
      await Promise.race([Promise.allSettled(running), new Promise((r) => setTimeout(r, 250))]);
    } else {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  return subjectStats(photos);
}

/* ── Measurement hooks (preview / console) ───────────────────────────────── */

/** Exposes `window.__megyV2` so the unlock rate can be read off a real pool in
 *  the preview without shipping any UI: `__megyV2.unlockRate(1.5)`. */
export function installV2Debug(getPhotos: () => readonly { id: string; url: string; width: number; height: number }[]): void {
  if (typeof window === 'undefined') return;
  (window as unknown as { __megyV2?: unknown }).__megyV2 = {
    stats: () => subjectStats(getPhotos()),
    subjects: () => getPhotos().map((p) => ({ id: p.id, ...(cache.get(p.id) ?? { box: null, source: 'pending' }) })),
    heroScores: () => heroScoresByIndex(getPhotos()),
    /** Fraction of the CURRENT pool that can safely enter a slot of this aspect. */
    unlockRate: (slotAspect: number, threshold?: number) =>
      unlockRate(
        getPhotos().filter((p) => p.width > 0 && p.height > 0).map((p) => ({ subject: cache.get(p.id)?.box ?? null, aspect: p.width / p.height })),
        slotAspect,
        threshold,
      ),
    /** Same, restricted to the SQUARE photos — the case the branch exists for. */
    squareUnlock: (slotAspect = 1.5, threshold?: number) => {
      const sq = getPhotos().filter((p) => p.width > 0 && p.height > 0 && Math.abs(p.width / p.height - 1) < 0.05);
      let unlocked = 0;
      for (const p of sq) if (fitsSlot(cache.get(p.id)?.box ?? UNKNOWN_SUBJECT, p.width / p.height, slotAspect, threshold)) unlocked++;
      return { unlocked, total: sq.length, rate: sq.length ? unlocked / sq.length : 0 };
    },
    ensureAll: () => whenSubjectsReady(getPhotos(), 120_000),
  };
}
