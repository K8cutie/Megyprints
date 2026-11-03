/* ══════════════════════════════════════════════════════════════════════════
   HINTS UNDER THE PAGE in "Edit pages" (owner's phone test, 2026-11-02: the
   space between the page and the page numbers is "a usable space that we
   can show hints").

   Nothing picked: the row where a picked thing's buttons go is the guide,
   "Select a photo to edit." (owner, 2026-11-03, with the new layout); a
   page with no photo says what it can do instead (an empty box, words). A
   photo picked: its buttons fill that row, and the line under the page
   says it moves and zooms with a finger (photos/FramingOverlay.tsx), when
   that line has nothing else to say. The app's own words (the website's
   editor has no such line).
   ══════════════════════════════════════════════════════════════════════════ */
import type { Target, TargetKind } from './hitTest';

export const HINTS = {
  selectPhoto: 'Select a photo to edit.',
  emptyFrame: 'Tap an empty box to add a photo, a quote or your own words.',
  emptyBox: 'Tap an empty box to add a quote or your own words.',
  words: 'Tap the words to change them.',
  framing: 'Drag the photo to move it in its frame. Pinch to zoom.',
} as const;

const WORDS: readonly TargetKind[] = ['slotText', 'freeText', 'boxText'];

/** The guide, nothing picked: "Select a photo to edit." on a page with a
 *  photo; else what the page can do; '' when there is nothing to say. */
export function pageHint(targets: readonly Pick<Target, 'kind'>[]): string {
  const has = (k: TargetKind) => targets.some((t) => t.kind === k);
  return has('photo') ? HINTS.selectPhoto
    : has('emptySlot') ? HINTS.emptyFrame
      : has('emptyBox') ? HINTS.emptyBox
        : WORDS.some(has) ? HINTS.words
          : '';
}

/** The line under the page for what is picked ('' when nothing to say). */
export function pickedHint(selected: Pick<Target, 'kind'> | null | undefined): string {
  return selected?.kind === 'photo' ? HINTS.framing : '';
}
