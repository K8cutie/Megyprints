/* ══════════════════════════════════════════════════════════════════════════
   ALBUM THEME — the occasion the album is about ("Wedding", "Baptism", or
   anything typed). It is the seed for the AI quote pool (60 % of every dealt
   combo box) and the quote picker, so it is asked as its own UNSKIPPABLE
   wizard step (pick_theme) before anything else.

   Stored locally under one key that the quote engine (lib/quotes.ts) and the
   quote picker already read. No photos involved, so it stays private.

   The rules (the key, the limits, reading and writing it in a device store)
   live in albumThemeRules.ts, which the 2.0 app shares; everything there is
   re-exported here, so the website imports this file as before. This file
   adds the website's own pair (this browser's localStorage) and the window
   event that tells the website's steps the occasion changed.

   The album builder (useBuilderState) reads and writes it through its
   device's own store (readAlbumThemeFrom / writeAlbumThemeTo with the
   platform's deviceStore), so in the 2.0 app the occasion is kept too, and a
   save to the account never sends an empty one over the one already there.
   On the website that store IS localStorage, so both ways meet.
   ══════════════════════════════════════════════════════════════════════════ */

import type { KeyValueStore } from '../shared/platform';
import { ALBUM_THEME_EVENT, readAlbumThemeFrom, writeAlbumThemeTo } from './albumThemeRules';

export * from './albumThemeRules';

/** The occasion this browser keeps (the website's own steps). */
export function readAlbumTheme(): string {
  try { return readAlbumThemeFrom(localStorage); } catch { return ''; }
}

/** Tell the website's steps showing the occasion that it changed (a window
 *  event they listen for); nothing to tell where there is no window. */
export function announceAlbumTheme(occasion: string): void {
  try { window.dispatchEvent(new CustomEvent(ALBUM_THEME_EVENT, { detail: occasion })); } catch { /* no window */ }
}

/** Keep the occasion in this browser (the website's own steps). */
export function writeAlbumTheme(v: string): void {
  let store: Pick<KeyValueStore, 'setItem' | 'removeItem'>;
  try { store = localStorage; } catch { store = { setItem: () => {}, removeItem: () => {} }; }
  writeAlbumThemeTo(store, v, announceAlbumTheme);
}
