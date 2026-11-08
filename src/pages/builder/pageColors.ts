/* ══════════════════════════════════════════════════════════════════════════
   pageColors — THE page colours: the one list every background picker offers
   (the cover, a page on the phone, the desktop studio strip, the panels).

   Owner, 2026-10-20: a selection of the Crayola 8 (+ White) on the cover and
   every page. Owner, 2026-11-08, looking at them on his phone: "The colors on
   the page color seem pretty plain. Could you make it have the same color
   palette as the fonts. The add gradients also", then "i would like both page
   and font colors to have these paletes". So a page is now coloured from the
   same 28 colours as the words (textColors.ts, in the same six families) or
   one of the 12 gradients (colorGradients.ts), each fading top to bottom. A
   page already in a colour that left the list keeps it.

   A choice is named by a KEY: a colour's own hex, or 'gradient:<id>'. The
   builder's setPageColor / applyPageColorToAllPages take a key, so every
   picker passes what it was given straight on.

   Solid colours and gradients already flow through every renderer (DOM
   preview, Fabric editor, print, the spine + back cover via coverLayout
   solidOf: a gradient's top colour), so this file names the choices and keeps
   the words readable on them: a word that would vanish is switched to the
   ink that shows, judged against the colour right behind it (on a gradient,
   the colour where the words sit).
   ══════════════════════════════════════════════════════════════════════════ */

import { contrastRatio } from './colorContrast';
import { COLOR_GRADIENTS, gradientById, gradientCss, mixColors, type ColorGradient } from './colorGradients';
import { isPlacedWords } from './freeWords';
import { getCanvasDimensions } from './layouts';
import { getTemplateById } from './pageTemplates';
import { resolveSlotBox } from './slotGeometry';
import { sameColor, TEXT_COLOR_GROUPS, TEXT_COLORS } from './textColors';
import type { AlbumBackground, AlbumPage, AlbumSizePreset, SlotText, TextElement } from './types';
import { TEXT_LINE_HEIGHT } from './wordArtRules';

export interface PageColor {
  name: string;
  hex: string;
}

/** Plain paper — the page colour an album starts with. */
export const PAGE_WHITE = '#FFFFFF';

/** The page colours: the words' 28, in their families. */
export const PAGE_COLOR_GROUPS: readonly { group: string; colors: readonly PageColor[] }[] = TEXT_COLOR_GROUPS;
export const PAGE_COLORS: readonly PageColor[] = TEXT_COLORS;

/** The two whites an album already uses (pages print #FFFFFF, the cover's
 *  default is the warm #FFFBF7): both are "White" in the picker. */
const WHITES = [PAGE_WHITE, '#FFFBF7'];
const WHITE_SWATCH = PAGE_COLORS.find((c) => sameColor(c.hex, PAGE_WHITE))!;

/** The swatch a solid background is on, or null (a gradient, a texture, a
 *  photo, a colour that isn't one of them). */
export function pageColorOf(bg: AlbumBackground | undefined | null): PageColor | null {
  if (!bg || bg.type !== 'solid') return null;
  const hex = bg.solid ?? PAGE_WHITE;
  if (WHITES.some((w) => sameColor(w, hex))) return WHITE_SWATCH;
  return PAGE_COLORS.find((c) => sameColor(c.hex, hex)) ?? null;
}

/** The background a swatch makes. */
export function solidPage(hex: string): AlbumBackground {
  return { type: 'solid', solid: hex };
}

/** The background a gradient makes: top to bottom. */
export function gradientPage(g: Pick<ColorGradient, 'top' | 'bottom'>): AlbumBackground {
  return { type: 'gradient', gradient: { type: 'linear', angle: 180, stops: [{ offset: 0, color: g.top }, { offset: 1, color: g.bottom }] } };
}

/* ── A choice in the picker, by key ─────────────────────────────────────── */

const GRADIENT_KEY = 'gradient:';
export const gradientKey = (g: Pick<ColorGradient, 'id'>): string => `${GRADIENT_KEY}${g.id}`;

/** One choice in a page picker: its key, its name, the background it makes,
 *  what its swatch shows (CSS) and the colour its tick is judged on. */
export interface PageFill {
  key: string;
  name: string;
  background: AlbumBackground;
  /** A plain colour, or a CSS gradient (the website's swatch). */
  swatch: string;
  /** The gradient, for a picker that draws its own swatch (the app). */
  gradient?: ColorGradient;
  /** The colour in the middle of the swatch (a tick's ink is chosen on it). */
  middle: string;
}

const colorFill = (c: PageColor): PageFill => ({ key: c.hex, name: c.name, background: solidPage(c.hex), swatch: c.hex, middle: c.hex });
const gradientFill = (g: ColorGradient): PageFill =>
  ({ key: gradientKey(g), name: g.name, background: gradientPage(g), swatch: gradientCss(g), gradient: g, middle: mixColors(g.top, g.bottom, 0.5) });

/** The gradients, as page choices. */
export const PAGE_GRADIENTS: readonly PageFill[] = COLOR_GRADIENTS.map(gradientFill);

/** The choice a key names: a swatch, a gradient, or any other colour (a
 *  customer's own colour from an older list, named by its hex). Null for a
 *  key that is neither. */
export function pageFillOfKey(key: string | undefined | null): PageFill | null {
  if (!key) return null;
  if (key.startsWith(GRADIENT_KEY)) {
    const g = gradientById(key.slice(GRADIENT_KEY.length));
    return g ? gradientFill(g) : null;
  }
  const swatch = pageColorOf(solidPage(key));
  if (swatch) return colorFill(swatch);
  return /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(key) ? { key, name: key, background: solidPage(key), swatch: key, middle: key } : null;
}

/** The picker's choice a page is on (a swatch or a gradient), or null. */
export function pageFillOf(bg: AlbumBackground | undefined | null): PageFill | null {
  const swatch = pageColorOf(bg);
  if (swatch) return colorFill(swatch);
  if (bg?.type !== 'gradient' || !bg.gradient || bg.gradient.type !== 'linear' || bg.gradient.angle !== 180) return null;
  const s = bg.gradient.stops;
  if (s.length !== 2 || s[0].offset !== 0 || s[1].offset !== 1) return null;
  const g = COLOR_GRADIENTS.find((x) => sameColor(x.top, s[0].color) && sameColor(x.bottom, s[1].color));
  return g ? gradientFill(g) : null;
}

/* ── Keeping words readable ─────────────────────────────────────────────── */

/** The inks words switch to when their own colour wouldn't show. */
export const DARK_INK = '#2D2D2D';
export const LIGHT_INK = '#FFFFFF';

/** Does a colour read on a background? 3:1, the large-text bar — the same
 *  bar the spine uses. An unreadable colour string counts as readable so a
 *  customer's odd value is left alone. */
export function readsOn(color: string | undefined, bg: string): boolean {
  if (!color) return true;
  const r = contrastRatio(color, bg);
  return r == null || r >= 3;
}

/** Whichever of the dark and light inks reads better on a background. */
export function inkOn(bg: string): string {
  return (contrastRatio(DARK_INK, bg) ?? 21) >= (contrastRatio(LIGHT_INK, bg) ?? 21) ? DARK_INK : LIGHT_INK;
}

/** A text element as it should read on a background: its own colour while it
 *  shows there (or while its outline does), else the ink that shows. A text
 *  with no colour set prints charcoal (every renderer's fallback), so it is
 *  judged as charcoal. */
export function inkFor(t: Pick<TextElement, 'color' | 'outlineColor' | 'outlineWidth'>, bg: string): string {
  const own = t.color || DARK_INK;
  if (readsOn(own, bg)) return own;
  if (t.outlineWidth && t.outlineColor && readsOn(t.outlineColor, bg)) return own;
  return inkOn(bg);
}

/** The colour of a background at a point of the page (fractions 0..1 across
 *  and down): a solid's colour; on a gradient, the colour there (CSS
 *  geometry: 0° up, clockwise; radial from the middle). Any other background
 *  (a texture, a photo) answers its backing colour. */
export function colorAt(bg: AlbumBackground, fx: number, fy: number): string {
  const s = bg.gradient?.stops;
  if (bg.type !== 'gradient' || !s?.length) return bg.solid ?? PAGE_WHITE;
  const stops = [...s].sort((a, b) => a.offset - b.offset);
  let t: number;
  if (bg.gradient!.type === 'radial') {
    t = Math.hypot(fx - 0.5, fy - 0.5) / Math.SQRT1_2;
  } else {
    const a = ((bg.gradient!.angle ?? 180) * Math.PI) / 180;
    const sin = Math.sin(a), cos = Math.cos(a);
    t = 0.5 + ((fx - 0.5) * sin - (fy - 0.5) * cos) / (Math.abs(sin) + Math.abs(cos));
  }
  if (t <= stops[0].offset) return stops[0].color;
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i].offset) {
      const span = stops[i].offset - stops[i - 1].offset;
      return mixColors(stops[i - 1].color, stops[i].color, span > 0 ? (t - stops[i - 1].offset) / span : 1);
    }
  }
  return stops[stops.length - 1].color;
}

/** Where a word sits on its page (fractions across and down), near enough to
 *  judge the colour behind it: a caption box's middle, a photo frame's middle,
 *  a free text's middle from its x/y. Null when the page can't say. */
function middleOfText(page: AlbumPage, t: TextElement): [number, number] | null {
  const template = page.templateId ? getTemplateById(page.templateId) : null;
  if (t.boxIndex != null) {
    const box = template?.textSlots?.[t.boxIndex];
    return box ? [box.x + box.width / 2, box.y + box.height / 2] : null;
  }
  const size = page.size as AlbumSizePreset | undefined;
  if (!size) return null;
  const { width: W, height: H } = getCanvasDimensions(size);
  const w = t.width ?? 0;
  return [(t.x + w / 2) / W, (t.y + ((t.fontSize || 24) * TEXT_LINE_HEIGHT) / 2) / H];
}
function middleOfSlot(page: AlbumPage, i: number): [number, number] | null {
  const template = page.templateId ? getTemplateById(page.templateId) : null;
  const raw = template?.slots[i];
  if (!raw) return null;
  const b = resolveSlotBox(raw, page.slotGeometries?.[i]);
  return [b.x + b.width / 2, b.y + b.height / 2];
}

/** Words as they should read on a background colour: as they are while they
 *  show there (both colours of a two-colour fill, or their outline), else in
 *  the one ink that shows (a half-switched fill would fade from the ink into
 *  a colour that doesn't show). The same object back when nothing changes. */
function readable<T extends Pick<TextElement, 'color' | 'fillTo' | 'outlineColor' | 'outlineWidth'>>(t: T, bg: string): T {
  const own = readsOn(t.color || DARK_INK, bg) && (!t.fillTo || readsOn(t.fillTo, bg));
  const outline = !!(t.outlineWidth && t.outlineColor && readsOn(t.outlineColor, bg));
  if (own || outline) return t;
  return { ...t, color: inkOn(bg), fillTo: undefined };
}

/** The page on a background, every word on it still readable: each word is
 *  judged on the colour right behind it, and only a word that wouldn't show
 *  there changes ink (a customer's chosen colour survives any page it shows
 *  on). Words placed on a photo (Add text) sit on the photo, not the page:
 *  they keep their colour. */
export function recolorPageTo(page: AlbumPage, background: AlbumBackground): AlbumPage {
  const behind = (at: [number, number] | null) => colorAt(background, at?.[0] ?? 0.5, at?.[1] ?? 0.5);
  const textElements = page.textElements?.map((t) => (isPlacedWords(t) ? t : readable(t, behind(middleOfText(page, t)))));
  const slotTexts = page.slotTexts?.map((st: SlotText | null, i) => (st ? readable(st, behind(middleOfSlot(page, i))) : st));
  return { ...page, background, ...(textElements ? { textElements } : {}), ...(slotTexts ? { slotTexts } : {}) };
}

/** The page in a page-picker choice (a key: a colour's hex or a gradient). An
 *  unknown key leaves the page as it is. */
export function recolorPage(page: AlbumPage, key: string): AlbumPage {
  const fill = pageFillOfKey(key);
  return fill ? recolorPageTo(page, fill.background) : page;
}
