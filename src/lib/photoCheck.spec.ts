import { describe, it, expect } from 'vitest';
import {
  grayscale, tileSharpness, dHash, hamming, eyeAspectRatio, eyesClosedIn,
  isBlurry, medianSharpness, photoQuality, findRepeats, suggestLeaveOut,
  nextCheckJob, checkIsReady, checkProgress,
  BLUR_ABS, REPEAT_BITS, type CheckablePhoto, type PhotoCheck,
} from './photoCheck';

/* ══════════════════════════════════════════════════════════════════════════
   MEGY'S FREE PHOTO CHECK (owner, 2026-10-04: "Suggest, one tap"). Blurry
   shots and repeats are suggested out; closed eyes only picks the keeper of a
   set of repeats and keeps a shot off the full pages. Thresholds were set on
   the repo's 42 real photos in Chromium: sharp originals 73–4,359 (median
   1,770), 2-px-blurred copies ≤ ~15; near-identical copies 0–12 bits apart
   (median 5), different photos ≥ 19.
   ══════════════════════════════════════════════════════════════════════════ */

/** An RGBA image from a brightness function. */
function img(w: number, h: number, f: (x: number, y: number) => number) {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const v = f(x, y), p = (y * w + x) * 4;
    d[p] = d[p + 1] = d[p + 2] = v; d[p + 3] = 255;
  }
  return grayscale(d, w, h);
}
/** Box blur of a gray image, radius r. */
function blur(g: Float32Array, w: number, h: number, r: number) {
  const out = new Float32Array(g.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0, n = 0;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx >= 0 && yy >= 0 && xx < w && yy < h) { s += g[yy * w + xx]; n++; }
    }
    out[y * w + x] = s / n;
  }
  return out;
}
const W = 160, H = 120;
// Detail everywhere: a fine checkerboard with a few bars.
const detailed = img(W, H, (x, y) => (((x >> 2) + (y >> 2)) % 2 ? 220 : 30) + (x % 37 < 3 ? 20 : 0));
// A sharp subject under a plain sky: top 60 % flat, bottom detailed.
const skyShot = img(W, H, (x, y) => (y < H * 0.6 ? 180 : (((x >> 2) + (y >> 2)) % 2 ? 220 : 30)));

describe('sharpness', () => {
  it('a detailed photo is sharp; the same photo blurred is far softer', () => {
    const sharp = tileSharpness(detailed, W, H);
    const soft = tileSharpness(blur(detailed, W, H, 3), W, H);
    expect(sharp).toBeGreaterThan(BLUR_ABS * 10);
    expect(soft).toBeLessThan(sharp / 10);
  });

  it('a plain sky does not drag a sharp photo down (the sharpest areas count)', () => {
    expect(tileSharpness(skyShot, W, H)).toBeGreaterThan(tileSharpness(detailed, W, H) * 0.5);
  });

  it('a flat image has no edges; a tiny one measures 0', () => {
    expect(tileSharpness(img(W, H, () => 128), W, H)).toBe(0);
    expect(tileSharpness(img(2, 2, () => 0), 2, 2)).toBe(0);
  });
});

describe('fingerprint (difference hash)', () => {
  // A natural-looking scene (smooth light and shade), and the same scene a
  // few pixels to the side — a second shot of the same moment.
  const scene = (dx: number) => img(W, H, (x, y) => 128 + 60 * Math.sin((x + dx) / 17) * Math.cos(y / 23) + 40 * Math.sin((x + dx + y) / 31));
  it('the same photo → 0 bits apart; a 3 % shift → a few bits; a different photo → many', () => {
    const a = dHash(scene(0), W, H);
    expect(a).toMatch(/^[0-9a-f]{16}$/);
    expect(hamming(a, dHash(scene(0), W, H))).toBe(0);
    expect(hamming(a, dHash(scene(5), W, H))).toBeLessThanOrEqual(REPEAT_BITS);
    expect(hamming(a, dHash(skyShot, W, H))).toBeGreaterThan(REPEAT_BITS);
  });

  it('a brighter copy of a natural scene keeps its fingerprint', () => {
    const scene = img(W, H, (x, y) => 60 + 120 * Math.sin(x / 17) * Math.cos(y / 23) + 60);
    const brighter = img(W, H, (x, y) => Math.min(255, (60 + 120 * Math.sin(x / 17) * Math.cos(y / 23) + 60) * 1.15));
    expect(hamming(dHash(scene, W, H), dHash(brighter, W, H))).toBeLessThanOrEqual(2);
  });

  it('an unreadable fingerprint is as far as possible', () => {
    expect(hamming('', 'abcd')).toBe(64);
    expect(hamming('00'.repeat(8), 'ff'.repeat(8))).toBe(64);
  });
});

describe('closed eyes (68-point landmarks)', () => {
  // A 6-point eye: corners at x=0 and x=30, lids at ±h.
  const eye = (cx: number, h: number) => [
    { x: cx, y: 0 }, { x: cx + 10, y: -h }, { x: cx + 20, y: -h }, { x: cx + 30, y: 0 }, { x: cx + 20, y: h }, { x: cx + 10, y: h },
  ];
  const face = (leftH: number, rightH: number, boxHeight: number) => {
    const lm = Array.from({ length: 68 }, () => ({ x: 0, y: 0 }));
    eye(0, leftH).forEach((p, i) => { lm[36 + i] = p; });
    eye(60, rightH).forEach((p, i) => { lm[42 + i] = p; });
    return { boxHeight, landmarks: lm };
  };

  it('open eyes measure ~0.3, shut eyes ~0.03', () => {
    expect(eyeAspectRatio(eye(0, 5))).toBeCloseTo(0.333, 2);
    expect(eyeAspectRatio(eye(0, 0.5))).toBeLessThan(0.05);
  });

  it('both eyes shut on a clear face → closed; a wink or open eyes → not', () => {
    expect(eyesClosedIn([face(0.5, 0.5, 200)], 1000)).toBe(true);
    expect(eyesClosedIn([face(5, 0.5, 200)], 1000)).toBe(false); // wink
    expect(eyesClosedIn([face(5, 5, 200)], 1000)).toBe(false);
  });

  it('a face too small to judge is ignored', () => {
    expect(eyesClosedIn([face(0.5, 0.5, 40)], 1000)).toBe(false);
  });

  it('any one clear face with shut eyes counts', () => {
    expect(eyesClosedIn([face(5, 5, 200), face(0.5, 0.5, 150)], 1000)).toBe(true);
  });
});

/* ── Album rules ─────────────────────────────────────────────────────── */

const check = (sharp: number, hash: string, eyesClosed = false): PhotoCheck => ({ v: 1, sharp, hash, faces: 1, eyesClosed });
const H0 = '0000000000000000';
/** H0 with these bit positions set (so distances are exact). */
const bitsAt = (positions: number[]) => {
  const b = new Array(64).fill(0); positions.forEach((i) => { b[i] = 1; });
  let hex = ''; for (let i = 0; i < 64; i += 4) hex += (b[i] * 8 + b[i + 1] * 4 + b[i + 2] * 2 + b[i + 3]).toString(16);
  return hex;
};
/** H0 with the first `n` bits set: `n` bits from H0, and away(a)↔away(b) is |a−b|. */
const away = (n: number) => bitsAt(Array.from({ length: n }, (_, i) => i));
/** A fingerprint unrelated to everything else here (~half its bits differ). */
const other = (seed: number) => bitsAt(Array.from({ length: 64 }, (_, i) => i).filter((i) => ((i * 7 + seed * 13) % 5) < 2 + (seed % 2)));
const photo = (id: string, c: PhotoCheck | undefined, extra: Partial<CheckablePhoto> = {}): CheckablePhoto => ({ id, width: 4032, height: 3024, capturedAt: null, check: c, ...extra });

describe('blurry', () => {
  const album = [photo('a', check(1800, other(1))), photo('b', check(1500, other(2))), photo('c', check(1200, other(3))), photo('soft', check(12, other(4)))];

  it('only a shot below BOTH the floor and 30 % of the album median is blurry', () => {
    const m = medianSharpness(album);
    expect(isBlurry(album[3], m)).toBe(true);
    expect(album.slice(0, 3).some((p) => isBlurry(p, m))).toBe(false);
  });

  it('an album shot in dim light is not all flagged (soft against a soft median)', () => {
    const dim = [photo('a', check(30, other(1))), photo('b', check(28, other(2))), photo('c', check(35, other(3)))];
    expect(dim.some((p) => isBlurry(p, medianSharpness(dim)))).toBe(false);
  });

  it('quality: blurry 0, shut eyes costs half, an unchecked photo is neutral', () => {
    const m = 1500;
    expect(photoQuality(photo('s', check(10, H0)), m)).toBe(0);
    expect(photoQuality(photo('o', check(2000, H0)), m)).toBeGreaterThan(photoQuality(photo('c', check(2000, H0, true)), m) + 0.4);
    expect(photoQuality(photo('u', undefined), m)).toBe(0.5);
  });
});

describe('repeats', () => {
  it('close fingerprints taken within 2 minutes are one set; far in time or fingerprint are not', () => {
    const ps = [
      photo('a', check(1500, H0), { capturedAt: 0 }),
      photo('b', check(1600, away(5)), { capturedAt: 3_000 }),
      photo('c', check(1500, away(4)), { capturedAt: 600_000 }),   // same look, 10 min later
      photo('d', check(1500, other(7)), { capturedAt: 4_000 }),    // different shot
    ];
    expect(findRepeats(ps)).toEqual([['a', 'b']]);
  });

  it('chains join (A≈B, B≈C), portrait never pairs with landscape', () => {
    const ps = [
      photo('a', check(1, H0), { capturedAt: 0 }),
      photo('b', check(1, away(8)), { capturedAt: 1000 }),
      photo('c', check(1, away(14)), { capturedAt: 2000 }),         // ≈ b (6 apart), not ≈ a
      photo('p', check(1, H0), { capturedAt: 500, width: 3024, height: 4032 }),
    ];
    const sets = findRepeats(ps);
    expect(sets).toHaveLength(1);
    expect(sets[0].sort()).toEqual(['a', 'b', 'c']);
  });

  it('without capture times only very close fingerprints count', () => {
    const c9 = bitsAt([20, 21, 22, 23, 24, 25, 26, 27, 28]); // 9 from a, 14 from b
    const ps = [photo('a', check(1, H0)), photo('b', check(1, away(5))), photo('c', check(1, c9))];
    expect(findRepeats(ps)).toEqual([['a', 'b']]);
  });
});

describe('suggestLeaveOut', () => {
  it('keeps the best shot of a set (sharp, eyes open) and suggests the rest', () => {
    const ps = [
      photo('blink', check(2000, H0, true), { capturedAt: 0 }),
      photo('best', check(1900, away(3)), { capturedAt: 1000 }),
      photo('ok', check(900, away(4)), { capturedAt: 2000 }),
      photo('solo', check(1500, other(5)), { capturedAt: 50_000 }),
    ];
    const s = suggestLeaveOut(ps);
    expect(s.repeats.sort()).toEqual(['blink', 'ok']);
    expect(s.keeperOf).toEqual({ blink: 'best', ok: 'best' });
    expect(s.blurry).toEqual([]);
  });

  it('two near-equal frames: the earlier one is kept (first taken, else first uploaded)', () => {
    const timed = suggestLeaveOut([
      photo('second', check(1520, away(2)), { capturedAt: 2000 }),
      photo('first', check(1500, H0), { capturedAt: 1000 }),
    ]);
    expect(timed.keeperOf).toEqual({ second: 'first' });
    const untimed = suggestLeaveOut([photo('orig', check(1500, H0)), photo('copy', check(1530, away(3)))]);
    expect(untimed.keeperOf).toEqual({ copy: 'orig' });
    // A clearly better shot still wins over an earlier one.
    const better = suggestLeaveOut([photo('soft', check(500, H0), { capturedAt: 0 }), photo('crisp', check(2200, away(2)), { capturedAt: 1000 })]);
    expect(better.keeperOf).toEqual({ soft: 'crisp' });
  });

  it('closed eyes alone never gets a photo suggested out', () => {
    const ps = [photo('lola', check(1500, H0, true), { capturedAt: 0 }), photo('x', check(1500, other(6)), { capturedAt: 900_000 })];
    expect(suggestLeaveOut(ps)).toEqual({ blurry: [], repeats: [], keeperOf: {} });
  });

  it('a photo the customer kept is never suggested — and keeping it never pushes the better shot out', () => {
    const ps = [
      photo('mine', check(800, H0), { capturedAt: 0, kept: true }),
      photo('sharper', check(2000, away(3)), { capturedAt: 1000 }),
      photo('soft', check(10, other(1)), { capturedAt: 900_000, kept: true }),
      photo('a', check(1500, other(2)), { capturedAt: 950_000 }),
      photo('b', check(1600, other(3)), { capturedAt: 990_000 }),
    ];
    // 'mine' (kept) and 'sharper' (the set's best) both stay; the kept blurry
    // 'soft' isn't suggested either.
    expect(suggestLeaveOut(ps)).toEqual({ blurry: [], repeats: [], keeperOf: {} });
  });

  it('bringing back a shaky copy never turns its sharp original into the "repeat"', () => {
    const ps = [
      photo('original', check(1800, H0), { capturedAt: 0 }),
      photo('shaky', check(12, away(2)), { capturedAt: 1000, kept: true }), // brought back
      photo('x', check(1500, other(4)), { capturedAt: 900_000 }),
      photo('y', check(1600, other(5)), { capturedAt: 990_000 }),
    ];
    expect(suggestLeaveOut(ps)).toEqual({ blurry: [], repeats: [], keeperOf: {} });
  });

  it('a blurry shot inside a set is listed once, as blurry; left-out photos are ignored', () => {
    const ps = [
      photo('a', check(1800, H0), { capturedAt: 0 }),
      photo('b', check(12, away(4)), { capturedAt: 1000 }),
      photo('gone', check(1700, away(2)), { capturedAt: 1500, leftOut: true }),
      photo('c', check(1500, other(4)), { capturedAt: 900_000 }),
      photo('d', check(1600, other(5)), { capturedAt: 990_000 }),
    ];
    const s = suggestLeaveOut(ps);
    expect(s.blurry).toEqual(['b']);
    expect(s.repeats).toEqual([]);
  });
});

describe('scheduling the check (two passes)', () => {
  const basicOnly = (sharp: number, hash: string): PhotoCheck => ({ v: 1, sharp, hash, faces: null, eyesClosed: false });
  it('pass 1 checks every measured photo for blur and repeats, skipping unmeasured and left-out ones', () => {
    const ps = [
      photo('unmeasured', undefined, { width: 0, height: 0 }),
      photo('gone', undefined, { leftOut: true }),
      photo('a', undefined),
    ];
    expect(nextCheckJob(ps, new Set())).toEqual({ id: 'a', stage: 'basic' });
    expect(nextCheckJob(ps, new Set(['basic:a']))).toBeNull(); // tried (or failed): no loop
  });

  it('pass 2 looks at faces in repeats first, then the rest; a tried face pass is done', () => {
    const ps = [
      photo('solo', basicOnly(1500, other(1)), { capturedAt: 900_000 }),
      photo('r1', basicOnly(1500, H0), { capturedAt: 0 }),
      photo('r2', basicOnly(1500, away(3)), { capturedAt: 1000 }),
    ];
    expect(nextCheckJob(ps, new Set())).toEqual({ id: 'r1', stage: 'faces' });
    expect(nextCheckJob(ps, new Set(['faces:r1', 'faces:r2']))).toEqual({ id: 'solo', stage: 'faces' });
    ps[0].check = { ...ps[0].check!, facesTried: true };
    expect(nextCheckJob(ps, new Set(['faces:r1', 'faces:r2']))).toBeNull();
  });

  it('on a device without fast face detection, only the repeats get a face pass', () => {
    const ps = [
      photo('solo', basicOnly(1500, other(1)), { capturedAt: 900_000 }),
      photo('r1', basicOnly(1500, H0), { capturedAt: 0 }),
      photo('r2', basicOnly(1500, away(3)), { capturedAt: 1000 }),
    ];
    expect(nextCheckJob(ps, new Set(), false)).toEqual({ id: 'r1', stage: 'faces' });
    expect(nextCheckJob(ps, new Set(['faces:r1', 'faces:r2']), false)).toBeNull();
  });

  it('ready to suggest once every photo has pass 1 and every repeat has pass 2', () => {
    const ps = [
      photo('solo', basicOnly(1500, other(1)), { capturedAt: 900_000 }),
      photo('r1', basicOnly(1500, H0), { capturedAt: 0 }),
      photo('r2', basicOnly(1500, away(3)), { capturedAt: 1000 }),
      photo('new', undefined),
    ];
    expect(checkIsReady(ps)).toBe(false);
    ps[3].check = basicOnly(1400, other(2));
    expect(checkIsReady(ps)).toBe(false);                       // repeats still need their faces
    ps[1].check = { ...ps[1].check!, faces: 1 };
    ps[2].check = { ...ps[2].check!, facesTried: true };        // face models unavailable: still done
    expect(checkIsReady(ps)).toBe(true);                        // 'solo' faces can wait
    expect(checkProgress(ps)).toEqual({ done: 4, total: 4 });
  });
});
