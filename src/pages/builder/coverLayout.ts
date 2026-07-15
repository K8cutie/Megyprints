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

/** Derive the spine's text + colour from the FRONT cover page.
 *  TEXT selection (deterministic): (1) the bound-caption title (a TextElement on
 *  textSlot 0 — the cover template's title box); else (2) the largest free
 *  TextElement (lowest index wins ties) — the visual "title"; else (3) empty.
 *  The chosen element's styling is copied but the SIZE is re-fit to the physical
 *  spine (the front title size is in page-design space and must not be used raw).
 *  COLOUR = solidOf(front.background). */
export function deriveSpine(front: AlbumPage, g: CoverWrapGeometry, override?: TextStyle): { text: TextStyle; bg: string } {
  const bg = solidOf(front.background);
  const spineFontSize = Math.round(Math.min(g.panels.spine.width * 0.5, g.panels.front.height * 0.035));

  // An explicit spine override (typed in the cover editor's Spine tab) wins over
  // the auto-from-front-title default; its size is still re-fit to the spine.
  if (override && override.text && override.text.trim()) {
    return {
      text: {
        text: override.text.trim(),
        fontSize: spineFontSize,
        fontFamily: override.fontFamily,
        color: override.color,
        bold: override.bold,
        italic: override.italic,
        underline: false,
        alignment: 'center',
        outlineColor: override.outlineColor,
        outlineWidth: override.outlineWidth,
        shadow: override.shadow,
      },
      bg,
    };
  }

  const nonEmpty = (front.textElements ?? []).filter((t) => !!t.text && t.text.trim().length > 0);

  let chosen = nonEmpty.find((t) => t.boxIndex === 0);
  if (!chosen) {
    for (const t of nonEmpty) {
      if (t.boxIndex !== undefined) continue;        // free text only for the "largest" heuristic
      if (!chosen || t.fontSize > chosen.fontSize) chosen = t;
    }
  }
  if (!chosen) chosen = nonEmpty[0];                  // fall back to any caption (e.g. a subtitle)

  const text: TextStyle = chosen
    ? {
        text: chosen.text.trim(),
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

  return { text, bg };
}
