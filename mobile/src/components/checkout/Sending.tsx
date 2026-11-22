/* ══════════════ SENDING: your own album, for real ══════════════
   Place order for real (lib/checkout/phoneSend.ts): the print files made on
   this phone and the order sent, the bar following each real step in the
   website's words. The screen is kept on, as on the website.

   The order keeper (lib/checkout/backgroundSend.ts) runs meanwhile: the
   person may use other apps, a notification shows the bar, and another one
   says how it went if they are not back yet. Notifications refused, or an
   older APK: "Keep this screen open", as before.

   The send belongs to the app, not to this screen (MP-2026-9M5572U): leaving
   the screen once the order has started no longer stops the keeper, so
   Android keeps the app working until every file is in; the notification
   then says how it went, even with the app open on another screen. When it
   stops, the step and the error go to the shop (reportToShop.ts). */
import { useKeepAwake } from 'expo-keep-awake';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { PlaceProgress } from '@web/lib/placeProgress';
import type { CoverType, MaterialType } from '@web/pages/builder/types';
import { BACKGROUND_NOTE, markOrderSending, startKeeper, startSending, type Keeper } from '../../lib/checkout/backgroundSend';
import { reportToShop, shopReport } from '../../lib/checkout/reportToShop';
import type { CheckoutAlbum, PlaceOrderPlan } from '../../lib/checkout/orderPayload';
import { KEEP_OPEN_NOTE, sendFrame } from '../../lib/checkout/placeRun';
import type { PlacedOrder, SendStep } from '../../lib/checkout/sendOrder';
import type { SentFiles } from '../../lib/checkout/sentFiles';
import { colors, space } from '../../lib/theme';
import type { PageText } from '../../render/pageText';
import { PlaceProgressBar } from './PlaceProgressBar';

/** The checkout screen's words for an error with none of its own. */
const SOMETHING_WRONG = 'Something went wrong placing your order.';

export function Sending({ plan, album, cover, material, text, placed, sent, bookingNumber = null, finishing = false, onOrder, onSent, onFailed }: {
  plan: PlaceOrderPlan; album: CheckoutAlbum; cover: CoverType; material: MaterialType; text: PageText; placed: PlacedOrder | null;
  /** The files already sent (sentFiles.ts): not made or sent again. */
  sent?: SentFiles;
  /** An event album its booking pays for: the booking's number (the notification says it). */
  bookingNumber?: string | null;
  /** Finish sending an order that stopped half-way (unsentOrders.ts). */
  finishing?: boolean;
  onOrder: (o: PlacedOrder) => void;
  onSent: (r: { order: PlacedOrder; paidByTester: boolean; paidByBooking?: boolean }) => void;
  onFailed: (e: unknown) => void;
}) {
  useKeepAwake('megy-place-order');
  const [frame, setFrame] = useState<{ progress: PlaceProgress; message: string }>(() => sendFrame(null, { step: 'order' }));
  const [background, setBackground] = useState(false);
  const handlers = useRef({ onOrder, onSent, onFailed });
  handlers.current = { onOrder, onSent, onFailed };
  useEffect(() => {
    let live = true;
    // The send started and hasn't settled: leaving the screen doesn't stop it.
    let running = false;
    let prev: PlaceProgress | null = null;
    let lastStep: string | null = null;
    let orderId: string | null = placed?.id ?? null;
    let keeper: Keeper | null = null;
    const first = sendFrame(null, { step: 'order' });
    // Until the send settles, the "new version is ready" box waits (a restart
    // would stop the order half-way).
    const sendDone = startSending();
    if (orderId) markOrderSending(orderId);
    void (async () => {
      // The keeper starts and Android asks about notifications; the order is
      // made and sent meanwhile, whatever the answer and however long it takes.
      keeper = await startKeeper(first.message);
      // The screen went before anything was sent: nothing to keep going.
      if (!live) { void keeper.end(); sendDone(); return; }
      void keeper.background.then((b) => { if (live) setBackground(b); });
      const k = keeper;
      const onStep = (s: SendStep) => {
        lastStep = s.step;
        const f = sendFrame(prev, s);
        prev = f.progress;
        k.step(f);
        if (live) setFrame(f);
      };
      // Loaded only here: it needs the phone's Skia and the live database.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { sendFromPhone } = require('../../lib/checkout/phoneSend') as typeof import('../../lib/checkout/phoneSend');
      running = true;
      sendFromPhone({
        plan, album, cover, material, text, placed, sent, onStep,
        onOrder: (o) => { orderId = o.id; markOrderSending(o.id); handlers.current.onOrder(o); },
      })
        .then(async (r) => {
          running = false;
          // The screen gone, the notification is the only one to say it.
          await k.sent(r.order, r.paidByTester, r.paidByBooking ? bookingNumber : null, !live);
          if (live) handlers.current.onSent(r);
        })
        .catch(async (e: unknown) => {
          running = false;
          void reportToShop(shopReport(e, { kind: 'app-order', step: lastStep, orderId, finishing }));
          await k.failed(e instanceof Error && e.message ? e.message : SOMETHING_WRONG, !live);
          if (live) handlers.current.onFailed(e);
        })
        .finally(sendDone);
    })().catch(sendDone); // nothing was sent: the box may show again
    // Leaving the screen mid-send keeps the keeper: it stops with the send.
    return () => { live = false; if (!running) void keeper?.end(); };
    // One send per visit of this step.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <View style={styles.placing} testID="order-placing">
      <Text style={styles.h1}>{finishing ? 'Finishing your order' : 'Placing your order'}</Text>
      <Text style={styles.placingStep} accessibilityLiveRegion="polite">{frame.message}</Text>
      <PlaceProgressBar progress={frame.progress} note={background ? BACKGROUND_NOTE : KEEP_OPEN_NOTE} />
    </View>
  );
}

const styles = StyleSheet.create({
  h1: { fontSize: 28, fontWeight: '800', color: colors.text },
  placing: { flex: 1, justifyContent: 'center', padding: space.lg, gap: space.lg, backgroundColor: colors.background },
  placingStep: { fontSize: 20, fontWeight: '700', color: colors.text, minHeight: 28 },
});
