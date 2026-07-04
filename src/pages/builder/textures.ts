/* ══════════════════════════════════════════════════════════════════════════
 *  Material Textures — SINGLE source of truth
 *  ──────────────────────────────────────────────────────────────────────────
 *  Maps a material name (+ optional tint colour) → a self-contained, TILEABLE,
 *  procedural SVG → a `data:image/svg+xml,` data URI. PROCEDURAL only
 *  (feTurbulence grain + line/crosshatch weave), so it renders identically in
 *  every renderer with NO external assets → CSP-safe.
 *
 *  ONE recipe per material feeds BOTH the picker swatch thumbnails AND all
 *  three page renderers (BuilderPreview DOM, useCanvasEngine Fabric,
 *  printPipeline canvas) — so the material can never drift between them.
 *
 *  COLOUR VARIATION: every material takes a base colour. The grain (dark+light
 *  overlays) is colour-agnostic, and the weave/twill thread is derived from the
 *  base (contrast-adaptive), so ANY material recolours cleanly to ANY tint.
 *
 *  PARITY ANCHOR: every tile is a fixed 80×80 px square whose edges wrap
 *  seamlessly, so all renderers repeat it at the SAME 80px tile size.
 * ══════════════════════════════════════════════════════════════════════════ */

export const TEXTURE_NAMES = [
  'leather', 'linen', 'canvas', 'denim', 'rug', 'kraft', 'cork', 'wood',
] as const;

export type TextureName = typeof TEXTURE_NAMES[number];

/** The fixed tile edge (CSS px). */
export const TEXTURE_TILE_PX = 80;

const T = TEXTURE_TILE_PX;

/** Each material's natural/default base colour (used when no tint is chosen). */
export const DEFAULT_TEXTURE_COLORS: Record<TextureName, string> = {
  leather: '#8a6a4f', linen: '#efe9df', canvas: '#e4dcc9', denim: '#3b5a7a',
  rug: '#a9553f', kraft: '#b79b74', cork: '#c9a877', wood: '#a9855c',
};

/** Curated tint palette — versatile tones that read well as a textured
 *  background behind photos. Any of these can be applied to any material. */
export const TEXTURE_COLORS: { name: string; hex: string }[] = [
  { name: 'Cream', hex: '#efe9df' },
  { name: 'Sand', hex: '#cdb48c' },
  { name: 'Clay', hex: '#a9553f' },
  { name: 'Cocoa', hex: '#7d5f47' },
  { name: 'Charcoal', hex: '#45413b' },
  { name: 'Sage', hex: '#8a9a7a' },
  { name: 'Slate', hex: '#3b5a7a' },
  { name: 'Blush', hex: '#cf9d92' },
];

/* ─── Colour helpers ─── */

function clampByte(v: number): number { return Math.round(Math.max(0, Math.min(255, v))); }
function toHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((v) => clampByte(v).toString(16).padStart(2, '0')).join('');
}
/** amt 0–1: shift toward black (darken) or white (lighten). */
function shade(hex: string, amt: number, toward: 'black' | 'white'): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (toward === 'black') { const f = 1 - amt; return toHex(r * f, g * f, b * f); }
  return toHex(r + (255 - r) * amt, g + (255 - g) * amt, b + (255 - b) * amt);
}
const darken = (hex: string, amt: number) => shade(hex, amt, 'black');
const lighten = (hex: string, amt: number) => shade(hex, amt, 'white');
function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}
/** A thread colour that CONTRASTS with the base (darker on light bases, lighter
 *  on dark ones) so the weave stays visible at any tint. */
function threadFor(base: string, amt: number): string {
  return luminance(base) > 0.45 ? darken(base, amt) : lighten(base, amt);
}

/* ─── SVG builders ─── */

function svgOpen(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${T}" height="${T}" viewBox="0 0 ${T} ${T}">`;
}

/** feTurbulence grain filter. `tone` = 0 → dark (shadow) grain, 1 → light
 *  (highlight) grain: RGB = that solid tone; ALPHA = turbulence × `alpha`. */
function grainFilter(
  id: string, baseFrequency: string, numOctaves: number, seed: number,
  alpha: number, tone: 0 | 1,
): string {
  return (
    `<filter id="${id}" x="0" y="0" width="100%" height="100%">` +
      `<feTurbulence type="fractalNoise" baseFrequency="${baseFrequency}" ` +
        `numOctaves="${numOctaves}" seed="${seed}" stitchTiles="stitch" result="n"/>` +
      `<feColorMatrix in="n" type="matrix" values="` +
        `0 0 0 0 ${tone}  0 0 0 0 ${tone}  0 0 0 0 ${tone}  0 0 0 ${alpha} 0"/>` +
    `</filter>`
  );
}

/** Base colour + a dark grain + a light grain → a visibly textured surface. */
function grained(
  base: string, freq: string, octaves: number, seed: number,
  darkA: number, lightA: number, extra = '',
): string {
  return (
    svgOpen() +
      `<defs>${grainFilter('gd', freq, octaves, seed, darkA, 0)}` +
        `${grainFilter('gl', freq, octaves, seed + 41, lightA, 1)}</defs>` +
      `<rect width="${T}" height="${T}" fill="${base}"/>` +
      `<rect width="${T}" height="${T}" filter="url(#gd)"/>` +
      `<rect width="${T}" height="${T}" filter="url(#gl)"/>` +
      extra +
    `</svg>`
  );
}

/** A crosshatch weave (horizontal + vertical threads) on a base colour. */
function weave(base: string, thread: string, step: number, width: number, opacity: number): string {
  let lines = '';
  for (let p = 0; p < T; p += step) { // p<T: the next tile's p=0 covers the far edge → no doubled seam
    lines += `<line x1="0" y1="${p}" x2="${T}" y2="${p}"/><line x1="${p}" y1="0" x2="${p}" y2="${T}"/>`;
  }
  return (
    svgOpen() +
      `<rect width="${T}" height="${T}" fill="${base}"/>` +
      `<g stroke="${thread}" stroke-width="${width}" opacity="${opacity}">${lines}</g>` +
    `</svg>`
  );
}

/* ─── Per-material recipes → a raw SVG string for a given base colour ─── */

const TEXTURE_SVG: Record<TextureName, (color: string) => string> = {
  // Mottled hide grain.
  leather: (c) => grained(c, '0.8', 3, 7, 0.55, 0.4),

  // Fine, tight, visible weave.
  linen: (c) => weave(c, threadFor(c, 0.32), 4, 1, 0.3),

  // Coarser, heavier weave.
  canvas: (c) => weave(c, threadFor(c, 0.38), 8, 1.8, 0.34),

  // Diagonal twill (45°) + counter-diagonal thread flecks.
  denim: (c) => {
    const twill = threadFor(c, 0.42);
    const fleck = luminance(c) > 0.45 ? darken(c, 0.18) : lighten(c, 0.5);
    const step = 5;
    let main = '', counter = '';
    for (let o = -T; o <= T; o += step) {
      main += `<line x1="${o}" y1="0" x2="${o + T}" y2="${T}"/>`;
      counter += `<line x1="${o}" y1="${T}" x2="${o + T}" y2="0"/>`;
    }
    return (
      svgOpen() +
        `<rect width="${T}" height="${T}" fill="${c}"/>` +
        `<g stroke="${twill}" stroke-width="1.9" opacity="0.46">${main}</g>` +
        `<g stroke="${fleck}" stroke-width="1" opacity="0.2">${counter}</g>` +
      `</svg>`
    );
  },

  // Coarse woven-pile grain.
  rug: (c) => grained(c, '0.32', 3, 11, 0.62, 0.42),

  // Fine fibre grain.
  kraft: (c) => grained(c, '0.9', 2, 3, 0.58, 0.46),

  // Sandy grain + darker speckle "grains" scattered on top.
  cork: (c) => grained(c, '0.7', 2, 5, 0.5, 0.42,
    ([[16, 22, 5, 3], [58, 14, 4, 6], [40, 48, 6, 4], [70, 60, 5, 3], [24, 66, 4, 5], [8, 44, 3, 4]] as const)
      .map(([cx, cy, rx, ry]) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${darken(c, 0.32)}" opacity="0.22"/>`)
      .join('')),

  // Long horizontal grain streaks (turbulence stretched on X), no hard seams.
  wood: (c) => grained(c, '0.014 0.85', 3, 9, 0.55, 0.4),
};

/** Resolve a (possibly stale/unknown) name to a valid texture name. */
function normalizeName(name: string): TextureName {
  return (TEXTURE_NAMES as readonly string[]).includes(name)
    ? (name as TextureName)
    : TEXTURE_NAMES[0];
}

/** Build the `data:image/svg+xml,` URI for a material texture in an optional
 *  tint colour (falls back to the material's natural colour). Uses
 *  encodeURIComponent so '#' in hex colours + quotes survive. Callers wrap the
 *  result in url("...") — do NOT add extra quotes here. */
export function textureDataUri(name: string, color?: string): string {
  const n = normalizeName(name);
  const svg = TEXTURE_SVG[n](color || DEFAULT_TEXTURE_COLORS[n]);
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/** Back-compat alias so callers that previously imported PATTERNS have a list. */
export const TEXTURES = TEXTURE_NAMES;
