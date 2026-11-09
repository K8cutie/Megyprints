/* The Preview's page flip, on or off (owner, 2026-11-04: "Turn off the page
   flip animation. It works fine on my phone but not for everyone or add a
   button to turn it off. On by default."). Off, a tap or a swipe shows the
   next page at once: no leaf turns, none follows the finger, and nothing
   waits for the leaf's pictures to be drawn first. The phone remembers it. */
import { useCallback, useState } from 'react';
import type { KeyValueStore } from '@web/shared/platform';

export const PAGE_FLIP_KEY = 'megy-2.0-page-flip';
export const PAGE_FLIP_LABEL = 'Page flip animation';

/** On unless this phone turned it off. */
export function pageFlipOn(store: KeyValueStore): boolean {
  try { return store.getItem(PAGE_FLIP_KEY) !== 'off'; } catch { return true; }
}

/** The switch: whether pages flip, and turning it on or off (kept on the phone). */
export function usePageFlip(store: KeyValueStore): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(() => pageFlipOn(store));
  const set = useCallback((next: boolean) => {
    setOn(next);
    try { store.setItem(PAGE_FLIP_KEY, next ? 'on' : 'off'); } catch { /* on again next visit: harmless */ }
  }, [store]);
  return [on, set];
}
