/* ══════════════════════════════════════════════════════════════════════════
   ALBUM THEME — the occasion the album is about ("Wedding", "Baptism", or
   anything typed). It is the seed for the AI quote pool (60 % of every dealt
   combo box) and the quote picker, so it is asked as its own UNSKIPPABLE
   wizard step (pick_theme) before anything else.

   Stored locally under one key that the quote engine (lib/quotes.ts) and the
   quote picker already read. No photos involved, so it stays private.
   ══════════════════════════════════════════════════════════════════════════ */

export const ALBUM_THEME_KEY = 'megy-album-theme';

/** Quick picks. Each label round-trips through curatedThemeFor's alias map
 *  (lib/quotes.ts), so a pick lands on its curated quote pool with no new
 *  plumbing; anything else goes through the free-text path. */
export const COMMON_THEMES = ['Wedding', 'Baptism', 'Birthday', 'Baby', 'Graduation', 'Family', 'Vacation'] as const;

/** Shortest theme the step accepts ("Me" is a theme; "" and "x" are not). */
export const MIN_THEME_LENGTH = 2;
export const MAX_THEME_LENGTH = 40;

export function readAlbumTheme(): string {
  try { return localStorage.getItem(ALBUM_THEME_KEY) || ''; } catch { return ''; }
}

/** Fired when the occasion changes outside the step that asks it (an album
 *  opened from the cloud brings its own): the steps showing it re-read. */
export const ALBUM_THEME_EVENT = 'megy-album-theme';

export function writeAlbumTheme(v: string): void {
  const clean = cleanAlbumTheme(v);
  try {
    if (clean) localStorage.setItem(ALBUM_THEME_KEY, clean); else localStorage.removeItem(ALBUM_THEME_KEY);
  } catch { /* memory-only this session */ }
  try { window.dispatchEvent(new CustomEvent(ALBUM_THEME_EVENT, { detail: clean })); } catch { /* no window */ }
}

/** Trim, collapse whitespace, cap the length. Never throws. */
export function cleanAlbumTheme(v: string): string {
  return (v || '').replace(/\s+/g, ' ').trim().slice(0, MAX_THEME_LENGTH);
}

/** The gate the wizard's Next button and isStepComplete share. */
export function isAlbumThemeReady(v: string): boolean {
  return cleanAlbumTheme(v).length >= MIN_THEME_LENGTH;
}

export function isCommonTheme(v: string): boolean {
  return (COMMON_THEMES as readonly string[]).includes(cleanAlbumTheme(v));
}
