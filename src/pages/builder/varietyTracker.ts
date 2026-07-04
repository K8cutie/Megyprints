/* ══════════════════════════════════════════════════════════════════════════
   Variety Tracker — Prevents repeats for "randomize until satisfied" flow
   Tracks last N items used and excludes them from the next pick.
   ══════════════════════════════════════════════════════════════════════════ */

export class VarietyTracker {
  history: string[] = [];
  maxHistory: number;

  constructor(maxHistory: number = 3) {
    this.maxHistory = maxHistory;
  }

  /** Track an item as recently used */
  track(item: string) {
    this.history.push(item);
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }
  }

  /** Get recently used items */
  getRecent(): string[] {
    return [...this.history];
  }

  /** Clear history */
  clear() {
    this.history = [];
  }

  /**
   * Pick a random item from `pool`, excluding the `recent` history.
   * If all items are recent, falls back to excluding only the most recent.
   * If the pool is empty, returns null.
   */
  pick(pool: string[], current?: string): string | null {
    if (pool.length === 0) return null;
    // Record single-option picks too — otherwise callers that check getRecent()
    // (e.g. the mixed-template de-cluster guard) never see this pick, so a lone
    // template gets placed on page after page beside itself.
    if (pool.length === 1) { this.track(pool[0]); return pool[0]; }

    const recentKeys = new Set<string>(this.history);
    if (current) recentKeys.add(current);

    let candidates = pool.filter((item) => !recentKeys.has(item));

    // If everything is excluded, just exclude the most recent one
    if (candidates.length === 0) {
      const last = this.history[this.history.length - 1];
      if (last) {
        candidates = pool.filter((item) => item !== last);
      }
    }

    // Ultimate fallback: pick from full pool
    if (candidates.length === 0) {
      candidates = pool;
    }

    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    this.track(pick);
    return pick;
  }
}

/** Module-level trackers for the builder */
export const templateTracker = new VarietyTracker(5);   // last 5 templates — spread layouts across more consecutive pages
export const themeTracker = new VarietyTracker(2);      // last 2 themes
export const backgroundTracker = new VarietyTracker(2); // last 2 backgrounds

/* ══════════════════════════════════════════════════════════════════════════
   ShuffleBag — dealt randomness for album generation.

   Per-pick randomness (even with a recent-exclusion window) CLUMPS — that is
   what true random does — and on thin pools it locks into A/B/A/B. Humans read
   both as "not random". The industry fix (Tetris' 7-bag, Spotify's shuffle
   rewrite) is a DEALER: shuffle the whole pool like a deck, deal one per page,
   reshuffle when empty. Every distinct layout then appears exactly once per
   cycle — maximum spread, no runs, no locks, BY CONSTRUCTION.
   ══════════════════════════════════════════════════════════════════════════ */

/** Fisher-Yates shuffle (non-mutating). */
export function shuffleArray<T>(items: readonly T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export class ShuffleBag {
  private readonly pool: string[];
  private bag: string[] = [];
  private last: string | null = null;
  private prev: string | null = null;

  constructor(ids: readonly string[]) {
    this.pool = [...new Set(ids)];
  }

  get size(): number { return this.pool.length; }

  private refill(): void {
    // Cards still owed from the old deck (skipped as currently-ineligible)
    // keep their turn at the FRONT — discarding them would let just-played
    // cards re-enter while owed ones starve for another full cycle.
    const owed = this.bag;
    const fresh = shuffleArray(this.pool.filter((id) => !owed.includes(id)));
    const b = [...owed, ...fresh];
    if (owed.length === 0) {
      // Seam guard 1: the new deck must not open with the card just played
      // (no A,A across the reshuffle boundary).
      if (b.length > 1 && b[0] === this.last) {
        const j = 1 + Math.floor(Math.random() * (b.length - 1));
        [b[0], b[j]] = [b[j], b[0]];
      }
      // Seam guard 2: avoid the A,B,A flicker across the boundary when the
      // pool is big enough to allow it.
      if (b.length > 2 && b[0] === this.prev) {
        const j = 1 + Math.floor(Math.random() * (b.length - 1));
        if (b[j] !== this.last) [b[0], b[j]] = [b[j], b[0]];
      }
    }
    this.bag = b;
  }

  /** Deal the next layout, optionally restricted to currently-eligible ids
   *  (e.g. "few photos left → only small layouts fit"). Skipped cards keep
   *  their place in the deck for later deals. Returns null only when the pool
   *  is empty or nothing eligible exists even after a reshuffle. */
  draw(eligible?: (id: string) => boolean): string | null {
    if (this.pool.length === 0) return null;
    for (let attempt = 0; attempt < 2; attempt++) {
      const idxs: number[] = [];
      for (let i = 0; i < this.bag.length; i++) {
        if (!eligible || eligible(this.bag[i])) idxs.push(i);
      }
      if (idxs.length > 0) {
        // Among eligible cards, prefer one that differs from the card just
        // played (and the one before). The refill seam guards only protect
        // deck position 0 — an eligibility-restricted scan right after a
        // refill could otherwise land straight back on `last`, producing the
        // exact A,A this class exists to prevent. Within an un-refilled deck
        // each id appears at most once (last is never still in the bag), so
        // this preference is a no-op there.
        const pick =
          idxs.find((i) => this.bag[i] !== this.last && this.bag[i] !== this.prev) ??
          idxs.find((i) => this.bag[i] !== this.last) ??
          idxs[0];
        const [id] = this.bag.splice(pick, 1);
        this.prev = this.last;
        this.last = id;
        return id;
      }
      this.refill();
    }
    return null;
  }
}
