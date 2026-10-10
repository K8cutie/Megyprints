/** Run at most `max` async jobs at once; the rest wait their turn (FIFO).
 *  Used where every job decodes a full-size photo — unbounded, a 250-photo
 *  pick decoded ~12 GB of pixels at once and the phone killed the app. */
export function createLimiter(max: number) {
  let active = 0;
  const queue: (() => void)[] = [];
  const next = () => {
    if (active >= max) return;
    const run = queue.shift();
    if (run) { active++; run(); }
  };
  return function limit<T>(job: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      queue.push(() => {
        job().then(resolve, reject).finally(() => { active--; next(); });
      });
      next();
    });
  };
}
