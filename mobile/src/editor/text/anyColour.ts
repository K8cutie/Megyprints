/* "Any color" (TextColorPicker): on the website it opens the phone's own
   colour picker (<input type="color">), which Android draws as a grid of
   shades with a colour code. React Native has no such picker, so the app
   draws one: 12 hues in 3 shades, a row of greys, and a colour code field.
   The colour is saved as a 6-digit hex, as <input type="color"> gives it. */

/** Hue → 6-digit hex at a saturation and lightness (0–1). */
export function hslHex(h: number, s: number, l: number): string {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const to = (x: number) => Math.round(x * 255).toString(16).padStart(2, '0');
  return `#${to(f(0))}${to(f(8))}${to(f(4))}`.toUpperCase();
}

const HUES = [0, 20, 35, 50, 90, 140, 170, 195, 215, 250, 280, 320];
const SHADES = [0.3, 0.5, 0.72];

/** The shades, 6 a row (48 dp each on a phone): two rows per lightness,
 *  dark to light, then a row of greys. */
export const ANY_COLORS: readonly string[] = [
  ...SHADES.flatMap((l) => HUES.map((h) => hslHex(h, 0.7, l))),
  '#000000', '#4D4D4D', '#808080', '#B3B3B3', '#E0E0E0', '#FFFFFF',
];

/** A colour code as typed ('3a6ea5', '#3A6EA5', '#fff') → '#3A6EA5', or null. */
export function parseColourCode(input: string): string | null {
  const s = input.trim().replace(/^#/, '');
  if (/^[0-9a-f]{6}$/i.test(s)) return `#${s.toUpperCase()}`;
  if (/^[0-9a-f]{3}$/i.test(s)) return `#${s.split('').map((c) => c + c).join('').toUpperCase()}`;
  return null;
}

/** A tick that shows on a swatch: dark on light colours, white on dark
 *  (TextColorPicker tickOn). */
export function tickOn(hex: string): string {
  const h = parseColourCode(hex) ?? '#2D2D2D';
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  return 0.299 * r + 0.587 * g + 0.114 * b > 160 ? '#2D2D2D' : '#FFFFFF';
}
