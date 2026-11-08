/* ══════════════════════════════════════════════════════════════════════════
   colorGradients — THE gradients, offered for a page's colour and for words
   (owner, 2026-11-08, of the page colours: "make it have the same color
   palette as the fonts. The add gradients also", then "i would like both page
   and font colors to have these paletes").

   Twelve, each made from two of the 28 text colours (textColors.ts), fading
   from the top to the bottom: a page as a top-to-bottom wash (pageColors
   gradientPage), words as their two-colour fill (color = top, fillTo =
   bottom; wordArt draws that top to bottom too).
   ══════════════════════════════════════════════════════════════════════════ */

import { sameColor } from './textColors';

export interface ColorGradient {
  id: string;
  name: string;
  top: string;
  bottom: string;
}

export const COLOR_GRADIENTS: readonly ColorGradient[] = [
  { id: 'cream-blush', name: 'Cream to blush', top: '#F3E9DC', bottom: '#E8A598' },
  { id: 'peach-sunset', name: 'Peach sunset', top: '#F07F5F', bottom: '#F48FB1' },
  { id: 'gold-glow', name: 'Gold glow', top: '#F3E9DC', bottom: '#C9A24B' },
  { id: 'terracotta', name: 'Terracotta', top: '#E8A598', bottom: '#B85C38' },
  { id: 'sky', name: 'Sky', top: '#FFFFFF', bottom: '#6FA8DC' },
  { id: 'ocean', name: 'Ocean', top: '#6FA8DC', bottom: '#1F3A5F' },
  { id: 'lavender', name: 'Lavender', top: '#F3E9DC', bottom: '#B39DDB' },
  { id: 'plum-night', name: 'Plum night', top: '#9B5DE5', bottom: '#6A2C70' },
  { id: 'sage', name: 'Sage', top: '#F3E9DC', bottom: '#8A9A7A' },
  { id: 'forest', name: 'Forest', top: '#8A9A7A', bottom: '#2E7D4A' },
  { id: 'teal-sea', name: 'Teal sea', top: '#6FA8DC', bottom: '#1F7A7A' },
  { id: 'charcoal', name: 'Charcoal', top: '#6B6B6B', bottom: '#1A1A1A' },
];

export function gradientById(id: string | undefined | null): ColorGradient | null {
  return COLOR_GRADIENTS.find((g) => g.id === id) ?? null;
}

/** The gradient two colours make (words: their colour and fillTo), or null. */
export function gradientOfColors(top: string | undefined | null, bottom: string | undefined | null): ColorGradient | null {
  return COLOR_GRADIENTS.find((g) => sameColor(g.top, top) && sameColor(g.bottom, bottom)) ?? null;
}

const channel = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
/** A colour part way from `a` to `b` (t 0..1), as #RRGGBB: a swatch's bands,
 *  the colour behind words on a gradient page. */
export function mixColors(a: string, b: string, t: number): string {
  const full = (h: string) => (/^#[0-9a-f]{3}$/i.test(h) ? `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}` : h);
  const x = full(a), y = full(b);
  if (!/^#[0-9a-f]{6}$/i.test(x) || !/^#[0-9a-f]{6}$/i.test(y)) return a;
  const k = Math.max(0, Math.min(1, t));
  return '#' + [0, 1, 2].map((i) => Math.round(channel(x, i) * (1 - k) + channel(y, i) * k).toString(16).padStart(2, '0')).join('').toUpperCase();
}

/** The CSS a swatch shows (the website). */
export const gradientCss = (g: Pick<ColorGradient, 'top' | 'bottom'>): string => `linear-gradient(180deg, ${g.top}, ${g.bottom})`;
