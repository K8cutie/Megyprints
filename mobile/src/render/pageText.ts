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
     • a canvas shadow is a blur with sigma = shadowBlur / 2 (HTML spec).
   The wrap itself is the website's (wordArtRules.wrapTextLines), given this
   file's measurer.
   ══════════════════════════════════════════════════════════════════════════ */

import type { SkCanvas, SkPaint, SkParagraph, SkTypefaceFontProvider, Skia } from '@shopify/react-native-skia/lib/commonjs/skia/types';
import { BlurStyle, FontSlant, FontWeight, PaintStyle, StrokeCap, StrokeJoin, TextAlign } from '@shopify/react-native-skia/lib/commonjs/skia/types';
import { wordArtShadow, TEXT_LINE_HEIGHT, type TextMeasurer, type WordArtStyle } from '@web/pages/builder/wordArtRules';
import { BUNDLED_FONTS, bundledFace, familyFaces, type BundledFont } from './fontTable';
import { middleToBaseline, readFontMetrics, type FontFileMetrics } from './fontMetrics';

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

/** The page fonts, loaded once: Skia's font provider and each file's metrics. */
export class PageText {
  private readonly provider: SkTypefaceFontProvider;
  private readonly loaded: { font: BundledFont; metrics: FontFileMetrics }[] = [];
  private readonly widths = new Map<string, number>();

  constructor(private readonly Skia: Skia, files: readonly FontFile[]) {
    this.provider = Skia.TypefaceFontProvider.Make();
    for (const f of files) {
      const typeface = Skia.Typeface.MakeFreeTypeFaceFromData(Skia.Data.fromBytes(f.bytes));
      if (!typeface) throw new Error(`could not read the font file ${f.font.file}`);
      this.provider.registerFont(typeface, f.font.face);
      this.loaded.push({ font: f.font, metrics: readFontMetrics(f.bytes) });
    }
  }

  /** Every bundled font must be given: the page renderer never guesses one. */
  static expectAll(files: readonly FontFile[]): void {
    const missing = BUNDLED_FONTS.filter((b) => !files.some((f) => f.font.file === b.file));
    if (missing.length) throw new Error(`fonts not loaded: ${missing.map((m) => m.file).join(', ')}`);
  }

  /** The face file a look draws with (the CSS font matching, kept simple:
   *  same face, same style, nearest weight). */
  private fileFor(look: TextLook): { font: BundledFont; metrics: FontFileMetrics } | null {
    const face = bundledFace(look.family);
    if (!face) return null;
    const same = this.loaded.filter((l) => l.font.face.toLowerCase() === face.toLowerCase());
    const want = look.bold ? 700 : 400;
    const byStyle = same.filter((l) => l.font.italic === !!look.italic);
    const pool = byStyle.length ? byStyle : same;
    return pool.slice().sort((a, b) => Math.abs(a.font.weight - want) - Math.abs(b.font.weight - want))[0] ?? null;
  }

  private paragraph(text: string, look: TextLook, paint?: SkPaint): SkParagraph {
    const face = bundledFace(look.family) ?? familyFaces(look.family)[0] ?? 'serif';
    const textStyle = {
      fontFamilies: [face],
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
    builder.dispose();
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

  private blurred(paint: SkPaint, blur: number): SkPaint {
    if (blur > 0) paint.setMaskFilter(this.Skia.MaskFilter.MakeBlur(BlurStyle.Normal, blur / 2, false));
    return paint;
  }

  /** One line of WordArt: wordArt.ts drawWordArtText, in Skia. `scale` = what
   *  the font size was scaled by (outline and shadow follow it). */
  drawLine(canvas: SkCanvas, text: string, x: number, middleY: number, look: TextLook, align: Align, s: LineStyle, scale: number, alpha = 1, onCover = false): void {
    const color = s.color || '#2D2D2D';
    const outline = !!(s.outlineWidth && s.outlineColor);
    const sh = wordArtShadow(s, onCover);
    const shadowAt = (paint: SkPaint) => {
      if (!sh) return;
      canvas.save();
      canvas.translate(sh.offsetX * scale, sh.offsetY * scale);
      this.paintLine(canvas, text, x, middleY, look, align, paint);
      canvas.restore();
    };
    if (outline) {
      const stroke = (c: string) => {
        const p = this.solid(c, alpha);
        p.setStyle(PaintStyle.Stroke);
        p.setStrokeJoin(StrokeJoin.Round);
        p.setStrokeWidth((s.outlineWidth as number) * scale);
        return p;
      };
      if (sh) shadowAt(this.blurred(stroke(sh.color), sh.blur * scale));
      this.paintLine(canvas, text, x, middleY, look, align, stroke(s.outlineColor as string));
      this.paintLine(canvas, text, x, middleY, look, align, this.solid(color, alpha));
    } else {
      if (sh) shadowAt(this.blurred(this.solid(sh.color, alpha), sh.blur * scale));
      this.paintLine(canvas, text, x, middleY, look, align, this.solid(color, alpha));
    }
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
