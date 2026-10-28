/* ══════════════════════════════════════════════════════════════════════════
   HOW CHROME'S CANVAS SAMPLES A PICTURE, so the app's print files sample
   theirs the same way (drawPage.ts image()).

   Measured in the golden tool's Chromium (CPU canvas, as the website's print
   files are made), three rules a plain Skia bilinear draw does not follow:

   1. A picture drawn level (not turned) is sampled with Skia's older
      bilinear code: the spot between four pixels is cut to 1/16 of a pixel
      (truncated), the four weights are whole numbers out of 256
      ((16-x)(16-y), x(16-y), (16-x)y, xy) and the sum is truncated.
      Measured: a sharp edge drawn at x + 0.193 comes out 90 where exact
      bilinear gives 77, and the 17 offsets tried land on 1/16 steps exactly.
      A picture drawn turned (smoothed edges) is plain float bilinear, as
      Skia draws it: there this file changes nothing.
   2. A picture file (a photo, a QR code, a graphic, a mask edge: anything
      the browser decoded) drawn at under half its size in both directions
      is first made smaller by halving (Chrome's image decode cache, cc
      MipMapUtil: the level is the deepest halving still at least the drawn
      size in both directions; each halving the average of 2 x 2 pixels,
      truncated, premultiplied), and the drawing samples that copy.
      Measured: a 900 px QR drawn at 450 px or less, and a 1024 px graphic
      at 500 px or less, differ by up to 151 levels without it, 0 with it.
      A canvas drawn onto another (the page under its words, a baked photo)
      is never halved.
   3. A picture with see-through pixels is filtered premultiplied (Chrome
      decodes to premultiplied pixels): a graphic's edge comes out within 0
      levels so, 56 apart when Skia filters the file's own unpremultiplied
      pixels.
   With all three, the golden tool's pictures (a QR code, a graphic and a
   photo, each at seven sizes and spots) come out pixel for pixel the
   website's, bar one: a size where a 1/16 cut lands within float rounding
   of a step (a few hundred pixels 16 levels apart).

   The older bilinear is a runtime shader (SkSL), so it works the same on
   the phone's Skia and in CanvasKit, whatever bilinear code either has.
   ══════════════════════════════════════════════════════════════════════════ */
import type { SkImage, SkRuntimeEffect, SkShader, Skia } from '@shopify/react-native-skia/lib/commonjs/skia/types';
import { AlphaType, ColorType, FilterMode, MipmapMode, TileMode } from '@shopify/react-native-skia/lib/commonjs/skia/types';

export interface Rect { x: number; y: number; w: number; h: number }

/* The spot (p - 0.5, as Skia biases a bilinear sample) cut to 16.16 fixed
   point and then to 1/16 of a pixel; sampled there with Skia's own bilinear
   (its weights are then exactly the older code's whole numbers out of 256)
   and truncated, as the older code truncates its sum. One bilinear sample
   instead of four nearest ones: the same numbers (the sum is a multiple of
   1/256, so a nudge of 1/1000 before truncating can't cross a step), at a
   quarter of the work. `bounds`: the source rectangle's first and last
   pixel centres (a draw of part of a picture never reads past it, as
   Skia's strict source rectangle; at a clamped edge both taps are the edge
   pixel, as in the older code). */
const LEGACY_BILINEAR = `
uniform shader img;
uniform float4 bounds;
half4 main(float2 p) {
  float2 f = floor((p - 0.5) * 65536.0);
  float2 i0 = floor(f / 65536.0);
  float2 sub = floor((f - i0 * 65536.0) / 4096.0);
  float2 q = clamp(i0 + sub / 16.0 + 0.5, bounds.xy, bounds.zw);
  float4 c = float4(img.eval(q));
  return half4(floor(c * 255.0 + 0.001) / 255.0);
}`;

const effects = new WeakMap<object, SkRuntimeEffect>();

/** Chrome's mip level for a picture `srcW` × `srcH` drawn at `targetW` ×
 *  `targetH` px (cc MipMapUtil::GetLevelForSize): halve while the next
 *  halving is still at least the target in both directions. */
export function mipLevelFor(srcW: number, srcH: number, targetW: number, targetH: number): number {
  let level = 0, w = srcW, h = srcH;
  for (;;) {
    if (w === 1 && h === 1) break;
    w = Math.max(1, Math.floor(w / 2));
    h = Math.max(1, Math.floor(h / 2));
    if (h < targetH || w < targetW) break;
    level++;
  }
  return level;
}

/** One halving of premultiplied RGBA (Skia's mip step: 2 taps on an even
 *  side, 1-2-1 on an odd one, 1 on a side of 1; the sum truncated). */
export function halve(px: Uint8Array, w: number, h: number): { px: Uint8Array; w: number; h: number } {
  const W = Math.max(1, Math.floor(w / 2)), H = Math.max(1, Math.floor(h / 2));
  const out = new Uint8Array(W * H * 4);
  const xTaps = w === 1 ? [[0, 1]] : w % 2 === 0 ? [[0, 1], [1, 1]] : [[0, 1], [1, 2], [2, 1]];
  const yTaps = h === 1 ? [[0, 1]] : h % 2 === 0 ? [[0, 1], [1, 1]] : [[0, 1], [1, 2], [2, 1]];
  const total = xTaps.reduce((n, t) => n + t[1], 0) * yTaps.reduce((n, t) => n + t[1], 0);
  const shift = Math.log2(total);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (const [dy, wy] of yTaps) {
        const row = (2 * y + dy) * w;
        for (const [dx, wx] of xTaps) {
          const i = (row + 2 * x + dx) * 4, k = wx * wy;
          r += px[i] * k; g += px[i + 1] * k; b += px[i + 2] * k; a += px[i + 3] * k;
        }
      }
      const o = (y * W + x) * 4;
      out[o] = r >> shift; out[o + 1] = g >> shift; out[o + 2] = b >> shift; out[o + 3] = a >> shift;
    }
  }
  return { px: out, w: W, h: H };
}

/** The pictures prepared Chrome's way, kept per picture and level. */
export class ChromeSampling {
  private readonly ready = new Map<SkImage, Map<number, SkImage>>();

  constructor(private readonly Skia: Skia) {}

  private effect(): SkRuntimeEffect {
    let e = effects.get(this.Skia);
    if (!e) {
      const made = this.Skia.RuntimeEffect.Make(LEGACY_BILINEAR);
      if (!made) throw new Error('the bilinear sampling shader did not compile');
      e = made;
      effects.set(this.Skia, e);
    }
    return e;
  }

  private premulInfo(w: number, h: number) {
    return { width: w, height: h, colorType: ColorType.RGBA_8888, alphaType: AlphaType.Premul };
  }

  /** A decoded picture as Chrome draws it at `level` (0: the picture itself,
   *  premultiplied if it has see-through pixels; 1+: halved that often). */
  decoded(img: SkImage, level: number): SkImage {
    let byLevel = this.ready.get(img);
    if (!byLevel) { byLevel = new Map(); this.ready.set(img, byLevel); }
    const hit = byLevel.get(level);
    if (hit) return hit;
    const opaque = img.getImageInfo().alphaType === AlphaType.Opaque;
    let out: SkImage;
    if (level === 0 && opaque) out = img;
    else {
      const w = img.width(), h = img.height();
      const px = img.readPixels(0, 0, this.premulInfo(w, h));
      if (!(px instanceof Uint8Array)) throw new Error('could not read a picture back to prepare it');
      let cur = { px, w, h };
      for (let k = 0; k < level; k++) cur = halve(cur.px, cur.w, cur.h);
      const made = this.Skia.Image.MakeImage(this.premulInfo(cur.w, cur.h), this.Skia.Data.fromBytes(cur.px), cur.w * 4);
      if (!made) throw new Error('could not make the prepared picture');
      out = made;
    }
    byLevel.set(level, out);
    return out;
  }

  /** The older bilinear for `img`'s `src` drawn into `dst` (dst's own space). */
  levelShader(img: SkImage, src: Rect, dst: Rect): SkShader {
    const child = img.makeShaderOptions(TileMode.Clamp, TileMode.Clamp, FilterMode.Linear, MipmapMode.None);
    const kx = dst.w / src.w, ky = dst.h / src.h;
    const m = this.Skia.Matrix();
    m.translate(dst.x, dst.y);
    m.scale(kx, ky);
    m.translate(-src.x, -src.y);
    const bounds = [src.x + 0.5, src.y + 0.5, src.x + src.w - 0.5, src.y + src.h - 0.5];
    return this.effect().makeShaderWithChildren(bounds, [child], m);
  }

  /** Let go of every prepared copy (not the pictures themselves). */
  dispose(): void {
    this.ready.forEach((byLevel, img) => byLevel.forEach((p) => { if (p !== img) p.dispose(); }));
    this.ready.clear();
  }
}
