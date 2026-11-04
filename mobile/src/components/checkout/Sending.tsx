/* ══════════════ SENDING: your own album, for real ══════════════
   Place order for real (lib/checkout/phoneSend.ts): the print files made on
   this phone and the order sent, the bar following each real step in the
   website's words. The screen is kept on, as on the website.

   The order keeper (lib/checkout/backgroundSend.ts) runs meanwhile: the
   person may use other apps, a notification shows the bar, and another one
   says how it went if they are not back yet. Notifications refused, or an
   older APK: "Keep this screen open", as before. */
import { useKeepAwake } from 'expo-keep-awake';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { PlaceProgress } from '@web/lib/placeProgress';
import type { CoverType, MaterialType } from '@web/pages/builder/types';
import { BACKGROUND_NOTE, startKeeper, startSending, type Keeper } from '../../lib/checkout/backgroundSend';
import type { CheckoutAlbum, PlaceOrderPlan } from '../../lib/checkout/orderPayload';
import { KEEP_OPEN_NOTE, sendFrame } from '../../lib/checkout/placeRun';
import type { PlacedOrder, SendStep } from '../../lib/checkout/sendOrder';
import { colors, space } from '../../lib/theme';
import type { PageText } from '../../render/pageText';
import { PlaceProgressBar } from './PlaceProgressBar';

/** The checkout screen's words for an error with none of its own. */
const SOMETHING_WRONG = 'Something went wrong placing your order.';

export function Sending({ plan, album, cover, material, text, placed, sent, bookingNumber = null, onOrder, onSent, onFailed }: {
  plan: PlaceOrderPlan; album: CheckoutAlbum; cover: CoverType; material: MaterialType; text: PageText; placed: PlacedOrder | null;
  /** The files this checkout visit already sent: not made or sent again. */
  sent?: Set<string>;
  /** An event album its booking pays for: the booking's number (the notification says it). */
  bookingNumber?: string | null;
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
    let prev: PlaceProgress | null = null;
    let keeper: Keeper | null = null;
    const first = sendFrame(null, { step: 'order' });
    // Until the send settles, the "new version is ready" box waits (a restart
    // would stop the order half-way).
    const sendDone = startSending();
    void (async () => {
      // The keeper starts and Android asks about notifications; the order is
      // made and sent meanwhile, whatever the answer and however long it takes.
      keeper = await startKeeper(first.message);
      if (!live) { void keeper.end(); sendDone(); return; }
      void keeper.background.then((b) => { if (live) setBackground(b); });
      const k = keeper;
      const onStep = (s: SendStep) => {
        const f = sendFrame(prev, s);
        prev = f.progress;
        k.step(f);
        if (live) setFrame(f);
      };
      // Loaded only here: it needs the phone's Skia and the live database.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { sendFromPhone } = require('../../lib/checkout/phoneSend') as typeof import('../../lib/checkout/phoneSend');
      sendFromPhone({ plan, album, cover, material, text, placed, sent, onStep, onOrder: (o) => handlers.current.onOrder(o) })
        .then(async (r) => {
          await k.sent(r.order, r.paidByTester, r.paidByBooking ? bookingNumber : null);
          if (live) handlers.current.onSent(r);
        })
        .catch(async (e: unknown) => {
          await k.failed(e instanceof Error && e.message ? e.message : SOMETHING_WRONG);
          if (live) handlers.current.onFailed(e);
        })
        .finally(sendDone);
    })().catch(sendDone); // nothing was sent: the box may show again
    return () => { live = false; void keeper?.end(); };
    // One send per visit of this step.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <View style={styles.placing} testID="order-placing">
      <Text style={styles.h1}>Placing your order</Text>
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
