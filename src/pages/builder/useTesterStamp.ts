import { useMemo, useState } from 'react';
import { isNativeShell } from '../../lib/nativeShell';
import { albumMadeAt, showTesterStamp, testerStampLines } from '../../lib/testingPhase';

/** The stamp for this album in this app ("For Testing purposes" + when it was
 *  made), or null: on the website, with the switch off, or before the album
 *  is made. */
export function useTesterStamp(pages: readonly unknown[]): readonly [string, string] | null {
  const [inApp] = useState(() => showTesterStamp(isNativeShell()));
  const madeAt = inApp ? albumMadeAt(pages) : null;
  return useMemo(() => (madeAt == null ? null : testerStampLines(madeAt)), [madeAt]);
}
