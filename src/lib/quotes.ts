// AI-themed album quotes: the album's FREE-TEXT theme ("Marriage", "Lola's 80th",
// "our Palawan trip") → short original caption lines, via the /api/theme-quotes
// proxy (Haiku-powered when a key is set). When the proxy has no key, fails, or
// is unreachable (local dev has no /api), we fall back to the curated corpus in
// builder/themeQuotes.ts — so the feature always produces something for $0.
//
// Caching contract: the SAME theme text always yields the SAME quotes, cached
// per device, so a paid call happens at most once per theme rather than once
// per page. (The sunset clipart pipeline used the same contract.)
//
// POOL SIZING (2026-09-09): the album deals each line AT MOST ONCE (owner's
// never-repeat rule), so the pool IS the per-album quote ceiling. A fixed
// 25-line pool ran dry halfway through an 80-page album — the second half of
// the boxes silently degraded to text/QR invitations. The pool now grows to
// the album: ensureThemeQuotes(theme, need) tops the cached set up in batches
// of up to 60 lines per call, each call carrying the lines already held so the
// model writes NEW ones. Generation asks for one line per caption box.

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

/** Lines a first (cold) fetch asks for — the picker's page and the warm-up. */
export const DEFAULT_QUOTE_COUNT = 25;
/** Most lines one proxy call returns (mirrors MAX_COUNT server-side). */
export const QUOTE_BATCH_MAX = 60;
/** Most lines kept per theme. 240 covers the largest album (≈ 1 box per page,
 *  200+ pages) plus a "more lines" press or two; beyond it the pool is reset. */
export const QUOTES_PER_THEME_MAX = 240;
/** Most top-up calls one ensure() will make before giving up (a model that
 *  keeps returning duplicates would otherwise loop and spend). */
const MAX_TOPUP_CALLS = 5;
/** Newest held lines sent back as "don't repeat these" (server caps at 200). */
const AVOID_MAX = 200;

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
/** One running top-up per theme. `target` is mutable so a later, bigger ask
 *  raises the running job's goal instead of starting a parallel paid loop. */
const topups = new Map<string, { target: number; done: Promise<void> }>();
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

/** Drop a theme's cached lines so the next fetch regenerates. Curated themes
 *  are unaffected — they are a constant. */
export function forgetThemeQuotes(theme: string): void {
  const key = theme.trim().toLowerCase();
  cache.delete(key);
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(cache))); } catch { /* ignore */ }
}

function withinLimit(quotes: string[]): string[] {
  return quotes.map((q) => q.trim()).filter((q) => q && q.length <= MAX_QUOTE_CHARS);
}

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** One proxy call. Returns the NEW lines (already filtered against `avoid`
 *  server-side, re-checked here), or null on any failure — the caller decides
 *  whether to retry, and never caches a failure. */
async function requestLines(theme: string, count: number, avoid: string[]): Promise<string[] | null> {
  try {
    const r = await fetch('/api/theme-quotes', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ theme, count, avoid: avoid.slice(-AVOID_MAX) }),
    });
    if (!r.ok) return null;
    const d = await r.json();
    const raw = Array.isArray(d.quotes) ? d.quotes.filter((q: unknown): q is string => typeof q === 'string') : [];
    const seen = new Set(avoid.map(norm));
    const fresh: string[] = [];
    for (const q of withinLimit(raw)) {
      const k = norm(q);
      if (!k || seen.has(k)) continue;
      seen.add(k);
      fresh.push(q);
    }
    return fresh;
  } catch {
    return null;
  }
}

/** Grow the theme's cached pool toward `job.target`, one batch per call. */
async function runTopup(key: string, theme: string, job: { target: number }): Promise<void> {
  for (let calls = 0; calls < MAX_TOPUP_CALLS; calls++) {
    const have = cache.get(key) ?? [];
    const short = Math.min(job.target, QUOTES_PER_THEME_MAX) - have.length;
    if (short <= 0) return;
    const fresh = await requestLines(theme, Math.min(QUOTE_BATCH_MAX, short), have);
    if (!fresh || fresh.length === 0) return;        // failed or dry — stop spending
    // Re-read: the cache may have been cleared/replaced while we were away.
    const now = cache.get(key) ?? [];
    persist(key, [...now, ...fresh].slice(0, QUOTES_PER_THEME_MAX));
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Make sure the theme's AI pool holds at least `min` lines (up to the
 *  per-theme cap), topping up in batches as needed, then return the lines
 *  available NOW: the AI pool if it has any, else the curated corpus.
 *
 *  `budgetMs` bounds how long the CALLER waits — the top-up itself keeps
 *  running in the background and lands in the cache for the next consumer
 *  (the finish-line sweep, the picker, the next generation). Never throws. */
export async function ensureThemeQuotes(
  theme: string,
  min: number,
  opts: { budgetMs?: number } = {},
): Promise<string[]> {
  const t = theme.trim();
  if (!t) return withinLimit(curatedQuotesFor(t));
  hydrate();
  const key = t.toLowerCase();
  const target = Math.min(QUOTES_PER_THEME_MAX, Math.max(1, Math.floor(min)));
  if ((cache.get(key)?.length ?? 0) < target) {
    let job = topups.get(key);
    if (job) {
      job.target = Math.max(job.target, target);
    } else {
      const j = { target, done: Promise.resolve() };
      j.done = runTopup(key, t, j).finally(() => { if (topups.get(key) === j) topups.delete(key); });
      topups.set(key, j);
      job = j;
    }
    const budget = opts.budgetMs ?? Infinity;
    await (Number.isFinite(budget) ? Promise.race([job.done, sleep(budget)]) : job.done);
  }
  return quotesForThemeNow(t);
}

/** Themed lines for the album's free-text theme. Never rejects: an empty or
 *  unrecognised theme still returns the curated corpus. Cached per theme, so
 *  a paid call happens once; a failure serves curated WITHOUT caching. */
export async function fetchThemeQuotes(theme: string): Promise<QuoteSet> {
  const t = theme.trim();
  const curated = { quotes: withinLimit(curatedQuotesFor(t)), source: 'curated' as const };
  if (!t) return curated;
  await ensureThemeQuotes(t, DEFAULT_QUOTE_COUNT);
  const ai = cache.get(t.toLowerCase());
  return ai?.length ? { quotes: withinLimit(ai), source: 'ai' } : curated;
}

/** The picker's "More lines": GROW the pool by another page rather than throw
 *  the held lines away (the album may already be dealing from them). Only at
 *  the per-theme cap does it start over. */
export async function moreThemeQuotes(theme: string): Promise<QuoteSet> {
  const t = theme.trim();
  if (!t) return fetchThemeQuotes(t);
  hydrate();
  const have = cache.get(t.toLowerCase())?.length ?? 0;
  if (have >= QUOTES_PER_THEME_MAX) forgetThemeQuotes(t);
  await ensureThemeQuotes(t, have >= QUOTES_PER_THEME_MAX ? DEFAULT_QUOTE_COUNT : have + DEFAULT_QUOTE_COUNT);
  const ai = cache.get(t.toLowerCase());
  return ai?.length
    ? { quotes: withinLimit(ai), source: 'ai' }
    : { quotes: withinLimit(curatedQuotesFor(t)), source: 'curated' };
}

/** The lines available RIGHT NOW for a theme, with no network round-trip: a
 *  previously generated AI set from the cache, else the curated corpus. */
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

/** Test-only: drop all module state (cache, hydration flag, running jobs). */
export function __resetQuotesForTests(): void {
  cache.clear();
  topups.clear();
  hydrated = false;
}
