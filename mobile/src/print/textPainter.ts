/* ══════════════════════════════════════════════════════════════════════════
   THE PRESS SHEETS' WORDS, drawn as pictures by the app (printSheetPdf's
   TextPainter: the order number, "pile 1 · pages 1–2", the piece numbers).
   A sheet then needs no font, like the console's (canvasTextPainter).

   The console draws them in 'Helvetica, Arial, sans-serif', which is Arial
   on the shop's Windows PC. The app carries Arimo (Apache 2.0), Google's
   font with Arial's letter widths and kerning: measured in Chromium, every
   label is exactly as wide in Arimo as in Arial (e.g. "MP-TEST-6X4 · sheet
   1 of 3 · front" at 7 pt, 600 DPI: 901.210 px both). So a label lands in
   the same spot, and the cut-strip patch under a 6x6 sheet name is as wide.

   Measured and drawn the way the console's canvas does it:
     • kerning on (canvas fontKerning 'auto'), each word and each space
       shaped on its own (Chromium's canvas: see render/pageText.ts), with
       Skia Paragraph; without kerning the line above is 904.43 px;
     • the picture as tall as the font's ascent plus descent, each rounded
       to a whole pixel as Chromium does (fontBoundingBoxAscent 53, Descent
       12 for that size), its baseline at the ascent, the words from x = 1.
   600 DPI, twice what the sheets print at, so a 7 pt label stays sharp.
   ══════════════════════════════════════════════════════════════════════════ */

import type { SkCanvas, SkParagraph, SkTypefaceFontProvider, Skia } from '@shopify/react-native-skia/lib/commonjs/skia/types';
import { FontWeight, ImageFormat, TextAlign } from '@shopify/react-native-skia/lib/commonjs/skia/types';
import type { TextPainter } from '@web/pages/builder/textPainter';

const PX_PER_PT = 600 / 72;
const FACE = 'Arimo';

/** The label font files (Arimo regular and bold), as package paths. */
export const LABEL_FONT_FILES = {
  regular: '@expo-google-fonts/arimo/400Regular/Arimo_400Regular.ttf',
  bold: '@expo-google-fonts/arimo/700Bold/Arimo_700Bold.ttf',
} as const;

/** A line cut where Chromium's canvas shapes it: words and single spaces. */
const pieces = (text: string) => text.split(/( )/).filter((s) => s.length > 0);

export function skiaTextPainter(Sk: Skia, fonts: { regular: Uint8Array; bold: Uint8Array }): TextPainter {
  const provider: SkTypefaceFontProvider = Sk.TypefaceFontProvider.Make();
  const metrics = { regular: { ascent: 0, descent: 0 }, bold: { ascent: 0, descent: 0 } };
  for (const [kind, bytes] of [['regular', fonts.regular], ['bold', fonts.bold]] as const) {
    const t = Sk.Typeface.MakeFreeTypeFaceFromData(Sk.Data.fromBytes(bytes));
    if (!t) throw new Error('could not read the label font');
    provider.registerFont(t, FACE);
    // Ascent and descent per pixel of size, from the font itself.
    const m = Sk.Font(t, 1000).getMetrics();
    metrics[kind] = { ascent: -m.ascent / 1000, descent: m.descent / 1000 };
  }

  const paragraph = (text: string, sizePx: number, color: string, bold?: boolean): SkParagraph => {
    const textStyle = { fontFamilies: [FACE], fontSize: sizePx, fontStyle: { weight: bold ? FontWeight.Bold : FontWeight.Normal }, color: Sk.Color(color) };
    const builder = Sk.ParagraphBuilder.Make({ textStyle, textAlign: TextAlign.Left }, provider);
    builder.pushStyle(textStyle);
    builder.addText(text);
    builder.pop();
    const p = builder.build();
    p.layout(1e7);
    // CanvasKit's builder must be disposed; the phone's has no dispose() (see pageText.ts).
    const disposable = builder as unknown as { dispose?: () => void };
    if (typeof disposable.dispose === 'function') disposable.dispose();
    return p;
  };
  const widths = new Map<string, number>();
  const pieceWidth = (piece: string, sizePx: number, bold?: boolean) => {
    const key = `${bold ? 'b' : 'r'}|${sizePx}|${piece}`;
    let w = widths.get(key);
    if (w == null) {
      const p = paragraph(piece, sizePx, '#000000', bold);
      w = p.getMaxIntrinsicWidth();
      p.dispose();
      widths.set(key, w);
    }
    return w;
  };
  const widthPx = (text: string, sizePx: number, bold?: boolean) => pieces(text).reduce((t, p) => t + pieceWidth(p, sizePx, bold), 0);
  const drawLine = (canvas: SkCanvas, text: string, x: number, baseline: number, sizePx: number, color: string, bold?: boolean) => {
    let left = x;
    for (const piece of pieces(text)) {
      if (piece !== ' ') {
        const p = paragraph(piece, sizePx, color, bold);
        // Skia Paragraph puts the glyphs round(ascent) below the top it is painted at (pageText.ts).
        const lm = p.getLineMetrics()[0];
        p.paint(canvas, left, baseline - (lm ? Math.round(lm.ascent) : 0));
        p.dispose();
      }
      left += pieceWidth(piece, sizePx, bold);
    }
  };

  return {
    width(text, sizePt, bold) {
      return widthPx(text, sizePt * PX_PER_PT, bold) / PX_PER_PT;
    },
    png(text, sizePt, color, bold) {
      const sizePx = sizePt * PX_PER_PT;
      const m = metrics[bold ? 'bold' : 'regular'];
      const ascent = Math.round(m.ascent * sizePx) || Math.ceil(sizePx * 0.8);
      const descent = Math.round(m.descent * sizePx) || Math.ceil(sizePx * 0.2);
      const w = Math.max(1, Math.ceil(widthPx(text, sizePx, bold)) + 2);
      const h = ascent + descent;
      const surface = Sk.Surface.Make(w, h);
      if (!surface) throw new Error('could not make a label picture');
      drawLine(surface.getCanvas(), text, 1, ascent, sizePx, color, bold);
      surface.flush();
      const img = surface.makeImageSnapshot();
      const bytes = img.encodeToBytes(ImageFormat.PNG, 100);
      img.dispose();
      surface.dispose();
      return { bytes, wPt: w / PX_PER_PT, hPt: h / PX_PER_PT, descentPt: descent / PX_PER_PT };
    },
  };
}
