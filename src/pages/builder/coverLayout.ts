/* ═══════════════════════════════════════════════════════════════════════════
   coverLayout.ts — the SINGLE shared layout for the cover wrap.
   ───────────────────────────────────────────────────────────────────────────
   Both cover renderers consume this: the DOM preview (CoverWrapPreview) and the
   print canvas (renderCoverWrapForPrint). Computing WHERE every element goes in
   exactly one place is what keeps "what you design" identical to "what prints" —
   the same discipline the three page renderers follow. Each consumer only
   differs in HOW it paints (CSS vs canvas), never in the geometry.

   All rects are in WRAP-PX (the 300-DPI flat-wrap space from coverGeometry).
   The DOM preview multiplies by a display scale; print draws at full px.
   ═══════════════════════════════════════════════════════════════════════════ */

import type { AlbumBackground, AlbumPage, CoverDesign, TextStyle } from './types';
import type { CoverWrapGeometry, Rect, CoverPanel } from './coverGeometry';
import { insetRect } from './coverGeometry';
import { contrastOutline } from './wordArt';

export interface PositionedText {
  style: TextStyle;
  /** Bounding box in wrap-px. For rotated (spine) text the renderer centres the
   *  line in the panel and rotates; the box is advisory bounds. */
  rect: Rect;
  /** Clockwise degrees. Spine text is -90 (reads bottom→top up the spine). */
  rotateDeg: number;
  /** Vertical placement of the text within its box. */
  valign: 'top' | 'middle' | 'bottom';
}

export interface PanelLayout {
  panel: CoverPanel;
  rect: Rect;
  safe: Rect;
  bg?: string;
  /** Hero/background photo id (object-cover into rect). */
  photoId?: string;
  texts: PositionedText[];
  /** Back panel only: brand-mark box (wrap-px), when enabled. */
  brandMark?: Rect;
}

export interface CoverLayout {
  wrap: { wPx: number; hPx: number };
  foldXPx: [number, number];
  safeInsetPx: number;
  /** Order: back, spine, front (left→right on the flat wrap). */
  panels: PanelLayout[];
}

/** Default text style for a cover role, sized to the geometry. The ONE place
 *  cover-text defaults live — the editor calls this when a field is first typed;
 *  the layout then trusts whatever fontSize is stored. */
export function defaultCoverText(
  role: 'title' | 'subtitle' | 'spine' | 'blurb',
  g: CoverWrapGeometry,
): TextStyle {
  const frontH = g.panels.front.height;
  const base = {
    text: '',
    fontFamily: 'Cinzel, Georgia, serif',
    color: '#2D2D2D',
    bold: false,
    italic: false,
    underline: false,
    alignment: 'center' as const,
  };
  switch (role) {
    case 'title':
      return { ...base, fontSize: Math.round(frontH * 0.085), bold: true };
    case 'subtitle':
      return { ...base, fontSize: Math.round(frontH * 0.04) };
    case 'blurb':
      return { ...base, fontSize: Math.round(frontH * 0.03) };
    case 'spine':
      // Height (fontSize) must fit within the spine thickness — cap at half of it.
      return { ...base, fontSize: Math.round(Math.min(g.panels.spine.width * 0.5, frontH * 0.035)) };
  }
}

/** Auto-add a contrasting outline to text sitting OVER a photo, so a title stays
 *  legible on any image. Only when the user hasn't decided (outlineWidth
 *  undefined); an explicit 0 means "off" and is respected.
 *  IMPORTANT: cover fontSize/outlineWidth are in WRAP-PX (300-DPI) space, so the
 *  outline is stored PROPORTIONAL to fontSize (~5.5%). Both renderers then scale
 *  it by the same factor they scale fontSize (DOM ×displayScale, print ×1), so
 *  the outline stays identical — unlike the page renderers' fixed 3-design-px. */
function forPhoto(style: TextStyle, overPhoto: boolean): TextStyle {
  if (!overPhoto || style.outlineWidth !== undefined) return style;
  return {
    ...style,
    outlineColor: style.outlineColor ?? contrastOutline(style.color),
    outlineWidth: Math.max(2, Math.round((style.fontSize || 24) * 0.055)),
  };
}

const hasText = (t?: TextStyle): t is TextStyle => !!t && !!t.text && t.text.trim().length > 0;

/**
 * Compute the full cover layout from geometry + design. Pure function — no DOM,
 * no canvas — so both renderers derive identical positions.
 */
export function coverLayout(g: CoverWrapGeometry, d: CoverDesign): CoverLayout {
  const inset = g.safeInsetPx;
  const mk = (panel: CoverPanel): PanelLayout => {
    const rect = g.panels[panel];
    return { panel, rect, safe: insetRect(rect, inset), texts: [] };
  };

  const back = mk('back');
  const spine = mk('spine');
  const front = mk('front');

  // ── FRONT: hero photo fills the panel; title low-centre, subtitle beneath. ──
  front.bg = d.front.background;
  front.photoId = d.front.photoId;
  const overFront = !!d.front.photoId;
  if (hasText(d.front.title)) {
    front.texts.push({
      style: forPhoto(d.front.title, overFront),
      rect: {
        x: front.safe.x,
        y: Math.round(front.rect.y + front.rect.height * 0.6),
        width: front.safe.width,
        height: Math.round(front.rect.height * 0.2),
      },
      rotateDeg: 0,
      valign: 'middle',
    });
  }
  if (hasText(d.front.subtitle)) {
    front.texts.push({
      style: forPhoto(d.front.subtitle, overFront),
      rect: {
        x: front.safe.x,
        y: Math.round(front.rect.y + front.rect.height * 0.81),
        width: front.safe.width,
        height: Math.round(front.rect.height * 0.1),
      },
      rotateDeg: 0,
      valign: 'top',
    });
  }

  // ── SPINE: one centred line, rotated up the spine. Colour follows the front. ──
  spine.bg = d.front.background;
  if (hasText(d.spine.text)) {
    spine.texts.push({ style: d.spine.text, rect: spine.safe, rotateDeg: -90, valign: 'middle' });
  }

  // ── BACK: optional photo + closing blurb + opt-in brand mark. ──
  back.bg = d.back.background;
  back.photoId = d.back.photoId;
  const overBack = !!d.back.photoId;
  if (hasText(d.back.blurb)) {
    back.texts.push({
      style: forPhoto(d.back.blurb, overBack),
      rect: {
        x: back.safe.x,
        y: Math.round(back.rect.y + back.rect.height * 0.42),
        width: back.safe.width,
        height: Math.round(back.rect.height * 0.2),
      },
      rotateDeg: 0,
      valign: 'middle',
    });
  }
  if (d.back.brandMark) {
    const w = Math.round(back.safe.width * 0.5);
    const h = Math.round(back.rect.height * 0.06);
    back.brandMark = {
      x: Math.round(back.rect.x + back.rect.width / 2 - w / 2),
      y: Math.round(back.safe.y + back.safe.height - h),
      width: w,
      height: h,
    };
  }

  return {
    wrap: { wPx: g.wrap.wPx, hPx: g.wrap.hPx },
    foldXPx: g.foldXPx,
    safeInsetPx: inset,
    panels: [back, spine, front],
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   COVER-AS-PAGES spine derivation.
   ───────────────────────────────────────────────────────────────────────────
   When the front/back covers are edited as PAGES, the spine is never edited —
   it is DERIVED from the front cover page: its TEXT is the front page's title,
   its COLOUR follows the front page background (same rule the legacy layout used:
   spine.bg = front.background). `deriveSpine` is the SINGLE authority for this,
   consumed by BOTH wrap renderers (print canvas + DOM preview) so they cannot
   drift. It is intentionally NOT shown in the per-panel Fabric editor (that edits
   one trim panel at a time), so the spine is a two-surface parity concern.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Flatten any background to a single solid colour for the spine + bleed base.
 *  solid → its colour; gradient → first stop; image/texture → its solid backing
 *  or a neutral default. Mirrors how the wrap fills the turn-in with a flat colour. */
export function solidOf(bg?: AlbumBackground): string {
  if (!bg) return '#FFFBF7';
  if (bg.type === 'gradient') return bg.gradient?.stops?.[0]?.color ?? bg.solid ?? '#FFFBF7';
  return bg.solid ?? '#FFFBF7';
}

/* ── The spine fits, and reads (1-star testers, 2026-10-04) ─────────────────
   A long title ran off both ends of the spine (only its middle printed), and a
   white title on a photo cover printed white on the cream spine. The title now
   shrinks to fit the spine's length — and only past a floor is it shortened,
   ending in "…" — and the spine's ink is the title's colour only while that
   colour reads on the spine. ───────────────────────────────────────────────── */

/** Width in px of one line of `text` at `fontSize`, in the style's face. */
export type SpineMeasure = (text: string, style: TextStyle, fontSize: number) => number;

let measureCtx: CanvasRenderingContext2D | null | undefined;
/** The canvas's own measure (the print canvas draws the spine with the same
 *  font string); an estimate where there is no canvas. */
export const measureSpineText: SpineMeasure = (text, style, fontSize) => {
  if (measureCtx === undefined) {
    try {
      measureCtx = typeof document !== 'undefined' && !/jsdom/i.test(globalThis.navigator?.userAgent ?? '')
        ? document.createElement('canvas').getContext('2d')
        : null;
    } catch { measureCtx = null; }
  }
  if (measureCtx) {
    measureCtx.font = `${style.italic ? 'italic' : 'normal'} ${style.bold ? 'bold' : 'normal'} ${fontSize}px ${style.fontFamily || 'serif'}`;
    return measureCtx.measureText(text).width;
  }
  return Array.from(text).length * fontSize * 0.62;
};

/** The spine line: the title at the largest size up to `max` that fits
 *  `length`, never below `min`. Still too long at `min`, it is cut — at a word
 *  when that costs little — and ends in "…". */
export function fitSpineLine(
  title: string, style: TextStyle, max: number, min: number, length: number,
  measure: SpineMeasure = measureSpineText,
): { text: string; fontSize: number; shortened: boolean } {
  let size = max;
  for (;;) {
    const w = measure(title, style, size);
    if (w <= length) return { text: title, fontSize: size, shortened: false };
    if (size <= min) break;
    // Width scales with size: jump straight to about where it fits.
    size = Math.max(min, Math.min(size - 1, Math.floor((size * length) / w)));
  }
  const chars = Array.from(title); // never split an emoji
  const fits = (n: number) => measure(chars.slice(0, n).join('').trimEnd() + '…', style, min) <= length;
  let lo = 0;
  let hi = chars.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (fits(mid)) lo = mid; else hi = mid - 1;
  }
  let cut = chars.slice(0, lo).join('');
  const space = cut.lastIndexOf(' ');
  if (space > 0 && space >= cut.length * 0.6) cut = cut.slice(0, space);
  return { text: cut.trimEnd() + '…', fontSize: min, shortened: true };
}

/** The smallest the spine title gets before it is shortened: 18 px (≈4.3 pt
 *  at 300 dpi), the size a thin softcover spine already prints at. One floor
 *  for every cover, so whether a title is shortened doesn't hang on the cover
 *  type chosen at checkout — the editor (which can't know it yet) tells the truth. */
export const SPINE_MIN_FONT_PX = 18;

/** Dark and light spine inks, for a title colour that would not show. */
export const SPINE_DARK_INK = '#2D2D2D';
export const SPINE_LIGHT_INK = '#FFFBF7';

/** WCAG contrast ratio (1..21) of two CSS colours; null when either can't be read. */
export function contrastRatio(a: string, b: string): number | null {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  if (la == null || lb == null) return null;
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** The spine's ink: the title's own colour while it reads on the spine colour
 *  (3:1, the large-text bar) — or while its outline does — else whichever of
 *  the dark and light inks reads better there. */
export function spineInk(title: Pick<TextStyle, 'color' | 'outlineColor' | 'outlineWidth'>, bg: string): string {
  const reads = (c?: string) => { const r = c ? contrastRatio(c, bg) : null; return r == null || r >= 3; };
  if (reads(title.color)) return title.color;
  if (title.outlineWidth && title.outlineColor && reads(title.outlineColor)) return title.color;
  return (contrastRatio(SPINE_DARK_INK, bg) ?? 21) >= (contrastRatio(SPINE_LIGHT_INK, bg) ?? 21) ? SPINE_DARK_INK : SPINE_LIGHT_INK;
}

export interface SpineInfo {
  /** The line that prints: fitted size, readable colour, shortened text if it had to be. */
  text: TextStyle;
  bg: string;
  /** The front title the spine was made from (whole). */
  title: string;
  /** True when it prints smaller than the spine's full size, to fit. */
  shrunk: boolean;
  /** True when even the smallest size couldn't fit it and it ends in "…". */
  shortened: boolean;
  /** True when the title's colour wouldn't show on the spine and it prints in another ink. */
  inkChanged: boolean;
}

/** Derive the spine's text + colour from the FRONT cover page.
 *  TEXT selection (deterministic): (1) the bound-caption title (a TextElement on
 *  textSlot 0 — the cover template's title box); else (2) the largest free
 *  TextElement (lowest index wins ties) — the visual "title"; else (3) empty.
 *  The chosen element's styling is copied but the SIZE is re-fit to the physical
 *  spine (the front title size is in page-design space and must not be used raw)
 *  and to its LENGTH (fitSpineLine), and the colour to the spine (spineInk).
 *  COLOUR = solidOf(front.background). */
export function deriveSpine(front: AlbumPage, g: CoverWrapGeometry, measure: SpineMeasure = measureSpineText): SpineInfo {
  const bg = solidOf(front.background);
  const spineFontSize = Math.round(Math.min(g.panels.spine.width * 0.5, g.panels.front.height * 0.035));
  const nonEmpty = (front.textElements ?? []).filter((t) => !!t.text && t.text.trim().length > 0);

  let chosen = nonEmpty.find((t) => t.boxIndex === 0);
  if (!chosen) {
    for (const t of nonEmpty) {
      if (t.boxIndex !== undefined) continue;        // free text only for the "largest" heuristic
      if (!chosen || t.fontSize > chosen.fontSize) chosen = t;
    }
  }
  if (!chosen) chosen = nonEmpty[0];                  // fall back to any caption (e.g. a subtitle)

  const title = chosen ? chosen.text.trim() : '';
  const text: TextStyle = chosen
    ? {
        text: title,
        fontSize: spineFontSize,
        fontFamily: chosen.fontFamily,
        color: chosen.color,
        bold: chosen.bold,
        italic: chosen.italic,
        underline: false,
        alignment: 'center',
        outlineColor: chosen.outlineColor,
        outlineWidth: chosen.outlineWidth,
        shadow: chosen.shadow,
      }
    : {
        text: '',
        fontSize: spineFontSize,
        fontFamily: 'Cinzel, Georgia, serif',
        color: '#2D2D2D',
        bold: false,
        italic: false,
        underline: false,
        alignment: 'center',
      };

  if (!title) return { text, bg, title, shrunk: false, shortened: false, inkChanged: false };
  // The line runs up the spine inside the same safe inset the print canvas
  // draws in (insetRect(spine, safeInsetPx)).
  const length = g.panels.spine.height - 2 * g.safeInsetPx;
  const fit = fitSpineLine(title, text, spineFontSize, Math.min(spineFontSize, SPINE_MIN_FONT_PX), length, measure);
  const ink = spineInk(text, bg);
  return {
    text: { ...text, text: fit.text, fontSize: fit.fontSize, color: ink },
    bg,
    title,
    shrunk: fit.fontSize < spineFontSize,
    shortened: fit.shortened,
    inkChanged: ink !== text.color,
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   RESERVED BACK PANEL — the Megy Prints mark.
   ───────────────────────────────────────────────────────────────────────────
   The back cover is NOT customer artwork: it is reserved for the Megy Prints
   brand mark (a colophon, like a publisher's mark on a book back). Like the
   spine, everything about it is DERIVED from the front page — bg =
   solidOf(front.background) — so the flat wrap reads as one cohesive piece.
   `deriveBrandedBack` is the SINGLE authority, consumed by BOTH wrap renderers
   (print canvas + DOM preview) so they cannot drift.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Swap these two lines to change what the reserved back says — both wrap
 *  renderers pick it up. Keep the tagline in step with the public identity the
 *  Footer/Contact pages publish. */
export const BRAND_BACK_WORDMARK = 'Megy Prints';
export const BRAND_BACK_TAGLINE = 'megyprints.com';

/** [r, g, b] (0..255) of a CSS colour in #rgb/#rrggbb/rgb() form; null otherwise. */
function parseRgb(color: string): [number, number, number] | null {
  const c = (color || '').trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c);
  const rgb = /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i.exec(c);
  if (hex) {
    const h = hex[1].length === 3 ? hex[1].split('').map((ch) => ch + ch).join('') : hex[1];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  if (rgb) return [+rgb[1], +rgb[2], +rgb[3]];
  return null;
}

/** WCAG relative luminance (0..1); null for a colour parseRgb can't read. */
function relativeLuminance(color: string): number | null {
  const rgb = parseRgb(color);
  if (!rgb) return null;
  const [r, g, b] = rgb.map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Perceived luminance (0..1) of a CSS colour; tolerant of #rgb/#rrggbb/rgb().
 *  Unknown formats read as light (→ dark ink), matching the light defaults. */
function perceivedLuminance(color: string): number {
  const rgb = parseRgb(color);
  if (!rgb) return 1;
  const [r, g, b] = rgb;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/** Derive the reserved back panel from the FRONT cover page: its solid colour
 *  (same rule as the spine) + a centred brand lockup (wordmark over tagline) in
 *  an ink that stays legible on light AND dark covers. Rects are wrap-px. */
export function deriveBrandedBack(front: AlbumPage, g: CoverWrapGeometry): { bg: string; texts: PositionedText[] } {
  const bg = solidOf(front.background);
  const lightBg = perceivedLuminance(bg) > 0.55;
  const ink = lightBg ? 'rgba(45,45,45,0.66)' : 'rgba(255,251,247,0.92)';
  const soft = lightBg ? 'rgba(45,45,45,0.45)' : 'rgba(255,251,247,0.72)';

  const panel = g.panels.back;
  const safe = insetRect(panel, g.safeInsetPx);
  const wordPx = Math.round(g.panels.front.height * 0.045);
  const subPx = Math.round(g.panels.front.height * 0.021);
  const wordH = Math.round(wordPx * 1.35);
  const subH = Math.round(subPx * 1.35);
  const gap = Math.round(wordPx * 0.5);
  const top = Math.round(panel.y + panel.height / 2 - (wordH + gap + subH) / 2);

  const base = { fontFamily: 'Cinzel, Georgia, serif', bold: false, italic: false, underline: false, alignment: 'center' as const };
  return {
    bg,
    texts: [
      {
        style: { ...base, text: BRAND_BACK_WORDMARK, fontSize: wordPx, color: ink },
        rect: { x: safe.x, y: top, width: safe.width, height: wordH },
        rotateDeg: 0,
        valign: 'middle',
      },
      {
        style: { ...base, text: BRAND_BACK_TAGLINE, fontSize: subPx, color: soft },
        rect: { x: safe.x, y: top + wordH + gap, width: safe.width, height: subH },
        rotateDeg: 0,
        valign: 'middle',
      },
    ],
  };
}
