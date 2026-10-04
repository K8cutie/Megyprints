/* ══════════════════════════════════════════════════════════════════════════
   A double tap is ONE tap (1-star testers, 2026-10-04: the Next-Masher and
   the Commuter). The first tap changes the screen; the second lands on
   whatever the new screen put under the finger:
     • "Let's Get Started →" twice picked the occasion "Something else";
     • "Next page" twice on page 39 hit "Done — Preview my album" (same spot)
       and skipped page 40.
   useSettleGuard(key) answers "too soon?" for SETTLE_MS after `key` changes:
   a tap that soon after a screen change is the tail of the tap that changed
   it, so it's ignored.
   ══════════════════════════════════════════════════════════════════════════ */

import { useCallback, useLayoutEffect, useRef } from 'react';

/** Longer than a double tap (~300 ms), short enough that nobody waits on it. */
export const SETTLE_MS = 400;

export function useSettleGuard(key: unknown): () => boolean {
  const changedAt = useRef(Number.NEGATIVE_INFINITY);
  const first = useRef(true);
  // On CHANGE only: the screen the tap changed. (A screen that just mounted
  // is answered by the guard of the screen that led to it.)
  useLayoutEffect(() => {
    if (first.current) { first.current = false; return; }
    changedAt.current = performance.now();
  }, [key]);
  return useCallback(() => performance.now() - changedAt.current < SETTLE_MS, []);
}
