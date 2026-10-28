/* ══════════════════════════════════════════════════════════════════════════
   faceCentre — where a photo's faces are, as one point to centre the crop on.
   Pure maths on the face boxes a face finder returns, so the website
   (face-api.js, faceDetection.ts) and the 2.0 app (Android's ML Kit) turn
   their boxes into the same point the same way:
     • 1 face   → the middle of that face;
     • 2+ faces → the middle of the GROUP (the box around everyone), so
                  everyone stays in frame;
     • 0 faces  → null (the photo is centred as usual).
   The point is 0–1 of the picture's width and height (top-left = 0,0).
   Turning it into a slot pan is slotPhotoFit.faceCentrePan.
   ══════════════════════════════════════════════════════════════════════════ */

/** A face's box, in the picture's pixels. */
export interface FaceBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The middle of the face(s) in a `width` × `height` picture, 0–1, or null. */
export function faceGroupCentre(boxes: readonly FaceBox[], width: number, height: number): { x: number; y: number } | null {
  if (boxes.length === 0) return null;

  let centerX: number;
  let centerY: number;

  if (boxes.length === 1) {
    // Single face: center on it
    const f = boxes[0];
    centerX = (f.x + f.width / 2) / width;
    centerY = (f.y + f.height / 2) / height;
  } else {
    // Multiple faces: find bounding box of ALL faces, center on the middle
    const minX = Math.min(...boxes.map((d) => d.x));
    const minY = Math.min(...boxes.map((d) => d.y));
    const maxX = Math.max(...boxes.map((d) => d.x + d.width));
    const maxY = Math.max(...boxes.map((d) => d.y + d.height));

    centerX = ((minX + maxX) / 2) / width;
    centerY = ((minY + maxY) / 2) / height;
  }

  return {
    x: Math.max(0, Math.min(1, centerX)),
    y: Math.max(0, Math.min(1, centerY)),
  };
}
