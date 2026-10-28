/* ══════════════════════════════════════════════════════════════════════════
   COLOUR CONTRAST: does one colour read on another? (WCAG contrast ratio.)

   Moved here unchanged from coverLayout.ts so the 2.0 app can use it
   (src/shared/sharedModules.ts): coverLayout measures the spine's words with
   a browser canvas, and pageColors (which ink reads on a page colour) only
   needs these numbers. coverLayout re-exports contrastRatio, so the website
   imports it from there as before.
   ══════════════════════════════════════════════════════════════════════════ */

/** [r, g, b] (0..255) of a CSS colour in #rgb/#rrggbb/rgb() form; null otherwise. */
export function parseRgb(color: string): [number, number, number] | null {
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

/** WCAG contrast ratio (1..21) of two CSS colours; null when either can't be read. */
export function contrastRatio(a: string, b: string): number | null {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  if (la == null || lb == null) return null;
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
