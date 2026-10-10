/* ══════════════════════════════════════════════════════════════════════════
   LOOKS (owner, 2026-09-13, Studio): a colour treatment on ONE photo —
   black & white, sepia, faded, warm. ONE definition per look as an ordered
   list of CSS filter functions; the DOM applies it as a `filter` string, the
   Fabric editor and the print pipeline apply the SAME functions to pixels
   using the matrices the CSS Filter Effects spec defines for them — so the
   three renderers agree by construction, and print never depends on the
   browser's canvas `filter` support.
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

/** Apply a look to a canvas region in place (Fabric offscreen + print). */
export function applyLookPixels(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, id: LookId | null | undefined): void {
  const ops = lookOps(id);
  if (!ops.length || w <= 0 || h <= 0) return;
  const img = ctx.getImageData(x, y, w, h);
  const d = img.data;
  // A 256³ lookup is too big; a per-channel cache per unique colour is not
  // worth it either — the matrices are 9 multiplies per pixel. Fine for a
  // frame at print size (a few million pixels).
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const [r, g, b] = applyLookToPixel(d[i], d[i + 1], d[i + 2], ops);
    d[i] = r; d[i + 1] = g; d[i + 2] = b;
  }
  ctx.putImageData(img, x, y);
}
