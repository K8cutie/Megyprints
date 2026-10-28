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

import type { AlbumPage, CoverDesign, TextStyle } from './types';
import type { CoverWrapGeometry, CoverPanel, Rect } from './coverGeometry';
import { insetRect } from './coverGeometry';
import { contrastOutline } from './wordArt';
import { deriveSpine as deriveSpineWith, fitSpineLine as fitSpineLineWith, type PositionedText, type SpineInfo, type SpineMeasure } from './coverSpine';

// The spine and the reserved back are worked out in coverSpine.ts (no
// browser: the 2.0 app shares it). Re-exported here, so the website imports
// this file as before; only the spine's canvas measure lives here.
export {
  solidOf, spineInk, contrastRatio, deriveBrandedBack,
  SPINE_MIN_FONT_PX, SPINE_DARK_INK, SPINE_LIGHT_INK, BRAND_BACK_WORDMARK, BRAND_BACK_TAGLINE,
  type PositionedText, type SpineInfo, type SpineMeasure,
} from './coverSpine';

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
 *  `length`, never below `min` (coverSpine.fitSpineLine), measured by the
 *  canvas unless a measure is handed in. */
export function fitSpineLine(
  title: string, style: TextStyle, max: number, min: number, length: number,
  measure: SpineMeasure = measureSpineText,
): { text: string; fontSize: number; shortened: boolean } {
  return fitSpineLineWith(title, style, max, min, length, measure);
}

/** The spine's text and colour, derived from the FRONT cover page
 *  (coverSpine.deriveSpine), measured by the canvas unless a measure is handed in. */
export function deriveSpine(front: AlbumPage, g: CoverWrapGeometry, measure: SpineMeasure = measureSpineText): SpineInfo {
  return deriveSpineWith(front, g, measure);
}
