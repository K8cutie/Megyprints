/* ══════════════════════════════════════════════════════════════════════════
   PAGE WORDS, drawn with Skia Paragraph (shaping, kerning and ligatures the
   way a browser does them) from the website's bundled font files.

   A line is measured and placed exactly as the website's canvas does it:
     • word by word: Chromium's canvas (fontKerning 'auto', the default)
       shapes each word and each space on its own, so a kerning pair across
       a space (Playfair Display has them) is never applied. Measured: "Our
       first beach day" at 80px is 687.92 px in Chromium, 684.88 shaped
       whole (= Chromium with fontKerning 'normal'), 687.92 word by word;
     • width = the sum of those advances (canvas measureText().width);
     • textAlign left / centre / right at the anchor x;
     • textBaseline 'middle' at y, from the font file (fontMetrics.ts), the
       glyphs snapped to the same pixel row as Chromium's (see paintLine);
     • the WordArt order of wordArt.ts drawWordArtText: the shadow is cast
       once (by the outline when there is one), the fill goes on top;
     • a canvas shadow is a blur with sigma = shadowBlur / 2, and both the
       blur and the offset are in page pixels whatever the transform (HTML
       spec), so a turned or stretched title drops its shadow straight down;
     • light letters on the phone: see below.
   The wrap itself is the website's (wordArtRules.wrapTextLines), given this
   file's measurer.

   LIGHT LETTERS ON THE PHONE. The phone's native Skia draws light letters
   (white, cream) thinner than the website's print files do, and dark ones
   the same: measured on the emulator, each text's ink against the
   website's, dark text 0.97 to 1.01, white and cream 0.82 (27 px) to 0.95
   (72 px) and 0.99 at 700 px: the shortfall is about the same fraction of a
   pixel on every edge, whatever the size. CanvasKit (the Node check) lands
   on the website's for every colour. (Drawing light letters in a grey and
   colouring them after, so Skia's glyph step treats them as darker, made
   them thinner still: tried on the emulator.) So on the phone a light
   colour's letters (Skia luminance 224 and up) are drawn with a hairline of
   weight: filled and outlined in their own colour, PHONE_LIGHT_WEIGHT_PX
   device pixels wide (an outline pass of a light colour gets as much more).
   The width was picked on the emulator from the trials the phone's golden
   run draws (LIGHT_WEIGHT_TRIALS; `npm run golden:phone` prints them):
   tried at 0, 0.2, 0.35 and 0.5 px on the 19 light texts of the golden pages
   and covers, the worst text's ink was 17.9%, 5.6%, 16.7% and 25.2% off the
   website's (bar 6%); at 0.2 px every one is within 0.96 to 1.06 of it.
   Colours between dark and light (luminance 128 to 223) are not in the
   golden set: not measured, drawn as before. In CanvasKit, and for every
   other colour, letters are drawn as before.
   ══════════════════════════════════════════════════════════════════════════ */

import type { SkCanvas, SkPaint, SkParagraph, SkTypefaceFontProvider, Skia } from '@shopify/react-native-skia/lib/commonjs/skia/types';
import { BlurStyle, FontSlant, FontWeight, PaintStyle, StrokeCap, StrokeJoin, TextAlign } from '@shopify/react-native-skia/lib/commonjs/skia/types';
import { wordArtShadow, TEXT_LINE_HEIGHT, type TextMeasurer, type WordArtStyle } from '@web/pages/builder/wordArtRules';
import { BUNDLED_FONTS, fontFileFor, paragraphFamilies, type BundledFont } from './fontTable';
import { middleToBaseline, readFontMetrics, type FontFileMetrics } from './fontMetrics';
import { isCanvasKit } from './surfaces';

export interface FontFile { font: BundledFont; bytes: Uint8Array }

export interface TextLook {
  /** The stored family string: '"Playfair Display", serif'. */
  family?: string;
  /** Print px. */
  size: number;
  bold?: boolean;
  italic?: boolean;
}

export type Align = 'left' | 'center' | 'right';

/** What a line of WordArt needs: its colour and its effects. */
export type LineStyle = WordArtStyle & { color?: string };

const LAYOUT_WIDTH = 1e7;
/** On the phone: the hairline of weight light letters get, device px (see
 *  "Light letters on the phone" above); 0 = none. */
export const PHONE_LIGHT_WEIGHT_PX = 0.2;
/** The widths the phone's golden run tries for light letters, device px, to
 *  pick PHONE_LIGHT_WEIGHT_PX from. */
export const LIGHT_WEIGHT_TRIALS: readonly number[] = [0, 0.15, 0.2, 0.25];
/** A colour this light (Skia's luminance, 0-255) gets the light weight. */
const LIGHT_FROM = 224;

/** Is `color` light enough for the light weight (SkComputeLuminance, the
 *  number Skia's glyph step picks its table by)? */
export function isLightColor(Sk: Skia, color: string): boolean {
  const c = Sk.Color(color);
  const lum = (Math.round(c[0] * 255) * 54 + Math.round(c[1] * 255) * 183 + Math.round(c[2] * 255) * 19) >> 8;
  return lum >= LIGHT_FROM;
}

/** The page fonts, loaded once: Skia's font provider and each file's metrics. */
export class PageText {
  /** The hairline light letters get, device px (0: none). */
  private lightWeight: number;
  private readonly provider: SkTypefaceFontProvider;
  private readonly loaded: { font: BundledFont; metrics: FontFileMetrics }[] = [];
  private readonly widths = new Map<string, number>();

  constructor(private readonly Skia: Skia, files: readonly FontFile[]) {
    this.lightWeight = isCanvasKit(Skia) ? 0 : PHONE_LIGHT_WEIGHT_PX;
    this.provider = Skia.TypefaceFontProvider.Make();
    for (const f of files) {
      const typeface = Skia.Typeface.MakeFreeTypeFaceFromData(Skia.Data.fromBytes(f.bytes));
      if (!typeface) throw new Error(`could not read the font file ${f.font.file}`);
      this.provider.registerFont(typeface, f.font.face);
      this.loaded.push({ font: f.font, metrics: readFontMetrics(f.bytes) });
    }
  }

  /** The golden run's light-weight trials only: give light letters `px`
   *  device px of weight (0: none). Returns what it was. */
  setLightWeight(px: number): number {
    const was = this.lightWeight;
    this.lightWeight = px;
    return was;
  }

  /** The weight `color`'s letters get, in the canvas's own units (0: none). */
  private weightFor(canvas: SkCanvas, color: string): number {
    if (!this.lightWeight || !isLightColor(this.Skia, color)) return 0;
    const m = canvas.getTotalMatrix().get();
    const k = Math.sqrt(Math.abs(m[0] * m[4] - m[1] * m[3])) || 1;
    return this.lightWeight / k;
  }

  /** Every bundled font must be given: the page renderer never guesses one. */
  static expectAll(files: readonly FontFile[]): void {
    const missing = BUNDLED_FONTS.filter((b) => !files.some((f) => f.font.file === b.file));
    if (missing.length) throw new Error(`fonts not loaded: ${missing.map((m) => m.file).join(', ')}`);
  }

  /** The face file a look draws with (fontTable fontFileFor: the same
   *  matching the page plan uses to say a font is not drawn exactly). */
  private fileFor(look: TextLook): { font: BundledFont; metrics: FontFileMetrics } | null {
    const want = fontFileFor(look);
    return want ? this.loaded.find((l) => l.font.file === want.file) ?? null : null;
  }

  private paragraph(text: string, look: TextLook, paint?: SkPaint): SkParagraph {
    const textStyle = {
      // A bundled face, or the stored list with its generic last (the phone's
      // serif / sans-serif, as Chrome on Android picks), never one bare name.
      fontFamilies: paragraphFamilies(look.family),
      fontSize: look.size,
      fontStyle: { weight: look.bold ? FontWeight.Bold : FontWeight.Normal, slant: look.italic ? FontSlant.Italic : FontSlant.Upright },
      color: this.Skia.Color('#000000'),
    };
    const builder = this.Skia.ParagraphBuilder.Make({ textStyle, textAlign: TextAlign.Left }, this.provider);
    if (paint) builder.pushStyle(textStyle, paint);
    else builder.pushStyle(textStyle);
    builder.addText(text);
    builder.pop();
    const p = builder.build();
    p.layout(LAYOUT_WIDTH);
    // CanvasKit's builder must be disposed (WebAssembly memory). The phone's
    // native builder has no dispose() at all (react-native-skia 2.14: its
    // memory is freed with the JS object), and calling it stopped every page
    // with words on the emulator ("undefined is not a function").
    const disposable = builder as unknown as { dispose?: () => void };
    if (typeof disposable.dispose === 'function') disposable.dispose();
    return p;
  }

  /** A line cut where Chromium's canvas shapes it: words and single spaces. */
  private static pieces(text: string): string[] {
    return text.split(/( )/).filter((s) => s.length > 0);
  }

  /** One piece's shaped advance, px. */
  private pieceWidth(text: string, look: TextLook): number {
    const key = `${look.family}|${look.size}|${look.bold ? 1 : 0}${look.italic ? 1 : 0}|${text}`;
    let w = this.widths.get(key);
    if (w == null) {
      if (!text) w = 0;
      else {
        const p = this.paragraph(text, look);
        w = p.getMaxIntrinsicWidth();
        p.dispose();
      }
      this.widths.set(key, w);
    }
    return w;
  }

  /** A line's advance width, px (canvas measureText().width): its pieces, shaped one by one. */
  measure(text: string, look: TextLook): number {
    return PageText.pieces(text).reduce((sum, p) => sum + this.pieceWidth(p, look), 0);
  }

  /** The website's wrap needs a measurer with the font already set. */
  measurer(look: TextLook): TextMeasurer {
    return { measureText: (s: string) => ({ width: this.measure(s, look) }) };
  }

  /** px from a line's middle down to its baseline (canvas textBaseline 'middle'). */
  middleToBaseline(look: TextLook): number {
    const f = this.fileFor(look);
    return f ? middleToBaseline(f.metrics, look.size) : look.size * 0.3;
  }

  private paintLine(canvas: SkCanvas, text: string, x: number, middleY: number, look: TextLook, align: Align, paint: SkPaint): void {
    if (!text) return;
    const width = this.measure(text, look);
    let left = align === 'left' ? x : align === 'right' ? x - width : x - width / 2;
    const baseline = middleY + this.middleToBaseline(look);
    for (const piece of PageText.pieces(text)) {
      if (piece !== ' ') {
        const p = this.paragraph(piece, look, paint);
        // Skia Paragraph draws a line's glyphs round(ascent) px below the top
        // it is painted at: a WHOLE number, not the baseline getLineMetrics
        // reports (which carries the line height's rounding). Painted so, the
        // glyphs' baseline is exactly `baseline`, and Skia snaps them to the
        // nearest pixel row as Chromium's Skia does. Calibrated against Skia's
        // own drawText at a known baseline: round(ascent) in 112 of 112
        // font/size cases, round(reported baseline) in 78.
        const lm = p.getLineMetrics()[0];
        p.paint(canvas, left, baseline - (lm ? Math.round(lm.ascent) : 0));
        p.dispose();
      }
      left += this.pieceWidth(piece, look);
    }
  }

  private solid(color: string, alpha: number): SkPaint {
    const paint = this.Skia.Paint();
    paint.setAntiAlias(true);
    paint.setColor(this.Skia.Color(color));
    if (alpha < 1) paint.setAlphaf(paint.getAlphaf() * alpha);
    return paint;
  }

  /** A page-pixel offset as an offset under the canvas's current transform.
   *  A canvas shadow's offset ignores the transform (HTML canvas spec:
   *  shadowOffsetX/Y are in the coordinate space's units before any
   *  transform), so a turned or stretched title still drops its shadow
   *  straight down on the page; drawn inside that title's rotate and scale,
   *  the offset has to be turned back through them. */
  private static pageOffset(canvas: SkCanvas, dx: number, dy: number): { x: number; y: number } {
    const m = canvas.getTotalMatrix().get();
    const a = m[0], c = m[1], b = m[3], d = m[4];
    const det = a * d - c * b;
    if (!det) return { x: dx, y: dy };
    return { x: (d * dx - c * dy) / det, y: (a * dy - b * dx) / det };
  }

  private blurred(paint: SkPaint, blur: number): SkPaint {
    if (blur > 0) paint.setMaskFilter(this.Skia.MaskFilter.MakeBlur(BlurStyle.Normal, blur / 2, false));
    return paint;
  }

  /** One pass of a line's letters (fill, outline or shadow) in `color` at
   *  `alpha`; `style` sets the pass's stroke or blur. A fill or an outline
   *  in a light colour gets the phone's light weight (see the top of this
   *  file): a fill is outlined that wide in its own colour too (in one layer
   *  when the colour is see-through, so the two never add up), an outline
   *  is drawn that much wider. */
  private inked(canvas: SkCanvas, text: string, x: number, middleY: number, look: TextLook, align: Align, color: string, alpha: number, style: ((p: SkPaint) => void) | null, kind: 'fill' | 'outline' | 'shadow'): void {
    if (!text) return;
    const weight = kind === 'shadow' ? 0 : this.weightFor(canvas, color);
    const p = this.solid(color, alpha);
    if (style) style(p);
    if (!weight) {
      this.paintLine(canvas, text, x, middleY, look, align, p);
      return;
    }
    if (kind === 'outline') {
      p.setStrokeWidth(p.getStrokeWidth() + weight);
      this.paintLine(canvas, text, x, middleY, look, align, p);
      return;
    }
    const a = p.getAlphaf();
    const layered = a < 1;
    if (layered) {
      const width = this.measure(text, look);
      const left = align === 'left' ? x : align === 'right' ? x - width : x - width / 2;
      const baseline = middleY + this.middleToBaseline(look);
      const m = look.size + weight + 2; // room for any glyph (swashes, accents, overhang)
      const layer = this.Skia.Paint();
      layer.setAlphaf(a);
      canvas.saveLayer(layer, this.Skia.XYWHRect(left - m, baseline - look.size - m, width + 2 * m, look.size * 1.5 + 2 * m));
      p.setAlphaf(1);
    }
    this.paintLine(canvas, text, x, middleY, look, align, p);
    p.setStyle(PaintStyle.Stroke);
    p.setStrokeJoin(StrokeJoin.Round);
    p.setStrokeWidth(weight);
    this.paintLine(canvas, text, x, middleY, look, align, p);
    if (layered) canvas.restore();
  }

  /** One line of WordArt: wordArt.ts drawWordArtText, in Skia. `scale` = what
   *  the font size was scaled by (outline and shadow follow it). */
  drawLine(canvas: SkCanvas, text: string, x: number, middleY: number, look: TextLook, align: Align, s: LineStyle, scale: number, alpha = 1, onCover = false): void {
    const color = s.color || '#2D2D2D';
    const outline = !!(s.outlineWidth && s.outlineColor);
    const sh = wordArtShadow(s, onCover);
    const strokeW = outline ? (s.outlineWidth as number) * scale : 0;
    const stroke = (p: SkPaint) => {
      p.setStyle(PaintStyle.Stroke);
      p.setStrokeJoin(StrokeJoin.Round);
      p.setStrokeWidth(strokeW);
    };
    if (sh) {
      // The shadow is cast once: by the outline when there is one.
      const blur = sh.blur * scale;
      const o = PageText.pageOffset(canvas, sh.offsetX * scale, sh.offsetY * scale);
      canvas.save();
      canvas.translate(o.x, o.y);
      this.inked(canvas, text, x, middleY, look, align, sh.color, alpha, (p) => { if (outline) stroke(p); this.blurred(p, blur); }, 'shadow');
      canvas.restore();
    }
    if (outline) this.inked(canvas, text, x, middleY, look, align, s.outlineColor as string, alpha, stroke, 'outline');
    this.inked(canvas, text, x, middleY, look, align, color, alpha, null, 'fill');
  }

  /** Underline drawn lines (wordArt.ts underlineTextLines): `firstY` is the
   *  first line's middle, lines TEXT_LINE_HEIGHT apart. */
  underline(canvas: SkCanvas, lines: readonly string[], x: number, firstY: number, look: TextLook, align: Align, color: string, alpha = 1): void {
    const step = look.size * TEXT_LINE_HEIGHT;
    const paint = this.solid(color, alpha);
    paint.setStyle(PaintStyle.Stroke);
    paint.setStrokeCap(StrokeCap.Butt);
    paint.setStrokeWidth(Math.max(1, look.size * 0.05));
    lines.forEach((line, i) => {
      const w = this.measure(line, look);
      const ux = align === 'left' ? x : align === 'right' ? x - w : x - w / 2;
      const uy = firstY + i * step + look.size * 0.5;
      canvas.drawLine(ux, uy, ux + w, uy, paint);
    });
  }
}
