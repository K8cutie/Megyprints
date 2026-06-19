/** ══════════════════════════════════════════════════════════════════════════
    SLOT UTILS — the duplicate-photo capstone

    A single invariant enforced at every render surface (editor canvas, live
    preview, print pipeline): the same photo never appears twice on one page.
    The store's fill paths already avoid creating duplicates, but this is the
    last line of defense — no matter how a page's slotFills were produced, a
    duplicate can't display or print. Later duplicates collapse to an empty
    slot (better an empty frame than the same picture twice).
    ══════════════════════════════════════════════════════════════════════════ */

/** Return a copy of slotFills where each photo index appears at most once;
 *  any repeat of an earlier slot becomes null. Cross-PAGE repeats (e.g. an
 *  intentionally duplicated page) are untouched — this is per-page only. */
export function dedupeSlotFills(fills: readonly (number | null)[] | undefined): (number | null)[] {
  if (!fills) return [];
  const seen = new Set<number>();
  return fills.map((f) => {
    if (f == null) return null;
    if (seen.has(f)) return null;
    seen.add(f);
    return f;
  });
}
