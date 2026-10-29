/* ══════════════════════════════════════════════════════════════════════════
   YOUR ORDERS (Phase 6): every order of the signed-in account, where it is
   now from its REAL status, in the website's words (src/pages/MyOrders.tsx).
   A tap opens the order (order-details.tsx): its steps, and its payment step
   while it waits for payment. Read through the website's shared code
   (myOrdersCloud), read only.
   ══════════════════════════════════════════════════════════════════════════ */
import { Redirect, router } from 'expo-router';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from '../components/Button';
import { useAuth } from '../lib/auth';
import type { AppOrder } from '../lib/orders/myOrders';
import { NO_ORDERS, ORDERS_LEAD, ORDERS_LOAD_FAILED, orderView, testOrderNote } from '../lib/orders/orderWords';
import { useMyOrders } from '../lib/orders/useMyOrders';
import { colors, space } from '../lib/theme';

export default function Orders() {
  const { loading: authLoading, session } = useAuth();
  const userId = session?.user.id;
  const orders = useMyOrders(userId);

  if (!authLoading && !session) return <Redirect href="/sign-in" />;

  const head = (
    <View style={styles.head}>
      <Text style={styles.h1}>Your orders</Text>
      <Text style={styles.lead}>{ORDERS_LEAD}</Text>
    </View>
  );

  if (authLoading || orders.loading) {
    return (
      <View style={styles.page}>
        {head}
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} size="large" />
          <Text style={styles.muted}>Loading…</Text>
        </View>
      </View>
    );
  }

  if (orders.error && !orders.value) {
    return (
      <View style={styles.page}>
        {head}
        <View style={styles.center}>
          <Text style={styles.error} testID="orders-error">{ORDERS_LOAD_FAILED}: {orders.error}</Text>
          <Button label="Try again" onPress={orders.retry} style={styles.wide} testID="orders-retry" />
        </View>
      </View>
    );
  }

  const list = orders.value ?? [];
  if (list.length === 0) {
    return (
      <View style={styles.page}>
        {head}
        <View style={styles.center} testID="orders-empty">
          <Text style={styles.muted}>{NO_ORDERS}</Text>
          <Button label="Make an album" onPress={() => router.push('/album-name')} style={styles.wide} testID="orders-make-album" />
        </View>
      </View>
    );
  }

  return (
    <FlatList
      data={list}
      keyExtractor={(o) => o.id}
      style={styles.page}
      contentContainerStyle={styles.list}
      ListHeaderComponent={head}
      renderItem={({ item }) => <OrderCard order={item} />}
    />
  );
}

function OrderCard({ order }: { order: AppOrder }) {
  const v = orderView(order);
  const open = () => router.push({ pathname: '/order-details', params: { id: order.id } });
  return (
    <Pressable accessibilityRole="button" accessibilityHint="Opens this order" onPress={open}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]} testID="order-card">
      <View style={styles.top}>
        <View style={styles.flex}>
          {!!v.albumName && <Text style={styles.album} numberOfLines={1} testID="order-album-name">{v.albumName}</Text>}
          <Text style={styles.number}>Order <Text style={styles.mono}>{order.order_number}</Text></Text>
          <Text style={styles.small}>{v.placed}</Text>
        </View>
        {!!v.price && <Text style={styles.price} testID="order-price">{v.price}</Text>}
      </View>
      <Text style={[styles.headline, v.track.cancelled && styles.bad]} testID="order-headline">{v.track.headline}</Text>
      {v.track.test && !!order.tester_code && <Text style={styles.small} testID="order-test-note">{testOrderNote(order.tester_code)}</Text>}
      {!!v.payBy && <Text style={styles.small} testID="order-pay-by">{v.payBy}</Text>}
      <Text style={styles.link}>{v.track.awaitingPayment ? 'Pay or see this order' : 'See this order'} ›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  head: { gap: space.xs, marginBottom: space.sm, paddingHorizontal: space.md, paddingTop: space.md },
  h1: { fontSize: 26, fontWeight: '800', color: colors.text },
  lead: { fontSize: 15, lineHeight: 21, color: colors.muted },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.lg, gap: space.md },
  muted: { fontSize: 16, color: colors.muted, textAlign: 'center' },
  error: { fontSize: 16, lineHeight: 22, color: colors.bad, textAlign: 'center' },
  wide: { alignSelf: 'stretch' },
  list: { paddingBottom: space.xl, gap: space.sm },
  card: { marginHorizontal: space.md, backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: space.md, gap: 6 },
  pressed: { opacity: 0.85 },
  top: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' },
  flex: { flex: 1 },
  album: { fontSize: 18, fontWeight: '700', color: colors.text },
  number: { fontSize: 15, fontWeight: '700', color: colors.text },
  mono: { fontFamily: 'monospace', color: '#A8673F' },
  small: { fontSize: 14, lineHeight: 20, color: colors.muted },
  price: { fontSize: 19, fontWeight: '800', color: colors.accent },
  headline: { fontSize: 16, fontWeight: '700', color: colors.text, marginTop: 2 },
  bad: { color: colors.bad },
  link: { fontSize: 15, fontWeight: '700', color: colors.accent, marginTop: 2 },
});
