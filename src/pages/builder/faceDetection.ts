/* >>> LAST MODIFIED: 2026-06-05 04:20 SGT — Session 7: Face detection module <<< */
/* ══════════════════════════════════════════════════════════════════════════
   Face Detection — Centers photos on faces using face-api.js

   Setup:
     npm install face-api.js

   Usage:
     import { detectFaceCenter, initFaceApi } from './faceDetection';
     await initFaceApi();                          // loads models from CDN
     const center = await detectFaceCenter(url);   // returns {x, y} 0-1 normalized
     // center is null if no face detected

   Models load automatically from CDN at runtime.
   No manual download needed.
   ══════════════════════════════════════════════════════════════════════════ */

import * as faceapi from 'face-api.js';

let modelsLoaded = false;
let loadPromise: Promise<void> | null = null;

// CDN for face-api.js pre-trained model weights (~190KB)
// Loaded at runtime — no manual download needed.
const DEFAULT_MODEL_URL =
  'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@0.22.2/weights';

/** Initialize face-api.js models — call once on app start. Safe to call multiple times.
    @param modelUrl — optional custom URL. Defaults to CDN (no download needed). */
export async function initFaceApi(modelUrl = DEFAULT_MODEL_URL): Promise<void> {
  if (modelsLoaded) return;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    try {
      await faceapi.nets.tinyFaceDetector.loadFromUri(modelUrl);
      modelsLoaded = true;
      console.log('[FaceDetection] Models loaded');
    } catch (err) {
      console.warn('[FaceDetection] Failed to load models:', err);
      // Don't throw — feature gracefully degrades to center-crop
    }
  })();

  return loadPromise;
}

/** The tiny 68-point landmark model (~80 KB, same CDN), for the photo check's
 *  closed-eyes test. Loaded on first use, after the face detector. Resolves
 *  false when either model can't load (the check then skips eyes). */
let landmarksLoaded = false;
let landmarksPromise: Promise<boolean> | null = null;
export async function initFaceLandmarks(modelUrl = DEFAULT_MODEL_URL): Promise<boolean> {
  if (landmarksLoaded) return true;
  if (landmarksPromise) return landmarksPromise;
  landmarksPromise = (async () => {
    await initFaceApi(modelUrl);
    if (!modelsLoaded) return false;
    try {
      await faceapi.nets.faceLandmark68TinyNet.loadFromUri(modelUrl);
      landmarksLoaded = true;
    } catch (err) {
      console.warn('[FaceDetection] Failed to load landmark model:', err);
    }
    return landmarksLoaded;
  })();
  return landmarksPromise;
}

/** Face detection runs on the GPU (WebGL) — fast. On the CPU fallback a
 *  detection takes about a second and blocks the screen. */
export function faceBackendIsFast(): boolean {
  try { return faceapi.tf.getBackend() === 'webgl'; } catch { return false; }
}

/** Faces with their 68 landmarks, for the photo check. Empty when the models
 *  aren't loaded or detection fails. */
export async function detectFacesWithLandmarks(
  input: HTMLCanvasElement,
): Promise<{ boxHeight: number; landmarks: { x: number; y: number }[] }[]> {
  if (!landmarksLoaded) return [];
  try {
    const found = await faceapi
      .detectAllFaces(input, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.5 }))
      .withFaceLandmarks(true);
    return found.map((f) => ({ boxHeight: f.detection.box.height, landmarks: f.landmarks.positions.map((pt) => ({ x: pt.x, y: pt.y })) }));
  } catch (err) {
    console.warn('[FaceDetection] Landmark detection failed:', err);
    return [];
  }
}

/** Every face with its box and eye centres, as fractions (0–1) of the input
 *  size — for yearbook portraits (same head size, same eye line) and class
 *  photos (keep the QR off every face). Empty when the models aren't loaded.
 *  `inputSize` trades speed for small faces: 416 for a portrait, 608 for a
 *  class photo. */
export async function detectFaceGeometry(
  input: HTMLCanvasElement,
  inputSize = 416,
): Promise<{ box: { x: number; y: number; w: number; h: number }; leftEye: { x: number; y: number }; rightEye: { x: number; y: number } }[]> {
  if (!landmarksLoaded) return [];
  const W = input.width, H = input.height;
  const mean = (pts: { x: number; y: number }[]) => ({
    x: pts.reduce((s, p) => s + p.x, 0) / pts.length / W,
    y: pts.reduce((s, p) => s + p.y, 0) / pts.length / H,
  });
  try {
    const found = await faceapi
      .detectAllFaces(input, new faceapi.TinyFaceDetectorOptions({ inputSize, scoreThreshold: 0.45 }))
      .withFaceLandmarks(true);
    return found.map((f) => {
      const b = f.detection.box;
      const pts = f.landmarks.positions;
      // 68-point layout: 36–41 = one eye, 42–47 = the other (image left → right).
      const a = mean(pts.slice(36, 42)), c = mean(pts.slice(42, 48));
      const [leftEye, rightEye] = a.x <= c.x ? [a, c] : [c, a];
      return { box: { x: b.x / W, y: b.y / H, w: b.width / W, h: b.height / H }, leftEye, rightEye };
    });
  } catch (err) {
    console.warn('[FaceDetection] Face geometry failed:', err);
    return [];
  }
}

/** Detect face center(s) in an image.
    - 1 face  → centers on that face
    - 2+ faces→ centers on the middle of the GROUP so everyone stays in frame
    - 0 faces → returns null (falls back to center-crop)
    Returns {x, y} normalized 0-1 (top-left = 0,0, bottom-right = 1,1). */
export async function detectFaceCenter(imageUrl: string): Promise<{ x: number; y: number } | null> {
  if (!modelsLoaded) return null;

  try {
    const img = await loadImage(imageUrl);
    const detections = await faceapi.detectAllFaces(
      img,
      new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.3 }),
    );

    if (!detections || detections.length === 0) {
      return null; // No face — will fall back to center-crop
    }

    let centerX: number;
    let centerY: number;

    if (detections.length === 1) {
      // Single face: center on it
      const f = detections[0];
      centerX = (f.box.x + f.box.width / 2) / img.width;
      centerY = (f.box.y + f.box.height / 2) / img.height;
    } else {
      // Multiple faces: find bounding box of ALL faces, center on the middle
      const minX = Math.min(...detections.map((d) => d.box.x));
      const minY = Math.min(...detections.map((d) => d.box.y));
      const maxX = Math.max(...detections.map((d) => d.box.x + d.box.width));
      const maxY = Math.max(...detections.map((d) => d.box.y + d.box.height));

      centerX = ((minX + maxX) / 2) / img.width;
      centerY = ((minY + maxY) / 2) / img.height;
    }

    return {
      x: Math.max(0, Math.min(1, centerX)),
      y: Math.max(0, Math.min(1, centerY)),
    };
  } catch (err) {
    console.warn('[FaceDetection] Detection failed:', err);
    return null;
  }
}

/** Pre-detect faces for a batch of photos. Returns a map of photoId → face center.
    Good for calling during album generation before placing photos. */
export async function detectFaceCentersBatch(
  photos: { id: string; url: string }[],
  onProgress?: (done: number, total: number) => void,
): Promise<Record<string, { x: number; y: number }>> {
  const result: Record<string, { x: number; y: number }> = {};

  for (let i = 0; i < photos.length; i++) {
    const { id, url } = photos[i];
    const center = await detectFaceCenter(url);
    if (center) {
      result[id] = center;
    }
    onProgress?.(i + 1, photos.length);
  }

  return result;
}

/* ── Helpers ─────────────────────────────────────────────────────────── */

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/* Turning a face centre into a slot pan (computeFaceOffset → faceCentrePan)
   lives in slotPhotoFit.ts, next to the fit every renderer draws with — pure
   maths, so it is tested without loading face-api. */

/** Synchronous version: just returns center-crop offset (0, 0).
    Used as fallback when face detection hasn't completed yet. */
export function getDefaultOffset(): { offsetX: number; offsetY: number } {
  return { offsetX: 0, offsetY: 0 };
}
