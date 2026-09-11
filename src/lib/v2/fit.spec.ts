import { describe, it, expect } from 'vitest';
import {
  coverWindow, bestWindow, overlapArea, fitSubject, fitAtRatio, fitsSlot, designPxOffset, unlockRate,
  FIT_THRESHOLD, SEVERITY_WEIGHT, UNKNOWN_SUBJECT, type Rect,
} from './fit';
import { bestAssignment } from './assign';

/* ══════════════════════════════════════════════════════════════════════════
   v2 · FIT-TO-LAYOUT — the pure half.
   The owner's rule: the image adapts to the layout. These lock the geometry
   that decides when a crop is safe, the one failure that motivated the branch
   (a group spanning the frame cropped through its edges), and the pixel
   conversion the renderers read.
   ══════════════════════════════════════════════════════════════════════════ */

const R = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h });
const SQUARE = 1;
const LANDSCAPE_32 = 3 / 2;
const PORTRAIT_34 = 3 / 4;

describe('coverWindow — what object-fit: cover leaves visible', () => {
  it('a square photo in a 3:2 slot keeps full width and loses a third of its height', () => {
    expect(coverWindow(SQUARE, LANDSCAPE_32)).toEqual({ w: 1, h: 2 / 3 });
  });
  it('a 3:2 photo in a square slot keeps full height and loses a third of its width', () => {
    const v = coverWindow(LANDSCAPE_32, SQUARE);
    expect(v.h).toBe(1);
    expect(v.w).toBeCloseTo(2 / 3, 10);
  });
  it('same ratio → nothing is cropped; degenerate input → treated as no crop', () => {
    expect(coverWindow(SQUARE, SQUARE)).toEqual({ w: 1, h: 1 });
    expect(coverWindow(0, SQUARE)).toEqual({ w: 1, h: 1 });
  });
});

describe('bestWindow — pan to contain the subject, never leave the photo', () => {
  it('centres the window on the subject when it fits', () => {
    const w = bestWindow(R(0.3, 0.1, 0.2, 0.2), { w: 1, h: 0.5 });
    expect(w).toEqual({ x: 0, y: 0, w: 1, h: 0.5 }); // subject centre y=0.2 → window top clamps to 0
    const w2 = bestWindow(R(0.4, 0.4, 0.2, 0.2), { w: 1, h: 0.5 });
    expect(w2.y).toBeCloseTo(0.25, 10);
  });
  it('clamps at the far edge', () => {
    const w = bestWindow(R(0.7, 0.8, 0.2, 0.2), { w: 1, h: 0.5 });
    expect(w.y).toBeCloseTo(0.5, 10);
  });
  it('overlap arithmetic', () => {
    expect(overlapArea(R(0, 0, 1, 0.5), R(0.2, 0.2, 0.2, 0.2))).toBeCloseTo(0.04, 10);
    expect(overlapArea(R(0, 0, 1, 0.5), R(0.2, 0.6, 0.2, 0.2))).toBe(0);
  });
});

describe('fitSubject — the number the engine ranks by', () => {
  it('a centred single subject in a square photo SURVIVES a 3:2 slot (this is the unlock)', () => {
    const f = fitSubject(R(0.3, 0.3, 0.4, 0.4), SQUARE, LANDSCAPE_32);
    expect(f.survival).toBe(1);
    expect(f.severity).toBeCloseTo(1 / 3, 10);
    expect(f.fit).toBeCloseTo(1 - SEVERITY_WEIGHT / 3, 10);
    expect(f.fit).toBeGreaterThanOrEqual(FIT_THRESHOLD);
  });

  it('THE BUG: a group spanning the frame does NOT survive a narrower slot — and the score says so', () => {
    // 3:2 class photo, faces from 5% to 95% of the width, into a square slot:
    // only 2/3 of the width is visible, so a third of the group is cut.
    const group = R(0.05, 0.3, 0.9, 0.3);
    const f = fitSubject(group, LANDSCAPE_32, SQUARE);
    expect(f.survival).toBeCloseTo((2 / 3) / 0.9, 6);
    expect(f.fit).toBeLessThan(FIT_THRESHOLD);
    expect(fitsSlot(group, LANDSCAPE_32, SQUARE)).toBe(false);
    // …but it survives a slot of its own ratio, and a WIDER one, untouched.
    expect(fitsSlot(group, LANDSCAPE_32, LANDSCAPE_32)).toBe(true);
    expect(fitsSlot(group, LANDSCAPE_32, 16 / 9)).toBe(true);
  });

  it('a full-body portrait does not survive a landscape slot (feet or head go)', () => {
    const body = R(0.3, 0.05, 0.4, 0.9);
    const f = fitSubject(body, PORTRAIT_34, LANDSCAPE_32);
    expect(f.survival).toBeCloseTo(0.5 / 0.9, 6);
    expect(fitsSlot(body, PORTRAIT_34, LANDSCAPE_32)).toBe(false);
  });

  it('a tight head-and-shoulders portrait DOES survive a landscape slot', () => {
    expect(fitsSlot(R(0.3, 0.2, 0.4, 0.35), PORTRAIT_34, LANDSCAPE_32)).toBe(true);
  });

  it('severity orders a gentle crop ahead of a harsh one when both are safe', () => {
    const s = R(0.4, 0.4, 0.2, 0.2);
    const gentle = fitSubject(s, SQUARE, 4 / 3);   // loses 25%
    const harsh = fitSubject(s, SQUARE, 16 / 9);   // loses 44%
    expect(gentle.survival).toBe(1);
    expect(harsh.survival).toBe(1);
    expect(gentle.fit).toBeGreaterThan(harsh.fit);
  });

  it('fitAtRatio resolves the named ratio', () => {
    expect(fitAtRatio(R(0.3, 0.3, 0.4, 0.4), SQUARE, '3:2').fit)
      .toBeCloseTo(fitSubject(R(0.3, 0.3, 0.4, 0.4), SQUARE, 1.5).fit, 10);
  });
});

describe('designPxOffset — the pan the renderers read', () => {
  it('a centred subject needs no pan', () => {
    const f = fitSubject(R(0.3, 0.3, 0.4, 0.4), SQUARE, LANDSCAPE_32);
    expect(designPxOffset(f.window, SQUARE, 300, 200)).toEqual({ offsetX: 0, offsetY: 0 });
  });
  it('a subject at the TOP of a square photo in a 3:2 slot moves the photo DOWN by the full overflow', () => {
    // Drawn cover-fit: width 300 → the square draws 300×300 in a 200-tall slot,
    // overflowing 100 px (50 above, 50 below). The window (height 2/3) sits at
    // the very top → its centre is at 1/3 → the photo shifts +50 px (down),
    // which is exactly the maximum pan: the top edge now touches the slot.
    const f = fitSubject(R(0.3, 0.02, 0.4, 0.3), SQUARE, LANDSCAPE_32);
    const o = designPxOffset(f.window, SQUARE, 300, 200);
    expect(o.offsetX).toBe(0);
    expect(o.offsetY).toBeCloseTo(50, 0);
  });
  it('a subject at the RIGHT of a 3:2 photo in a square slot moves the photo LEFT', () => {
    const f = fitSubject(R(0.75, 0.3, 0.2, 0.4), LANDSCAPE_32, SQUARE);
    const o = designPxOffset(f.window, LANDSCAPE_32, 200, 200);
    expect(o.offsetY).toBe(0);
    expect(o.offsetX).toBeLessThan(0);
    expect(Math.abs(o.offsetX)).toBeCloseTo(50, 0); // drawn 300 wide; window 2/3 at the right edge
  });
  it('never pans on the uncropped axis and never past the photo edge', () => {
    const f = fitSubject(R(0.9, 0.9, 0.1, 0.1), SQUARE, LANDSCAPE_32);
    const o = designPxOffset(f.window, SQUARE, 300, 200);
    expect(o.offsetX).toBe(0);
    expect(Math.abs(o.offsetY)).toBeLessThanOrEqual(50 + 1e-6); // (300 − 200) / 2
  });
});

describe('bestAssignment — which photo goes in which slot', () => {
  it('finds the optimum exhaustively for a page', () => {
    // 3 photos, 3 slots; a matrix where greedy-by-slot would pick wrong.
    const S = [
      [0.9, 0.8, 0.1],
      [0.85, 0.2, 0.2],
      [0.1, 0.1, 0.95],
    ];
    const a = bestAssignment(3, 3, (i, s) => S[i][s]);
    expect(a.picks).toEqual([1, 0, 2]); // 0.85 + 0.8 + 0.95 = 2.6 beats greedy 0.9 + 0.2 + 0.95
    expect(a.total).toBeCloseTo(2.6, 10);
  });
  it('the wide group lands in the widest slot with no special rule', () => {
    const group = R(0.05, 0.3, 0.9, 0.3);
    const single = R(0.35, 0.2, 0.3, 0.5);
    const photos = [{ s: group, a: LANDSCAPE_32 }, { s: single, a: LANDSCAPE_32 }];
    const slots = [SQUARE, 16 / 9]; // slot 0 narrow, slot 1 wide
    const a = bestAssignment(2, 2, (i, s) => fitSubject(photos[i].s, photos[i].a, slots[s]).fit);
    expect(a.picks[1]).toBe(0); // group → the 16:9 slot
    expect(a.picks[0]).toBe(1);
  });
  it('picks the best subset when the pool is larger than the page, and swaps improve greedy', () => {
    const score = (i: number, s: number) => [[0.5, 0.9], [0.9, 0.5], [0.1, 0.1], [0.6, 0.6]][i][s];
    const a = bestAssignment(4, 2, score);
    expect(a.picks.sort()).toEqual([0, 1]);
    expect(a.total).toBeCloseTo(1.8, 10);
  });
  it('handles empty input', () => {
    expect(bestAssignment(0, 3, () => 1)).toEqual({ picks: [], total: 0 });
  });
});

describe('unlockRate — the measurement that justifies the branch', () => {
  it('reports the fraction of a pool that can safely enter a slot ratio', () => {
    const pool = [
      { subject: R(0.3, 0.3, 0.4, 0.4), aspect: SQUARE },  // centred → unlocks
      { subject: R(0.05, 0.05, 0.9, 0.9), aspect: SQUARE }, // fills the frame → does not
      { subject: null, aspect: SQUARE },                   // unknown → assumed centred 60% → unlocks
      { subject: R(0.3, 0.02, 0.4, 0.3), aspect: SQUARE }, // top-heavy but small → unlocks by panning
    ];
    const r = unlockRate(pool, LANDSCAPE_32);
    expect(r.total).toBe(4);
    expect(r.unlocked).toBe(3);
    expect(r.rate).toBeCloseTo(0.75, 10);
    expect(UNKNOWN_SUBJECT).toEqual({ x: 0.2, y: 0.2, w: 0.6, h: 0.6 });
  });
});
