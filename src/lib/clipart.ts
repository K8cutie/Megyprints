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

/* Keyword cache — the SAME theme text always yields the SAME keywords, so the
   proxy (and its paid Haiku call) runs at most ONCE per theme, ever. Cached in
   localStorage keyed by the lowercased theme: a 20-graphic album makes 1 Haiku
   call, not 20, and it persists across reloads/sessions on this device. Only a
   SUCCESSFUL proxy result is cached — a transient failure falls back to a local
   split WITHOUT caching, so the next open retries the proxy/Haiku. */
const KW_CACHE_KEY = 'megy-theme-kw';
const KW_CACHE_MAX = 10; // cap stored themes (~1-3 KB total) so localStorage can't grow unbounded
const kwCache = new Map<string, string[]>();
const kwInflight = new Map<string, Promise<string[]>>();
let kwHydrated = false;

function hydrateKwCache(): void {
  if (kwHydrated) return;
  kwHydrated = true;
  try {
    const raw = localStorage.getItem(KW_CACHE_KEY);
    if (raw) for (const [k, v] of Object.entries(JSON.parse(raw))) {
      if (Array.isArray(v)) kwCache.set(k, v as string[]);
    }
  } catch { /* no/blocked storage just means no cross-session cache */ }
}

function persistKwCache(key: string, kws: string[]): void {
  kwCache.set(key, kws);
  if (kwCache.size > KW_CACHE_MAX) {
    const oldest = kwCache.keys().next().value; // Map preserves insertion order
    if (oldest !== undefined) kwCache.delete(oldest);
  }
  try {
    localStorage.setItem(KW_CACHE_KEY, JSON.stringify(Object.fromEntries(kwCache)));
  } catch { /* storage full/unavailable — memory cache still serves this session */ }
}

export async function fetchThemeKeywords(theme: string): Promise<string[]> {
  const t = theme.trim();
  if (!t) return [];
  const key = t.toLowerCase();
  hydrateKwCache();

  const cached = kwCache.get(key);
  if (cached) return cached;             // cache hit → no network, no Haiku
  const pending = kwInflight.get(key);
  if (pending) return pending;           // dedupe a concurrent request for the same theme

  const p = (async () => {
    try {
      const r = await fetch('/api/theme-keywords', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ theme: t }),
      });
      if (r.ok) {
        const d = await r.json();
        if (Array.isArray(d.keywords) && d.keywords.length) {
          persistKwCache(key, d.keywords); // cache the good result → Haiku fires once per theme
          return d.keywords as string[];
        }
      }
    } catch { /* fall through */ }
    return simpleSplit(t);               // transient failure → NOT cached, so a later open retries
  })().finally(() => kwInflight.delete(key));

  kwInflight.set(key, p);
  return p;
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
