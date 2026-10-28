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

/** One face as ML Kit reports it (the parts the photo check reads). */
export interface PhoneFace {
  box: FaceBox;
  /** ML Kit's eye points (the middle of each eye), when it found them. */
  leftEye: Pt | null;
  rightEye: Pt | null;
  /** ML Kit's chance each eye is open, 0–1; null when it could not tell. */
  leftEyeOpen: number | null;
  rightEyeOpen: number | null;
}

/** ML Kit's open chance below which an eye counts as shut (both eyes must
 *  be, as on the website). ML Kit scores open eyes about 0.9 or more and
 *  eyes with the lids down (a blink, a squeezed laugh, looking down) under
 *  0.1; squints and big smiles land in between. tools/photo-check tried
 *  lines from 0.05 to 0.5 on the website's sample photos: at 0.3 the phone
 *  called visibly open, smiling eyes shut (33 photos to the website's 2);
 *  at 0.1 it calls shut only faces whose lids are down (20 photos), still
 *  more than the website, whose finder reads most laughing and downcast
 *  eyes as open. */
export const EYE_SHUT_BELOW = 0.1;
/** The smallest face (box width and height, in the pixels of the copy ML Kit
 *  looked at: 800 px on the long side) whose eye scores are read. ML Kit's
 *  own guide asks for faces of at least 100 × 100 px; on smaller faces its
 *  eye scores call laughing and downcast eyes shut far more often (on the
 *  website's sample photos, most of the phone's extra "shut" verdicts were
 *  faces under this size, several the website's finder did not see at all).
 *  Smaller faces still count as faces, and still need MIN_FACE_SHARE to
 *  count at all, as on the website. */
export const MIN_EYE_FACE_PX = 100;

/** Are this face's eyes judged on the phone? ML Kit scored both, and the
 *  face is at least MIN_EYE_FACE_PX in both directions. */
export function eyesJudged(f: PhoneFace): boolean {
  return f.leftEyeOpen != null && f.rightEyeOpen != null && f.box.width >= MIN_EYE_FACE_PX && f.box.height >= MIN_EYE_FACE_PX;
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
  // ML Kit's "left eye" is the person's left (on the right of the picture).
  const personLeft = f.leftEye ?? { x: box.x + box.width * 0.7, y: box.y + box.height * 0.4 };
  const personRight = f.rightEye ?? { x: box.x + box.width * 0.3, y: box.y + box.height * 0.4 };
  const middle = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const landmarks: Pt[] = Array.from({ length: 68 }, () => ({ ...middle }));
  // 36–41 is the eye on the picture's left (the person's right), as in the
  // 68-point layout; the rule needs both shut, so the order only keeps it tidy.
  eyePoints(personRight, eyeWidth, earFromOpenChance(f.rightEyeOpen)).forEach((p, i) => { landmarks[36 + i] = p; });
  eyePoints(personLeft, eyeWidth, earFromOpenChance(f.leftEyeOpen)).forEach((p, i) => { landmarks[42 + i] = p; });
  return { boxHeight: box.height, landmarks };
}

/* ── What the app's native module reports (modules/photo-pixels) ────────── */

const probability = (v: number | null | undefined) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1 ? v : null);
const point = (p: { x: number; y: number } | null | undefined) => (p && Number.isFinite(p.x) && Number.isFinite(p.y) ? { x: p.x, y: p.y } : null);

/** The module's face → a PhoneFace. */
export function fromNative(f: NativeFace): PhoneFace {
  return {
    box: { x: f.x, y: f.y, width: f.width, height: f.height },
    leftEye: point(f.leftEye),
    rightEye: point(f.rightEye),
    leftEyeOpen: probability(f.leftEyeOpen),
    rightEyeOpen: probability(f.rightEyeOpen),
  };
}
