/* ══════════════════════════════════════════════════════════════════════════
   ALBUM THEME — the occasion the album is about ("Wedding", "Baptism", or
   anything typed). It is the seed for the AI quote pool (60 % of every dealt
   combo box) and the quote picker, so it is asked as its own UNSKIPPABLE
   wizard step (pick_theme) before anything else.

   Stored locally under one key that the quote engine (lib/quotes.ts) and the
   quote picker already read. No photos involved, so it stays private.

   The album builder (useBuilderState) reads and writes it through its
   device's own store (readAlbumThemeFrom / writeAlbumThemeTo with the
   platform's deviceStore), so in the 2.0 app the occasion is kept too, and a
   save to the account never sends an empty one over the one already there.
   On the website that store IS localStorage, so both ways meet.
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

/** The occasion this browser keeps (the website's own steps). */
export function readAlbumTheme(): string {
  try { return readAlbumThemeFrom(localStorage); } catch { return ''; }
}

/** Fired when the occasion changes outside the step that asks it (an album
 *  opened from the cloud brings its own): the steps showing it re-read. */
export const ALBUM_THEME_EVENT = 'megy-album-theme';

/** Keep the occasion in `store` ('' forgets it), and tell the steps showing
 *  it (website: a window event; nothing to tell where there is no window). */
export function writeAlbumThemeTo(store: Pick<KeyValueStore, 'setItem' | 'removeItem'>, v: string): void {
  const clean = cleanAlbumTheme(v);
  try {
    if (clean) store.setItem(ALBUM_THEME_KEY, clean); else store.removeItem(ALBUM_THEME_KEY);
  } catch { /* storage blocked or full: not kept */ }
  try { window.dispatchEvent(new CustomEvent(ALBUM_THEME_EVENT, { detail: clean })); } catch { /* no window */ }
}

/** Keep the occasion in this browser (the website's own steps). */
export function writeAlbumTheme(v: string): void {
  let store: Pick<KeyValueStore, 'setItem' | 'removeItem'>;
  try { store = localStorage; } catch { store = { setItem: () => {}, removeItem: () => {} }; }
  writeAlbumThemeTo(store, v);
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
