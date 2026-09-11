/* ── v2 · Assign photos to the slots of one page ────────────────────────────
   A page has at most six slots, so "which photo goes where" can be solved
   exactly: try every arrangement and keep the one with the highest total fit.
   The wide group photo lands in the widest slot by itself — no special rule —
   because that is where it scores highest.

   When the candidate pool is larger than the slot count (a mixed-ratio layout
   choosing from a whole moment), exhaustive search explodes, so it falls back
   to greedy-by-best-score followed by pairwise swaps until nothing improves.
   Pure; no engine types. */

export interface Assignment {
  /** picks[slot] = index of the item placed in that slot. */
  picks: number[];
  total: number;
}

/** Exhaustive search for `n` items into `n` slots. n ≤ 7 keeps this under
 *  5,040 evaluations; above that callers must use the greedy path. */
function exhaustive(n: number, score: (item: number, slot: number) => number): Assignment {
  const best: Assignment = { picks: [], total: -Infinity };
  const picks: number[] = new Array(n).fill(-1);
  const used: boolean[] = new Array(n).fill(false);
  // Pre-score so the recursion is arithmetic only.
  const table: number[][] = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, s) => score(i, s)));

  const recurse = (slot: number, running: number) => {
    if (slot === n) {
      if (running > best.total) { best.total = running; best.picks = [...picks]; }
      return;
    }
    for (let i = 0; i < n; i++) {
      if (used[i]) continue;
      used[i] = true;
      picks[slot] = i;
      recurse(slot + 1, running + table[i][slot]);
      used[i] = false;
    }
  };
  recurse(0, 0);
  return best;
}

/** Greedy: fill each slot with the best remaining item, then improve by
 *  swapping any two slots' items while it raises the total. */
function greedyThenSwap(items: number, slots: number, score: (item: number, slot: number) => number): Assignment {
  const picks: number[] = [];
  const used = new Set<number>();
  for (let s = 0; s < slots; s++) {
    let bestI = -1;
    let bestV = -Infinity;
    for (let i = 0; i < items; i++) {
      if (used.has(i)) continue;
      const v = score(i, s);
      if (v > bestV) { bestV = v; bestI = i; }
    }
    if (bestI < 0) break;
    used.add(bestI);
    picks.push(bestI);
  }
  // 2-opt on the chosen set.
  let improved = true;
  while (improved) {
    improved = false;
    for (let a = 0; a < picks.length; a++) {
      for (let b = a + 1; b < picks.length; b++) {
        const now = score(picks[a], a) + score(picks[b], b);
        const swapped = score(picks[b], a) + score(picks[a], b);
        if (swapped > now + 1e-9) {
          [picks[a], picks[b]] = [picks[b], picks[a]];
          improved = true;
        }
      }
    }
  }
  let total = 0;
  picks.forEach((i, s) => { total += score(i, s); });
  return { picks, total };
}

/**
 * Best placement of `items` candidates into `slots` positions (items ≥ slots).
 * Exact when the counts are equal and small; greedy+swap otherwise.
 */
export function bestAssignment(
  items: number,
  slots: number,
  score: (item: number, slot: number) => number,
): Assignment {
  if (slots <= 0 || items <= 0) return { picks: [], total: 0 };
  if (items === slots && slots <= 7) return exhaustive(slots, score);
  return greedyThenSwap(items, slots, score);
}
