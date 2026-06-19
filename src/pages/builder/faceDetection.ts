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

/** Calculate the slot offset needed to center a face in a slot.

    @param faceCenter   — {x, y} from detectFaceCenter (0-1, relative to photo)
    @param photoAspect  — photo width / height
    @param slotAspect   — slot width / height
    @returns            — { offsetX, offsetY } in slot-relative units (-1 to +1)
                          where 0 = center, -1 = far left/top, +1 = far right/bottom

    EDGE CASE HANDLING:
    If the face is at the extreme edge of the photo (e.g. x=0.05 or x=0.95),
    centering it would reveal empty space on the other side. We clamp the face
    center to the "safe zone" — the portion of the photo that can be centered
    without showing the photo's edge.
*/
export function computeFaceOffset(
  faceCenter: { x: number; y: number },
  photoAspect: number,
  slotAspect: number,
): { offsetX: number; offsetY: number } {
  // "Cover" mode: photo fills slot, one axis gets cropped.
  // Calculate how much of each axis is VISIBLE (0-1 range).
  let visibleWidth: number;
  let visibleHeight: number;

  if (photoAspect > slotAspect) {
    // Photo is wider → width gets cropped
    visibleHeight = 1;
    visibleWidth = slotAspect / photoAspect;
  } else {
    // Photo is taller → height gets cropped
    visibleWidth = 1;
    visibleHeight = photoAspect / slotAspect;
  }

  // The "safe zone" is the region that can be centered without revealing edges.
  // It's half the visible width/height from the center of the photo.
  // e.g. if 60% of width is visible, safe zone is 20%-80% of the photo.
  const safeMinX = 0.5 - visibleWidth / 2;
  const safeMaxX = 0.5 + visibleWidth / 2;
  const safeMinY = 0.5 - visibleHeight / 2;
  const safeMaxY = 0.5 + visibleHeight / 2;

  // Clamp face center to safe zone — prevents showing empty photo edges
  const clampedX = Math.max(safeMinX, Math.min(safeMaxX, faceCenter.x));
  const clampedY = Math.max(safeMinY, Math.min(safeMaxY, faceCenter.y));

  // Convert to offset: how far from photo center (0-1) → slot offset (-1 to +1)
  // A face at photo center (0.5) → offset 0 (no pan needed)
  // A face at left edge of safe zone → offset -1 (pan right to show it)
  const offsetX = (clampedX - 0.5) / (visibleWidth / 2);
  const offsetY = (clampedY - 0.5) / (visibleHeight / 2);

  return { offsetX, offsetY };
}

/** Synchronous version: just returns center-crop offset (0, 0).
    Used as fallback when face detection hasn't completed yet. */
export function getDefaultOffset(): { offsetX: number; offsetY: number } {
  return { offsetX: 0, offsetY: 0 };
}
