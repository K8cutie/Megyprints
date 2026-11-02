/* The app's own native module that keeps an order going while the person
   uses other apps (android/src/main/java/expo/modules/megyorderkeeper):
     • a foreground service with a notification showing the bar, so Android
       does not freeze or close the app while the print files are made and
       sent;
     • a React Native "headless task" for the same time: with the app out of
       sight, React Native stops the app's timers unless one is running, and
       making the print files waits on a timer between pages;
     • at the end, a notification that says how it went (tap: the app opens).
   lib/checkout/backgroundSend.ts decides what it says. Missing in jest and
   in an APK built before it: every call is then a no-op. */
import { requireOptionalNativeModule } from 'expo';
import { AppRegistry } from 'react-native';

/** The native half (OrderKeeperModule.kt). */
export interface OrderKeeperNative {
  /** Notifications are on for the app (Android settings). */
  notificationsAllowed(): boolean;
  /** Starts the service and the headless task; says which started. */
  start(title: string, text: string): Promise<{ service: boolean; task: boolean }>;
  /** The notification's words and bar (0–100; below 0: a moving bar). */
  update(title: string, text: string, percent: number): void;
  /** Stops both; with words, then shows the "done" notification. */
  finish(title: string | null, text: string | null): Promise<void>;
}

const native = requireOptionalNativeModule<OrderKeeperNative>('MegyOrderKeeper');

/** The headless task's name (OrderKeeperModule.TASK_KEY). */
export const KEEPER_TASK = 'MegyOrderKeeper';

/* The headless task: React Native runs it (and keeps the app's timers going)
   until the promise ends, which the keeper ends when the order is done. */
let running: Promise<void> | null = null;
let release: (() => void) | null = null;
if (native) {
  AppRegistry.registerHeadlessTask(KEEPER_TASK, () => () => running ?? Promise.resolve());
}

/** The module with the headless task wired in, or null (jest, an older APK). */
export const orderKeeper: OrderKeeperNative | null = native
  ? {
      notificationsAllowed: () => native.notificationsAllowed(),
      start: async (title, text) => {
        running = new Promise<void>((r) => { release = r; });
        try {
          return await native.start(title, text);
        } catch (e) {
          const r = release;
          release = null;
          running = null;
          r?.();
          throw e;
        }
      },
      update: (title, text, percent) => native.update(title, text, percent),
      finish: async (title, text) => {
        try {
          await native.finish(title, text);
        } finally {
          const r = release;
          release = null;
          running = null;
          r?.();
        }
      },
    }
  : null;
