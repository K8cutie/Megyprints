// ──────────────────────────────────────────────────────────────────────────
// WORDART RULES: the part of wordArt.ts that needs no browser, so the 2.0
// app lays out and styles words with the same numbers as the website
// (src/shared/sharedModules.ts): the outline and shadow sizes, the line
// rhythm, the caption margin, alignment, and the word wrap. wordArt.ts
// re-exports all of it and adds the drawing (DOM style, canvas); the website
// imports wordArt.ts exactly as before.
// ──────────────────────────────────────────────────────────────────────────

/** The words on a curve (the cover title, owner 2026-11-05: "that wordart capability"). */
export type WordArtCurve = 'arch' | 'smile' | 'wave';

export interface WordArtStyle {
  outlineColor?: string;
  outlineWidth?: number; // design px; 0/undefined = no outline
  shadow?: boolean;
  /** Design px; the cover's floating shadow is sized from it. */
  fontSize?: number;
  /** A two-colour fill: the letters fade from their colour, at the top of the
   *  line, to this one at the bottom. */
  fillTo?: string;
  /** A soft light of this colour around the letters, in the shadow's place
   *  (every renderer draws one shadow). */
  glow?: string;
  /** The words on a curve, on one line (never wrapped, and not clipped to the box). */
  curve?: WordArtCurve;
}

/** Outline width (design px) the editor's Outline toggle applies. */
export const WORDART_OUTLINE_WIDTH = 3;

/** Soft drop-shadow geometry in DESIGN px (scaled per renderer). */
export const WORDART_SHADOW = { color: 'rgba(0,0,0,0.38)', offsetX: 0, offsetY: 2, blur: 3 };

/** The COVER's floating text (owner, 2026-10-21: "add a floating effect so
 *  there is a distinction"). A dark, soft shadow dropped below the letters and
 *  sized from them, so the words sit lifted off the cover instead of printed
 *  into it — white words stay readable on bright sand or sky. Offset and blur
 *  are shares of the text's own font size: the small caption shadow above is
 *  2px whatever the size, which a 60px title hides. One layer (not an edge +
 *  a glow): every renderer, Fabric included, draws exactly one shadow. */
export const WORDART_FLOAT = { color: 'rgba(0,0,0,0.6)', offsetX: 0, offsetY: 0.06, blur: 0.14 };

/** A glow's blur, as a share of the text's font size, and how many times it is
 *  cast: one soft light round thin letters hardly shows. */
export const WORDART_GLOW_BLUR = 0.25;
export const WORDART_GLOW_PASSES = 3;

/** The shadow a text casts, in DESIGN px, or null. A glow is a shadow with no
 *  offset, in its own colour. Cover text floats unless its Shadow switch was
 *  turned OFF (shadow === false), so every cover, old ones included, gets it;
 *  anywhere else a text casts the small caption shadow only when it was
 *  switched ON. */
export function wordArtShadow(s: WordArtStyle, onCover = false): { color: string; offsetX: number; offsetY: number; blur: number } | null {
  if (s.glow) return { color: s.glow, offsetX: 0, offsetY: 0, blur: WORDART_GLOW_BLUR * (s.fontSize || 24) };
  if (onCover) {
    if (s.shadow === false) return null;
    const size = s.fontSize || 24;
    return { color: WORDART_FLOAT.color, offsetX: WORDART_FLOAT.offsetX * size, offsetY: WORDART_FLOAT.offsetY * size, blur: WORDART_FLOAT.blur * size };
  }
  return s.shadow ? WORDART_SHADOW : null;
}

export const hasWordArt = (s: WordArtStyle): boolean =>
  !!s.shadow || !!(s.outlineWidth && s.outlineColor) || !!s.fillTo || !!s.glow || !!s.curve;

/** How far an arch or a smile turns from end to end, radians (100 degrees). */
export const WORDART_ARC = (100 * Math.PI) / 180;
/** How high a wave rides, as a share of the font size. */
export const WORDART_WAVE = 0.4;

/** One letter on a curve: its middle, from the middle of the curve, and how far it is turned (radians). */
export interface CurveGlyph { text: string; x: number; y: number; angle: number }
export interface CurveLayout { glyphs: CurveGlyph[]; width: number; height: number }

/** The words as a curve takes them: one line. */
export const curveLine = (text: string): string => String(text ?? '').replace(/\s+/g, ' ').trim();

/** Each letter of `text` on `curve`, with the measurer's font already set.
 *  Letters sit where the straight line would put them along the curve (each
 *  from the width of the words before it, so spacing is print's), middle of
 *  the curve at (0, 0). A space takes its room and draws nothing. Every renderer
 *  and the fit check read this one layout. */
export function curveGlyphs(text: string, m: TextMeasurer, fontSize: number, curve: WordArtCurve): CurveLayout {
  const chars = Array.from(curveLine(text));
  const total = m.measureText(chars.join('')).width;
  if (!chars.length || !(total > 0)) return { glyphs: [], width: 0, height: 0 };
  const radius = total / WORDART_ARC;
  const dip = radius * (1 - Math.cos(WORDART_ARC / 2));
  const wave = Math.min(WORDART_WAVE * fontSize, total / 10);
  const place = (s: number): { x: number; y: number; angle: number } => {
    if (curve === 'wave') {
      const k = (2 * Math.PI) / total;
      return { x: s, y: wave * Math.sin(k * s), angle: Math.atan(wave * k * Math.cos(k * s)) };
    }
    const a = s / radius;
    const y = radius * (1 - Math.cos(a)) - dip / 2;
    return curve === 'arch'
      ? { x: radius * Math.sin(a), y, angle: a }
      : { x: radius * Math.sin(a), y: -y, angle: -a };
  };
  const glyphs: CurveGlyph[] = [];
  let width = 0, top = 0, bottom = 0, before = '';
  chars.forEach((ch) => {
    const start = before ? m.measureText(before).width : 0;
    before += ch;
    const advance = m.measureText(before).width - start;
    const p = place(start + advance / 2 - total / 2);
    width = Math.max(width, (Math.abs(p.x) + advance / 2) * 2);
    top = Math.min(top, p.y);
    bottom = Math.max(bottom, p.y);
    if (ch !== ' ') glyphs.push({ text: ch, ...p });
  });
  return { glyphs, width, height: bottom - top + fontSize };
}

/** The curve's middle, for words anchored as a straight line is (left, centre or right). */
export function curveCentreX(anchorX: number, align: 'left' | 'center' | 'right', width: number): number {
  return align === 'left' ? anchorX + width / 2 : align === 'right' ? anchorX - width / 2 : anchorX;
}

/** Pick a contrasting outline color for a fill (dark fills → white, light → ink). */
export function contrastOutline(fill: string): string {
  const hex = (fill || '').replace('#', '');
  if (hex.length < 6) return '#FFFFFF';
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? '#2D2D2D' : '#FFFFFF';
}

/** Line spacing used by every renderer. The DOM preview hardcodes 1.25, so the
 *  print path must wrap at the same rhythm or a two-line caption sits at a
 *  different height on paper than it does on screen. */
export const TEXT_LINE_HEIGHT = 1.25;

/** The margin a caption (a bound text box, or text in a photo slot) wraps
 *  inside, on each side, as a share of the box's width. Print draws it; the
 *  preview and the editor used the box's full width, so a line close to the
 *  box width sat on one line on screen and broke in two on paper ("Beach days
 *  are the best" / "days": 1-star testers round 3, the Print Inspector). Every
 *  renderer and the fit check read this one number. */
export const CAPTION_PAD_X = 0.04;

/** Fabric 5 draws each line fontSize × lineHeight × 1.13 tall (its
 *  _fontSizeMult), so its lineHeight for TEXT_LINE_HEIGHT on the canvas is
 *  this. With 1.25 itself the editor spaced lines 13% wider than the preview
 *  and print: a caption "Make it fit" had fitted still overflowed the box in
 *  the editor (1-star testers round 3, the Perfectionist). */
export const FABRIC_FONT_SIZE_MULT = 1.13;
export const FABRIC_LINE_HEIGHT = TEXT_LINE_HEIGHT / FABRIC_FONT_SIZE_MULT;

/** Caption alignment resolution — the ELEMENT's own choice wins over the
 *  template slot's default, in ALL THREE renderers. (Print used to resolve
 *  template-first on interior pages, so a left-aligned caption printed centered
 *  on any template that declares ts.align.) */
export function resolveTextSlotAlign(
  element: { alignment?: 'left' | 'center' | 'right' } | null | undefined,
  slot: { align?: 'left' | 'center' | 'right' } | null | undefined,
): 'left' | 'center' | 'right' {
  return element?.alignment ?? slot?.align ?? 'center';
}

/** Free-text wrap width in DESIGN px — the DOM preview's box model, shared with
 *  print so both wrap a title/quote at the same width. (The Fabric editor keeps
 *  a 100px usability floor so a short text stays grabbable — that floor only
 *  differs for texts too short to wrap anyway.) */
export function freeTextBoxWidth(t: { width?: number; text: string; fontSize?: number }): number {
  return t.width || t.text.length * (t.fontSize || 24) * 0.6;
}

/** Where the first of `lineCount` wrapped lines sits (its vertical centre)
 *  when the block of lines is centred on `cy`, lines TEXT_LINE_HEIGHT ×
 *  fontSize apart. The caption layout every renderer draws. */
export function firstLineCenter(lineCount: number, cy: number, fontSize: number): number {
  return cy - ((lineCount - 1) * (fontSize * TEXT_LINE_HEIGHT)) / 2;
}

/** What wrapTextLines needs to measure words: a canvas 2D context with its
 *  font set, or the app's own measurer. */
export interface TextMeasurer {
  measureText(text: string): { width: number };
}

/** Break `text` into lines that each fit `maxWidth` with the ctx's CURRENT font.
 *  Greedy word wrap; a single word wider than the box is split by character,
 *  matching the DOM's `word-break: break-word`. */
export function wrapTextLines(
  ctx: TextMeasurer,
  text: string,
  maxWidth: number,
): string[] {
  const paragraphs = String(text ?? '').split('\n');
  const lines: string[] = [];
  const fits = (s: string) => ctx.measureText(s).width <= maxWidth;

  for (const para of paragraphs) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) { lines.push(''); continue; }
    let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (fits(candidate) || !line) {
        // A lone word too wide for the box → split it by character.
        if (!fits(candidate) && !line && !fits(word)) {
          let chunk = '';
          for (const ch of word) {
            if (chunk && !fits(chunk + ch)) { lines.push(chunk); chunk = ch; } else { chunk += ch; }
          }
          line = chunk;
          continue;
        }
        line = candidate;
      } else {
        lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
  }
  return lines.length ? lines : [''];
}

