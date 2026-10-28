/* ══════════════════════════════════════════════════════════════════════════
   A PRESS-SHEET PDF AS JPEG PICTURES, drawn by the app with Skia.

   The console's "Sheets as JPEG" draws each sheet side FROM the sheet PDF it
   makes (pressSheetJpeg.ts, with pdf.js), so a picture is exactly the PDF
   sheet: same spots, marks and labels. The app does the same: the sheet PDF
   comes from the very same code (printSheetPdf.ts, shared), and this file
   draws it. It is not a general PDF reader. It draws what pdf-lib writes for
   those sheets and what the print files put in them (pdf-lib's here, jsPDF's
   on the website): pages placed whole, turned and clipped; pictures (JPEG,
   or see-through PNG words and labels); cut lines, dashed fold lines and
   white patches. Anything else in a file stops it with the operator's name,
   so a new kind of mark on the sheets can't go missing from the pictures
   without a failing test (test/printFiles.test.ts).

   Coordinates: a PDF page is in points from its bottom-left; the picture is
   drawn at `dpi` from its top-left.
   ══════════════════════════════════════════════════════════════════════════ */

import type { SkCanvas, SkImage, SkPaint, Skia } from '@shopify/react-native-skia/lib/commonjs/skia/types';
import { AlphaType, ClipOp, ColorType, FilterMode, ImageFormat, MipmapMode, PaintStyle, StrokeCap, StrokeJoin } from '@shopify/react-native-skia/lib/commonjs/skia/types';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFRawStream, PDFRef, decodePDFRawStream, type PDFContext, type PDFObject } from 'pdf-lib';
import { setJpegDpi } from '@web/lib/jpegZip';

/** How each picture is drawn. pdf.js draws a picture that is made bigger
 *  without smoothing unless the PDF asks for it (getImageSmoothingEnabled:
 *  the /Interpolate flag), and smooths one made smaller: the same here. */
export interface RasterOptions {
  dpi: number;
  /** JPEG quality, 0 to 100. */
  quality: number;
  /** After each page: done, total. */
  onPage?: (done: number, total: number) => void;
}

type Token = number | string | { name: string } | Token[];
type Mat = [number, number, number, number, number, number];

const IDENTITY: Mat = [1, 0, 0, 1, 0, 0];

/** m1 then m2 (PDF order: a point goes through m1 first). */
function mul(m1: Mat, m2: Mat): Mat {
  const [a, b, c, d, e, f] = m1;
  const [A, B, C, D, E, F] = m2;
  return [a * A + b * C, a * B + b * D, c * A + d * C, c * B + d * D, e * A + f * C + E, e * B + f * D + F];
}

/** Split a content stream into operands and operators. */
export function tokenize(bytes: Uint8Array): { operands: Token[]; op: string }[] {
  const out: { operands: Token[]; op: string }[] = [];
  const stack: Token[][] = [[]];
  let i = 0;
  const n = bytes.length;
  const isWhite = (c: number) => c === 0x20 || c === 0x0a || c === 0x0d || c === 0x09 || c === 0x0c || c === 0x00;
  const isDelim = (c: number) => c === 0x28 || c === 0x29 || c === 0x3c || c === 0x3e || c === 0x5b || c === 0x5d || c === 0x7b || c === 0x7d || c === 0x2f || c === 0x25;
  const top = () => stack[stack.length - 1];
  while (i < n) {
    const c = bytes[i];
    if (isWhite(c)) { i++; continue; }
    if (c === 0x25) { while (i < n && bytes[i] !== 0x0a && bytes[i] !== 0x0d) i++; continue; } // % comment
    if (c === 0x5b) { stack.push([]); i++; continue; }
    if (c === 0x5d) {
      const arr = stack.pop();
      if (!arr || !stack.length) throw new Error('sheetRaster: unbalanced ] in a content stream');
      top().push(arr);
      i++;
      continue;
    }
    if (c === 0x2f) { // /Name
      let j = i + 1;
      while (j < n && !isWhite(bytes[j]) && !isDelim(bytes[j])) j++;
      top().push({ name: String.fromCharCode(...bytes.subarray(i + 1, j)) });
      i = j;
      continue;
    }
    if (c === 0x28 || c === 0x3c) throw new Error('sheetRaster: a string or dictionary in a content stream (text is not drawn here)');
    let j = i;
    while (j < n && !isWhite(bytes[j]) && !isDelim(bytes[j])) j++;
    if (j === i) throw new Error(`sheetRaster: unexpected byte ${c} in a content stream`);
    const word = String.fromCharCode(...bytes.subarray(i, j));
    i = j;
    if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(word)) { top().push(parseFloat(word)); continue; }
    if (stack.length !== 1) throw new Error(`sheetRaster: operator ${word} inside an array`);
    out.push({ operands: stack[0], op: word });
    stack[0] = [];
  }
  return out;
}

const num = (t: Token | undefined): number => {
  if (typeof t !== 'number') throw new Error('sheetRaster: a number was expected');
  return t;
};

/** A PNG predictor (DecodeParms /Predictor ≥ 10) undone: jsPDF writes its
 *  PNG pictures this way. */
function unpredict(data: Uint8Array, colors: number, columns: number): Uint8Array {
  const bpp = colors;
  const row = columns * colors;
  const rows = Math.floor(data.length / (row + 1));
  const out = new Uint8Array(rows * row);
  for (let r = 0; r < rows; r++) {
    const type = data[r * (row + 1)];
    const src = r * (row + 1) + 1;
    const dst = r * row;
    for (let x = 0; x < row; x++) {
      const raw = data[src + x];
      const left = x >= bpp ? out[dst + x - bpp] : 0;
      const up = r > 0 ? out[dst - row + x] : 0;
      const upLeft = r > 0 && x >= bpp ? out[dst - row + x - bpp] : 0;
      let v: number;
      switch (type) {
        case 0: v = raw; break;
        case 1: v = raw + left; break;
        case 2: v = raw + up; break;
        case 3: v = raw + ((left + up) >> 1); break;
        case 4: {
          const p = left + up - upLeft;
          const pa = Math.abs(p - left), pb = Math.abs(p - up), pc = Math.abs(p - upLeft);
          v = raw + (pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft);
          break;
        }
        default: throw new Error(`sheetRaster: PNG predictor ${type}`);
      }
      out[dst + x] = v & 0xff;
    }
  }
  return out;
}

export class SheetRaster {
  constructor(private readonly Skia: Skia) {}

  private lookup(ctx: PDFContext, o: PDFObject | undefined): PDFObject | undefined {
    return o instanceof PDFRef ? ctx.lookup(o) : o;
  }

  private nameOf(ctx: PDFContext, dict: PDFDict, key: string): string | null {
    const v = this.lookup(ctx, dict.get(PDFName.of(key)));
    return v instanceof PDFName ? v.decodeText() : null;
  }

  private numOf(ctx: PDFContext, dict: PDFDict, key: string): number | null {
    const v = this.lookup(ctx, dict.get(PDFName.of(key)));
    return v instanceof PDFNumber ? v.asNumber() : null;
  }

  private filters(ctx: PDFContext, dict: PDFDict): string[] {
    const f = this.lookup(ctx, dict.get(PDFName.of('Filter')));
    if (f instanceof PDFName) return [f.decodeText()];
    if (f instanceof PDFArray) return f.asArray().map((x) => (this.lookup(ctx, x) as PDFName).decodeText());
    return [];
  }

  /** A stream's bytes with its filters undone (FlateDecode, PNG predictor). */
  private decoded(ctx: PDFContext, s: PDFRawStream): Uint8Array {
    const bytes = decodePDFRawStream(s).decode();
    const parms = this.lookup(ctx, s.dict.get(PDFName.of('DecodeParms')));
    if (parms instanceof PDFDict) {
      const predictor = this.numOf(ctx, parms, 'Predictor') ?? 1;
      if (predictor >= 10) {
        const bpc = this.numOf(ctx, parms, 'BitsPerComponent') ?? 8;
        if (bpc !== 8) throw new Error(`sheetRaster: ${bpc}-bit predicted picture`);
        return unpredict(bytes, this.numOf(ctx, parms, 'Colors') ?? 1, this.numOf(ctx, parms, 'Columns') ?? 1);
      }
      if (predictor !== 1) throw new Error(`sheetRaster: TIFF predictor ${predictor}`);
    }
    return bytes;
  }

  /** An image XObject as a Skia picture (the caller disposes it). */
  private image(ctx: PDFContext, s: PDFRawStream): SkImage {
    const d = s.dict;
    const filters = this.filters(ctx, d);
    if (filters.length === 1 && filters[0] === 'DCTDecode') {
      if (d.get(PDFName.of('SMask'))) throw new Error('sheetRaster: a JPEG with a see-through mask');
      const img = this.Skia.Image.MakeImageFromEncoded(this.Skia.Data.fromBytes(s.contents));
      if (!img) throw new Error('sheetRaster: a JPEG in the file did not decode');
      return img;
    }
    if (filters.some((f) => f !== 'FlateDecode')) throw new Error(`sheetRaster: picture filter ${filters.join(', ')}`);
    const w = this.numOf(ctx, d, 'Width') ?? 0;
    const h = this.numOf(ctx, d, 'Height') ?? 0;
    const bpc = this.numOf(ctx, d, 'BitsPerComponent') ?? 8;
    if (bpc !== 8) throw new Error(`sheetRaster: ${bpc}-bit picture`);
    const cs = this.nameOf(ctx, d, 'ColorSpace');
    const colors = cs === 'DeviceRGB' ? 3 : cs === 'DeviceGray' ? 1 : 0;
    if (!colors) throw new Error(`sheetRaster: picture colour space ${cs ?? 'unknown'}`);
    if (d.get(PDFName.of('Mask')) || d.get(PDFName.of('Decode'))) throw new Error('sheetRaster: a picture with a colour-key mask or a decode array');
    const px = this.decoded(ctx, s);
    if (px.length < w * h * colors) throw new Error('sheetRaster: a picture shorter than its size');
    let alpha: Uint8Array | null = null;
    const smask = this.lookup(ctx, d.get(PDFName.of('SMask')));
    if (smask instanceof PDFRawStream) {
      if ((this.numOf(ctx, smask.dict, 'Width') ?? 0) !== w || (this.numOf(ctx, smask.dict, 'Height') ?? 0) !== h) {
        throw new Error('sheetRaster: a see-through mask of another size');
      }
      alpha = this.decoded(ctx, smask);
    }
    const rgba = new Uint8Array(w * h * 4);
    for (let i = 0, j = 0; i < w * h; i++, j += colors) {
      rgba[i * 4] = px[j];
      rgba[i * 4 + 1] = colors === 3 ? px[j + 1] : px[j];
      rgba[i * 4 + 2] = colors === 3 ? px[j + 2] : px[j];
      rgba[i * 4 + 3] = alpha ? alpha[i] : 255;
    }
    const img = this.Skia.Image.MakeImage({ width: w, height: h, colorType: ColorType.RGBA_8888, alphaType: AlphaType.Unpremul }, this.Skia.Data.fromBytes(rgba), w * 4);
    if (!img) throw new Error('sheetRaster: could not make a picture');
    return img;
  }

  private contentOf(ctx: PDFContext, contents: PDFObject | undefined): Uint8Array {
    const c = this.lookup(ctx, contents);
    const streams = c instanceof PDFArray ? c.asArray().map((x) => this.lookup(ctx, x)) : c ? [c] : [];
    const parts = streams.map((s) => {
      if (!(s instanceof PDFRawStream)) throw new Error('sheetRaster: a content stream that is not a stream');
      return this.decoded(ctx, s);
    });
    // Streams are joined with a space between them (a token never runs across).
    const total = parts.reduce((t, p) => t + p.length + 1, 0);
    const out = new Uint8Array(total);
    let at = 0;
    for (const p of parts) { out.set(p, at); at += p.length; out[at++] = 0x20; }
    return out;
  }

  private matrix(m: Mat) {
    const [a, b, c, d, e, f] = m;
    return this.Skia.Matrix([a, c, e, b, d, f, 0, 0, 1]);
  }

  private paint(rgb: [number, number, number], stroke: boolean, gs: State): SkPaint {
    const p = this.Skia.Paint();
    p.setAntiAlias(true);
    p.setColor(this.Skia.Color(`rgb(${Math.round(rgb[0] * 255)}, ${Math.round(rgb[1] * 255)}, ${Math.round(rgb[2] * 255)})`));
    if (stroke) {
      p.setStyle(PaintStyle.Stroke);
      p.setStrokeWidth(gs.lineWidth);
      p.setStrokeCap(gs.lineCap === 1 ? StrokeCap.Round : gs.lineCap === 2 ? StrokeCap.Square : StrokeCap.Butt);
      p.setStrokeJoin(gs.lineJoin === 1 ? StrokeJoin.Round : gs.lineJoin === 2 ? StrokeJoin.Bevel : StrokeJoin.Miter);
      p.setStrokeMiter(gs.miter);
      if (gs.dash.length && gs.dash.some((v) => v > 0)) {
        const intervals = gs.dash.length % 2 ? [...gs.dash, ...gs.dash] : gs.dash;
        p.setPathEffect(this.Skia.PathEffect.MakeDash(intervals, gs.dashPhase));
      }
    }
    return p;
  }

  /** Run a content stream on `canvas` (its matrix already set for this
   *  stream's space). `images` keeps the pictures decoded for this page. */
  private run(canvas: SkCanvas, ctx: PDFContext, content: Uint8Array, resources: PDFDict | undefined, images: Map<string, SkImage>, ctm: Mat, depth: number): void {
    if (depth > 8) throw new Error('sheetRaster: forms nested too deep');
    const Sk = this.Skia;
    let gs: State = newState(ctm);
    const saved: State[] = [];
    let path = Sk.PathBuilder.Make();
    let pathEmpty = true;
    let clipNext = false;
    const finishPath = (paint?: () => void) => {
      if (paint) paint();
      if (clipNext) {
        canvas.clipPath(path.build(), ClipOp.Intersect, true);
        clipNext = false;
      }
      path = Sk.PathBuilder.Make();
      pathEmpty = true;
    };
    const xobjects = resources ? this.lookup(ctx, resources.get(PDFName.of('XObject'))) : undefined;
    for (const { operands: o, op } of tokenize(content)) {
      switch (op) {
        case 'q': saved.push({ ...gs, dash: [...gs.dash] }); canvas.save(); break;
        case 'Q': {
          const prev = saved.pop();
          if (!prev) throw new Error('sheetRaster: Q without q');
          gs = prev;
          canvas.restore();
          break;
        }
        case 'cm': {
          const m: Mat = [num(o[0]), num(o[1]), num(o[2]), num(o[3]), num(o[4]), num(o[5])];
          canvas.concat(this.matrix(m));
          gs.ctm = mul(m, gs.ctm);
          break;
        }
        case 'w': gs.lineWidth = num(o[0]); break;
        case 'J': gs.lineCap = num(o[0]); break;
        case 'j': gs.lineJoin = num(o[0]); break;
        case 'M': gs.miter = num(o[0]); break;
        case 'd': {
          const arr = o[0];
          if (!Array.isArray(arr)) throw new Error('sheetRaster: a dash without an array');
          gs.dash = arr.map(num);
          gs.dashPhase = num(o[1]);
          break;
        }
        case 'gs': break; // pdf-lib names an empty graphics state; the sheets use no opacity
        case 'RG': gs.stroke = [num(o[0]), num(o[1]), num(o[2])]; break;
        case 'rg': gs.fill = [num(o[0]), num(o[1]), num(o[2])]; break;
        case 'G': gs.stroke = [num(o[0]), num(o[0]), num(o[0])]; break;
        case 'g': gs.fill = [num(o[0]), num(o[0]), num(o[0])]; break;
        case 'm': path.moveTo(num(o[0]), num(o[1])); pathEmpty = false; break;
        case 'l': path.lineTo(num(o[0]), num(o[1])); pathEmpty = false; break;
        case 'c': path.cubicTo(num(o[0]), num(o[1]), num(o[2]), num(o[3]), num(o[4]), num(o[5])); pathEmpty = false; break;
        case 'h': path.close(); break;
        case 're': path.addRect(Sk.XYWHRect(num(o[0]), num(o[1]), num(o[2]), num(o[3]))); pathEmpty = false; break;
        case 'W': clipNext = true; break;
        case 'n': finishPath(); break;
        case 'S': { const g = gs; finishPath(() => { if (!pathEmpty) canvas.drawPath(path.build(), this.paint(g.stroke, true, g)); }); break; }
        case 'f': case 'F': { const g = gs; finishPath(() => { if (!pathEmpty) canvas.drawPath(path.build(), this.paint(g.fill, false, g)); }); break; }
        case 'B': {
          const g = gs;
          finishPath(() => {
            if (pathEmpty) return;
            const p = path.build();
            canvas.drawPath(p, this.paint(g.fill, false, g));
            canvas.drawPath(p, this.paint(g.stroke, true, g));
          });
          break;
        }
        case 'Do': {
          const name = o[0];
          if (!name || typeof name !== 'object' || Array.isArray(name)) throw new Error('sheetRaster: Do without a name');
          if (!(xobjects instanceof PDFDict)) throw new Error('sheetRaster: Do on a page with no XObjects');
          const ref = xobjects.get(PDFName.of(name.name));
          const x = this.lookup(ctx, ref);
          if (!(x instanceof PDFRawStream)) throw new Error(`sheetRaster: XObject ${name.name} is not a stream`);
          const subtype = this.nameOf(ctx, x.dict, 'Subtype');
          if (subtype === 'Image') {
            const key = ref instanceof PDFRef ? ref.toString() : name.name;
            let img = images.get(key);
            if (!img) { img = this.image(ctx, x); images.set(key, img); }
            this.drawImage(canvas, img, gs.ctm, x.dict, ctx);
          } else if (subtype === 'Form') {
            const bbox = this.lookup(ctx, x.dict.get(PDFName.of('BBox')));
            const mtx = this.lookup(ctx, x.dict.get(PDFName.of('Matrix')));
            const formRes = this.lookup(ctx, x.dict.get(PDFName.of('Resources')));
            canvas.save();
            let m: Mat = IDENTITY;
            if (mtx instanceof PDFArray) {
              const v = mtx.asArray().map((e) => (this.lookup(ctx, e) as PDFNumber).asNumber());
              m = [v[0], v[1], v[2], v[3], v[4], v[5]];
              canvas.concat(this.matrix(m));
            }
            if (bbox instanceof PDFArray) {
              const [x0, y0, x1, y1] = bbox.asArray().map((e) => (this.lookup(ctx, e) as PDFNumber).asNumber());
              canvas.clipRect(Sk.XYWHRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0)), ClipOp.Intersect, true);
            }
            this.run(canvas, ctx, this.decoded(ctx, x), formRes instanceof PDFDict ? formRes : resources, images, mul(m, gs.ctm), depth + 1);
            canvas.restore();
          } else {
            throw new Error(`sheetRaster: XObject subtype ${subtype ?? 'none'}`);
          }
          break;
        }
        default:
          throw new Error(`sheetRaster: PDF operator "${op}" is not drawn here`);
      }
    }
    if (saved.length) throw new Error('sheetRaster: q without Q');
  }

  /** A picture over the unit square of the current space, its first row at
   *  the top, the way pdf.js paints it (paintInlineImageXObject): smoothed
   *  only when it is drawn at most 4/3 device pixels per picture pixel, or
   *  when the PDF asks (/Interpolate); and a picture that is not turned (or
   *  turned exactly a quarter) is drawn on whole device pixels
   *  (drawImageAtIntegerCoords). */
  private drawImage(canvas: SkCanvas, img: SkImage, ctm: Mat, dict: PDFDict, ctx: PDFContext): void {
    const w = img.width(), h = img.height();
    const T = mul([1 / w, 0, 0, -1 / h, 0, 0], ctm);
    const [a, b, c, d, tx, ty] = T;
    const interpolate = String(this.lookup(ctx, dict.get(PDFName.of('Interpolate')))) === 'true';
    const smooth = interpolate || imageSmoothing(T);
    const p = this.Skia.Paint();
    const src = this.Skia.XYWHRect(0, 0, w, h);
    const draw = (dst: { x: number; y: number; w: number; h: number }) =>
      canvas.drawImageRectOptions(img, src, this.Skia.XYWHRect(dst.x, dst.y, dst.w, dst.h), smooth ? FilterMode.Linear : FilterMode.Nearest, MipmapMode.None, p);
    canvas.save();
    if ((b === 0 && c === 0) || (a === 0 && d === 0)) {
      // Device space, then pdf.js's own transform for the picture.
      canvas.concat(this.matrix(invert(ctm)));
      if (b === 0 && c === 0) {
        const rTlX = Math.round(tx), rTlY = Math.round(-h * d + ty);
        const rW = Math.abs(Math.round(w * a + tx) - rTlX) || 1;
        const rH = Math.abs(Math.round(ty) - rTlY) || 1;
        canvas.concat(this.matrix([Math.sign(a), 0, 0, Math.sign(d), rTlX, rTlY]));
        draw({ x: 0, y: 0, w: rW, h: rH });
      } else {
        const rTlX = Math.round(-h * c + tx), rTlY = Math.round(ty);
        const rW = Math.abs(Math.round(tx) - rTlX) || 1;
        const rH = Math.abs(Math.round(w * b + ty) - rTlY) || 1;
        canvas.concat(this.matrix([0, Math.sign(b), Math.sign(c), 0, rTlX, rTlY]));
        draw({ x: 0, y: 0, w: rH, h: rW });
      }
    } else {
      canvas.concat(this.matrix([1 / w, 0, 0, -1 / h, 0, 0]));
      p.setAntiAlias(true);
      draw({ x: 0, y: -h, w, h });
    }
    canvas.restore();
  }

  /** Each page of `pdf` as a JPEG at `dpi` on white, marked with that DPI
   *  (setJpegDpi) so it opens at its real size. One page's pixels at a time. */
  async toJpegs(pdf: Uint8Array, { dpi, quality, onPage }: RasterOptions): Promise<Uint8Array[]> {
    const doc = await PDFDocument.load(pdf);
    const ctx = doc.context;
    const pages = doc.getPages();
    const out: Uint8Array[] = [];
    const s = dpi / 72;
    for (const [n, page] of pages.entries()) {
      const { width, height } = page.getSize();
      const W = Math.round(width * s), H = Math.round(height * s);
      const surface = this.Skia.Surface.Make(W, H);
      if (!surface) throw new Error(`could not make a ${W}×${H} drawing surface`);
      const canvas = surface.getCanvas();
      const white = this.Skia.Paint();
      white.setColor(this.Skia.Color('#ffffff'));
      canvas.drawRect(this.Skia.XYWHRect(0, 0, W, H), white);
      const device: Mat = [s, 0, 0, -s, 0, height * s];
      canvas.concat(this.matrix(device));
      const images = new Map<string, SkImage>();
      try {
        this.run(canvas, ctx, this.contentOf(ctx, page.node.get(PDFName.of('Contents'))), page.node.Resources(), images, device, 0);
        surface.flush();
        const snap = surface.makeImageSnapshot();
        const jpeg = snap.encodeToBytes(ImageFormat.JPEG, quality);
        snap.dispose();
        out.push(setJpegDpi(jpeg, dpi));
      } finally {
        images.forEach((img) => img.dispose());
        surface.dispose();
      }
      onPage?.(n + 1, pages.length);
      // Let the phone breathe between 85 MB sheets.
      await new Promise((r) => setTimeout(r, 0));
    }
    return out;
  }
}

interface State {
  ctm: Mat;
  lineWidth: number;
  lineCap: number;
  lineJoin: number;
  miter: number;
  dash: number[];
  dashPhase: number;
  stroke: [number, number, number];
  fill: [number, number, number];
}

/** pdf.js getImageSmoothingEnabled: at most 4/3 device pixels (CSS px per
 *  PDF point at devicePixelRatio 1) per picture pixel on both axes. */
function imageSmoothing(m: Mat): boolean {
  const [m0, m1, m2, m3] = m;
  const a = m0 * m0 + m1 * m1;
  const b = m0 * m2 + m1 * m3;
  const c = m2 * m0 + m3 * m1;
  const d = m2 * m2 + m3 * m3;
  const first = (a + d) / 2;
  const second = Math.sqrt((a + d) ** 2 - 4 * (a * d - c * b)) / 2;
  const sx = Math.fround(Math.sqrt(first + second || 1));
  const sy = Math.fround(Math.sqrt(first - second || 1));
  const actual = Math.fround(96 / 72);
  return sx <= actual && sy <= actual;
}

function invert(m: Mat): Mat {
  const [a, b, c, d, e, f] = m;
  const det = a * d - b * c;
  if (!det) throw new Error('sheetRaster: a flat transform');
  return [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det];
}

function newState(ctm: Mat): State {
  return { ctm, lineWidth: 1, lineCap: 0, lineJoin: 0, miter: 10, dash: [], dashPhase: 0, stroke: [0, 0, 0], fill: [0, 0, 0] };
}
