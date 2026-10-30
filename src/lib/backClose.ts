/* ══════════════════════════════════════════════════════════════════════════
   backClose — Back closes what is open on top first.

   The Android app's Back button and the browser's Back both reach the
   builder as one history step (BuilderBackGuard catches it). Before the
   guard gives Back its own meaning (Preview → the pages, or "Leave the
   builder?"), it asks here: a panel that is open over the screen, such as
   Megy's panel on a phone, closes instead, and the screen stays as it was
   (tester, 2026-10-30: Megy's panel over the last page would not close).
   ══════════════════════════════════════════════════════════════════════════ */

import { useEffect, useRef } from 'react';

/** What Back closes, oldest first. */
const open: { close: () => void }[] = [];

/** Back was pressed: close the newest open thing. False when nothing was open. */
export function closeTopOnBack(): boolean {
  const top = open.pop();
  if (!top) return false;
  top.close();
  return true;
}

/** While `isOpen`, Back calls `close` (and does nothing else). */
export function useCloseOnBack(isOpen: boolean, close: () => void): void {
  const closeRef = useRef(close);
  useEffect(() => { closeRef.current = close; });
  useEffect(() => {
    if (!isOpen) return;
    const entry = { close: () => closeRef.current() };
    open.push(entry);
    return () => {
      const i = open.indexOf(entry);
      if (i >= 0) open.splice(i, 1);
    };
  }, [isOpen]);
}
