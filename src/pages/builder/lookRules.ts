/* ══════════════════════════════════════════════════════════════════════════
   LOOK RULES: the part of looks.ts that needs no browser (which looks there
   are, their CSS filter functions and the same functions on a pixel), so the
   2.0 app colours a photo with the same numbers as the website
   (src/shared/sharedModules.ts). looks.ts re-exports all of it and adds the
   canvas step (applyLookPixels); the website imports looks.ts as before.
   ══════════════════════════════════════════════════════════════════════════ */

export type LookId = 'bw' | 'sepia' | 'faded' | 'warm';
export type LookOp =
  | { fn: 'grayscale'; v: number }
  | { fn: 'sepia'; v: number }
  | { fn: 'saturate'; v: number }
  | { fn: 'brightness'; v: number }
  | { fn: 'contrast'; v: number };

export const LOOKS: { id: LookId; label: string; ops: LookOp[] }[] = [
  { id: 'bw', label: 'Black & white', ops: [{ fn: 'grayscale', v: 1 }, { fn: 'contrast', v: 1.06 }] },
  { id: 'sepia', label: 'Sepia', ops: [{ fn: 'sepia', v: 0.8 }, { fn: 'contrast', v: 0.96 }] },
  { id: 'faded', label: 'Faded', ops: [{ fn: 'sepia', v: 0.18 }, { fn: 'saturate', v: 0.72 }, { fn: 'contrast', v: 0.86 }, { fn: 'brightness', v: 1.07 }] },
  { id: 'warm', label: 'Warm', ops: [{ fn: 'sepia', v: 0.22 }, { fn: 'saturate', v: 1.15 }, { fn: 'brightness', v: 1.03 }] },
];

export function isLookId(v: unknown): v is LookId {
  return typeof v === 'string' && LOOKS.some((l) => l.id === v);
}

export function lookOps(id: LookId | null | undefined): LookOp[] {
  return LOOKS.find((l) => l.id === id)?.ops ?? [];
}

/** The DOM's `filter` value for a look ('' when none). */
export function lookCss(id: LookId | null | undefined): string {
  return lookOps(id).map((o) => `${o.fn}(${o.v})`).join(' ');
}

/* ── The same functions on pixels (CSS Filter Effects Module Level 1) ───── */
type M = [number, number, number, number, number, number, number, number, number];
const grayscaleM = (g: number): M => {
  const a = 1 - g;
  return [0.2126 + 0.7874 * a, 0.7152 - 0.7152 * a, 0.0722 - 0.0722 * a,
          0.2126 - 0.2126 * a, 0.7152 + 0.2848 * a, 0.0722 - 0.0722 * a,
          0.2126 - 0.2126 * a, 0.7152 - 0.7152 * a, 0.0722 + 0.9278 * a];
};
const sepiaM = (s: number): M => {
  const a = 1 - s;
  return [0.393 + 0.607 * a, 0.769 - 0.769 * a, 0.189 - 0.189 * a,
          0.349 - 0.349 * a, 0.686 + 0.314 * a, 0.168 - 0.168 * a,
          0.272 - 0.272 * a, 0.534 - 0.534 * a, 0.131 + 0.869 * a];
};
const saturateM = (k: number): M => [
  0.213 + 0.787 * k, 0.715 - 0.715 * k, 0.072 - 0.072 * k,
  0.213 - 0.213 * k, 0.715 + 0.285 * k, 0.072 - 0.072 * k,
  0.213 - 0.213 * k, 0.715 - 0.715 * k, 0.072 + 0.928 * k,
];

/** Apply one look to a pixel (0–255 channels). Exported for the spec. */
export function applyLookToPixel(r: number, g: number, b: number, ops: LookOp[]): [number, number, number] {
  let R = r / 255, G = g / 255, B = b / 255;
  for (const o of ops) {
    if (o.fn === 'grayscale' || o.fn === 'sepia' || o.fn === 'saturate') {
      const m = o.fn === 'grayscale' ? grayscaleM(o.v) : o.fn === 'sepia' ? sepiaM(o.v) : saturateM(o.v);
      const nr = m[0] * R + m[1] * G + m[2] * B;
      const ng = m[3] * R + m[4] * G + m[5] * B;
      const nb = m[6] * R + m[7] * G + m[8] * B;
      R = nr; G = ng; B = nb;
    } else if (o.fn === 'brightness') {
      R *= o.v; G *= o.v; B *= o.v;
    } else if (o.fn === 'contrast') {
      R = (R - 0.5) * o.v + 0.5; G = (G - 0.5) * o.v + 0.5; B = (B - 0.5) * o.v + 0.5;
    }
  }
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255)));
  return [c(R), c(G), c(B)];
}

/** The same look over a whole photo's RGBA pixels (not premultiplied), in
 *  place: applyLookToPixel's arithmetic exactly (the same operations in the
 *  same order, the same rounding), with the matrices built once instead of
 *  once per pixel and no array per pixel, for the 2.0 app, whose JavaScript
 *  runs it over a few million pixels per print page. See-through pixels
 *  (alpha 0) are left alone, as applyLookPixels leaves them. looks.spec.ts
 *  holds it to applyLookToPixel, number for number. */
export function applyLookToPixels(px: Uint8Array, ops: readonly LookOp[]): void {
  const steps = ops.map((o) => (o.fn === 'grayscale' ? { m: grayscaleM(o.v), fn: o.fn, v: o.v }
    : o.fn === 'sepia' ? { m: sepiaM(o.v), fn: o.fn, v: o.v }
      : o.fn === 'saturate' ? { m: saturateM(o.v), fn: o.fn, v: o.v } : { m: null, fn: o.fn, v: o.v }));
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255)));
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] === 0) continue;
    let R = px[i] / 255, G = px[i + 1] / 255, B = px[i + 2] / 255;
    for (let k = 0; k < steps.length; k++) {
      const s = steps[k];
      if (s.m) {
        const m = s.m;
        const nr = m[0] * R + m[1] * G + m[2] * B;
        const ng = m[3] * R + m[4] * G + m[5] * B;
        const nb = m[6] * R + m[7] * G + m[8] * B;
        R = nr; G = ng; B = nb;
      } else if (s.fn === 'brightness') {
        R *= s.v; G *= s.v; B *= s.v;
      } else if (s.fn === 'contrast') {
        R = (R - 0.5) * s.v + 0.5; G = (G - 0.5) * s.v + 0.5; B = (B - 0.5) * s.v + 0.5;
      }
    }
    px[i] = c(R); px[i + 1] = c(G); px[i + 2] = c(B);
  }
}
