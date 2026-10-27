/* ══════════════════════════════════════════════════════════════════════════
   SYNTHETIC TEST PHOTOS for the golden page check (no real photos, ever).

   Each photo is drawn from plain arithmetic, so the website render
   (renderWeb.mjs) and the app render (mobile/test/goldenPages.test.ts) get
   the very same pixels without any picture files in git. Every photo has
   features that show at once when a crop, a pan or a zoom is off:
     • coloured corner squares (red top-left, green top-right, blue
       bottom-left, yellow bottom-right), so a flip or a shift shows;
     • a grid of dark lines every 1/8 of each side;
     • a ring in the middle and the photo's number in big block digits;
     • a band of fine stripes near the bottom, which shows the smallest
       resampling or position difference.
   Edges are smoothed (4×4 samples per pixel) so the photo resamples like a
   real one rather than a hard-edged drawing.
   ══════════════════════════════════════════════════════════════════════════ */

export interface SyntheticPhoto {
  width: number;
  height: number;
  /** RGBA, row by row, opaque. */
  rgba: Uint8Array;
}

/** The sizes of the test photos: the common phone shapes, big and small. */
export const PHOTO_SIZES: readonly { width: number; height: number }[] = [
  { width: 1600, height: 1200 }, // 4:3
  { width: 1200, height: 1600 }, // 3:4
  { width: 1500, height: 1500 }, // 1:1
  { width: 1800, height: 1200 }, // 3:2
  { width: 1200, height: 1800 }, // 2:3
  { width: 2400, height: 1350 }, // 16:9
  { width: 1350, height: 2400 }, // 9:16
  { width: 1000, height: 750 }, //  4:3, small: drawn bigger than it is
];

type RGB = [number, number, number];

function hsl(h: number, s: number, l: number): RGB {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

/* Block digits: 5 × 7 cells. */
const DIGITS: Record<string, string[]> = {
  '0': ['11111', '10001', '10011', '10101', '11001', '10001', '11111'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['11111', '00001', '00001', '11111', '10000', '10000', '11111'],
  '3': ['11111', '00001', '00001', '01111', '00001', '00001', '11111'],
  '4': ['10001', '10001', '10001', '11111', '00001', '00001', '00001'],
  '5': ['11111', '10000', '10000', '11111', '00001', '00001', '11111'],
  '6': ['11111', '10000', '10000', '11111', '10001', '10001', '11111'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['11111', '10001', '10001', '11111', '10001', '10001', '11111'],
  '9': ['11111', '10001', '10001', '11111', '00001', '00001', '11111'],
};

/** Photo `n` (0-based) of `size`: deterministic, the same on every machine. */
export function syntheticPhoto(n: number, size: { width: number; height: number }): SyntheticPhoto {
  const { width: w, height: h } = size;
  const rgba = new Uint8Array(w * h * 4);
  const hue = (n * 47) % 360;
  const c0 = hsl(hue, 0.55, 0.62);
  const c1 = hsl((hue + 140) % 360, 0.5, 0.38);
  const ring = hsl((hue + 200) % 360, 0.7, 0.85);
  const ink: RGB = [24, 24, 28];
  const m = Math.min(w, h);
  const corner = Math.round(m * 0.12);
  const gridW = Math.max(3, Math.round(m * 0.004));
  const cx = w / 2;
  const cy = h / 2;
  const rOuter = m * 0.3;
  const rInner = m * 0.27;
  // Digits: the photo's number, centred, 0.36 × the short side tall.
  const label = String(n + 1);
  const cell = Math.max(4, Math.round((m * 0.36) / 7));
  const labelW = (label.length * 6 - 1) * cell;
  const lx = Math.round(cx - labelW / 2);
  const ly = Math.round(cy - (7 * cell) / 2);
  const stripeTop = Math.round(h * 0.84);
  const stripeBottom = Math.round(h * 0.9);
  const stripe = Math.max(2, Math.round(m * 0.004));

  /** The colour at a point (sub-pixel), before smoothing. */
  const at = (x: number, y: number): RGB => {
    // corner squares
    if (x < corner && y < corner) return [220, 40, 40];
    if (x >= w - corner && y < corner) return [40, 170, 70];
    if (x < corner && y >= h - corner) return [40, 80, 220];
    if (x >= w - corner && y >= h - corner) return [240, 200, 30];
    // digits
    const dx = Math.floor((x - lx) / cell);
    const dy = Math.floor((y - ly) / cell);
    if (dy >= 0 && dy < 7 && dx >= 0 && x < lx + labelW) {
      const ch = Math.floor(dx / 6);
      const col = dx % 6;
      if (col < 5 && DIGITS[label[ch]]?.[dy][col] === '1') return ink;
    }
    // ring
    const d = Math.hypot(x - cx, y - cy);
    if (d <= rOuter && d >= rInner) return ring;
    // stripes band
    if (y >= stripeTop && y < stripeBottom && x >= corner && x < w - corner) {
      return Math.floor(x / stripe) % 2 === 0 ? [250, 250, 250] : ink;
    }
    // grid lines
    const gx = (x % (w / 8));
    const gy = (y % (h / 8));
    if (gx < gridW || gy < gridW) return [40, 40, 48];
    // background: a diagonal wash
    const t = (x / w + y / h) / 2;
    return [c0[0] + (c1[0] - c0[0]) * t, c0[1] + (c1[1] - c0[1]) * t, c0[2] + (c1[2] - c0[2]) * t];
  };

  const SS = 4;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Smooth only where the four corners of the pixel disagree (an edge).
      const a = at(x, y);
      const b = at(x + 0.999, y + 0.999);
      const c = at(x + 0.999, y);
      const e = at(x, y + 0.999);
      let r: number, g: number, bl: number;
      const same = (p: RGB, q: RGB) => Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) + Math.abs(p[2] - q[2]) < 6;
      if (same(a, b) && same(a, c) && same(a, e)) {
        r = a[0]; g = a[1]; bl = a[2];
      } else {
        r = 0; g = 0; bl = 0;
        for (let sy = 0; sy < SS; sy++) {
          for (let sx = 0; sx < SS; sx++) {
            const p = at(x + (sx + 0.5) / SS, y + (sy + 0.5) / SS);
            r += p[0]; g += p[1]; bl += p[2];
          }
        }
        r /= SS * SS; g /= SS * SS; bl /= SS * SS;
      }
      const i = (y * w + x) * 4;
      rgba[i] = Math.round(r);
      rgba[i + 1] = Math.round(g);
      rgba[i + 2] = Math.round(bl);
      rgba[i + 3] = 255;
    }
  }
  return { width: w, height: h, rgba };
}

/** Every distinct test photo, in PHOTO_SIZES order. */
export function allSyntheticPhotos(): SyntheticPhoto[] {
  return PHOTO_SIZES.map((s, i) => syntheticPhoto(i, s));
}
