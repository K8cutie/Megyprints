/** mulberry32: a tiny 32-bit PRNG. Same seed → same stream on every machine
 *  and Node version (integer math only). Returns floats in [0, 1).
 *  In its own file (no vitest import) so a script can seed with it too:
 *  tools/golden builds the 2.0 app's golden pages from the seeded generator. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
