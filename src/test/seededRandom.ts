import { afterEach, beforeEach, vi, type MockInstance } from 'vitest';

/* ══════════════════════════════════════════════════════════════════════════
   SEEDED Math.random FOR THE ALBUM-GENERATOR SPECS (2026-10-02).
   generateAlbum deals with Math.random (box rolls, shuffle bags, the fill
   plan, hero cadence), so every `npm test` used to build different albums.
   Two specs fail on an unlucky one: "quotes still land" (about 1 album in
   70) and the 6x6 rhythm check (about 1 in 100). Unseeded, 4 of 150 runs
   went red, and any of them would have failed a PR's required `verify`
   check. Seeding the specs (never the product) makes every run build the
   same albums, whether a test runs in the full suite or alone.

   Other seeds are still worth a look after a generator change:
     TEST_SEED=7 npx vitest run src/pages/builder
   ══════════════════════════════════════════════════════════════════════════ */

/** mulberry32: a tiny 32-bit PRNG. Same seed → same stream on every machine
 *  and Node version (integer math only). Returns floats in [0, 1). */
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

const envSeed = process.env.TEST_SEED;
/** The seed every test starts from. Fixed, unless TEST_SEED overrides it. */
export const TEST_SEED = envSeed ? Number(envSeed) : 0x5eed;
if (!Number.isInteger(TEST_SEED)) throw new Error(`TEST_SEED must be an integer, got "${envSeed}"`);

/** Call once at the top of a spec file: before EACH test Math.random restarts
 *  from `seed`, so a test sees the same numbers whatever ran before it; after
 *  each test the real Math.random is back. A test may still pin Math.random
 *  itself with vi.spyOn — restoring that also lands on the real one. */
export function seedMathRandom(seed: number = TEST_SEED): void {
  let spy: MockInstance<() => number> | undefined;
  beforeEach(() => {
    spy = vi.spyOn(Math, 'random').mockImplementation(mulberry32(seed));
  });
  afterEach(() => {
    spy?.mockRestore();
    spy = undefined;
  });
}
