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
    if (pool.length === 1) return pool[0];

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
export const templateTracker = new VarietyTracker(3);   // last 3 templates
export const themeTracker = new VarietyTracker(2);      // last 2 themes
export const backgroundTracker = new VarietyTracker(2); // last 2 backgrounds
