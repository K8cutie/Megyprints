/* A button that opens another screen opens it once: a quick double tap
   would push two copies (router.push always adds one), and the customer
   would have to press back twice. The first press goes; any more are
   ignored until this screen is on top again. */
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef } from 'react';

/** Wraps a "go to another screen" press so it runs once per visit. */
export function useOncePerVisit(): (go: () => void) => () => void {
  const leaving = useRef(false);
  useFocusEffect(useCallback(() => { leaving.current = false; }, []));
  return useCallback((go: () => void) => () => {
    if (leaving.current) return;
    leaving.current = true;
    go();
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
