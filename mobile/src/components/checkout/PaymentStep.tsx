/* ══════════════════════════════════════════════════════════════════════════
   THE PAYMENT STEP (Phase 5, #223): GoTyme / InstaPay QR, the amount, the
   order number for the transfer note once there is one, "Attach the
   transfer receipt", "I've sent ₱X". The website's words
   (src/pages/Order.tsx).

   Used by checkout (after Place order, and for "This album already has an
   order") and by Your orders (an order waiting for payment). THIS TEST
   VERSION SENDS NOTHING: "I've sent" shows what it would send (the receipt
   upload and submit_payment_proof) in a test panel.
   ══════════════════════════════════════════════════════════════════════════ */
import { Image } from 'expo-image';
import { useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { PAY_WITHIN_MESSAGE } from '@web/lib/orderExpiry';
import { Button } from '../Button';
import { Field } from './Field';
import { TestPanel } from './TestPanel';
import { payByLine, type OpenOrder } from '../../lib/checkout/openOrder';
import { ORDER_ID } from '../../lib/checkout/orderPayload';
import { PAYEE, PAYEE_QR_URL, paymentSubmitPlan, referenceProblem, type PaymentSubmitPlan } from '../../lib/checkout/payment';
import { peso } from '../../lib/checkout/price';
import { pickReceipt, receiptLabel, type PickedReceipt } from '../../lib/checkout/receipt';
import { siteFile } from '../../lib/checkout/site';
import { colors, space } from '../../lib/theme';

export interface PaySummary { albumLine: string; breakdown: { label: string; amount: number }[]; total: number; wasTotal: number | null }

/** The payment step. `order` is an order already placed (opened from "this
 *  album already has an order", or from Your orders): its number is said, as
 *  the website says it once there is one. Without it (checkout places
 *  nothing in this version) those lines are left out, as the website does.
 *  `amount` is null only for an order that has no saved total (placed before
 *  the database saved it, 0055): the step says so, and how to learn it,
 *  instead of making a total up. */
export function PaymentStep({ amount, order, summary, onBack, backLabel = 'Back to your order' }: {
  amount: number | null;
  order: Pick<OpenOrder, 'id' | 'order_number' | 'created_at'> | null;
  summary?: PaySummary;
  onBack: () => void;
  backLabel?: string;
}) {
  const [qrMissing, setQrMissing] = useState(false);
  const [receipt, setReceipt] = useState<PickedReceipt | null>(null);
  const [receiptError, setReceiptError] = useState('');
  const [payRef, setPayRef] = useState('');
  const [refError, setRefError] = useState('');
  const [sent, setSent] = useState<PaymentSubmitPlan | null>(null);
  const [showSummary, setShowSummary] = useState(false);
  const amountLabel = amount !== null ? peso(amount) : '';

  const addReceipt = async () => {
    setReceiptError('');
    try {
      const r = await pickReceipt();
      if (!r) return;
      if ('problem' in r) { setReceiptError(r.problem); setReceipt(null); return; }
      setReceipt(r.picked);
    } catch {
      setReceiptError("We couldn't open your photos. Try again.");
    }
  };
  const sentIt = () => {
    const bad = referenceProblem(payRef);
    if (bad) { setRefError(bad); return; }
    setSent(paymentSubmitPlan(order?.id ?? ORDER_ID, payRef, receipt));
  };

  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled" testID="pay-step">
      <View style={styles.testNote}>
        <Text style={styles.testNoteText} testID="pay-test-note">{order
          ? `Test version: this is how paying order ${order.order_number} looks. The "I've sent" button only shows what it would send. It sends nothing.`
          : 'Test version: no order was placed. This is how the payment step looks for this album. Do not send money: there is no order.'}</Text>
      </View>
      <Text style={[styles.h1, styles.center]}>{amount !== null ? `Send ${amountLabel}` : `Pay order ${order?.order_number ?? ''}`}</Text>
      {order && <Text style={[styles.small, styles.center]} testID="pay-order-placed">Order {order.order_number} is placed. Pay by bank transfer to finish.</Text>}

      <View style={styles.card}>
        <View style={styles.qrBox}>
          <Text style={styles.payee}>{PAYEE.bank} · {PAYEE.rail}</Text>
          {!qrMissing ? (
            <View>
              <Image source={{ uri: PAYEE_QR_URL }} style={styles.qr} contentFit="contain" onError={() => setQrMissing(true)}
                accessibilityLabel={`${PAYEE.bank} InstaPay QR for ${PAYEE.name}`} />
              {/* No order behind it: a band across the code, so nobody pays for nothing. */}
              {!order && (
                <View style={styles.qrBand} testID="pay-qr-test-band">
                  <Text style={styles.qrBandText}>Test only. Do not pay.</Text>
                </View>
              )}
            </View>
          ) : (
            <View style={[styles.qr, styles.qrMissing]}>
              <Text style={styles.small}>The QR code isn't available right now — message us and we'll send the account details.</Text>
            </View>
          )}
          <Text style={styles.strong}>{PAYEE.name}</Text>
          <Text style={styles.small}>Account ending in {PAYEE.accountLast4}</Text>
          {amount !== null ? (
            <Text style={styles.payAmount}>{amountLabel}</Text>
          ) : (
            <View style={styles.noTotal} testID="pay-no-total">
              <Text style={[styles.small, styles.center]}>This order is older, so its total is not saved here. Message us and we will tell you how much to send.</Text>
              <Button label="Message us" kind="plain" onPress={() => { void Linking.openURL(siteFile('contact')); }} testID="pay-message-us" />
            </View>
          )}
        </View>

        <View style={styles.steps}>
          <Text style={styles.small}>1. Open your bank or e-wallet app (GCash, Maya, BPI, BDO, UnionBank…).</Text>
          <Text style={styles.small}>2. Choose Scan QR / InstaPay and scan the code above.</Text>
          <Text style={styles.small}>3. {amount !== null ? `Send exactly ${amountLabel}` : 'Send the total we tell you'}{order ? ` and put ${order.order_number} in the note if your app asks` : ''}.</Text>
          <Text style={styles.small}>4. Attach your receipt below — it speeds up confirmation.</Text>
        </View>
        <Text style={styles.tiny}>Your app may charge a small InstaPay fee. We don't add any.</Text>

        <View style={styles.receiptBox}>
          <Text style={styles.strongSmall}>Receipt screenshot <Text style={styles.tiny}>(optional)</Text></Text>
          <Button label={receipt ? receiptLabel(receipt) : 'Attach the transfer receipt (JPG, PNG or PDF)'} kind="plain" onPress={() => void addReceipt()} testID="pay-receipt" />
          {!!receiptError && <Text style={styles.error}>{receiptError}</Text>}
          <Field label="Reference no. (optional — from your bank's receipt)" value={payRef} onChangeText={(t) => { setPayRef(t); setRefError(''); }}
            autoComplete="off" autoCorrect={false} placeholder="e.g. 2026091012345678" maxLength={64} error={refError} testID="pay-reference" />
        </View>

        <Button label={amount !== null ? `I've sent ${amountLabel}` : "I've sent the payment"} onPress={sentIt} testID="pay-sent" />
        <Text style={[styles.tiny, styles.center]}>We confirm transfers in our bank app during business hours, then print. Nothing is charged automatically.</Text>
        {/* An order already placed: its own last day, as the website's Orders page says it. */}
        <Text style={[styles.tiny, styles.center]} testID="pay-within">{order?.created_at ? payByLine(order.created_at) : PAY_WITHIN_MESSAGE}</Text>

        {summary && (
          <Pressable accessibilityRole="button" onPress={() => setShowSummary((v) => !v)}>
            <Text style={[styles.tiny, styles.center, styles.underline]}>Order summary</Text>
          </Pressable>
        )}
        {summary && showSummary && (
          <View style={styles.summary}>
            <Row label="Album" value={summary.albumLine} accent />
            {summary.breakdown.map((item) => <Row key={item.label} label={item.label} value={peso(item.amount)} />)}
            <Row label="Shipping" value="Free" good />
            <View style={styles.totalRow}>
              <Text style={styles.strong}>Total</Text>
              <Text style={styles.total}>{summary.wasTotal !== null && <Text style={styles.was}>{peso(summary.wasTotal)}  </Text>}{peso(summary.total)}</Text>
            </View>
          </View>
        )}
      </View>

      {sent && (
        <TestPanel
          title="Test version: what I've sent would send"
          note="Nothing was sent. With ordering on, the receipt goes to the private payment-proofs folder (create-only) and the order is marked as paid by you, for the shop to confirm."
          data={sent}
        />
      )}
      <Button label={backLabel} kind="plain" onPress={onBack} testID="pay-back" />
    </ScrollView>
  );
}

function Row({ label, value, accent, good }: { label: string; value: string; accent?: boolean; good?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.small, styles.flex]}>{label}</Text>
      <Text style={[styles.rowValue, accent && styles.accent, good && styles.good]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { padding: space.md, gap: space.md, paddingBottom: space.xl * 2, backgroundColor: colors.background },
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  h1: { fontSize: 28, fontWeight: '800', color: colors.text },
  strong: { fontSize: 16, fontWeight: '700', color: colors.text },
  strongSmall: { fontSize: 14, fontWeight: '700', color: colors.text },
  small: { fontSize: 14, lineHeight: 20, color: colors.muted },
  tiny: { fontSize: 12, lineHeight: 17, color: colors.muted, fontWeight: '400' },
  underline: { textDecorationLine: 'underline' },
  card: { backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: space.md, gap: space.sm },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  rowValue: { fontSize: 14, fontWeight: '600', color: colors.text, textAlign: 'right', maxWidth: '45%' },
  accent: { color: colors.accent, fontWeight: '700' },
  good: { color: colors.good, fontWeight: '700' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: space.sm },
  total: { fontSize: 24, fontWeight: '800', color: colors.accent },
  was: { fontSize: 15, fontWeight: '500', color: colors.muted, textDecorationLine: 'line-through' },
  error: { fontSize: 15, color: colors.bad, textAlign: 'center' },
  testNote: { borderWidth: 1, borderStyle: 'dashed', borderColor: '#8A5A12', backgroundColor: '#FFF6E5', borderRadius: 12, padding: 12 },
  testNoteText: { fontSize: 13, lineHeight: 18, color: '#8A5A12' },
  qrBox: { borderWidth: 1, borderColor: colors.border, backgroundColor: '#FFFDFB', borderRadius: 12, padding: space.md, alignItems: 'center', gap: 4 },
  payee: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5, color: colors.muted, textTransform: 'uppercase' },
  qr: { width: 224, height: 224, borderRadius: 8, backgroundColor: colors.card, marginVertical: space.sm },
  qrMissing: { backgroundColor: '#F7F1EC', alignItems: 'center', justifyContent: 'center', padding: space.md },
  qrBand: { position: 'absolute', left: -space.sm, right: -space.sm, top: '42%', paddingVertical: 10, backgroundColor: '#FFF6E5', borderWidth: 1, borderColor: '#8A5A12', borderRadius: 8, alignItems: 'center' },
  qrBandText: { fontSize: 16, fontWeight: '800', color: '#8A5A12' },
  noTotal: { gap: space.sm, alignSelf: 'stretch', marginTop: space.xs },
  payAmount: { fontSize: 26, fontWeight: '800', color: colors.accent, marginTop: space.xs },
  steps: { gap: 4 },
  receiptBox: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, gap: space.sm },
  summary: { gap: space.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: space.sm },
});
