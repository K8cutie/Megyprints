/* The picked thing's buttons under the page, in rows, all in view (owner,
   2026-11-03: they scrolled sideways before, and the last ones were off the
   screen). A button that removes (danger, in red) comes last, after the
   others in their parts' order, so it is never the one under the thumb by
   mistake. */
export function dangerLast<A extends { danger?: boolean }>(actions: readonly A[]): A[] {
  return [...actions.filter((a) => !a.danger), ...actions.filter((a) => a.danger)];
}
