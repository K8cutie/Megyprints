/* ══════════════════════════════════════════════════════════════════════════
 *  Material Textures — SINGLE source of truth
 *  ──────────────────────────────────────────────────────────────────────────
 *  Maps a material name → a self-contained, TILEABLE, procedural SVG → a
 *  `data:image/svg+xml,` data URI. PROCEDURAL only (feTurbulence grain +
 *  line/crosshatch weave), so it renders identically in every renderer with
 *  NO external assets → CSP-safe (DOM <img>, Fabric Image, canvas
 *  createPattern all accept inline data: URIs).
 *
 *  ONE recipe per material feeds BOTH the picker swatch thumbnails AND all
 *  three page renderers (BuilderPreview DOM, useCanvasEngine Fabric,
 *  printPipeline canvas) — so the material can never drift between them.
 *
 *  Textures are SUBTLE and earthy: they sit BEHIND the user's photos, so
 *  every fill/stroke is low-opacity grain, not a loud pattern.
 *
 *  PARITY ANCHOR: every tile is a fixed 80×80 px square whose edges wrap
 *  seamlessly, so all renderers can repeat it at the SAME 80px tile size.
 * ══════════════════════════════════════════════════════════════════════════ */

export const TEXTURE_NAMES = [
  'leather', 'linen', 'canvas', 'denim', 'rug', 'kraft', 'cork', 'wood',
] as const;

export type TextureName = typeof TEXTURE_NAMES[number];

/** The fixed tile edge (CSS px). Every renderer repeats the tile at this size
 *  so the material reads identically across preview / edit / print. */
export const TEXTURE_TILE_PX = 80;

const T = TEXTURE_TILE_PX;

/* ─── Small helpers to keep the SVG builders terse ─── */

/** A feTurbulence-based grain filter, composited at `alpha` over the base. */
function grainFilter(
  id: string,
  baseFrequency: string,
  numOctaves: number,
  seed: number,
  /** slope on the alpha channel (grain strength) */
  alphaSlope: number,
  /** darken/lighten the grain (negative = darker) */
  rgbSlope: number,
): string {
  return (
    `<filter id="${id}" x="0" y="0" width="100%" height="100%">` +
      `<feTurbulence type="fractalNoise" baseFrequency="${baseFrequency}" ` +
        `numOctaves="${numOctaves}" seed="${seed}" stitchTiles="stitch" result="n"/>` +
      // Desaturate + reshape into a soft alpha grain.
      `<feColorMatrix in="n" type="matrix" values="` +
        `0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 ${alphaSlope} 0"/>` +
      `<feComponentTransfer><feFuncR type="linear" slope="${rgbSlope}" intercept="0"/>` +
        `<feFuncG type="linear" slope="${rgbSlope}" intercept="0"/>` +
        `<feFuncB type="linear" slope="${rgbSlope}" intercept="0"/></feComponentTransfer>` +
    `</filter>`
  );
}

function svgOpen(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${T}" height="${T}" viewBox="0 0 ${T} ${T}">`;
}

/* ─── Per-material recipes → a raw SVG string ─── */

const TEXTURE_SVG: Record<TextureName, () => string> = {
  // Earthy tan leather: base fill + fine desaturated fractal grain, low contrast.
  leather: () =>
    svgOpen() +
      `<defs>${grainFilter('g', '0.9', 2, 7, 0.14, -1)}</defs>` +
      `<rect width="${T}" height="${T}" fill="#8a6a4f"/>` +
      `<rect width="${T}" height="${T}" filter="url(#g)" opacity="0.5"/>` +
      // faint darker mottling for a hide feel
      `<rect width="${T}" height="${T}" fill="#5c4633" opacity="0.05"/>` +
    `</svg>`,

  // Off-white greige linen: FINE crosshatch — tight horizontal + vertical weave.
  linen: () => {
    const base = '#efe9df';
    const thread = '#9c8f79';
    const step = 4;
    let lines = '';
    for (let p = 0; p < T; p += step) { // p<T (not <=): the tile's far edge is drawn by the next tile's p=0 → no doubled seam line
      lines += `<line x1="0" y1="${p}" x2="${T}" y2="${p}"/>`;
      lines += `<line x1="${p}" y1="0" x2="${p}" y2="${T}"/>`;
    }
    return (
      svgOpen() +
        `<rect width="${T}" height="${T}" fill="${base}"/>` +
        `<g stroke="${thread}" stroke-width="1" opacity="0.12">${lines}</g>` +
      `</svg>`
    );
  },

  // Natural-cotton canvas: COARSER weave — thicker, darker, wider-spaced hatch.
  canvas: () => {
    const base = '#e4dcc9';
    const thread = '#8a7c5f';
    const step = 8;
    let lines = '';
    for (let p = 0; p < T; p += step) { // p<T (not <=): the tile's far edge is drawn by the next tile's p=0 → no doubled seam line
      lines += `<line x1="0" y1="${p}" x2="${T}" y2="${p}"/>`;
      lines += `<line x1="${p}" y1="0" x2="${p}" y2="${T}"/>`;
    }
    return (
      svgOpen() +
        `<rect width="${T}" height="${T}" fill="${base}"/>` +
        `<g stroke="${thread}" stroke-width="1.6" opacity="0.16">${lines}</g>` +
      `</svg>`
    );
  },

  // Indigo denim: blue base + DIAGONAL twill (45°) + faint counter-diagonal
  // lighter thread flecks. The blue tint is the signature.
  denim: () => {
    const base = '#3b5a7a';
    const twill = '#22364d';
    const fleck = '#8fa9c4';
    const step = 5;
    let main = '';
    let counter = '';
    // Diagonal lines that wrap seamlessly: draw across an offset range that
    // covers both the -T..0 and 0..T origins so edges tile.
    for (let o = -T; o <= T; o += step) {
      main += `<line x1="${o}" y1="0" x2="${o + T}" y2="${T}"/>`;
      counter += `<line x1="${o}" y1="${T}" x2="${o + T}" y2="0"/>`;
    }
    return (
      svgOpen() +
        `<rect width="${T}" height="${T}" fill="${base}"/>` +
        `<g stroke="${twill}" stroke-width="1.4" opacity="0.22">${main}</g>` +
        `<g stroke="${fleck}" stroke-width="0.8" opacity="0.08">${counter}</g>` +
      `</svg>`
    );
  },

  // Warm terracotta rug: muted red base + coarse fractal grain (woven-pile feel),
  // slightly higher alpha than leather.
  rug: () =>
    svgOpen() +
      `<defs>${grainFilter('g', '0.35', 3, 11, 0.2, -1)}</defs>` +
      `<rect width="${T}" height="${T}" fill="#a9553f"/>` +
      `<rect width="${T}" height="${T}" filter="url(#g)" opacity="0.6"/>` +
      `<rect width="${T}" height="${T}" fill="#7a3826" opacity="0.06"/>` +
    `</svg>`,

  // Kraft paper: paper-brown base + FINE fractal fibre grain.
  kraft: () =>
    svgOpen() +
      `<defs>${grainFilter('g', '1.2', 2, 3, 0.1, -1)}</defs>` +
      `<rect width="${T}" height="${T}" fill="#b79b74"/>` +
      `<rect width="${T}" height="${T}" filter="url(#g)" opacity="0.45"/>` +
    `</svg>`,

  // Cork: sandy tan + speckled fractal grain + a few darker "grain" ellipses.
  cork: () => {
    // Deterministic scatter of low-opacity darker ellipses (cork grains).
    const grains = [
      [16, 22, 5, 3], [58, 14, 4, 6], [40, 48, 6, 4],
      [70, 60, 5, 3], [24, 66, 4, 5], [8, 44, 3, 4],
    ]
      .map(([cx, cy, rx, ry]) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#7d6035" opacity="0.1"/>`)
      .join('');
    return (
      svgOpen() +
        `<defs>${grainFilter('g', '0.7', 2, 5, 0.16, -1)}</defs>` +
        `<rect width="${T}" height="${T}" fill="#c9a877"/>` +
        `<rect width="${T}" height="${T}" filter="url(#g)" opacity="0.5"/>` +
        grains +
      `</svg>`
    );
  },

  // Wood: plank base + long low-frequency grain streaks (turbulence stretched
  // on X) + faint seam lines at the tile edges.
  wood: () =>
    svgOpen() +
      `<defs>${grainFilter('g', '0.012 0.9', 3, 9, 0.14, -1)}</defs>` +
      `<rect width="${T}" height="${T}" fill="#a9855c"/>` +
      `<rect width="${T}" height="${T}" filter="url(#g)" opacity="0.5"/>` +
      // seam lines top+bottom so tiled planks read as boards
      `<line x1="0" y1="0.5" x2="${T}" y2="0.5" stroke="#6f5334" stroke-width="1" opacity="0.16"/>` +
      `<line x1="0" y1="${T - 0.5}" x2="${T}" y2="${T - 0.5}" stroke="#6f5334" stroke-width="1" opacity="0.16"/>` +
    `</svg>`,
};

/** Resolve a (possibly stale/unknown) name to a valid texture name. Old albums
 *  may still carry a geometric pattern string ('dots') — fall back to the first
 *  texture so nothing ever blanks the page. */
function normalizeName(name: string): TextureName {
  return (TEXTURE_NAMES as readonly string[]).includes(name)
    ? (name as TextureName)
    : TEXTURE_NAMES[0];
}

/** Build the `data:image/svg+xml,` URI for a material texture.
 *  Uses encodeURIComponent (NOT btoa) so '#' in hex colours and quotes survive.
 *  Callers wrap the result in url("...") — do NOT add extra quotes here. */
export function textureDataUri(name: string): string {
  const svg = TEXTURE_SVG[normalizeName(name)]();
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/** Back-compat alias so callers that previously imported PATTERNS have a list. */
export const TEXTURES = TEXTURE_NAMES;
