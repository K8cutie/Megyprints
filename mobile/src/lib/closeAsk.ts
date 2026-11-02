/* ══════════════════════════════════════════════════════════════════════════
   BACK NEVER CLOSES THE APP WITHOUT ASKING (owner, 2026-11-02: "i pressed
   back by accident ... Is there an 'are you sure you want to exit app'
   message?").

   Android's Back goes back a screen. With no screen left to go back to, it
   would close the app: the app asks first, "Close Megy Prints?", with Stay
   (the default, and what tapping outside the question does) and Close.
   A screen that takes Back for itself (the "Making your album" screen, an
   open sheet) still does: its own listener comes first.
   ══════════════════════════════════════════════════════════════════════════ */
import { useEffect } from 'react';
import { Alert, BackHandler, type AlertButton } from 'react-native';

export const CLOSE_TITLE = 'Close Megy Prints?';
export const STAY = 'Stay';
export const CLOSE = 'Close';

type Ask = (title: string, message: string | undefined, buttons: AlertButton[], options: { cancelable: boolean }) => void;

/** Back was pressed: nothing to go back to, so ask before closing. True when
 *  Back was taken here (asked); false to let it go back a screen. */
export function askBeforeClosing(
  canGoBack: () => boolean,
  ask: Ask = Alert.alert,
  close: () => void = () => BackHandler.exitApp(),
): boolean {
  if (canGoBack()) return false;
  ask(CLOSE_TITLE, undefined, [{ text: STAY, style: 'cancel' }, { text: CLOSE, style: 'destructive', onPress: close }], { cancelable: true });
  return true;
}

/** For the app's root: Back on the last screen asks before closing. */
export function useAskBeforeClosing(canGoBack: () => boolean): void {
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => askBeforeClosing(canGoBack));
    return () => sub.remove();
  }, [canGoBack]);
}
