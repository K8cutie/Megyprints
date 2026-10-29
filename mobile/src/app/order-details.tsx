/* ══════════════════════════════════════════════════════════════════════════
   ONE ORDER (Phase 6), opened from Your orders: where it is now, from its
   REAL status (the shared orderTracker: the website's steps and words,
   src/pages/MyOrders.tsx OrderCard).

   Waiting for payment: the website's "Send ₱X by bank transfer to finish"
   box, its last day to pay, the payment step (checkout's, #223: the QR, the
   order number for the note, the receipt; "I've sent" sends nothing in this
   test version) and "Cancel this order", asked twice in words, as the
   website does (cancel_my_unpaid_order, 0042: the database decides).
   ══════════════════════════════════════════════════════════════════════════ */
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '../components/Button';
import { PaymentStep } from '../components/checkout/PaymentStep';
import { OrderTracker } from '../components/orders/OrderTracker';
import { useAuth } from '../lib/auth';
import { askedToPay } from '../lib/checkout/openOrder';
import { siteFile } from '../lib/checkout/site';
import { cancelUnpaidOrder, type AppOrder } from '../lib/orders/myOrders';
import {
  CANCEL_ASK,
  CANCEL_FAILED,
  CANCEL_GONE,
  CANCELLED_NOTE,
  cancelYes,
  KEEP_IT,
  orderView,
  payButton,
  payHeadline,
  testOrderNote,
  trackingLine,
} from '../lib/orders/orderWords';
import { useMyOrder } from '../lib/orders/useMyOrders';
import { supabase } from '../lib/supabase';
import { colors, space } from '../lib/theme';

export default function OrderDetails() {
  const { loading: authLoading, session } = useAuth();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const userId = session?.user.id;
  const reading = useMyOrder(userId, typeof id === 'string' ? id : undefined);
  const [paying, setPaying] = useState(false);

  if (!authLoading && !session) return <Redirect href="/sign-in" />;

  if (authLoading || reading.loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} size="large" />
        <Text style={styles.muted}>Loading…</Text>
      </View>
    );
  }
  if (reading.error && !reading.value) {
    return (
      <View style={styles.center}>
        <Text style={styles.error} testID="order-load-error">We couldn't load this order: {reading.error}</Text>
        <Button label="Try again" onPress={reading.retry} style={styles.wide} testID="order-retry" />
      </View>
    );
  }
  const order = reading.value;
  if (!order) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted} testID="order-not-found">We couldn't find this order in your account.</Text>
      </View>
    );
  }

  if (paying && order) {
    return <PaymentStep amount={askedToPay(order)} order={order} onBack={() => setPaying(false)} backLabel="Back to this order" />;
  }
  return <OrderScreen order={order} onPay={() => setPaying(true)} onChanged={reading.retry} />;
}

function OrderScreen({ order, onPay, onChanged }: { order: AppOrder; onPay: () => void; onChanged: () => void }) {
  const v = orderView(order);
  const track = v.track;
  const total = askedToPay(order);
  // Cancel asks once more before it acts (two taps, both in words).
  const [askCancel, setAskCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelErr, setCancelErr] = useState('');
  const messageUs = () => { void Linking.openURL(siteFile('contact')); };

  const cancel = async () => {
    setCancelling(true);
    setCancelErr('');
    try {
      const ok = await cancelUnpaidOrder(supabase, order.id);
      if (!ok) setCancelErr(CANCEL_GONE);
      onChanged();
    } catch (e) {
      setCancelErr(e instanceof Error && e.message ? e.message : CANCEL_FAILED);
    } finally {
      setCancelling(false);
      setAskCancel(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.page} testID="order-details">
      <View style={styles.top}>
        <View style={styles.flex}>
          {!!v.albumName && <Text style={styles.album} testID="order-album-name">{v.albumName}</Text>}
          <Text style={styles.h1}>Order <Text style={styles.mono}>{order.order_number}</Text></Text>
          <Text style={styles.small}>{v.placed}</Text>
        </View>
        {!!v.price && <Text style={styles.price} testID="order-price">{v.price}</Text>}
      </View>

      <View style={styles.card}>
        <Text style={[styles.headline, track.cancelled && styles.bad]} testID="order-headline">{track.headline}</Text>
        {track.cancelled ? (
          <>
            <Text style={styles.small} testID="order-cancelled-note">{CANCELLED_NOTE}</Text>
            <Button label="Message us" kind="plain" onPress={messageUs} testID="order-message-us" />
          </>
        ) : track.test ? (
          // A tester-code order: no printing journey to follow (orderTracker).
          <Text style={styles.small} testID="order-test-note">{testOrderNote(order.tester_code ?? '')}</Text>
        ) : (
          <OrderTracker track={track} />
        )}
        {!!order.tracking && track.stage >= 4 && <Text style={styles.small} testID="order-tracking">{trackingLine(order.tracking)}</Text>}
      </View>

      {track.awaitingPayment && (
        <View style={styles.payBox} testID="order-how-to-pay">
          <Text style={styles.payHead}>{payHeadline(total)}</Text>
          <Text style={styles.payText}>The button below shows our InstaPay QR. Scan it with your bank or e-wallet app, and put {order.order_number} in the note if your app asks.</Text>
          {!!v.payBy && <Text style={styles.payText} testID="order-pay-by">{v.payBy}</Text>}
          {/* While the cancel question is open, its "Yes" is the one filled button. */}
          {!askCancel && <Button label={payButton(total)} onPress={onPay} testID="order-pay" />}
          {!askCancel ? (
            <Button label={CANCEL_ASK} kind="plain" onPress={() => { setCancelErr(''); setAskCancel(true); }} testID="order-cancel" />
          ) : (
            <>
              <Button label={cancelYes(order.order_number)} busy={cancelling} onPress={() => void cancel()} testID="order-cancel-yes" />
              <Button label={KEEP_IT} kind="plain" onPress={() => { if (!cancelling) setAskCancel(false); }} testID="order-cancel-keep" />
            </>
          )}
        </View>
      )}
      {!!cancelErr && (
        <View style={styles.errBox}>
          <Text style={styles.error} accessibilityRole="alert" testID="order-cancel-error">{cancelErr}</Text>
          <Button label="Message us" kind="plain" onPress={messageUs} testID="order-cancel-message-us" />
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: space.md, gap: space.md, paddingBottom: space.xl * 2, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.lg, gap: space.md, backgroundColor: colors.background },
  wide: { alignSelf: 'stretch' },
  muted: { fontSize: 16, lineHeight: 22, color: colors.muted, textAlign: 'center' },
  error: { fontSize: 15, lineHeight: 21, color: colors.bad, textAlign: 'center' },
  top: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' },
  flex: { flex: 1 },
  album: { fontSize: 20, fontWeight: '700', color: colors.text },
  h1: { fontSize: 22, fontWeight: '800', color: colors.text },
  mono: { fontFamily: 'monospace', color: '#A8673F' },
  small: { fontSize: 14, lineHeight: 20, color: colors.muted },
  price: { fontSize: 22, fontWeight: '800', color: colors.accent },
  card: { backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: space.md, gap: space.sm },
  headline: { fontSize: 17, fontWeight: '800', color: colors.text },
  bad: { color: colors.bad },
  payBox: { borderWidth: 1, borderColor: '#E9B8A0', backgroundColor: '#FBF0EA', borderRadius: 16, padding: space.md, gap: space.sm },
  payHead: { fontSize: 17, fontWeight: '800', color: colors.text },
  payText: { fontSize: 15, lineHeight: 21, color: '#6B4A3A' },
  errBox: { gap: space.sm },
});
