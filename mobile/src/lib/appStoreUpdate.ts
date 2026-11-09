/* ══════════════════════════════════════════════════════════════════════════
   A NEW VERSION ON THE APP STORE, SAID IN THE APP (iPhone; Android's is
   appUpdate.ts, through Google Play's in-app update).

   iPhone has no in-app update: the App Store installs a new version itself.
   So when the app comes on screen, it asks the App Store which version it
   has (Apple's public lookup, by the app's bundle id only; nothing about the
   person is sent) and, when that is newer than this one:
     "A new version of Megy Prints is ready." — Update in App Store / Later.
   The same rules as Android's box: only while the app is on screen, never
   two boxes at once, never while an order is being made and sent (opening
   the App Store would leave it half-way), and Later (or a tap beside the
   box) waits LATER_WAIT_MS (4 hours). Update opens the App Store page and
   waits the same 4 hours, so coming back does not ask again at once.

   The App Store is asked at most once an hour (LOOKUP_EVERY_MS). A test
   build (com.megyprints.app.dev) is not on the App Store: the lookup finds
   nothing and nothing shows.
   ══════════════════════════════════════════════════════════════════════════ */
import Constants from 'expo-constants';
import { useEffect } from 'react';
import { Alert, AppState, Linking, type AlertButton, type AlertOptions } from 'react-native';
import { LATER, LATER_WAIT_MS, laterHolds, NEVER, UPDATE_READY } from './appUpdate';
import { orderBeingSent } from './checkout/backgroundSend';

/** The box's button that opens the App Store page. */
export const UPDATE_IN_STORE = 'Update in App Store';
/** The App Store is asked at most this often. */
export const LOOKUP_EVERY_MS = 60 * 60 * 1000;

/** Is `store` a newer version than `current`? ("2.0.10" > "2.0.9"; missing parts are 0.) */
export function isNewerVersion(store: string, current: string): boolean {
  const parts = (v: string) => v.trim().split('.').map((p) => {
    const n = parseInt(p, 10);
    return Number.isFinite(n) ? n : 0;
  });
  const a = parts(store), b = parts(current);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0, y = b[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}

/** What the App Store says about this app, or null (not there, offline). */
export interface StoreVersion {
  version: string;
  /** The app's App Store page. */
  url: string;
}

/** Apple's public lookup, by bundle id, in the Philippine store. */
export async function lookUpStoreVersion(bundleId: string, fetchFn: typeof fetch = fetch): Promise<StoreVersion | null> {
  try {
    const res = await fetchFn(`https://itunes.apple.com/lookup?bundleId=${encodeURIComponent(bundleId)}&country=ph`);
    if (!res.ok) return null;
    const body = await res.json() as { results?: { version?: unknown; trackViewUrl?: unknown }[] };
    const r = body.results?.[0];
    return r && typeof r.version === 'string' && typeof r.trackViewUrl === 'string' ? { version: r.version, url: r.trackViewUrl } : null;
  } catch {
    return null;
  }
}

type Ask = (title: string, message: string | undefined, buttons: AlertButton[], options: AlertOptions) => void;

export interface StorePromptDeps {
  /** This app's version (app.json "version"). */
  current: string;
  lookUp: () => Promise<StoreVersion | null>;
  /** An order is being made and sent. */
  sending: () => boolean;
  now: () => number;
  ask: Ask;
  open: (url: string) => void;
}

export interface StorePrompt {
  cameOnScreen(): Promise<void>;
  leftScreen(): void;
}

export function createAppStorePrompt(deps: StorePromptDeps): StorePrompt {
  let onScreen = false;
  let boxShowing = false;
  let laterAt = NEVER;
  let lookedAt = NEVER;
  let known: StoreVersion | null = null;
  const wait = () => { boxShowing = false; laterAt = deps.now(); };
  return {
    async cameOnScreen() {
      onScreen = true;
      if (boxShowing || deps.sending() || laterHolds(laterAt, deps.now())) return;
      if (lookedAt === NEVER || deps.now() - lookedAt >= LOOKUP_EVERY_MS) {
        lookedAt = deps.now();
        known = await deps.lookUp();
      }
      // The answer can come after the person left: checked again here.
      if (!known || !isNewerVersion(known.version, deps.current)) return;
      if (!onScreen || boxShowing || deps.sending() || laterHolds(laterAt, deps.now())) return;
      const url = known.url;
      boxShowing = true;
      deps.ask('', UPDATE_READY, [
        { text: LATER, style: 'cancel', onPress: wait },
        { text: UPDATE_IN_STORE, onPress: () => { wait(); deps.open(url); } },
      ], { cancelable: true, onDismiss: wait });
    },
    leftScreen() {
      onScreen = false;
    },
  };
}

const realDeps = (): StorePromptDeps => {
  const bundleId = Constants.expoConfig?.ios?.bundleIdentifier ?? '';
  return {
    current: Constants.expoConfig?.version ?? '0',
    lookUp: () => (bundleId ? lookUpStoreVersion(bundleId) : Promise.resolve(null)),
    sending: orderBeingSent,
    now: () => Date.now(),
    ask: Alert.alert,
    open: (url) => { void Linking.openURL(url).catch(() => {}); },
  };
};

/** For the app's root on iPhone: checks when the app comes on screen. */
export function useAppStoreUpdatePrompt(deps: StorePromptDeps = realDeps()): void {
  useEffect(() => {
    const prompt = createAppStorePrompt(deps);
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

export { LATER, LATER_WAIT_MS };
