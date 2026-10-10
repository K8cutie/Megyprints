import { useState } from 'react';

/** The end-of-album prompt opens EVERY time the reader arrives at the last
 *  spread (owner, 2026-10-02: "every time it reaches the end the pop up
 *  appears") — on opening Preview there, and each time they page back to it.
 *  It used to show once per visit (a `ctaSeen` latch), so after one ✕ the
 *  only way to order was the small corner button.
 *
 *  Arriving opens it; staying doesn't re-open it, so ✕ sticks while they look
 *  at the last spread, and an edit on the last page doesn't pop it again.
 *  (State-from-the-previous-render, not an effect: the prompt is up on the
 *  same render that lands on the end.) */
export function useEndOfAlbumPrompt(atEnd: boolean): { open: boolean; close: () => void } {
  const [open, setOpen] = useState(false);
  const [wasAtEnd, setWasAtEnd] = useState(false);
  if (atEnd !== wasAtEnd) {
    setWasAtEnd(atEnd);
    setOpen(atEnd);
  }
  return { open, close: () => setOpen(false) };
}
