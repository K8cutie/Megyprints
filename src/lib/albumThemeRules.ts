/* ══════════════════════════════════════════════════════════════════════════
   ALBUM THEME RULES: the album's occasion ("Wedding", "Baptism", or anything
   typed), as the part of albumTheme.ts that needs no browser, so the 2.0 app
   keeps it the same way (src/shared/sharedModules.ts).

   The occasion is kept in a device store (shared/platform.ts KeyValueStore)
   under ALBUM_THEME_KEY. The album builder (useBuilderState) reads and writes
   it through its platform's deviceStore; on the website that store IS
   localStorage, which the website's own steps read and write too
   (albumTheme.ts: readAlbumTheme / writeAlbumTheme), so both ways meet.

   Moved here unchanged from albumTheme.ts, which re-exports all of it. The
   one difference: writeAlbumThemeTo used to tell the website's steps itself
   (a window event). Now whoever writes says how to tell them (`announce`):
   the website passes that same window event (albumTheme.ts
   announceAlbumTheme), the app its own.
   ══════════════════════════════════════════════════════════════════════════ */

import type { KeyValueStore } from '../shared/platform';

export const ALBUM_THEME_KEY = 'megy-album-theme';

/** Quick picks. Each label round-trips through curatedThemeFor's alias map
 *  (lib/quotes.ts), so a pick lands on its curated quote pool with no new
 *  plumbing; anything else goes through the free-text path. */
export const COMMON_THEMES = ['Wedding', 'Baptism', 'Birthday', 'Baby', 'Graduation', 'Family', 'Vacation'] as const;

/** Shortest theme the step accepts ("Me" is a theme; "" and "x" are not). */
export const MIN_THEME_LENGTH = 2;
export const MAX_THEME_LENGTH = 40;

/** The occasion kept in `store` ('' when none, or the store can't be read). */
export function readAlbumThemeFrom(store: Pick<KeyValueStore, 'getItem'>): string {
  try { return store.getItem(ALBUM_THEME_KEY) || ''; } catch { return ''; }
}

/** Fired when the occasion changes outside the step that asks it (an album
 *  opened from the cloud brings its own): the steps showing it re-read. */
export const ALBUM_THEME_EVENT = 'megy-album-theme';

/** Keep the occasion in `store` ('' forgets it), then tell the screens showing
 *  it (`announce`, with the occasion as kept; website: a window event). */
export function writeAlbumThemeTo(
  store: Pick<KeyValueStore, 'setItem' | 'removeItem'>,
  v: string,
  announce?: (occasion: string) => void,
): void {
  const clean = cleanAlbumTheme(v);
  try {
    if (clean) store.setItem(ALBUM_THEME_KEY, clean); else store.removeItem(ALBUM_THEME_KEY);
  } catch { /* storage blocked or full: not kept */ }
  try { announce?.(clean); } catch { /* nobody to tell */ }
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
