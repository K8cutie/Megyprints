/* ══════════════════════════════════════════════════════════════════════════
   THE PAY CARD on the payment step: the website's PayCard (src/components/
   PayCard.tsx, #234, the owner's design of 2026-10-31), its words and its
   order. Who you pay and the QR (full size: 224, as on a phone), the order
   number with Copy for the transfer note ("Copied" for 2 s; a phone that
   won't copy says to type it in the note), and four numbered steps with
   icons. Step 2 says how to pay with this phone: a phone can't scan its own
   screen, so screenshot the QR, then Upload QR in the bank app. Plain words
   for the bank and InstaPay, not their logos.

   The app's own additions, as before: the band across the QR when there is
   no order behind it (the test album), and, for an order placed before the
   database saved totals (0055), no total made up: "Send the total we tell
   you" and Message us.
   ══════════════════════════════════════════════════════════════════════════ */
import { Image } from 'expo-image';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Tick } from '../../home/homeIcons';
import { copyText } from '../../lib/checkout/copyText';
import { PAYEE, PAYEE_QR_URL } from '../../lib/checkout/payment';
import { space } from '../../lib/theme';
import { BankMark, ClipMark, CopyMark, NoteMark, PhoneMark, ScanMark } from './payIcons';

/** The website's colours (src/index.css, the classic look). */
export const PAY = {
  peach: '#B85C38', blushPink: '#9A4A2C', blush: '#F6E7DF', dark: '#2D2D2D', inkMid: '#5A5A5A', taupe: '#8B7E7A',
  light: '#9B9B9B', medium: '#6B6B6B', lineSoft: '#F1EEEA', cocoa: '#8B6F47', icon: '#C98A5E', stepsBg: '#FFF8F3', card: '#FFFDFB',
} as const;

/** How long "Copied" shows (the website's 2 s). */
export const COPIED_MS = 2000;

function Step({ n, icon, title, children }: { n: number; icon: ReactNode; title: ReactNode; children?: ReactNode }) {
  return (
    <View style={styles.step} testID="pay-how-step">
      <View style={styles.stepNumber}><Text style={styles.stepNumberText}>{n}</Text></View>
      <View style={styles.stepIcon}>{icon}</View>
      <View style={styles.stepWords}>
        <Text style={styles.stepTitle}>{title}</Text>
        {children}
      </View>
    </View>
  );
}

export function PayCard({ amountLabel, orderNumber, testOnly }: {
  /** "₱1,288", or null when the order has no saved total. */
  amountLabel: string | null;
  orderNumber: string | null;
  /** No order behind it (the test album): a band across the QR. */
  testOnly: boolean;
}) {
  const [qrMissing, setQrMissing] = useState(false);
  const [copied, setCopied] = useState<'yes' | 'no' | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const copy = async () => {
    if (!orderNumber) return;
    const ok = await copyText(orderNumber);
    setCopied(ok ? 'yes' : 'no');
    if (timer.current) clearTimeout(timer.current);
    if (ok) timer.current = setTimeout(() => setCopied(null), COPIED_MS);
  };

  return (
    <>
      {/* Who you pay, and the QR (any PH bank or e-wallet app, InstaPay / QR Ph). */}
      <View style={styles.card} testID="pay-card">
        <View style={styles.bankStrip}>
          <View style={styles.bankDot}><BankMark size={15} color={PAY.medium} /></View>
          <Text style={styles.bankText} testID="pay-bank">{PAYEE.bank} · {PAYEE.rail}</Text>
        </View>
        <View style={styles.who}>
          {!qrMissing ? (
            <View>
              <Image source={{ uri: PAYEE_QR_URL }} style={styles.qr} contentFit="contain" onError={() => setQrMissing(true)}
                accessibilityLabel={`${PAYEE.bank} InstaPay QR for ${PAYEE.name}`} testID="pay-qr" />
              {/* No order behind it: a band across the code, so nobody pays for nothing. */}
              {testOnly && (
                <View style={styles.qrBand} testID="pay-qr-test-band">
                  <Text style={styles.qrBandText}>Test only. Do not pay.</Text>
                </View>
              )}
            </View>
          ) : (
            <View style={[styles.qr, styles.qrMissing]}>
              <Text style={styles.qrMissingText}>The QR code isn't available right now — message us and we'll send the account details.</Text>
            </View>
          )}
          <Text style={styles.name} testID="pay-name">{PAYEE.name}</Text>
          <Text style={styles.account} accessibilityLabel={`Account ending in ${PAYEE.accountLast4}`} testID="pay-account">{`•••••• ${PAYEE.accountLast4}`}</Text>
        </View>
        <Text style={styles.fee}>Your app may charge a small InstaPay fee. We don't add any.</Text>
      </View>

      {/* The order number for the transfer note: one tap copies it. */}
      {orderNumber && (
        <>
          <Pressable accessibilityRole="button" accessibilityLabel={`Copy order number ${orderNumber}`} onPress={() => { void copy(); }}
            style={({ pressed }) => [styles.copyBar, pressed && styles.pressed]} testID="pay-copy-order">
            <Text style={styles.copyNumber}>{orderNumber}</Text>
            <View style={styles.copyLabel}>
              {copied === 'yes' ? <Tick size={16} color={PAY.cocoa} stroke={2.2} /> : <CopyMark size={15} color={PAY.cocoa} />}
              <Text style={styles.copyLabelText} testID="pay-copy-label">{copied === 'yes' ? 'Copied' : 'Copy'}</Text>
            </View>
          </Pressable>
          {copied === 'no' && (
            <Text style={styles.copyFailed} accessibilityLiveRegion="polite" testID="pay-copy-failed">This phone didn't let us copy it. Type {orderNumber} in the note instead.</Text>
          )}
        </>
      )}

      <View style={styles.steps} testID="pay-steps">
        <Step n={1} icon={<PhoneMark size={17} color={PAY.icon} />} title="Open your bank or e-wallet app">
          <Text style={styles.stepNote}>GCash, Maya, BPI, BDO, UnionBank…</Text>
        </Step>
        <View style={styles.rule} />
        <Step n={2} icon={<ScanMark size={17} color={PAY.icon} />} title={<>Choose <Text style={styles.bold}>Scan QR</Text> / <Text style={styles.bold}>InstaPay</Text></>}>
          <Text style={styles.stepNote}>and scan the code above.</Text>
          <Text style={[styles.stepNote, styles.samePhone]} testID="pay-same-phone">
            <Text style={styles.samePhoneLead}>Paying with this phone?</Text> Take a screenshot of the QR, then choose <Text style={styles.samePhoneLead}>Upload QR</Text> in your bank app.
          </Text>
        </Step>
        <View style={styles.rule} />
        <Step n={3} icon={<NoteMark size={17} color={PAY.icon} />}
          title={amountLabel !== null ? <>Send exactly <Text style={styles.amount}>{amountLabel}</Text></> : 'Send the total we tell you'}>
          {orderNumber && <Text style={styles.stepNote} testID="pay-note-line">and paste <Text style={styles.mono}>{orderNumber}</Text> in the note if your app asks.</Text>}
        </Step>
        <View style={styles.rule} />
        <Step n={4} icon={<ClipMark size={17} color={PAY.icon} />} title="Attach your receipt below">
          <Text style={styles.stepNote}>It speeds up confirmation.</Text>
        </Step>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderColor: PAY.lineSoft, borderRadius: 12, backgroundColor: PAY.card, overflow: 'hidden' },
  bankStrip: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, backgroundColor: 'rgba(246, 231, 223, 0.6)', paddingHorizontal: space.md, paddingVertical: 10 },
  bankDot: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  bankText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.9, color: PAY.medium, textTransform: 'uppercase' },
  who: { alignItems: 'center', gap: space.sm, padding: space.md },
  qr: { width: 224, height: 224, borderRadius: 8, backgroundColor: '#FFFFFF' },
  qrMissing: { backgroundColor: '#F7F1EC', alignItems: 'center', justifyContent: 'center', padding: space.md },
  qrMissingText: { fontSize: 12, lineHeight: 17, color: PAY.taupe, textAlign: 'center' },
  qrBand: { position: 'absolute', left: -space.sm, right: -space.sm, top: '42%', paddingVertical: 10, backgroundColor: '#FFF6E5', borderWidth: 1, borderColor: '#8A5A12', borderRadius: 8, alignItems: 'center' },
  qrBandText: { fontSize: 16, fontWeight: '800', color: '#8A5A12' },
  name: { fontSize: 16, fontWeight: '700', letterSpacing: 0.4, color: PAY.dark },
  account: { fontSize: 14, color: PAY.taupe, fontFamily: 'monospace' },
  fee: { fontSize: 11, lineHeight: 15, color: PAY.light, textAlign: 'center', paddingHorizontal: space.md, paddingBottom: 12 },
  copyBar: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderWidth: 1, borderColor: PAY.peach, backgroundColor: PAY.blush, borderRadius: 12, paddingHorizontal: space.md, paddingVertical: 12 },
  copyNumber: { flexShrink: 1, fontSize: 14, fontWeight: '700', color: PAY.dark, fontFamily: 'monospace' },
  copyLabel: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  copyLabelText: { fontSize: 14, fontWeight: '700', color: PAY.cocoa },
  copyFailed: { fontSize: 11, lineHeight: 15, color: PAY.taupe, textAlign: 'center' },
  steps: { backgroundColor: PAY.stepsBg, borderRadius: 12, paddingHorizontal: space.md, paddingVertical: space.md },
  rule: { height: StyleSheet.hairlineWidth, backgroundColor: PAY.lineSoft, marginVertical: 12 },
  step: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  stepNumber: { marginTop: 2, width: 24, height: 24, borderRadius: 12, backgroundColor: PAY.peach, alignItems: 'center', justifyContent: 'center' },
  stepNumberText: { fontSize: 12, fontWeight: '800', color: '#FFFFFF' },
  stepIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: PAY.blush, alignItems: 'center', justifyContent: 'center' },
  stepWords: { flex: 1, minWidth: 0 },
  stepTitle: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: PAY.dark },
  stepNote: { fontSize: 12, lineHeight: 17, color: PAY.taupe },
  bold: { fontWeight: '800' },
  samePhone: { marginTop: 4 },
  samePhoneLead: { fontWeight: '700', color: PAY.inkMid },
  amount: { color: PAY.blushPink },
  mono: { fontFamily: 'monospace', color: PAY.icon },
  pressed: { opacity: 0.85 },
});
