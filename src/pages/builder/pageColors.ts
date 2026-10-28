/* ══════════════════════════════════════════════════════════════════════════
   pageColors — THE page colours: the one list every background picker offers
   (the cover, a page on the phone, the desktop studio strip, the panels).

   Owner, 2026-10-20: "for the background I'd like it to have colors, not just
   a plain white background — make it a selection of those 8 colors", then
   "not just the cover but the background of all pages". The 8 are the
   Crayola 8-box: red, orange, yellow, green, blue, violet, brown, black.
   White stays first so a page can go back to plain.

   A solid colour already flows through every renderer (DOM preview, Fabric
   editor, print, the spine + back cover via coverLayout.solidOf), so this file
   only names the colours and keeps the words readable on them: text that
   would vanish on a dark page (charcoal on black) is switched to the ink that
   shows, the way the spine does (coverLayout.spineInk).
   ══════════════════════════════════════════════════════════════════════════ */

import { contrastRatio } from './colorContrast';
import { sameColor } from './textColors';
import type { AlbumBackground, AlbumPage, TextElement } from './types';

export interface PageColor {
  name: string;
  hex: string;
}

/** Plain paper — the page colour an album starts with. */
export const PAGE_WHITE = '#FFFFFF';

export const PAGE_COLORS: readonly PageColor[] = [
  { name: 'White', hex: PAGE_WHITE },
  { name: 'Red', hex: '#EE204D' },
  { name: 'Orange', hex: '#FF7538' },
  { name: 'Yellow', hex: '#FCE883' },
  { name: 'Green', hex: '#1CAC78' },
  { name: 'Blue', hex: '#1F75FE' },
  { name: 'Violet', hex: '#926EAE' },
  { name: 'Brown', hex: '#B4674D' },
  { name: 'Black', hex: '#232323' },
];

/** The two whites an album already uses (pages print #FFFFFF, the cover's
 *  default is the warm #FFFBF7): both are "White" in the picker. */
const WHITES = [PAGE_WHITE, '#FFFBF7'];

/** The swatch a background is on, or null (a texture, a photo, another colour). */
export function pageColorOf(bg: AlbumBackground | undefined | null): PageColor | null {
  if (!bg || bg.type !== 'solid') return null;
  const hex = bg.solid ?? PAGE_WHITE;
  if (WHITES.some((w) => sameColor(w, hex))) return PAGE_COLORS[0];
  return PAGE_COLORS.find((c) => sameColor(c.hex, hex)) ?? null;
}

/** The background a swatch makes. */
export function solidPage(hex: string): AlbumBackground {
  return { type: 'solid', solid: hex };
}

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

/** The page in a colour: a solid background, and every word on it still
 *  readable. Text that already reads is untouched, so a customer's chosen
 *  colour survives any swatch it shows on. */
export function recolorPage(page: AlbumPage, hex: string): AlbumPage {
  const textElements = page.textElements?.map((t) => {
    const color = inkFor(t, hex);
    return color === t.color ? t : { ...t, color };
  });
  return { ...page, background: solidPage(hex), ...(textElements ? { textElements } : {}) };
}
