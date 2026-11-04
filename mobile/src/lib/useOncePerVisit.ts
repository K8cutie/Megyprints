/* A button that opens another screen opens it once: a quick double tap
   would push two copies (router.push always adds one), and the customer
   would have to press back twice. The first press goes; any more are
   ignored until this screen is on top again.

   A screen that has just come on top also ignores it for ARRIVING_MS: the
   second tap of a double tap on "Name your album"'s Next landed on Album
   size's Next, in the same spot, while that screen slid in, and the size
   step was skipped (beta round 2, Mother: taps 75 to 420 ms apart). */
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef } from 'react';

/** How long a screen just on top ignores its way forward. */
export const ARRIVING_MS = 500;

/** Wraps a "go to another screen" press so it runs once per visit. A press
 *  that did not leave after all (`go` answers false, now or later: not
 *  ready, not enough photos) lets the next press go. */
export function useOncePerVisit(): (go: () => unknown) => () => void {
  const leaving = useRef(false);
  const arrivedAt = useRef(Date.now());
  useFocusEffect(useCallback(() => { leaving.current = false; arrivedAt.current = Date.now(); }, []));
  return useCallback((go: () => unknown) => () => {
    if (leaving.current || Date.now() - arrivedAt.current < ARRIVING_MS) return;
    leaving.current = true;
    const left = go();
    if (left === false) leaving.current = false;
    else if (left instanceof Promise) void left.then((l) => { if (l === false) leaving.current = false; }, () => { leaving.current = false; });
  }, []);
}

/** The same outside a screen (a part's tile): a second push within `ms` is ignored. */
export function pushGuard(ms = 1000, now: () => number = Date.now): (go: () => void) => void {
  let last = -Infinity;
  return (go) => {
    const t = now();
    if (t - last < ms) return;
    last = t;
    go();
  };
}
