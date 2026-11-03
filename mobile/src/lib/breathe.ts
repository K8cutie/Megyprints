/* ══════════════════════════════════════════════════════════════════════════
   A PAUSE BETWEEN THE STEPS OF LONG WORK (the print files, page by page).

   On screen: a timer, so the screen gets to draw (the progress bar moves).
   Out of sight: React Native runs the app's timers on the screen's refresh
   (JavaTimerManager on the Choreographer), and Android all but stops that
   for an app that is not on screen, so every page waited for it: about 3
   pages a minute against many more on screen (owner's phone test,
   2026-11-02). There the next step runs as soon as JavaScript is free
   (setImmediate needs no screen refresh); nothing is drawn anyway.
   ══════════════════════════════════════════════════════════════════════════ */
import { AppState } from 'react-native';

export function breathe(appState: () => string = () => String(AppState.currentState)): Promise<void> {
  return new Promise((resolve) => {
    if (appState() === 'active') setTimeout(resolve, 0);
    else setImmediate(resolve);
  });
}
