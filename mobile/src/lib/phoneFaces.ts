/* ══════════════════════════════════════════════════════════════════════════
   FACES ON THE PHONE: Android's ML Kit face finder → what the website's
   photo-check rules read.

   The website finds faces with face-api.js: a box per face and 68 points,
   and the shared rule (src/lib/photoCheck.ts eyesClosedIn) measures each eye
   from 6 of those points (the "eye aspect ratio": about 0.3 open, under 0.19
   shut). The phone uses Google's ML Kit (it runs on the phone, model inside
   the app: the photos never leave the phone), which gives a box per face, a
   point for each eye, and its own score for each eye: the chance it is open
   (0–1).

   ML Kit looks at a copy up to FACE_COPY_SCALE (2) times the small copy's
   size (faceModel.ts): its guide asks for faces of 100 × 100 px, and on the
   800 px small copy most faces in group photos are smaller than that. Its
   boxes and eye points are brought back to the small copy's pixels
   (fromNative), so the shared rules read the same sizes as on the website.

   So each ML Kit face becomes a CheckFace for the SAME shared rules:
     • boxHeight: ML Kit's box height (in the small copy's pixels, as on the
       website), so "too small to judge" (MIN_FACE_SHARE) is the same rule;
     • the 68 points: points 36–41 and 42–47 are the two eyes, drawn around
       ML Kit's eye points with an eye aspect ratio made from its open
       chance: a chance of EYE_SHUT_BELOW gives exactly EYE_CLOSED_EAR (the
       website's line between open and shut), lower is shut, higher is open.
       The other points are not read by any rule (they sit at the face's
       middle). A face whose eyes ML Kit could not score (turned away, too
       small), or one under MIN_EYE_FACE_PX in the copy ML Kit looked at,
       gets no points, so the rule leaves its eyes out, as it leaves out a
       face it can't judge (the face still counts as a face).
   The decisions (both eyes shut, face big enough, how many faces) stay in
   the shared code; only the measurement comes from a different model, so
   the answers can differ from the website's where the two models see a face
   differently (tools/photo-check says how often).
   ══════════════════════════════════════════════════════════════════════════ */
import { EYE_CLOSED_EAR, type CheckFace } from '@web/lib/photoCheck';
import type { FaceBox } from '@web/pages/builder/faceCentre';
import type { NativeFace } from '../../modules/photo-pixels';

type Pt = { x: number; y: number };

/** One face as ML Kit reports it (the parts the photo check reads), in the
 *  small copy's pixels. */
export interface PhoneFace {
  box: FaceBox;
  /** ML Kit's eye points (the middle of each eye), when it found them.
   *  ML Kit's "left eye" is the one on the picture's left (tools/photo-check:
   *  291 of 292 faces). */
  leftEye: Pt | null;
  rightEye: Pt | null;
  /** ML Kit's chance each eye is open, 0–1; null when it could not tell. */
  leftEyeOpen: number | null;
  rightEyeOpen: number | null;
  /** The face's smaller side (box width or height) in the pixels of the copy
   *  ML Kit looked at, as it reported it: what MIN_EYE_FACE_PX is measured in. */
  mlKitSidePx: number;
}

/** ML Kit's open chance below which an eye counts as shut (both eyes must
 *  be, as on the website). ML Kit scores open eyes about 0.9 or more and
 *  eyes with the lids down (a blink, a squeezed laugh, looking down) under
 *  0.1; squints and big smiles land in between. CHOSEN ON THE TEST SET:
 *  tools/photo-check tried lines from 0.05 to 0.5 on the same pictures it
 *  reports on (the website's sample photos and copies, with only a few shut
 *  eyes), so its agreement there is not a test of the line; at 0.3 the
 *  phone called visibly open, smiling eyes shut (33 photos to the
 *  website's 2). docs/mobile-port-plan.md has the numbers. */
export const EYE_SHUT_BELOW = 0.1;
/** The smallest face (its smaller side, in the pixels of the copy ML Kit
 *  looked at: mlKitSidePx) whose eye scores are read: ML Kit's own guide
 *  asks for faces of at least 100 × 100 px. With ML Kit's copy twice the
 *  small copy, that is a face of 50 px in the small copy: 8.3 % of a
 *  landscape photo's height, about the website's MIN_FACE_SHARE (8 %).
 *  Smaller faces still count as faces, and still need MIN_FACE_SHARE to
 *  count at all, as on the website. */
export const MIN_EYE_FACE_PX = 100;

/** Are this face's eyes judged on the phone? ML Kit scored both, and the
 *  face is at least MIN_EYE_FACE_PX in both directions in ML Kit's copy. */
export function eyesJudged(f: PhoneFace): boolean {
  return f.leftEyeOpen != null && f.rightEyeOpen != null && f.mlKitSidePx >= MIN_EYE_FACE_PX;
}

/** This face's eyes are shut by the phone's rule (both under the line, on a
 *  face whose eyes are judged). What toCheckFace's points tell the shared
 *  rule, said directly, for the comparison tools (tools/photo-check). */
export function phoneEyesShut(f: PhoneFace): boolean {
  return eyesJudged(f) && f.leftEyeOpen! < EYE_SHUT_BELOW && f.rightEyeOpen! < EYE_SHUT_BELOW;
}
/** The eye aspect ratio given to a wide-open eye (chance 1): a typical open eye. */
const OPEN_EAR = 0.3;

/** ML Kit's open chance → an eye aspect ratio on the website's scale:
 *  EYE_SHUT_BELOW ↔ EYE_CLOSED_EAR exactly, 0 → a quarter of it, 1 → OPEN_EAR. */
export function earFromOpenChance(open: number): number {
  const p = Math.max(0, Math.min(1, open));
  if (p < EYE_SHUT_BELOW) return EYE_CLOSED_EAR * (0.25 + (0.75 * p) / EYE_SHUT_BELOW);
  return EYE_CLOSED_EAR + ((OPEN_EAR - EYE_CLOSED_EAR) * (p - EYE_SHUT_BELOW)) / (1 - EYE_SHUT_BELOW);
}

/** Six eye points (corner, two upper lid, corner, two lower lid: the order
 *  the shared eyeAspectRatio reads) around `c`, `width` wide, with this
 *  aspect ratio. */
export function eyePoints(c: Pt, width: number, ear: number): Pt[] {
  const half = width / 2, third = width / 6, lid = (ear * width) / 2;
  return [
    { x: c.x - half, y: c.y },
    { x: c.x - third, y: c.y - lid },
    { x: c.x + third, y: c.y - lid },
    { x: c.x + half, y: c.y },
    { x: c.x + third, y: c.y + lid },
    { x: c.x - third, y: c.y + lid },
  ];
}

/** An ML Kit face → the face the shared photo-check rules read. */
export function toCheckFace(f: PhoneFace): CheckFace {
  const { box } = f;
  if (!eyesJudged(f) || f.leftEyeOpen == null || f.rightEyeOpen == null) {
    return { boxHeight: Math.max(0, box.height), landmarks: [] };
  }
  const eyeWidth = box.width * 0.2;
  // ML Kit's "left eye" is the one on the picture's left (see PhoneFace).
  const pictureLeft = f.leftEye ?? { x: box.x + box.width * 0.3, y: box.y + box.height * 0.4 };
  const pictureRight = f.rightEye ?? { x: box.x + box.width * 0.7, y: box.y + box.height * 0.4 };
  const middle = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const landmarks: Pt[] = Array.from({ length: 68 }, () => ({ ...middle }));
  // 36–41 is the eye on the picture's left, 42–47 the one on its right, as
  // in the 68-point layout; the rule needs both shut, so the order only
  // keeps it tidy.
  eyePoints(pictureLeft, eyeWidth, earFromOpenChance(f.leftEyeOpen)).forEach((p, i) => { landmarks[36 + i] = p; });
  eyePoints(pictureRight, eyeWidth, earFromOpenChance(f.rightEyeOpen)).forEach((p, i) => { landmarks[42 + i] = p; });
  return { boxHeight: box.height, landmarks };
}

/* ── What the app's native module reports (modules/photo-pixels) ────────── */

const probability = (v: number | null | undefined) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1 ? v : null);
const point = (p: { x: number; y: number } | null | undefined) => (p && Number.isFinite(p.x) && Number.isFinite(p.y) ? { x: p.x, y: p.y } : null);

/** The module's face, found on a copy `sx` × `sy` times the small copy (1
 *  when ML Kit looked at the small copy itself) → a PhoneFace in the small
 *  copy's pixels. */
export function fromNative(f: NativeFace, sx = 1, sy = sx): PhoneFace {
  const back = (p: Pt | null) => (p ? { x: p.x / sx, y: p.y / sy } : null);
  return {
    box: { x: f.x / sx, y: f.y / sy, width: f.width / sx, height: f.height / sy },
    leftEye: back(point(f.leftEye)),
    rightEye: back(point(f.rightEye)),
    leftEyeOpen: probability(f.leftEyeOpen),
    rightEyeOpen: probability(f.rightEyeOpen),
    mlKitSidePx: Math.max(0, Math.min(f.width, f.height)),
  };
}
