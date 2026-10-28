/* At most one call every `ms` while a finger moves, the last value always
   sent, and `flush` when it lets go (the final value goes at once). A drag
   on the cover is an album change per call (and a cover picture drawn
   again), so it is not sent on every frame the finger moves. */
export interface Throttle<A extends unknown[]> {
  call(...args: A): void;
  /** Sends these now, dropping anything waiting. */
  flush(...args: A): void;
  cancel(): void;
}

export function throttle<A extends unknown[]>(fn: (...args: A) => void, ms: number, now: () => number = Date.now): Throttle<A> {
  let at = -Infinity;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: A | null = null;
  const fire = (args: A) => { at = now(); fn(...args); };
  const cancel = () => { if (timer) clearTimeout(timer); timer = null; pending = null; };
  return {
    call(...args) {
      const wait = ms - (now() - at);
      if (wait <= 0 && !timer) { fire(args); return; }
      pending = args;
      if (!timer) {
        timer = setTimeout(() => {
          timer = null;
          const p = pending;
          pending = null;
          if (p) fire(p);
        }, Math.max(0, wait));
      }
    },
    flush(...args) { cancel(); fire(args); },
    cancel,
  };
}
