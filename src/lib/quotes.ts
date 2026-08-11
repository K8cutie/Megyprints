// AI-themed album quotes: the album's FREE-TEXT theme ("Marriage", "Lola's 80th",
// "our Palawan trip") → short original caption lines, via the /api/theme-quotes
// proxy (Haiku-powered when a key is set). When the proxy has no key, fails, or
// is unreachable (local dev has no /api), we fall back to the curated corpus in
// builder/themeQuotes.ts — so the feature always produces something for $0.
//
// Caching contract: the SAME theme text always yields the SAME quotes, cached
// per device, so a paid call happens at most once per theme rather than once
// per page. (The sunset clipart pipeline used the same contract.)

import { THEME_QUOTES } from '../pages/builder/themeQuotes';
import type { TemplateType } from '../pages/builder/types';

export interface QuoteSet {
  quotes: string[];
  /** 'ai' = generated for this exact theme; 'curated' = the shipped corpus. */
  source: 'ai' | 'curated';
}

/** Same ceiling the endpoint enforces — applied again here because the curated
 *  corpus and any future source must obey the printed-caption limit too. */
export const MAX_QUOTE_CHARS = 46;

/* ── Free text → curated theme ──────────────────────────────────────────────
   The curated corpus is keyed by TemplateType, but the theme a customer types
   is free text. Map the common words so "Marriage"/"Wedding"/"Kasal" all reach
   the wedding lines; anything unrecognised gets the deliberately generic
   'classic' set rather than nothing. */
const THEME_ALIASES: { match: RegExp; theme: TemplateType }[] = [
  { match: /wedding|marriage|married|bride|groom|kasal|anniversar/i, theme: 'wedding' },
  { match: /baptism|christening|dedication|binyag/i, theme: 'baptism' },
  { match: /baby|newborn|christening shower|maternity|pregnan/i, theme: 'baby' },
  { match: /birthday|bday|debut|kaarawan/i, theme: 'birthday' },
  { match: /graduat|commencement|alumni|school/i, theme: 'graduation' },
  { match: /travel|trip|vacation|holiday|tour|beach|island|adventure/i, theme: 'travel' },
  { match: /kids?|children|toddler|playground/i, theme: 'kids' },
  { match: /family|reunion|parents|lola|lolo|pamilya/i, theme: 'family' },
  { match: /vintage|retro|throwback|heritage/i, theme: 'vintage' },
  { match: /minimal|simple|clean/i, theme: 'minimalist' },
];

/** The curated theme whose lines best fit this free-text theme. */
export function curatedThemeFor(theme: string): TemplateType {
  for (const { match, theme: t } of THEME_ALIASES) if (match.test(theme)) return t;
  return 'classic';
}

/** The shipped lines for a free-text theme — the always-available $0 answer. */
export function curatedQuotesFor(theme: string): string[] {
  return THEME_QUOTES[curatedThemeFor(theme)] ?? THEME_QUOTES.classic;
}

/* ── Cache ──────────────────────────────────────────────────────────────────
   localStorage, keyed by the lowercased theme, capped so it can't grow without
   bound. Only a SUCCESSFUL generated set is cached — a transient failure serves
   curated lines WITHOUT caching, so the next open retries the proxy. */
const CACHE_KEY = 'megy-theme-quotes';
const CACHE_MAX = 10;
const cache = new Map<string, string[]>();
const inflight = new Map<string, Promise<QuoteSet>>();
let hydrated = false;

function hydrate(): void {
  if (hydrated) return;
  hydrated = true;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) for (const [k, v] of Object.entries(JSON.parse(raw))) {
      if (Array.isArray(v)) cache.set(k, v as string[]);
    }
  } catch { /* no/blocked storage just means no cross-session cache */ }
}

function persist(key: string, quotes: string[]): void {
  cache.set(key, quotes);
  if (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value; // Map preserves insertion order
    if (oldest !== undefined) cache.delete(oldest);
  }
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(cache)));
  } catch { /* storage full/unavailable — memory cache still serves this session */ }
}

/** Drop a theme's cached lines so the next fetch regenerates (the "more quotes"
 *  action). Curated themes are unaffected — they are a constant. */
export function forgetThemeQuotes(theme: string): void {
  const key = theme.trim().toLowerCase();
  cache.delete(key);
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(cache))); } catch { /* ignore */ }
}

function withinLimit(quotes: string[]): string[] {
  return quotes.map((q) => q.trim()).filter((q) => q && q.length <= MAX_QUOTE_CHARS);
}

/** Themed lines for the album's free-text theme. Never rejects: an empty or
 *  unrecognised theme still returns the curated corpus. */
export async function fetchThemeQuotes(theme: string): Promise<QuoteSet> {
  const t = theme.trim();
  const curated = { quotes: withinLimit(curatedQuotesFor(t)), source: 'curated' as const };
  if (!t) return curated;

  const key = t.toLowerCase();
  hydrate();

  const cached = cache.get(key);
  if (cached?.length) return { quotes: cached, source: 'ai' };
  const pending = inflight.get(key);
  if (pending) return pending;               // dedupe concurrent asks for one theme

  const p = (async (): Promise<QuoteSet> => {
    try {
      const r = await fetch('/api/theme-quotes', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ theme: t }),
      });
      if (r.ok) {
        const d = await r.json();
        const quotes = Array.isArray(d.quotes) ? withinLimit(d.quotes.filter((q: unknown) => typeof q === 'string')) : [];
        if (quotes.length) {
          persist(key, quotes);              // cache the good result → one paid call per theme
          return { quotes, source: 'ai' };
        }
      }
    } catch { /* fall through to curated */ }
    return curated;                          // NOT cached, so a later open retries
  })().finally(() => inflight.delete(key));

  inflight.set(key, p);
  return p;
}

/** The lines available RIGHT NOW for a theme, with no network round-trip: a
 *  previously generated AI set from the cache, else the curated corpus. Album
 *  generation is synchronous, so its auto-dealt box quotes draw from this;
 *  callers fire fetchThemeQuotes alongside to warm the AI cache for the NEXT
 *  generation instead of delaying this one. */
export function quotesForThemeNow(theme: string): string[] {
  const t = theme.trim();
  if (t) {
    hydrate();
    const cached = cache.get(t.toLowerCase());
    if (cached?.length) return withinLimit(cached);
  }
  return withinLimit(curatedQuotesFor(t));
}

/** The album theme the customer typed at setup (BuilderSetup writes this). */
export function currentAlbumTheme(): string {
  try { return localStorage.getItem('megy-album-theme') || ''; } catch { return ''; }
}
