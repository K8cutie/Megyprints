/* ══════════════════════════════════════════════════════════════════════════
   The newest app on Home (owner, 2026-10-29: testers should always get the
   latest flow). In the Android app while TESTING_PHASE is on, when the app
   comes back to the front ON HOME, it reads /version.json (appVersion,
   #190) and, when the live build is another one, reloads into it.

   Only on Home, and only while nothing is open there (Today's test, a
   question): never in the builder, the photo picker or checkout, so no work
   is ever lost. appVersion's own guard stops a loop (two reloads in a row
   that didn't help → carry on). No "was just updated" note: nothing needs
   doing again after it.
   ══════════════════════════════════════════════════════════════════════════ */

import { useEffect } from 'react';
import { ensureLatestApp } from './appVersion';
import { TESTING_PHASE } from './testingPhase';

/** Home checks for a new version when it comes back to the front: the
 *  Android app only, while the testing switch is on. */
export function autoUpdatesOnHome(inApp: boolean, switchOn: boolean = TESTING_PHASE): boolean {
  return switchOn && inApp;
}

/** While `enabled`: each time the app comes back to the front, check, and
 *  reload when the live build is another one. */
export function useAutoUpdateOnHome(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    let checking = false;
    const onVisibility = () => {
      if (document.visibilityState !== 'visible' || checking) return;
      checking = true;
      void ensureLatestApp(null).finally(() => { checking = false; });
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [enabled]);
}
