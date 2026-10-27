/* ══════════════════════════════════════════════════════════════════════════
   WHICH PHOTOS ARE PICKED, in the pick-photos grid.

   Two shapes, so "Select all" costs nothing even with 20,000 photos and
   still covers photos that are still loading:
     • { mode: 'some', ids }    the photos tapped on (or whole days);
     • { mode: 'all', except }  everything, minus the ones tapped off.
   Photos already in the album ("blocked") are never picked again.
   Every change returns a new object (React sees it); nothing is mutated.
   ══════════════════════════════════════════════════════════════════════════ */

export type Selection =
  | { readonly mode: 'some'; readonly ids: ReadonlySet<string> }
  | { readonly mode: 'all'; readonly except: ReadonlySet<string> };

const NONE: ReadonlySet<string> = new Set();

export const nothingSelected = (): Selection => ({ mode: 'some', ids: new Set() });
export const everythingSelected = (): Selection => ({ mode: 'all', except: new Set() });

export function isSelected(sel: Selection, id: string, blocked: ReadonlySet<string> = NONE): boolean {
  if (blocked.has(id)) return false;
  return sel.mode === 'some' ? sel.ids.has(id) : !sel.except.has(id);
}

/** Picks one photo, or un-picks it. */
export function toggle(sel: Selection, id: string, blocked: ReadonlySet<string> = NONE): Selection {
  if (blocked.has(id)) return sel;
  return setMany(sel, [id], !isSelected(sel, id));
}

/** Picks (on = true) or un-picks a group of photos, such as one day. */
export function setMany(sel: Selection, ids: readonly string[], on: boolean, blocked: ReadonlySet<string> = NONE): Selection {
  const wanted = ids.filter((id) => !blocked.has(id));
  if (sel.mode === 'some') {
    const next = new Set(sel.ids);
    for (const id of wanted) {
      if (on) next.add(id);
      else next.delete(id);
    }
    return { mode: 'some', ids: next };
  }
  const except = new Set(sel.except);
  for (const id of wanted) {
    if (on) except.delete(id);
    else except.add(id);
  }
  return { mode: 'all', except };
}

/** The picked photos' ids, in the order of `allIds`. */
export function selectedIds(sel: Selection, allIds: readonly string[], blocked: ReadonlySet<string> = NONE): string[] {
  return allIds.filter((id) => isSelected(sel, id, blocked));
}

export function countSelected(sel: Selection, allIds: readonly string[], blocked: ReadonlySet<string> = NONE): number {
  if (sel.mode === 'some') {
    let n = 0;
    for (const id of sel.ids) if (!blocked.has(id)) n++;
    return n;
  }
  let n = 0;
  for (const id of allIds) if (!blocked.has(id) && !sel.except.has(id)) n++;
  return n;
}

/** How much of a group (a day) is picked. Blocked photos don't count; a
 *  group with nothing pickable left is 'none'. */
export function groupState(sel: Selection, ids: readonly string[], blocked: ReadonlySet<string> = NONE): 'all' | 'some' | 'none' {
  let picked = 0;
  let pickable = 0;
  for (const id of ids) {
    if (blocked.has(id)) continue;
    pickable++;
    if (isSelected(sel, id)) picked++;
  }
  if (pickable === 0 || picked === 0) return 'none';
  return picked === pickable ? 'all' : 'some';
}

/** Forgets photos that are no longer on the phone (deleted, or access taken
 *  away), so the count never includes a photo that can't be added. Returns
 *  the same object when nothing changed. */
export function keepOnly(sel: Selection, present: ReadonlySet<string>): Selection {
  const list = sel.mode === 'some' ? sel.ids : sel.except;
  let gone = false;
  for (const id of list) if (!present.has(id)) { gone = true; break; }
  if (!gone) return sel;
  const kept = new Set([...list].filter((id) => present.has(id)));
  return sel.mode === 'some' ? { mode: 'some', ids: kept } : { mode: 'all', except: kept };
}

/** Is every pickable photo picked? (for "Select all" / "Unselect all") */
export function allPicked(sel: Selection, allIds: readonly string[], blocked: ReadonlySet<string> = NONE): boolean {
  const pickable = allIds.reduce((n, id) => (blocked.has(id) ? n : n + 1), 0);
  return pickable > 0 && countSelected(sel, allIds, blocked) === pickable;
}
