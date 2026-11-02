/* ══════════════════════════════════════════════════════════════════════════
   WHICH SCREENS TURN WITH THE PHONE.

   Every screen of the app is upright: app.json "orientation": "portrait",
   which prebuild writes into the Android manifest. The Preview alone turns
   with the phone (owner, 2026-11: turning the phone shows the open book full
   screen; src/builder/previewLayout.ts):
     • while it is the screen on top, the phone may turn it. The phone's own
       auto-rotate setting decides, as in every app (OrientationLock.DEFAULT:
       with auto-rotate off, Android shows its small "turn" button instead);
     • when it is left (the editor opens over it, or it closes), the app is
       upright again (OrientationLock.PORTRAIT_UP).
   The root layout makes the app upright when it starts too, so a reload on
   the Preview (while developing) never leaves another screen turned.

   expo-screen-orientation has a native half: an app built before it was
   added (an older dev APK) does not have it, and the module throws when it
   is loaded. So it is loaded here only, when first asked: such an app just
   stays upright, and the Preview does not say "turn your phone sideways".
   test/screenTurning.test.ts holds these rules.
   ══════════════════════════════════════════════════════════════════════════ */
import { useEffect } from 'react';
import type * as ScreenOrientation from 'expo-screen-orientation';

/** The screens (their names under src/app) that turn with the phone. Every
 *  other screen stays upright. */
export const SCREENS_THAT_TURN: readonly string[] = ['preview'];

/** May this screen turn with the phone? */
export function mayTurn(screen: string): boolean {
  return SCREENS_THAT_TURN.includes(screen);
}

/** expo-screen-orientation, or null in an app built without its native half. */
function orientation(): typeof ScreenOrientation | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-screen-orientation') as typeof ScreenOrientation;
  } catch {
    return null;
  }
}

/** This app can turn a screen (it was built with expo-screen-orientation). */
export function screenCanTurn(): boolean {
  return orientation() !== null;
}

/** The phone may turn the screen (its auto-rotate setting decides). */
export async function letTheScreenTurn(): Promise<void> {
  const o = orientation();
  if (!o) return;
  await o.lockAsync(o.OrientationLock.DEFAULT).catch(() => {});
}

/** Upright, as every screen but the Preview. */
export async function keepTheScreenUpright(): Promise<void> {
  const o = orientation();
  if (!o) return;
  await o.lockAsync(o.OrientationLock.PORTRAIT_UP).catch(() => {});
}

/** While `screen` is the screen on top (`focused`, expo-router's
 *  useIsFocused) and is one of SCREENS_THAT_TURN, the phone may turn it;
 *  when another screen opens over it, or it closes, the app is upright
 *  again. */
export function useTurnsWithThePhone(screen: string, focused: boolean): void {
  const turns = focused && mayTurn(screen);
  useEffect(() => {
    if (!turns) return undefined;
    void letTheScreenTurn();
    return () => { void keepTheScreenUpright(); };
  }, [turns]);
}
