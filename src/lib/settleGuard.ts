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

/* ── Across surfaces ──
   A tap on one surface can change what is under the finger on ANOTHER: Megy's
   size card moves on, and for a moment the setup page's own size grid shows
   under it, so a double tap picked 6×4 and then 9×9 there. The album came out
   9×9 while the toast said "Size set: 6×4" (1-star testers round 3, the
   Next-Masher). noteScreenTap() marks a tap that changes the screen;
   tooSoonAfterScreenTap() answers its tail, wherever it lands. */
let screenTapAt = Number.NEGATIVE_INFINITY;
export function noteScreenTap(): void { screenTapAt = performance.now(); }
export function tooSoonAfterScreenTap(): boolean { return performance.now() - screenTapAt < SETTLE_MS; }
