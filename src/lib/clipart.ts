// AI-themed clip-art: album theme text → search keywords (via the /api/theme-keywords
// proxy, Haiku-powered when a key is set, dumb-split fallback otherwise) → matching
// vectors from the free, open Iconify API. Restricted to permissively-licensed icon
// sets (no attribution-required sets) so the art is safe on a commercial print.
// Colorful emoji-style sets are preferred for a decorative (non-"icon-y") look.

/** Permissive-license Iconify sets we allow (MIT / Apache / OFL / ISC). Colorful
 *  first (noto, fluent-emoji-flat), then clean monochrome fallbacks. */
const PERMISSIVE_PREFIXES = [
  'noto', 'fluent-emoji-flat',
  'material-symbols', 'mdi', 'tabler', 'lucide', 'iconoir', 'ph', 'solar', 'mingcute', 'hugeicons',
];
const COLORFUL = new Set(['noto', 'fluent-emoji-flat']);
/** Color applied to MONOCHROME (currentColor) icons so they don't rasterize black. */
const MONO_COLOR = '#6B5842';

const ICONIFY = 'https://api.iconify.design';

export interface ClipartItem {
  id: string;   // "prefix:name"
  svg: string;  // full SVG markup
}

const STOP = new Set(['the', 'a', 'an', 'our', 'my', 'your', 'of', 'in', 'on', 'at', 'for', 'and', 'or', 'to', 'with', 'is', 'this', 'that', 'we', 'album', 'photo', 'photos', 'memory', 'trip', 'first', 'year', 'day', 'theme']);

/** Client-side fallback if the proxy is unreachable (e.g. local dev). */
function simpleSplit(theme: string): string[] {
  const out: string[] = [];
  for (const w of (theme.toLowerCase().match(/[a-z]+/g) || [])) {
    if (w.length < 3 || STOP.has(w) || out.includes(w)) continue;
    out.push(w);
    if (out.length >= 10) break;
  }
  return out;
}

export async function fetchThemeKeywords(theme: string): Promise<string[]> {
  const t = theme.trim();
  if (!t) return [];
  try {
    const r = await fetch('/api/theme-keywords', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ theme: t }),
    });
    if (r.ok) {
      const d = await r.json();
      if (Array.isArray(d.keywords) && d.keywords.length) return d.keywords;
    }
  } catch { /* fall through */ }
  return simpleSplit(t);
}

async function searchIconify(keyword: string, limit = 12): Promise<string[]> {
  try {
    const url = `${ICONIFY}/search?query=${encodeURIComponent(keyword)}&prefixes=${PERMISSIVE_PREFIXES.join(',')}&limit=${limit}`;
    const r = await fetch(url);
    if (!r.ok) return [];
    const d = await r.json();
    return Array.isArray(d.icons) ? d.icons : [];
  } catch { return []; }
}

async function fetchSvg(id: string): Promise<string | null> {
  try {
    const [prefix, name] = id.split(':');
    if (!prefix || !name) return null;
    const color = COLORFUL.has(prefix) ? '' : `&color=${encodeURIComponent(MONO_COLOR)}`;
    const r = await fetch(`${ICONIFY}/${prefix}/${name}.svg?height=96${color}`);
    if (!r.ok) return null;
    const svg = await r.text();
    return svg.trim().startsWith('<svg') ? svg : null;
  } catch { return null; }
}

/** Full pipeline: theme → keywords → a deduped set of themed vectors (SVG markup).
 *  One vector per concept (colorful preferred), a few per keyword, capped at `max`. */
export async function fetchThemeClipart(theme: string, max = 24): Promise<ClipartItem[]> {
  const keywords = await fetchThemeKeywords(theme);
  if (!keywords.length) return [];
  const ids: string[] = [];
  const seenName = new Set<string>();
  for (const kw of keywords.slice(0, 8)) {
    const found = await searchIconify(kw, 12);
    // Colorful sets first so the one we keep per concept is the decorative one.
    found.sort((a, b) => (COLORFUL.has(b.split(':')[0]) ? 1 : 0) - (COLORFUL.has(a.split(':')[0]) ? 1 : 0));
    let added = 0;
    for (const id of found) {
      const name = id.split(':')[1] || id;
      if (seenName.has(name)) continue;
      seenName.add(name);
      ids.push(id);
      if (++added >= 3) break;
    }
    if (ids.length >= max) break;
  }
  const items = await Promise.all(ids.slice(0, max).map(async (id) => {
    const svg = await fetchSvg(id);
    return svg ? { id, svg } : null;
  }));
  return items.filter((x): x is ClipartItem => x !== null);
}
