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
      is never halved. The halving is drawn by Skia (a runtime shader on a
      CPU surface, `halveOnce`), not a JavaScript loop: on a phone a loop
      over a 12 MP photo takes seconds. The halved copies are kept only
      while one page (or one cover) is drawn: PageDrawer.drawing frees them
      when it ends, so they never pile up across an album.
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

   A shader made from a picture keeps the picture's pixels alive until it
   is let go of, and JavaScript's garbage collector sees a shader as a few
   bytes: so every shader and paint made here is disposed as soon as it has
   drawn (on the emulator, leaving them to the collector let the app's
   memory climb past 800 MB in a run of 12 MP photos).
   ══════════════════════════════════════════════════════════════════════════ */
import type { SkImage, SkRuntimeEffect, SkShader, Skia } from '@shopify/react-native-skia/lib/commonjs/skia/types';
import { AlphaType, BlendMode, ColorType, FilterMode, MipmapMode, TileMode } from '@shopify/react-native-skia/lib/commonjs/skia/types';
import { SurfacePool } from './surfaces';

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
 *  side, 1-2-1 on an odd one, 1 on a side of 1; the sum truncated). The
 *  reference the renderer's Skia halving (ChromeSampling.halveOnce) is held
 *  to; the renderer itself never runs this loop. */
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

/* One halving as Skia's mip step does it (the JavaScript `halve` above, the
   same taps, weights and truncation), drawn by Skia itself: a runtime shader
   on a CPU surface reads the 2 or 3 pixels each way at their centres
   (nearest, so each tap is the pixel's own 8-bit number), sums them with the
   whole-number weights and truncates, so the result is `halve`'s byte for
   byte (test/sampling.test.ts holds the two together on real photos). On the
   phone a JavaScript loop over a 12 MP photo takes seconds; this is native. */
const halveTaps = (n: number): [number, number][] => (n === 1 ? [[0, 1]] : n % 2 === 0 ? [[0, 1], [1, 1]] : [[0, 1], [1, 2], [2, 1]]);

function halveSksl(w: number, h: number): string {
  const xt = halveTaps(w), yt = halveTaps(h);
  const total = xt.reduce((n, t) => n + t[1], 0) * yt.reduce((n, t) => n + t[1], 0);
  const taps: string[] = [];
  for (const [dy, wy] of yt) {
    for (const [dx, wx] of xt) taps.push(`s += ${wx * wy}.0 * floor(float4(img.eval(o + float2(${dx}.0, ${dy}.0))) * 255.0 + 0.5);`);
  }
  return `
uniform shader img;
half4 main(float2 p) {
  float2 o = floor(p) * 2.0 + 0.5;
  float4 s = float4(0.0);
  ${taps.join('\n  ')}
  return half4(floor(s / ${total}.0) / 255.0);
}`;
}

const halveEffects = new WeakMap<object, Map<string, SkRuntimeEffect>>();

/** The pictures prepared Chrome's way, kept per picture and level. */
export class ChromeSampling {
  private readonly ready = new Map<SkImage, Map<number, SkImage>>();

  /** `surfaces`: where the halving surfaces come from (the drawer's own pool). */
  constructor(private readonly Skia: Skia, private readonly surfaces: SurfacePool = new SurfacePool(Skia)) {}

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
    let out: SkImage;
    if (level === 0) out = this.premultiplied(img);
    else {
      // Halved from the level above (kept too: a smaller draw of the same
      // picture on the page starts from it), as Chrome builds its mip chain.
      out = this.halveOnce(this.decoded(img, level - 1));
    }
    byLevel.set(level, out);
    return out;
  }

  /** The picture with premultiplied pixels (Chrome decodes to premultiplied
   *  pixels): itself when it is opaque or already premultiplied (the
   *  phone's Skia decodes a PNG or JPEG premultiplied), else read back
   *  premultiplied (CanvasKit in Node decodes a file with see-through
   *  pixels unpremultiplied). Reading back on the phone would put a full
   *  copy of every photo into JavaScript's memory on every page. */
  private premultiplied(img: SkImage): SkImage {
    const alpha = img.getImageInfo().alphaType;
    if (alpha === AlphaType.Opaque || alpha === AlphaType.Premul) return img;
    const w = img.width(), h = img.height();
    const px = img.readPixels(0, 0, this.premulInfo(w, h));
    if (!(px instanceof Uint8Array)) throw new Error('could not read a picture back to prepare it');
    const data = this.Skia.Data.fromBytes(px);
    const made = this.Skia.Image.MakeImage(this.premulInfo(w, h), data, w * 4);
    data.dispose(); // the picture keeps its own hold on the bytes
    if (!made) throw new Error('could not make the prepared picture');
    return made;
  }

  /** One halving of a premultiplied picture, drawn by Skia: `halve`'s taps,
   *  weights and truncation, byte for byte (test/sampling.test.ts). */
  halveOnce(img: SkImage): SkImage {
    const w = img.width(), h = img.height();
    const W = Math.max(1, Math.floor(w / 2)), H = Math.max(1, Math.floor(h / 2));
    const d = this.surfaces.take(W, H);
    const p = this.Skia.Paint();
    p.setBlendMode(BlendMode.Src);
    const child = img.makeShaderOptions(TileMode.Clamp, TileMode.Clamp, FilterMode.Nearest, MipmapMode.None);
    const shader = this.halveEffect(w, h).makeShaderWithChildren([], [child]);
    child.dispose();
    p.setShader(shader);
    d.canvas.drawRect(this.Skia.XYWHRect(0, 0, W, H), p);
    p.dispose();
    shader.dispose();
    const snap = this.surfaces.snapshot(d);
    // The phone's Skia makes premultiplied surfaces, CanvasKit (Node)
    // unpremultiplied ones; a picture with see-through pixels must be
    // premultiplied to be filtered as Chrome filters it (rule 3), so a
    // copy that comes back unpremultiplied is turned round (losslessly:
    // 8-bit premultiplied -> unpremultiplied -> premultiplied is exact).
    if (snap.getImageInfo().alphaType !== AlphaType.Unpremul) return snap;
    const px = snap.readPixels(0, 0, this.premulInfo(W, H));
    snap.dispose();
    if (!(px instanceof Uint8Array)) throw new Error('could not read a halved picture back');
    const data = this.Skia.Data.fromBytes(px);
    const made = this.Skia.Image.MakeImage(this.premulInfo(W, H), data, W * 4);
    data.dispose();
    if (!made) throw new Error('could not make the halved picture');
    return made;
  }

  private halveEffect(w: number, h: number): SkRuntimeEffect {
    const key = `${halveTaps(w).length}x${halveTaps(h).length}`;
    let byKey = halveEffects.get(this.Skia);
    if (!byKey) { byKey = new Map(); halveEffects.set(this.Skia, byKey); }
    let e = byKey.get(key);
    if (!e) {
      const made = this.Skia.RuntimeEffect.Make(halveSksl(w, h));
      if (!made) throw new Error('the halving shader did not compile');
      e = made;
      byKey.set(key, e);
    }
    return e;
  }

  /** The older bilinear for `img`'s `src` drawn into `dst` (dst's own
   *  space). The caller disposes the shader once it has drawn. */
  levelShader(img: SkImage, src: Rect, dst: Rect): SkShader {
    const child = img.makeShaderOptions(TileMode.Clamp, TileMode.Clamp, FilterMode.Linear, MipmapMode.None);
    const kx = dst.w / src.w, ky = dst.h / src.h;
    const m = this.Skia.Matrix();
    m.translate(dst.x, dst.y);
    m.scale(kx, ky);
    m.translate(-src.x, -src.y);
    const bounds = [src.x + 0.5, src.y + 0.5, src.x + src.w - 0.5, src.y + src.h - 0.5];
    const shader = this.effect().makeShaderWithChildren(bounds, [child], m);
    child.dispose();
    return shader;
  }

  /** Let go of every prepared copy (not the pictures themselves). */
  dispose(): void {
    this.ready.forEach((byLevel, img) => byLevel.forEach((p) => { if (p !== img) p.dispose(); }));
    this.ready.clear();
  }
}
