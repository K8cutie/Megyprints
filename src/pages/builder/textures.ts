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
 *  Each material layers a DARK grain (shadows) + a LIGHT grain (highlights)
 *  over a base colour → a bumpy, clearly-readable surface whose base colour
 *  still shows between the grains. Strength is tuned per material.
 *
 *  PARITY ANCHOR: every tile is a fixed 80×80 px square whose edges wrap
 *  seamlessly (feTurbulence stitchTiles="stitch"; weaves drop the far edge),
 *  so all renderers repeat it at the SAME 80px tile size.
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

function svgOpen(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${T}" height="${T}" viewBox="0 0 ${T} ${T}">`;
}

/** A feTurbulence grain filter. `tone` = 0 → dark (shadow) grain, 1 → light
 *  (highlight) grain: RGB becomes that solid tone; ALPHA = the turbulence
 *  scaled by `alpha` (grain strength). stitchTiles="stitch" keeps it seamless
 *  across the 80px tile. */
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

/** Base colour + a dark grain + a light grain → a visibly textured surface.
 *  `extra` = any material-specific overlay (e.g. cork speckles) drawn on top. */
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
  // p < T (not <=): the next tile's p=0 line covers the far edge exactly once → no doubled seam.
  for (let p = 0; p < T; p += step) {
    lines += `<line x1="0" y1="${p}" x2="${T}" y2="${p}"/><line x1="${p}" y1="0" x2="${p}" y2="${T}"/>`;
  }
  return (
    svgOpen() +
      `<rect width="${T}" height="${T}" fill="${base}"/>` +
      `<g stroke="${thread}" stroke-width="${width}" opacity="${opacity}">${lines}</g>` +
    `</svg>`
  );
}

/* ─── Per-material recipes → a raw SVG string ─── */

const TEXTURE_SVG: Record<TextureName, () => string> = {
  // Earthy tan leather — mottled hide grain (dark shadows + light highlights).
  leather: () => grained('#8a6a4f', '0.8', 3, 7, 0.55, 0.4),

  // Off-white greige linen — fine, tight, visible weave.
  linen: () => weave('#efe9df', '#8b7d63', 4, 1, 0.3),

  // Natural-cotton canvas — coarser, heavier weave.
  canvas: () => weave('#e4dcc9', '#7a6c50', 8, 1.8, 0.34),

  // Indigo denim — diagonal twill (45°) + counter-diagonal thread flecks.
  denim: () => {
    const step = 5;
    let main = '', counter = '';
    // Draw across -T..T so the diagonals wrap seamlessly across the tile edge.
    for (let o = -T; o <= T; o += step) {
      main += `<line x1="${o}" y1="0" x2="${o + T}" y2="${T}"/>`;
      counter += `<line x1="${o}" y1="${T}" x2="${o + T}" y2="0"/>`;
    }
    return (
      svgOpen() +
        `<rect width="${T}" height="${T}" fill="#3b5a7a"/>` +
        `<g stroke="#1c2f44" stroke-width="1.9" opacity="0.46">${main}</g>` +
        `<g stroke="#a6bdd6" stroke-width="1" opacity="0.2">${counter}</g>` +
      `</svg>`
    );
  },

  // Warm terracotta rug — coarse woven-pile grain.
  rug: () => grained('#a9553f', '0.32', 3, 11, 0.62, 0.42),

  // Kraft paper — fine fibre grain, strengthened so it reads as paper not a flat swatch.
  kraft: () => grained('#b79b74', '0.9', 2, 3, 0.58, 0.46),

  // Cork — sandy grain + darker speckle "grains" scattered on top.
  cork: () => grained('#c9a877', '0.7', 2, 5, 0.5, 0.42,
    ([[16, 22, 5, 3], [58, 14, 4, 6], [40, 48, 6, 4], [70, 60, 5, 3], [24, 66, 4, 5], [8, 44, 3, 4]] as const)
      .map(([cx, cy, rx, ry]) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#6f5330" opacity="0.22"/>`)
      .join('')),

  // Wood — long horizontal grain streaks (turbulence stretched on X). NO hard
  // seam lines (they made a visible repeating line every tile); the stretched
  // grain reads as boards on its own.
  wood: () => grained('#a9855c', '0.014 0.85', 3, 9, 0.55, 0.4),
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
