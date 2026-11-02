/* ══════════════════════════════════════════════════════════════════════════
   HINTS UNDER THE PAGE in "Edit pages" (owner's phone test, 2026-11-02: the
   space between the page and the page numbers is "a usable space that we
   can show hints").

   Nothing picked: the row where a picked thing's buttons go says what the
   page can do, the first that fits (an empty box, a video memory's QR, a
   photo, words), and how to turn the page. A photo picked: its buttons
   fill that row, and the line under the page says it moves and zooms with
   a finger (photos/FramingOverlay.tsx), when that line has nothing else to
   say. The app's own words (the website's editor has no such line).
   ══════════════════════════════════════════════════════════════════════════ */
import type { Target, TargetKind } from './hitTest';

export const HINTS = {
  emptyFrame: 'Tap an empty box to add a photo, a quote or your own words.',
  emptyBox: 'Tap an empty box to add a quote or your own words.',
  qr: 'Tap the QR to change its video or move it to another corner.',
  photo: 'Tap a photo to replace, swap or style it.',
  words: 'Tap the words to change them.',
  turn: 'Swipe the page to turn it.',
  framing: 'Drag the photo to move it in its frame. Pinch to zoom.',
} as const;

const WORDS: readonly TargetKind[] = ['slotText', 'freeText', 'boxText'];

/** What the page can do, nothing picked: one line, then how to turn the page. */
export function pageHint(targets: readonly Pick<Target, 'kind'>[]): string {
  const has = (k: TargetKind) => targets.some((t) => t.kind === k);
  const first = has('emptySlot') ? HINTS.emptyFrame
    : has('emptyBox') ? HINTS.emptyBox
      : has('slotQr') || has('boxQr') ? HINTS.qr
        : has('photo') ? HINTS.photo
          : WORDS.some(has) ? HINTS.words
            : '';
  return [first, HINTS.turn].filter(Boolean).join(' ');
}

/** The line under the page for what is picked ('' when nothing to say). */
export function pickedHint(selected: Pick<Target, 'kind'> | null | undefined): string {
  return selected?.kind === 'photo' ? HINTS.framing : '';
}
