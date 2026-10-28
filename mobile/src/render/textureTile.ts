/* ══════════════════════════════════════════════════════════════════════════
   A PAGE TEXTURE'S TILE (leather, linen, marble… in any tint), drawn with
   Skia from the website's own recipe.

   The website keeps each material as a small SVG (textures.ts
   textureDataUri: one 80 × 80 tile, a base colour, grain made with SVG
   noise filters, threads, flecks). Print loads that SVG as a picture, draws
   it at the print tile size (TEXTURE_TILE_PX design px × print px per design
   px: 256 px on an 8×8, 192 px on a 6×4) and repeats it over the page
   (printPipeline renderBackground, case 'texture').

   The app does not keep a second copy of the recipes: it asks textures.ts
   for the very same SVG text and draws it here. Only the few SVG parts the
   recipes use are understood (rect, line, circle, ellipse, a group with a
   stroke and an opacity, and a filter made of feTurbulence → feColorMatrix
   → feComponentTransfer); anything else stops with an error naming it, so
   a new recipe can't quietly print as something else.

   Drawn the way Chromium draws that SVG into the print canvas:
     • vector, at the tile's print size (not 80 px blown up);
     • the noise is Skia's own Perlin noise, the one Chromium's feTurbulence
       is made with: the same frequencies, octaves, seed and stitched 80 × 80
       tile, in the tile's own 80-unit space;
     • SVG filters work in linearRGB by default (color-interpolation-filters):
       the colour matrix and the alpha curve act on the noise as it comes,
       and the colour that comes out is turned into sRGB at the end;
     • a group's opacity is one see-through layer (crossing threads don't
       darken twice); a shape's own opacity is its paint's.
   ══════════════════════════════════════════════════════════════════════════ */

import { releaseSurface } from './surfaces';
import type { SkCanvas, SkImage, SkPaint, SkRuntimeEffect, SkShader, Skia } from '@shopify/react-native-skia/lib/commonjs/skia/types';
import { ClipOp, PaintStyle, StrokeCap } from '@shopify/react-native-skia/lib/commonjs/skia/types';
import { textureDataUri, TEXTURE_TILE_PX } from '@web/pages/builder/textures';

interface Node { tag: string; attrs: Record<string, string>; children: Node[] }

/** The SVG text → a tree (the recipes' plain XML: no text content, no entities). */
export function parseSvg(svg: string): Node {
  const root: Node = { tag: '#root', attrs: {}, children: [] };
  const stack: Node[] = [root];
  const tagRe = /<(\/?)([a-zA-Z][\w:-]*)([^>]*?)(\/?)>/g;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(svg))) {
    const [, closing, tag, rest, selfClosing] = m;
    if (closing) {
      const top = stack.pop();
      if (!top || top.tag !== tag) throw new Error(`texture SVG: </${tag}> does not close <${top?.tag}>`);
      continue;
    }
    const attrs: Record<string, string> = {};
    for (const a of rest.matchAll(/([a-zA-Z][\w:-]*)\s*=\s*"([^"]*)"/g)) attrs[a[1]] = a[2];
    const node: Node = { tag, attrs, children: [] };
    stack[stack.length - 1].children.push(node);
    if (!selfClosing) stack.push(node);
  }
  if (stack.length !== 1) throw new Error('texture SVG: an element is not closed');
  const svgNode = root.children[0];
  if (!svgNode || svgNode.tag !== 'svg') throw new Error('texture SVG: no <svg> root');
  return svgNode;
}

const num = (v: string | undefined, d = 0): number => {
  if (v == null) return d;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : d;
};

/** One filter, as the recipes build them. */
interface NoiseFilter {
  type: 'fractalNoise' | 'turbulence';
  freqX: number;
  freqY: number;
  octaves: number;
  seed: number;
  stitch: boolean;
  /** feColorMatrix values, 20 numbers, rows R G B A (identity if none). */
  matrix: number[];
  /** feFuncA type="gamma": amplitude, exponent, offset (null if none). */
  gammaA: [number, number, number] | null;
  /** The filter works in linearRGB (the SVG default). */
  linear: boolean;
}

const IDENTITY = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0];

function readFilter(f: Node): NoiseFilter {
  const x = f.attrs.x ?? '0', y = f.attrs.y ?? '0', w = f.attrs.width ?? '100%', h = f.attrs.height ?? '100%';
  if (x !== '0' || y !== '0' || w !== '100%' || h !== '100%') throw new Error(`texture SVG: filter region ${x} ${y} ${w} ${h} is not drawn by the app`);
  const out: Partial<NoiseFilter> = { matrix: IDENTITY, gammaA: null, linear: (f.attrs['color-interpolation-filters'] ?? 'linearRGB') !== 'sRGB' };
  f.children.forEach((p, i) => {
    if (p.tag === 'feTurbulence') {
      if (i !== 0) throw new Error('texture SVG: feTurbulence must come first');
      const [fx, fy] = (p.attrs.baseFrequency ?? '0').trim().split(/[\s,]+/).map((v) => num(v));
      out.type = p.attrs.type === 'fractalNoise' ? 'fractalNoise' : 'turbulence';
      out.freqX = fx;
      out.freqY = fy ?? fx;
      out.octaves = Math.round(num(p.attrs.numOctaves, 1));
      out.seed = num(p.attrs.seed, 0);
      out.stitch = p.attrs.stitchTiles === 'stitch';
    } else if (p.tag === 'feColorMatrix') {
      if ((p.attrs.type ?? 'matrix') !== 'matrix') throw new Error(`texture SVG: feColorMatrix type ${p.attrs.type} is not drawn by the app`);
      const v = (p.attrs.values ?? '').trim().split(/[\s,]+/).map((s) => num(s));
      if (v.length !== 20) throw new Error('texture SVG: feColorMatrix needs 20 values');
      out.matrix = v;
    } else if (p.tag === 'feComponentTransfer') {
      for (const fn of p.children) {
        if (fn.tag !== 'feFuncA' || fn.attrs.type !== 'gamma') throw new Error(`texture SVG: ${fn.tag} ${fn.attrs.type ?? ''} is not drawn by the app`);
        out.gammaA = [num(fn.attrs.amplitude, 1), num(fn.attrs.exponent, 1), num(fn.attrs.offset, 0)];
      }
    } else {
      throw new Error(`texture SVG: filter part <${p.tag}> is not drawn by the app`);
    }
  });
  if (!out.type) throw new Error('texture SVG: a filter without feTurbulence');
  return out as NoiseFilter;
}

/* The filter after the noise, in one Skia shader: the noise's colour (not
   premultiplied) through the colour matrix, clamped; the alpha curve; the
   colour turned from linearRGB into sRGB; premultiplied out. */
const FILTER_SKSL = `
uniform shader noise;
uniform float4 r0;
uniform float4 r1;
uniform float4 r2;
uniform float4 r3;
uniform float4 off;
uniform float4 gammaA;
uniform float toSrgb;
float enc(float c) { return c <= 0.0031308 ? 12.92 * c : 1.055 * pow(c, 1.0 / 2.4) - 0.055; }
half4 main(float2 p) {
  float4 c = float4(noise.eval(p));
  float3 rgb = c.a > 0.0 ? c.rgb / c.a : float3(0.0);
  float4 u = float4(rgb, c.a);
  float4 o = clamp(float4(dot(r0, u), dot(r1, u), dot(r2, u), dot(r3, u)) + off, 0.0, 1.0);
  if (gammaA.w > 0.5) o.a = clamp(gammaA.x * pow(o.a, gammaA.y) + gammaA.z, 0.0, 1.0);
  if (toSrgb > 0.5) o.rgb = float3(enc(o.r), enc(o.g), enc(o.b));
  return half4(half3(o.rgb * o.a), half(o.a));
}`;

const effects = new WeakMap<object, SkRuntimeEffect>();

function filterEffect(Sk: Skia): SkRuntimeEffect {
  let e = effects.get(Sk);
  if (!e) {
    const made = Sk.RuntimeEffect.Make(FILTER_SKSL);
    if (!made) throw new Error('the texture filter shader did not compile');
    e = made;
    effects.set(Sk, e);
  }
  return e;
}

function filterShader(Sk: Skia, f: NoiseFilter, tile: number): SkShader {
  const tw = f.stitch ? tile : 0, th = f.stitch ? tile : 0;
  const noise = f.type === 'fractalNoise'
    ? Sk.Shader.MakeFractalNoise(f.freqX, f.freqY, f.octaves, f.seed, tw, th)
    : Sk.Shader.MakeTurbulence(f.freqX, f.freqY, f.octaves, f.seed, tw, th);
  const m = f.matrix;
  const g = f.gammaA;
  const uniforms = [
    m[0], m[1], m[2], m[3],
    m[5], m[6], m[7], m[8],
    m[10], m[11], m[12], m[13],
    m[15], m[16], m[17], m[18],
    m[4], m[9], m[14], m[19],
    g ? g[0] : 1, g ? g[1] : 1, g ? g[2] : 0, g ? 1 : 0,
    f.linear ? 1 : 0,
  ];
  return filterEffect(Sk).makeShaderWithChildren(uniforms, [noise]);
}

/** Draw the recipe's SVG at `size` px square onto `canvas` (already empty). */
export function drawTextureSvg(Sk: Skia, canvas: SkCanvas, svg: string, size: number): void {
  const root = parseSvg(svg);
  const [vx, vy, vw, vh] = (root.attrs.viewBox ?? `0 0 ${root.attrs.width} ${root.attrs.height}`).split(/[\s,]+/).map((v) => num(v));
  if (vx !== 0 || vy !== 0 || vw !== vh) throw new Error(`texture SVG: viewBox ${root.attrs.viewBox} is not a square from 0 0`);
  const filters = new Map<string, NoiseFilter>();
  const paint = (color: string, alpha = 1): SkPaint => {
    const p = Sk.Paint();
    p.setAntiAlias(true);
    p.setColor(Sk.Color(color));
    if (alpha < 1) p.setAlphaf(p.getAlphaf() * alpha);
    return p;
  };

  canvas.save();
  canvas.clipRect(Sk.XYWHRect(0, 0, size, size), ClipOp.Intersect, true);
  canvas.scale(size / vw, size / vw);

  const draw = (n: Node, inherited: { stroke?: string; strokeWidth?: number }): void => {
    const a = n.attrs;
    switch (n.tag) {
      case 'defs':
        for (const f of n.children) {
          if (f.tag !== 'filter' || !f.attrs.id) throw new Error(`texture SVG: <${f.tag}> in defs is not drawn by the app`);
          filters.set(f.attrs.id, readFilter(f));
        }
        return;
      case 'rect': {
        if (num(a.x) !== 0 || num(a.y) !== 0) throw new Error('texture SVG: a rect off the tile origin');
        const r = Sk.XYWHRect(0, 0, num(a.width), num(a.height));
        if (a.filter) {
          const id = /^url\(#(.+)\)$/.exec(a.filter)?.[1];
          const f = id ? filters.get(id) : undefined;
          if (!f) throw new Error(`texture SVG: filter ${a.filter} not found`);
          const p = Sk.Paint();
          p.setAntiAlias(true);
          p.setShader(filterShader(Sk, f, vw));
          canvas.drawRect(r, p);
        } else if (a.fill && a.fill !== 'none') {
          canvas.drawRect(r, paint(a.fill, num(a.opacity, 1) * num(a['fill-opacity'], 1)));
        }
        return;
      }
      case 'circle':
      case 'ellipse': {
        const rx = n.tag === 'circle' ? num(a.r) : num(a.rx);
        const ry = n.tag === 'circle' ? num(a.r) : num(a.ry);
        const cx = num(a.cx), cy = num(a.cy);
        if (a.stroke && a.stroke !== 'none') throw new Error(`texture SVG: a stroked ${n.tag} is not drawn by the app`);
        canvas.drawOval(Sk.XYWHRect(cx - rx, cy - ry, rx * 2, ry * 2), paint(a.fill ?? '#000000', num(a.opacity, 1) * num(a['fill-opacity'], 1)));
        return;
      }
      case 'line': {
        const stroke = a.stroke ?? inherited.stroke;
        if (!stroke || stroke === 'none') return;
        const p = paint(stroke, num(a.opacity, 1));
        p.setStyle(PaintStyle.Stroke);
        p.setStrokeWidth(num(a['stroke-width'], inherited.strokeWidth ?? 1));
        p.setStrokeCap(StrokeCap.Butt);
        canvas.drawLine(num(a.x1), num(a.y1), num(a.x2), num(a.y2), p);
        return;
      }
      case 'g': {
        const opacity = num(a.opacity, 1);
        const next = { stroke: a.stroke ?? inherited.stroke, strokeWidth: a['stroke-width'] != null ? num(a['stroke-width']) : inherited.strokeWidth };
        if (opacity < 1) {
          const lp = Sk.Paint();
          lp.setAlphaf(opacity);
          canvas.saveLayer(lp);
        } else canvas.save();
        for (const c of n.children) draw(c, next);
        canvas.restore();
        return;
      }
      default:
        throw new Error(`texture SVG: <${n.tag}> is not drawn by the app`);
    }
  };
  for (const c of root.children) draw(c, {});
  canvas.restore();
}

/** The print tile's size, px: TEXTURE_TILE_PX design px at `printPerDesign`
 *  (print px per design px), as printPipeline rounds it. */
export function textureTilePx(printPerDesign: number): number {
  return Math.max(1, Math.round(TEXTURE_TILE_PX * printPerDesign));
}

/** One texture tile, `tilePx` square, as the print canvas has it before it
 *  repeats it. The caller disposes the image. */
export function makeTextureTile(Sk: Skia, name: string, color: string | undefined, tilePx: number): SkImage {
  const svg = decodeURIComponent(textureDataUri(name, color).slice('data:image/svg+xml,'.length));
  const surface = Sk.Surface.Make(tilePx, tilePx);
  if (!surface) throw new Error(`could not make a ${tilePx} px texture tile`);
  drawTextureSvg(Sk, surface.getCanvas(), svg, tilePx);
  surface.flush();
  const img = surface.makeImageSnapshot();
  releaseSurface(surface); // not dispose() on the phone: surfaces.ts says why
  return img;
}
