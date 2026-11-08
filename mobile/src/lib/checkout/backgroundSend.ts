/* ══════════════════════════════════════════════════════════════════════════
   PLACE ORDER, EVEN IN ANOTHER APP: the order keeper (modules/order-keeper).

   Making the print files on the phone takes minutes. If the person opens
   another app meanwhile, Android pauses this app's timers (React Native
   stops them for an app out of sight) and may freeze or close it, and the
   order stops half-way. While an order is made and sent, the keeper keeps
   the app working, with a notification showing the bar, and when it is done
   while the person is in another app, a notification says so (tap: the app
   opens on the order).

   This file decides what the notifications say, with the screens' words
   (the website's where it has them), and when. Every native call is
   wrapped: the keeper never stops an order. Without the native half (jest,
   an APK made before it) it does nothing, and the screen says "Keep this
   screen open", as before.
   ══════════════════════════════════════════════════════════════════════════ */
import { paidByBooking } from '../events/eventDeal';
import { AppState, PermissionsAndroid, Platform } from 'react-native';
import type { PlaceProgress } from '@web/lib/placeProgress';
import { orderKeeper, type OrderKeeperNative } from '../../../modules/order-keeper';
import { barPercent } from './placeRun';
import type { PlacedOrder } from './sendOrder';

export type KeeperNative = OrderKeeperNative;

/** The notification's title while it works: the bar's name on the website
 *  (PlaceOrderProgress aria-label) and the app's screen heading. */
export const KEEPER_TITLE = 'Placing your order';
/** The "done" notification when Place order stopped: its text is the same
 *  words the screen shows (why, and what to do). */
export const FAILED_TITLE = 'Placing your order stopped';
/** Under the bar when the keeper runs (instead of "Keep this screen open"). */
export const BACKGROUND_NOTE = 'You can use other apps while we make and send your order. A notification will tell you when it is done.';

/** The "done" notification for an order sent: the website's words after
 *  Place order ("Order MP-… is placed. Pay by bank transfer to finish."), or
 *  its tracking headline for a tester order. */
export function placedNotice(order: Pick<PlacedOrder, 'order_number'>, tester: boolean, bookingNumber: string | null = null): { title: string; text: string } {
  // An event album its booking paid for (Order.tsx's line after it).
  if (bookingNumber) return { title: `Order ${order.order_number} is placed`, text: paidByBooking(bookingNumber) };
  return tester
    ? { title: 'Test order placed', text: `Order ${order.order_number}` }
    : { title: `Order ${order.order_number} is placed`, text: 'Pay by bank transfer to finish.' };
}

/** Android 13+ and iPhone ask the person before an app may show
 *  notifications. Asked when Place order is tapped (the phone shows its own
 *  question; iPhone asks once, then remembers the answer). */
export async function askToNotify(native: KeeperNative | null = orderKeeper): Promise<boolean> {
  if (!native) return false;
  if (Platform.OS === 'ios') {
    try {
      return typeof native.requestNotifications === 'function' ? await native.requestNotifications() : false;
    } catch {
      return false;
    }
  }
  if (Platform.OS !== 'android') return false;
  try {
    if (Number(Platform.Version) >= 33) {
      const p = PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS;
      if (!(await PermissionsAndroid.check(p))) {
        const answer = await PermissionsAndroid.request(p);
        if (answer !== PermissionsAndroid.RESULTS.GRANTED) return false;
      }
    }
    return native.notificationsAllowed();
  } catch {
    return false;
  }
}

/* An order being made and sent: from Place order until the send settles
   (components/checkout/Sending.tsx), even if the screen goes first. The
   "new version is ready" box (lib/appUpdate.ts) waits meanwhile: its
   restart would stop the order half-way. */
let sending = 0;

/** An order is being made and sent right now. */
export function orderBeingSent(): boolean {
  return sending > 0;
}

/** A send started; call the answer when it has settled (once is enough). */
export function startSending(): () => void {
  sending += 1;
  let ended = false;
  return () => {
    if (ended) return;
    ended = true;
    sending -= 1;
  };
}

export interface KeeperDeps {
  native: KeeperNative | null;
  askToNotify: () => Promise<boolean>;
  /** 'active' while the app is in front. */
  appState: () => string;
}

const realDeps = (): KeeperDeps => ({ native: orderKeeper, askToNotify: () => askToNotify(orderKeeper), appState: () => String(AppState.currentState) });

export interface Keeper {
  /** It runs and notifications are on: the person may use other apps.
   *  Known once Android's question is answered; the order never waits for it. */
  background: Promise<boolean>;
  /** A step of the bar (placeRun.ts sendFrame). */
  step(frame: { progress: PlaceProgress; message: string }): void;
  /** Sent: stops; says so if the person is in another app. */
  sent(order: Pick<PlacedOrder, 'order_number'>, tester: boolean, bookingNumber?: string | null): Promise<void>;
  /** Stopped with an error: stops; says why if the person is in another app. */
  failed(message: string): Promise<void>;
  /** The screen went away first: stops, says nothing. */
  end(): Promise<void>;
}

/** Place order was tapped: notifications asked for, and the keeper started
 *  with the bar's first words without waiting for the answer. Android keeps
 *  the answer while the person is away from the app (React Native hands it
 *  over when they come back), so an order that waited for it did not start
 *  until they returned (beta round 2). */
export async function startKeeper(firstMessage: string, deps: KeeperDeps = realDeps()): Promise<Keeper> {
  const { native } = deps;
  if (!native) {
    return { background: Promise.resolve(false), step: () => {}, sent: async () => {}, failed: async () => {}, end: async () => {} };
  }
  // No "done" notification until it is allowed (none could show before).
  let notify = false;
  const asked = deps.askToNotify().catch(() => false).then((ok) => { notify = ok; return ok; });
  // Started even when notifications are off: if the person leaves anyway,
  // the order still goes on (the notification is then not shown).
  let started = false;
  try {
    const r = await native.start(KEEPER_TITLE, firstMessage);
    started = r.service || r.task;
  } catch {
    started = false;
  }
  let open = true;
  let lastMessage = '';
  const stop = async (words: { title: string; text: string } | null) => {
    if (!open) return;
    open = false;
    const say = words && notify && deps.appState() !== 'active' ? words : null;
    try {
      await native.finish(say?.title ?? null, say?.text ?? null);
    } catch {
      // Never stops the order: the screen says how it went.
    }
  };
  return {
    background: asked.then((ok) => started && ok),
    step(frame) {
      if (!open || frame.message === lastMessage) return;
      lastMessage = frame.message;
      try {
        native.update(KEEPER_TITLE, frame.message, frame.progress.sending ? -1 : barPercent(frame.progress));
      } catch {
        // The notification is only a mirror of the screen.
      }
    },
    sent: (order, tester, bookingNumber) => stop(placedNotice(order, tester, bookingNumber ?? null)),
    failed: (message) => stop({ title: FAILED_TITLE, text: message }),
    end: () => stop(null),
  };
}
