/* A SECOND TAP IS NOT AIMED AT WHAT IS NOW UNDER THE FINGER (owner, 2026-11-04:
   "the combo box add photo quote own text appeared during editing"; both ways
   reproduced on the emulator, test/pageTapGuard.test.tsx). The website's
   settleGuard.ts rule, for the page in Edit pages:
     • a sheet closed: it was covering the page, so a double tap on it (or an
       impatient second tap) falls through;
     • the page moved: what is selected changed, its buttons came or went, and
       the page shrank or grew, so a second tap lands on something else. */
import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';

/** Longer than an impatient second tap: 0.7 s still fell through. */
export const AFTER_SHEET_MS = 800;
/** Long enough to see that the page moved. */
export const AFTER_MOVE_MS = 700;

export interface PageTapGuard {
  afterSheet(): boolean;
  afterMove(): boolean;
}

export function usePageTapGuard(selectedKey: string | null, covered: boolean): PageTapGuard {
  const sheetUntil = useRef(Number.NEGATIVE_INFINITY);
  const moveUntil = useRef(Number.NEGATIVE_INFINITY);
  const wasCovered = useRef(covered);
  const first = useRef(true);
  useLayoutEffect(() => {
    if (wasCovered.current && !covered) sheetUntil.current = performance.now() + AFTER_SHEET_MS;
    wasCovered.current = covered;
  }, [covered]);
  useLayoutEffect(() => {
    // On CHANGE only: the screen opening moved nothing.
    if (first.current) { first.current = false; return; }
    moveUntil.current = performance.now() + AFTER_MOVE_MS;
  }, [selectedKey]);
  const afterSheet = useCallback(() => performance.now() < sheetUntil.current, []);
  const afterMove = useCallback(() => performance.now() < moveUntil.current, []);
  return useMemo(() => ({ afterSheet, afterMove }), [afterSheet, afterMove]);
}
