import { describe, expect, it } from 'vitest';
import { fitPortrait, mainFace, TARGET_EYE_GAP, MAX_EYE_GAP, badgeHitsHead, sectionEyeGap } from './portraitFit';
import type { FaceGeom } from './types';

/** A face whose eyes sit at (cx ± gap/2, ey) in a W×H photo, all in pixels. */
function face(W: number, H: number, cx: number, ey: number, gap: number): FaceGeom {
  const boxH = gap / 0.4, boxW = boxH * 0.85;
  return {
    box: { x: (cx - boxW / 2) / W, y: (ey - boxH * 0.3) / H, w: boxW / W, h: boxH / H },
    leftEye: { x: (cx - gap / 2) / W, y: ey / H },
    rightEye: { x: (cx + gap / 2) / W, y: ey / H },
    source: 'sample',
  };
}

describe('fitPortrait', () => {
  it('puts every head at the same size and the eyes on the same line', () => {
    // Three photographers' crops of the "same" pose: small, medium, large heads, off centre.
    const cases: [number, number, FaceGeom][] = [
      [2000, 2500, face(2000, 2500, 900, 1000, 120)],
      [2000, 2500, face(2000, 2500, 1100, 1200, 200)],
      [1600, 2000, face(1600, 2000, 820, 760, 150)],
    ];
    for (const [W, H, f] of cases) {
      const fit = fitPortrait(W, H, f);
      expect(fit.tight).toBe(false);
      expect(fit.eyes!.x).toBeCloseTo(0.5, 2);
      expect(fit.eyes!.y).toBeCloseTo(0.36, 2);
      const gapInFrame = (Math.hypot((f.rightEye.x - f.leftEye.x) * W, (f.rightEye.y - f.leftEye.y) * H)) / fit.crop.h;
      expect(gapInFrame).toBeCloseTo(TARGET_EYE_GAP, 3);
      expect(fit.crop.w / fit.crop.h).toBeCloseTo(0.8, 5);
    }
  });

  it('flags a photo cropped too tight and keeps the crop inside the photo', () => {
    const f = face(800, 1000, 400, 420, 260); // huge head in a small frame
    const fit = fitPortrait(800, 1000, f);
    expect(fit.tight).toBe(true);
    expect(fit.crop.x).toBeGreaterThanOrEqual(0);
    expect(fit.crop.y).toBeGreaterThanOrEqual(0);
    expect(fit.crop.x + fit.crop.w).toBeLessThanOrEqual(800 + 1e-6);
    expect(fit.crop.y + fit.crop.h).toBeLessThanOrEqual(1000 + 1e-6);
  });

  it('flags a face jammed against the edge', () => {
    const fit = fitPortrait(2000, 2500, face(2000, 2500, 120, 1000, 150));
    expect(fit.tight).toBe(true);
  });

  it('falls back to a centred crop with no face', () => {
    const fit = fitPortrait(3000, 2000, null);
    expect(fit.head).toBeNull();
    expect(fit.crop.w / fit.crop.h).toBeCloseTo(0.8, 5);
    expect(fit.crop.x).toBeCloseTo((3000 - fit.crop.w) / 2, 5);
  });

  it('finds whether an upper-right badge hits the head', () => {
    const fit = fitPortrait(2000, 2500, face(2000, 2500, 1000, 1000, 160));
    expect(badgeHitsHead(fit, { x0: 0.6, y0: 0.02, x1: 0.98, y1: 0.32 })).toBe(true); // big badge on a small portrait
    expect(badgeHitsHead(fit, { x0: 0.82, y0: 0.02, x1: 0.98, y1: 0.15 })).toBe(false); // small badge on a big portrait
  });

  it('picks the biggest face as the student', () => {
    const small = face(2000, 2500, 300, 300, 40), big = face(2000, 2500, 1000, 1000, 160);
    expect(mainFace([small, big])).toBe(big);
    expect(mainFace([])).toBeNull();
  });
});

describe('sectionEyeGap', () => {
  const photo = (gap: number) => ({ width: 1200, height: 1500, faces: [face(1200, 1500, 600, 600, gap)] });
  it('keeps the standard head size when the photos allow it', () => {
    expect(sectionEyeGap([photo(120), photo(140), photo(150)])).toBeCloseTo(TARGET_EYE_GAP, 6);
  });
  it('matches a photographer who cropped tighter, so the heads still match', () => {
    const t = sectionEyeGap(Array.from({ length: 10 }, () => photo(225))); // eye gap 15% of the frame
    expect(t).toBeCloseTo(0.15, 3);
    const fit = fitPortrait(1200, 1500, photo(225).faces[0], 0.8, t);
    expect(fit.tight).toBe(false);
  });
  it('caps it: an extreme close-up is still flagged', () => {
    const list = [...Array.from({ length: 9 }, () => photo(150)), photo(330)];
    const t = sectionEyeGap(list);
    expect(t).toBeLessThanOrEqual(MAX_EYE_GAP);
    expect(fitPortrait(1200, 1500, photo(330).faces[0], 0.8, t).tight).toBe(true);
  });
});
