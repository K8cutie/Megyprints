// AI-themed album quotes, on the WEBSITE: the album's free-text theme → short
// caption lines. How the pool works (the shipped bank first, AI lines on top,
// cached per theme, never the same line twice) is in themeQuotePool.ts, which
// the 2.0 app shares; that file's header has the whole story.
//
// This file makes the website's one pool: cached in this browser's
// localStorage (key 'megy-theme-quotes'), asking /api/theme-quotes for AI
// lines. That endpoint WAS DELETED 2026-10-27 (security audit), so every call
// gets a 404 and the curated corpus is used, exactly as before. The functions
// keep the names and behaviour they always had.

import { createThemeQuotes, type QuoteSet } from './themeQuotePool';
import { browserLocalStore } from './browserStores';

export {
  MAX_QUOTE_CHARS,
  DEFAULT_QUOTE_COUNT,
  QUOTE_BATCH_MAX,
  QUOTES_PER_THEME_MAX,
  curatedThemeFor,
  matchedTheme,
  curatedQuotesFor,
  type QuoteSet,
} from './themeQuotePool';

const pool = createThemeQuotes({ store: browserLocalStore, endpoint: '/api/theme-quotes' });

/** Drop a theme's cached lines so the next fetch regenerates. */
export function forgetThemeQuotes(theme: string): void {
  pool.forgetThemeQuotes(theme);
}

/** Make sure the theme's pool holds at least `min` lines, then return the
 *  lines available now (themeQuotePool). Never throws. */
export function ensureThemeQuotes(theme: string, min: number, opts: { budgetMs?: number } = {}): Promise<string[]> {
  return pool.ensureThemeQuotes(theme, min, opts);
}

/** Themed lines for the album's free-text theme. Never rejects. */
export function fetchThemeQuotes(theme: string): Promise<QuoteSet> {
  return pool.fetchThemeQuotes(theme);
}

/** The picker's "More lines": grow the pool by another page. */
export function moreThemeQuotes(theme: string): Promise<QuoteSet> {
  return pool.moreThemeQuotes(theme);
}

/** The lines available RIGHT NOW for a theme, with no network round-trip. */
export function quotesForThemeNow(theme: string): string[] {
  return pool.quotesForThemeNow(theme);
}

/** The album theme the customer typed at setup (BuilderSetup writes this). */
export function currentAlbumTheme(): string {
  try { return localStorage.getItem('megy-album-theme') || ''; } catch { return ''; }
}

/** Test-only: drop all module state (cache, hydration flag, running jobs). */
export function __resetQuotesForTests(): void {
  pool.reset();
}
