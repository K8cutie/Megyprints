/* ══════════════════════════════════════════════════════════════════════════
   WHAT IS SELECTED ON A PAGE, kept in the website's own album builder.

   useBuilderState (shared) holds the editor's selection: selectedElementId,
   selectedSlotIndex, selectedTextId and selectedPhotoId, which the website's
   desktop editor fills the same way (BuilderEdit → setSelected…). The app
   writes all four from one tapped target, so the builder always knows the
   frame, the words or the photo picked.

   selectedElementId names the page too ('3|slot:2', 'cover|box:0'), like
   MobileReview's selection, tagged with the page it was made on: turning the
   page drops it with no reset to run, and coming back does not bring it back
   on a page that changed. A selection is read back against the page as it is
   NOW (its targets), so a frame that was filled since shows as its photo, and
   words deleted since (or undone) are no longer selected.
   ══════════════════════════════════════════════════════════════════════════ */
import type { BuilderActions } from '@web/pages/builder/useBuilderState';
import type { UploadedPhoto } from '@web/pages/builder/types';
import { SLOT_KINDS, type Target } from './hitTest';

/** Which page: an album page (0-based) or the front cover. */
export type PageKey = number | 'cover';

type SelectionSetters = Pick<BuilderActions, 'setSelectedElementId' | 'setSelectedSlotIndex' | 'setSelectedTextId' | 'setSelectedPhotoId'>;

export function selectionKey(page: PageKey, t: Target): string {
  return `${page}|${t.key}`;
}

/** Selects `t` on `page` in the builder (null: nothing selected). */
export function selectTarget(b: SelectionSetters, page: PageKey, t: Target | null, photos: readonly UploadedPhoto[]): void {
  b.setSelectedElementId(t ? selectionKey(page, t) : null);
  b.setSelectedSlotIndex(t && SLOT_KINDS.includes(t.kind) ? t.index : null);
  b.setSelectedTextId(t?.textId ?? null);
  b.setSelectedPhotoId(t?.photoIndex != null ? photos[t.photoIndex]?.id ?? null : null);
}

/** The selected target on `page` as the page is now, or null (nothing
 *  selected, selected on another page, or no longer there). */
export function selectedTarget(selectedElementId: string | null, page: PageKey, targets: readonly Target[]): Target | null {
  if (!selectedElementId) return null;
  const bar = selectedElementId.indexOf('|');
  if (bar < 0 || selectedElementId.slice(0, bar) !== String(page)) return null;
  const key = selectedElementId.slice(bar + 1);
  return targets.find((t) => t.key === key) ?? null;
}
