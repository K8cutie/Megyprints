/* ══════════════════════════════════════════════════════════════════════════
   A NEW VERSION FROM GOOGLE PLAY, ASKED FOR IN THE APP (owner, 2026-11-04:
   "Yes, add it", so 2.0.2 and later reach testers soon after they are out,
   the way 1.x's have since 1.4.0).

   The rules and words of 1.x (android-native AppUpdatePrompt.java,
   UpdateDecision.java), with Play's flexible in-app update
   (modules/app-update):
     • the app comes on screen and Play has a newer version: Google's own
       sheet asks, once per launch; a yes downloads it while the person keeps
       using the app, a no holds until the next launch;
     • once it is downloaded, the next time the app comes back on screen (from
       the photo picker, the sign-in tab, Home, or a new launch): "A new
       version of Megy Prints is ready." — Restart to update / Later. Never
       while they are in the app, where a tap meant for the album could land
       on it, and the app never restarts without that tap. Later waits 4
       hours (the app can stay open for days);
     • new in 2.0: neither while an order is being made and sent
       (lib/checkout/backgroundSend.ts): a restart would stop it half-way.

   An Alert can't tell Back from a tap beside the box (1.x ignored the tap):
   both count as Later, which only waits. Only an app installed from Google
   Play can be updated; anywhere else the check fails and nothing shows.
   ══════════════════════════════════════════════════════════════════════════ */
import { useEffect } from 'react';
import { Alert, AppState, type AlertButton, type AlertOptions } from 'react-native';
import { appUpdate, type AppUpdateInfo, type AppUpdateNative } from '../../modules/app-update';
import { orderBeingSent } from './checkout/backgroundSend';

/** 1.x's words (android-native strings.xml). */
export const UPDATE_READY = 'A new version of Megy Prints is ready.';
export const RESTART = 'Restart to update';
export const LATER = 'Later';

/** Play's numbers (UpdateAvailability, InstallStatus), as 1.x has them. */
export const UPDATE_AVAILABLE = 2;
export const PENDING = 1;
export const DOWNLOADING = 2;
export const INSTALLING = 3;
export const DOWNLOADED = 11;

/** How long Later holds: 4 hours. */
export const LATER_WAIT_MS = 4 * 60 * 60 * 1000;
/** laterAt when Later has not been tapped. */
export const NEVER = -1;

const underWay = (installStatus: number) => [PENDING, DOWNLOADING, DOWNLOADED, INSTALLING].includes(installStatus);

/** Ask about the new version (Google's sheet)? Only while the app is on
 *  screen, once per launch, never while a download is under way or an order
 *  is being sent. */
export function shouldStartFlow(info: Pick<AppUpdateInfo, 'availability' | 'installStatus' | 'flexibleAllowed'>, onScreen: boolean, askedThisLaunch: boolean, sending: boolean): boolean {
  if (!onScreen || askedThisLaunch || sending) return false;
  if (info.availability !== UPDATE_AVAILABLE || !info.flexibleAllowed) return false;
  return !underWay(info.installStatus);
}

export function laterHolds(laterAt: number, now: number): boolean {
  return laterAt !== NEVER && now - laterAt < LATER_WAIT_MS;
}

/** Say the new version is ready? Once it is downloaded and the app is on
 *  screen, never two boxes at once, not while Later holds, not while an
 *  order is being sent. */
export function shouldShowReadyBox(installStatus: number, onScreen: boolean, boxShowing: boolean, laterAt: number, now: number, sending: boolean): boolean {
  return installStatus === DOWNLOADED && onScreen && !boxShowing && !sending && !laterHolds(laterAt, now);
}

type Ask = (title: string, message: string | undefined, buttons: AlertButton[], options: AlertOptions) => void;

export interface PromptDeps {
  native: AppUpdateNative | null;
  /** An order is being made and sent. */
  sending: () => boolean;
  now: () => number;
  ask: Ask;
}

export interface UpdatePrompt {
  /** The app came on screen (a launch, or back from elsewhere). */
  cameOnScreen(): Promise<void>;
  /** The app went out of sight. */
  leftScreen(): void;
}

/** One per launch: what it asked, and when Later was tapped. */
export function createUpdatePrompt(deps: PromptDeps): UpdatePrompt {
  let onScreen = false;
  let askedThisLaunch = false;
  let boxShowing = false;
  let laterAt = NEVER;
  const later = () => { boxShowing = false; laterAt = deps.now(); };
  const showBox = (native: AppUpdateNative) => {
    boxShowing = true;
    // The line alone, as 1.x's box (Android hides an empty title).
    deps.ask('', UPDATE_READY, [
      { text: LATER, style: 'cancel', onPress: later },
      { text: RESTART, onPress: () => { boxShowing = false; native.completeUpdate().catch(() => {}); } },
    ], { cancelable: true, onDismiss: later });
  };
  return {
    async cameOnScreen() {
      onScreen = true;
      const native = deps.native;
      if (!native) return;
      let info: AppUpdateInfo;
      try {
        info = await native.check();
      } catch {
        return; // not installed from Google Play
      }
      // The answer can come after the person left (the photo picker): both
      // rules check onScreen, so nothing opens on top of it.
      if (shouldShowReadyBox(info.installStatus, onScreen, boxShowing, laterAt, deps.now(), deps.sending())) {
        showBox(native);
        return;
      }
      if (shouldStartFlow(info, onScreen, askedThisLaunch, deps.sending())) {
        // Set first: closing the sheet brings the app back on screen, which checks again.
        askedThisLaunch = true;
        await native.startFlexible().catch(() => false);
      }
    },
    leftScreen() {
      onScreen = false;
    },
  };
}

const realDeps = (): PromptDeps => ({ native: appUpdate, sending: orderBeingSent, now: () => Date.now(), ask: Alert.alert });

/** For the app's root: checks when the app comes on screen, the whole time it is open. */
export function useAppUpdatePrompt(deps: PromptDeps = realDeps()): void {
  useEffect(() => {
    const prompt = createUpdatePrompt(deps);
    if (AppState.currentState === 'active') void prompt.cameOnScreen();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void prompt.cameOnScreen();
      else prompt.leftScreen();
    });
    return () => sub.remove();
    // One prompt for the app's whole life.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
