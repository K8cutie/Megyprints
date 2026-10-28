/* ══════════════════════════════════════════════════════════════════════════
   CHECKOUT (Phase 5 screens): the website's Order page on the phone.

   form → Place order → placing (the bar, screen kept on) → payment
   (GoTyme / InstaPay QR, the amount, the order number for the transfer note
   once there is one, "Attach the transfer receipt", "I've sent ₱X").

   Everything a customer reads is the website's (src/pages/Order.tsx), and
   every rule is the website's: shared code (prices, contact and address
   rules, 40 photos, the cover that fits the press, the bar) or a mirror
   that a test runs beside the website's own function (see lib/checkout/).

   THIS TEST VERSION WRITES NOTHING. The album is the test album
   (fixtureAlbum.ts) until Phase 3; Place order runs the website's checks,
   builds exactly what the website would send (the order row, the memory
   rows, the files), shows it in a test panel, and stops: no order, no
   upload, no tester-code check (that call counts tries in the database).
   The price is real: the live price list, read only.
   ══════════════════════════════════════════════════════════════════════════ */
import { router } from 'expo-router';
import { Image } from 'expo-image';
import { useKeepAwake } from 'expo-keep-awake';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type ScrollViewInstance } from 'react-native';
import { EMPTY_ADDRESS, type AddressValue } from '@web/lib/contact';
import { PAY_WITHIN_MESSAGE } from '@web/lib/orderExpiry';
import { countQrMemories, EXTRA_QR_RATE, FREE_QR_MEMORIES } from '@web/lib/pricing';
import { albumPhotoCount, photosShortBy, tooFewToOrderMessage } from '@web/pages/builder/albumMinimum';
import { coverChoiceNote, coverFitsSheet } from '@web/pages/builder/printSheet';
import { ALBUM_SIZES, COVERS, MATERIALS, type CoverType, type MaterialType } from '@web/pages/builder/types';
import { Button } from '../components/Button';
import { AddressFields } from '../components/checkout/AddressFields';
import { CoverThumb } from '../components/checkout/CoverThumb';
import { Field } from '../components/checkout/Field';
import { PlaceProgressBar } from '../components/checkout/PlaceProgressBar';
import { TestPanel } from '../components/checkout/TestPanel';
import { TesterCodeBox } from '../components/checkout/TesterCodeBox';
import { useAuth } from '../lib/auth';
import { checkCheckout, phoneOnBlur, type AddressErrors } from '../lib/checkout/checkoutForm';
import { fixtureCheckoutAlbum } from '../lib/checkout/fixtureAlbum';
import { openOrderForAlbum, openOrderWords, secondOrderQuestion, type OpenOrder } from '../lib/checkout/openOrder';
import { albumQrFills, ORDER_ID, placeOrderPlan, type PlaceOrderPlan } from '../lib/checkout/orderPayload';
import { PAYEE, PAYEE_QR_URL, paymentSubmitPlan, referenceProblem, type PaymentSubmitPlan } from '../lib/checkout/payment';
import { placeFrames, type PlaceFrame } from '../lib/checkout/placeRun';
import { checkoutPrice, peso, placeOrderLabel } from '../lib/checkout/price';
import { loadPriceSchedule, usePriceSchedule } from '../lib/checkout/priceSchedule';
import { pickReceipt, receiptLabel, type PickedReceipt } from '../lib/checkout/receipt';
import { checkTesterCodeOffline, testerLine, type TesterCode } from '../lib/checkout/testerCode';
import { supabase, supabaseConfigured } from '../lib/supabase';
import { colors, space } from '../lib/theme';

type Step = 'form' | 'placing' | 'placed' | 'payment';

const DEFAULT_MATERIAL: MaterialType = 'matte';
const DEFAULT_COVER: CoverType = 'softcover';

export default function OrderScreen() {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  // Until Phase 3: the test album (48 sample photos, made by the shared album maker).
  const album = useMemo(() => fixtureCheckoutAlbum(), []);
  const loadSchedule = useCallback(() => loadPriceSchedule(supabase, supabaseConfigured), []);
  const prices = usePriceSchedule(loadSchedule);

  const [step, setStep] = useState<Step>('form');
  const [material, setMaterial] = useState<MaterialType>(DEFAULT_MATERIAL);
  const [cover, setCover] = useState<CoverType>(DEFAULT_COVER);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState<AddressValue>(EMPTY_ADDRESS);
  const [errors, setErrors] = useState<{ name?: string; phone?: string }>({});
  const [addressErrors, setAddressErrors] = useState<AddressErrors>({});
  const [tester, setTester] = useState<TesterCode | null>(null);
  const [message, setMessage] = useState('');
  const [signInAsk, setSignInAsk] = useState(false);
  const [openAlbumAsk, setOpenAlbumAsk] = useState(false);
  const [openOrder, setOpenOrder] = useState<OpenOrder | null>(null);
  const [askSecond, setAskSecond] = useState(false);
  const secondOk = useRef(false);
  const [plan, setPlan] = useState<PlaceOrderPlan | null>(null);
  const [placedAmount, setPlacedAmount] = useState(0);

  const scrollRef = useRef<ScrollViewInstance>(null);
  // Where each part of the form starts on the page, to go to the first thing
  // to fix (the website scrolls there too: the errors sat off-screen).
  const spots = useRef<Record<'details' | 'phone' | 'address', number>>({ details: 0, phone: 0, address: 0 });

  // This album's order still waiting for payment, if any (read only).
  useEffect(() => {
    if (!userId || !supabaseConfigured || step !== 'form') return;
    let alive = true;
    openOrderForAlbum(supabase, userId, album.albumId)
      .then((o) => { if (alive) setOpenOrder(o); })
      .catch(() => { /* can't tell: checkout goes on as before */ });
    return () => { alive = false; };
  }, [userId, album.albumId, step]);

  const albumSize = album.albumSize;
  const pageCount = album.pages.length;
  const qrCount = countQrMemories(album.pages);
  const photosIn = albumPhotoCount(album.pages);
  const tooFew = photosShortBy(photosIn) > 0;

  // THE PRESS: a cover too big for the shop's sheet isn't offered (shared printSheet).
  const coverChoices = COVERS.filter((c) => coverFitsSheet(albumSize, c.type, pageCount, { material }));
  const coverFits = coverFitsSheet(albumSize, cover, pageCount, { material });
  const coverNote = coverChoiceNote(albumSize, pageCount, coverChoices.map((c) => c.type), { material });
  const firstChoice = coverChoices[0]?.type;
  useEffect(() => {
    if (coverFits || !firstChoice || step !== 'form') return;
    setCover(firstChoice);
  }, [coverFits, firstChoice, step]);

  // No memory videos in the app yet (Phase 4+): standard quality, the included term.
  const price = checkoutPrice(prices.schedule, { albumSize, cover, pageCount, qrCount, hostingYears: null, hdMemories: false, tester });

  // The bar's steps for this album (made once: a re-render must not restart the bar).
  const frames = useMemo(() => {
    const fills = albumQrFills(album.pages);
    return placeFrames({ pages: album.pages.length, clips: fills.filter((f) => f?.kind === 'clip').length, memories: fills.filter(Boolean).length, tester: !!tester });
  }, [album.pages, tester]);

  // Signing in answers "You must be signed in to check out": don't leave it
  // up, nor its Sign in button (the website's shownError).
  const signInSaid = message.startsWith('You must be signed in');
  const shownMessage = userId && signInSaid ? '' : message;

  const scrollToSpot = (spot: 'name' | 'phone' | 'address') => {
    // The name and phone boxes sit inside the "Your Details" card: their own
    // place is measured from the card, so add the card's.
    const y = spot === 'address' ? spots.current.address : spots.current.details + (spot === 'phone' ? spots.current.phone : 0);
    scrollRef.current?.scrollTo({ y: Math.max(0, y - space.lg), animated: true });
  };

  const startPlacing = (cleanName: string, cleanPhone: string) => {
    if (!userId) return;
    try {
      const p = placeOrderPlan({
        userId,
        album: album.row,
        pages: album.pages,
        specs: { material, cover, size: albumSize },
        shipping: { name: cleanName, phone: cleanPhone, address },
        hostingYears: price.effectiveYears,
        hdMemories: false,
        testerCode: tester?.code ?? null,
        includedYears: price.includedYears,
      });
      setPlan(p);
      setPlacedAmount(price.payTotal);
      setStep('placing');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Something went wrong placing your order.');
    }
  };

  const onPlace = () => {
    if (!price.ready) { prices.retry(); return; }
    setMessage('');
    setSignInAsk(false);
    setOpenAlbumAsk(false);
    const r = checkCheckout({ name, phone, address, coverFits, coverNote, signedIn: !!userId, openOrderUnanswered: !!openOrder && !secondOk.current, pages: album.pages });
    if (r.ok) {
      setErrors({}); setAddressErrors({});
      setName(r.name); setPhone(r.phone);
      startPlacing(r.name, r.phone);
      return;
    }
    if (r.kind === 'fields') {
      setErrors(r.errors);
      setAddressErrors(r.addressErrors);
      scrollToSpot(r.first);
      return;
    }
    setErrors({}); setAddressErrors({});
    if (r.kind === 'askSecond') { setName(r.name); setPhone(r.phone); setAskSecond(true); return; }
    if (r.name) setName(r.name);
    if (r.phone) setPhone(r.phone);
    setMessage(r.message);
    setSignInAsk(!!r.signIn);
    setOpenAlbumAsk(!!r.openAlbum);
  };
  const placeSecond = () => { secondOk.current = true; setAskSecond(false); onPlace(); };

  if (step === 'placing' && plan) {
    return <Placing frames={frames} onDone={() => setStep('placed')} />;
  }

  if (step === 'placed' && plan) {
    return (
      <ScrollView contentContainerStyle={styles.page}>
        <Text style={styles.h1}>Stopped before sending</Text>
        <Text style={styles.body}>This test version does not place orders yet. Your order was not placed, and nothing was sent: no order, no files.</Text>
        {tester && <Text style={styles.body}>This was a test order. Nothing is charged, and nothing will be printed or sent.</Text>}
        <TestPanel
          title="Test version: what Place order would send"
          note={`The same order the website would send for this album, address${tester ? ' and tester code' : ''}. The order number and the price come from the database. The cover and the pages are not made in this version.${tester?.unchecked ? ` The code ${tester.code} was not checked with the shop (that check is a database write).` : ''}`}
          steps={plan.steps}
          data={{ orders: plan.orderRow, qr_memories: plan.steps.flatMap((s) => (s.kind === 'upsert' ? s.rows : [])), files: plan.files }}
        />
        {tester ? (
          <Button label="Back to your order" onPress={() => setStep('form')} testID="placed-back" />
        ) : (
          <>
            <Button label="See the payment step" onPress={() => setStep('payment')} testID="placed-payment" />
            <Button label="Back to your order" kind="plain" onPress={() => setStep('form')} testID="placed-back" />
          </>
        )}
      </ScrollView>
    );
  }

  if (step === 'payment') {
    const albumLine = [ALBUM_SIZES.find((s) => s.preset === albumSize)?.name, MATERIALS.find((m) => m.type === material)?.name, COVERS.find((c) => c.type === cover)?.name].join(' · ');
    return <Payment amount={placedAmount} albumLine={albumLine} breakdown={price.breakdown.items} total={price.total} wasTotal={price.wasTotal} onBack={() => setStep('form')} />;
  }

  /* ══════════════ FORM ══════════════ */
  const sizeName = ALBUM_SIZES.find((s) => s.preset === albumSize)?.name ?? albumSize;
  const materialName = MATERIALS.find((m) => m.type === material)?.name ?? material;
  const coverName = COVERS.find((c) => c.type === cover)?.name ?? cover;
  const words = openOrder ? openOrderWords(openOrder) : null;

  return (
    <ScrollView ref={scrollRef} contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      {album.fixture && (
        <View style={styles.testNote} testID="order-test-album">
          <Text style={styles.testNoteText}>Test version: this is a test album of {photosIn} sample photos. Place order shows what it would send, and sends nothing.</Text>
        </View>
      )}

      <Text style={styles.h1}>Finalize Your Order</Text>

      {words && (
        <View style={styles.notice} testID="order-already-open">
          <Text style={styles.noticeHead}>{words.headline}</Text>
          <Text style={styles.noticeBody}>{words.body}</Text>
        </View>
      )}

      {/* What you're paying for: the front of the book. */}
      <View style={styles.card}>
        <View style={styles.coverRow}>
          <CoverThumb uri={album.coverPhotoUri} albumSize={albumSize} />
          <View style={styles.flex}>
            <Text style={styles.strong}>Your cover</Text>
            <Text style={styles.small}>{pageCount} pages inside, printed as they look in your preview.</Text>
          </View>
        </View>
      </View>

      <Section title="Paper Material">
        {MATERIALS.map((m) => (
          <Choice key={m.type} on={material === m.type} title={m.name} body={m.description} onPress={() => setMaterial(m.type)} />
        ))}
      </Section>

      <Section title="Cover Type">
        {coverChoices.map((c) => (
          <Choice key={c.type} on={cover === c.type} title={c.name} body={c.description} onPress={() => setCover(c.type)} />
        ))}
        {!!coverNote && <Text style={styles.small} testID="order-cover-note">{coverNote}</Text>}
      </Section>

      <Section title="Album Size">
        <View style={styles.locked}>
          <Text style={styles.small}>From your design</Text>
          <Text style={styles.strong} testID="order-album-size">{sizeName}</Text>
        </View>
      </Section>

      <View onLayout={(e) => { spots.current.details = e.nativeEvent.layout.y; }}>
      <Section title="Your Details">
        <View>
          <Field label="Full Name" value={name} onChangeText={(t) => { setName(t); if (errors.name) setErrors((p) => ({ ...p, name: undefined })); }}
            autoComplete="name" maxLength={80} placeholder="Juan Dela Cruz" error={errors.name} testID="order-name" />
        </View>
        <View onLayout={(e) => { spots.current.phone = e.nativeEvent.layout.y; }}>
          <Field label="Phone Number" value={phone} onChangeText={(t) => { setPhone(t); if (errors.phone) setErrors((p) => ({ ...p, phone: undefined })); }}
            onBlur={() => setPhone((v) => phoneOnBlur(v))} keyboardType="phone-pad" autoComplete="tel" maxLength={20}
            placeholder="+63 9XX XXX XXXX" error={errors.phone} testID="order-phone" />
        </View>
      </Section>
      </View>

      <View onLayout={(e) => { spots.current.address = e.nativeEvent.layout.y; }}>
        <Section title="Delivery Address">
          <AddressFields value={address} onChange={(v) => { setAddress(v); if (Object.keys(addressErrors).length) setAddressErrors({}); }} errors={addressErrors} />
        </Section>
      </View>

      <Section title="Order Summary">
        <Row label="Material" value={materialName} accent />
        <Row label="Cover" value={coverName} accent />
        <Row label="Size" value={sizeName} accent />
        <View style={styles.rule} />
        {price.breakdown.items.map((item) => <Row key={item.label} label={item.label} value={peso(item.amount)} />)}
        <Row label="Shipping" value="Free" good testID="order-shipping" />
        {tester && price.ready && <Row label={testerLine(tester)} value={`−${peso(price.total - price.payTotal)}`} good testID="order-tester-line" />}
        <View style={styles.totalRow}>
          <Text style={styles.strong}>Total</Text>
          <Text style={styles.total} testID="order-total">
            {price.ready && tester && <Text style={styles.was}>{peso(price.total)}  </Text>}
            {price.ready && !tester && price.wasTotal !== null && <Text style={styles.was}>{peso(price.wasTotal)}  </Text>}
            {price.ready ? peso(price.payTotal) : '—'}
          </Text>
        </View>
        {price.ready && !tester && price.wasTotal !== null && (
          <Text style={styles.savings} testID="order-savings">New lower price: you save {peso(price.wasTotal - price.total)}</Text>
        )}
        {price.ready && <TesterCodeBox tester={tester} onChange={setTester} check={(typed) => checkTesterCodeOffline(typed, !!userId)} />}
        <View style={styles.included} testID="order-included">
          <Text style={styles.strongSmall}>Included with your album</Text>
          <Text style={styles.small}>✓ Free shipping{price.freeShippingValue > 0 ? ` (${peso(price.freeShippingValue)} value)` : ''}</Text>
          <Text style={styles.small}>✓ {FREE_QR_MEMORIES} living-memory QRs ({peso(FREE_QR_MEMORIES * EXTRA_QR_RATE)} value)</Text>
          {price.includedYears !== null && <Text style={styles.small}>✓ {price.includedYears} years of memory hosting</Text>}
        </View>
        <View style={styles.qrNote} testID="order-qr-note">
          <Text style={styles.qrNoteText}>
            <Text style={styles.strongSmall}>{FREE_QR_MEMORIES} living-memory QRs included</Text> — a video plays when anyone scans your printed album. Extra QRs are ₱{EXTRA_QR_RATE} each.
            {qrCount > 0 && <> This album has <Text style={styles.strongSmall}>{qrCount}</Text>.</>}
          </Text>
        </View>
      </Section>

      {tooFew ? (
        <View style={styles.warn} testID="order-too-few-photos"><Text style={styles.warnText}>{tooFewToOrderMessage(photosIn)}</Text></View>
      ) : (
        <Button
          label={placeOrderLabel({ ready: price.ready, loading: prices.loading, retrying: prices.retrying, tester: !!tester, total: price.total })}
          busy={!price.ready && (prices.loading || prices.retrying)}
          onPress={onPlace}
          testID="order-place"
        />
      )}

      {askSecond && openOrder && (
        <View style={styles.notice} testID="order-second-ask">
          <Text style={styles.noticeBody}>{secondOrderQuestion(openOrder)}</Text>
          <Button label="Yes, place a second order" kind="plain" onPress={placeSecond} testID="order-second-yes" />
        </View>
      )}
      {!!shownMessage && <Text style={styles.error} accessibilityRole="alert">{shownMessage}</Text>}
      {/* Sign in comes back here, to this order (then=back), not to My albums. */}
      {signInAsk && !userId && <Button label="Sign in" kind="plain" onPress={() => router.push({ pathname: '/sign-in', params: { then: 'back' } })} testID="order-sign-in" />}
      {(openAlbumAsk || tooFew) && <Button label="Open my album" kind="plain" onPress={() => router.push('/photos')} testID="order-open-album" />}
    </ScrollView>
  );
}

/* ══════════════ PLACING: the bar, the screen kept on ══════════════ */
function Placing({ frames, onDone }: { frames: PlaceFrame[]; onDone: () => void }) {
  // A locked screen paused a 70-page print file on the website (keepScreenOn).
  useKeepAwake('megy-place-order');
  const [i, setI] = useState(0);
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    if (i >= frames.length) { done.current(); return; }
    const t = setTimeout(() => setI((n) => n + 1), frames[i].holdMs);
    return () => clearTimeout(t);
  }, [i, frames]);
  const frame = frames[Math.min(i, frames.length - 1)];
  return (
    <View style={styles.placing} testID="order-placing">
      <Text style={styles.h1}>Placing your order</Text>
      <Text style={styles.placingStep} accessibilityLiveRegion="polite">{frame.message}</Text>
      <PlaceProgressBar progress={frame.progress} />
      <Text style={styles.testNoteText}>Test version: nothing is made or sent. The bar shows how it moves for this album's {frames.filter((f) => f.message.startsWith('Making page')).length} pages.</Text>
    </View>
  );
}

/* ══════════════ PAYMENT: QR, amount, reference, receipt ══════════════ */
function Payment({ amount, albumLine, breakdown, total, wasTotal, onBack }: {
  amount: number; albumLine: string; breakdown: { label: string; amount: number }[]; total: number; wasTotal: number | null; onBack: () => void;
}) {
  const [qrMissing, setQrMissing] = useState(false);
  const [receipt, setReceipt] = useState<PickedReceipt | null>(null);
  const [receiptError, setReceiptError] = useState('');
  const [payRef, setPayRef] = useState('');
  const [refError, setRefError] = useState('');
  const [sent, setSent] = useState<PaymentSubmitPlan | null>(null);
  const [summary, setSummary] = useState(false);
  const amountLabel = peso(amount);
  // No order is placed in this version, so there is no order number: the
  // website then leaves out "Order … is placed" and "put … in the note".

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
    setSent(paymentSubmitPlan(ORDER_ID, payRef, receipt));
  };

  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <View style={styles.testNote}>
        <Text style={styles.testNoteText}>Test version: no order was placed. This is how the payment step looks for this album.</Text>
      </View>
      <Text style={[styles.h1, styles.center]}>Send {amountLabel}</Text>

      <View style={styles.card}>
        <View style={styles.qrBox}>
          <Text style={styles.payee}>{PAYEE.bank} · {PAYEE.rail}</Text>
          {!qrMissing ? (
            <Image source={{ uri: PAYEE_QR_URL }} style={styles.qr} contentFit="contain" onError={() => setQrMissing(true)}
              accessibilityLabel={`${PAYEE.bank} InstaPay QR for ${PAYEE.name}`} />
          ) : (
            <View style={[styles.qr, styles.qrMissing]}>
              <Text style={styles.small}>The QR code isn't available right now — message us and we'll send the account details.</Text>
            </View>
          )}
          <Text style={styles.strong}>{PAYEE.name}</Text>
          <Text style={styles.small}>Account ending in {PAYEE.accountLast4}</Text>
          <Text style={styles.payAmount}>{amountLabel}</Text>
        </View>

        <View style={styles.steps}>
          <Text style={styles.small}>1. Open your bank or e-wallet app (GCash, Maya, BPI, BDO, UnionBank…).</Text>
          <Text style={styles.small}>2. Choose Scan QR / InstaPay and scan the code above.</Text>
          <Text style={styles.small}>3. Send exactly {amountLabel}.</Text>
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

        <Button label={`I've sent ${amountLabel}`} onPress={sentIt} testID="pay-sent" />
        <Text style={[styles.tiny, styles.center]}>We confirm transfers in our bank app during business hours, then print. Nothing is charged automatically.</Text>
        <Text style={[styles.tiny, styles.center]} testID="pay-within">{PAY_WITHIN_MESSAGE}</Text>

        <Pressable accessibilityRole="button" onPress={() => setSummary((v) => !v)}>
          <Text style={[styles.tiny, styles.center, styles.underline]}>Order summary</Text>
        </Pressable>
        {summary && (
          <View style={styles.summary}>
            <Row label="Album" value={albumLine} accent />
            {breakdown.map((item) => <Row key={item.label} label={item.label} value={peso(item.amount)} />)}
            <Row label="Shipping" value="Free" good />
            <View style={styles.totalRow}>
              <Text style={styles.strong}>Total</Text>
              <Text style={styles.total}>{wasTotal !== null && <Text style={styles.was}>{peso(wasTotal)}  </Text>}{peso(total)}</Text>
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
      <Button label="Back to your order" kind="plain" onPress={onBack} testID="pay-back" />
    </ScrollView>
  );
}

/* ── small pieces ── */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.card}>
      <Text style={styles.h2}>{title}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function Choice({ on, title, body, onPress }: { on: boolean; title: string; body: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ checked: on }} onPress={onPress} style={[styles.choice, on && styles.choiceOn]}>
      <Text style={styles.strong}>{title}</Text>
      <Text style={styles.small}>{body}</Text>
    </Pressable>
  );
}

function Row({ label, value, accent, good, testID }: { label: string; value: string; accent?: boolean; good?: boolean; testID?: string }) {
  return (
    <View style={styles.row} testID={testID}>
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
  h2: { fontSize: 19, fontWeight: '800', color: colors.text },
  body: { fontSize: 17, lineHeight: 24, color: colors.text },
  strong: { fontSize: 16, fontWeight: '700', color: colors.text },
  strongSmall: { fontSize: 14, fontWeight: '700', color: colors.text },
  small: { fontSize: 14, lineHeight: 20, color: colors.muted },
  tiny: { fontSize: 12, lineHeight: 17, color: colors.muted, fontWeight: '400' },
  underline: { textDecorationLine: 'underline' },
  card: { backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: space.md, gap: space.sm },
  sectionBody: { gap: space.sm },
  coverRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  choice: { borderWidth: 2, borderColor: '#E8E8E8', borderRadius: 12, padding: 12, backgroundColor: colors.card, gap: 2 },
  choiceOn: { borderColor: colors.accent, backgroundColor: '#F6E7DF' },
  locked: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 2, borderColor: '#E9B8A0', backgroundColor: '#FBF5F0', borderRadius: 12, paddingHorizontal: space.md, paddingVertical: 12 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  rowValue: { fontSize: 14, fontWeight: '600', color: colors.text, textAlign: 'right', maxWidth: '45%' },
  accent: { color: colors.accent, fontWeight: '700' },
  good: { color: colors.good, fontWeight: '700' },
  rule: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: space.xs },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: space.sm },
  total: { fontSize: 24, fontWeight: '800', color: colors.accent },
  was: { fontSize: 15, fontWeight: '500', color: colors.muted, textDecorationLine: 'line-through' },
  savings: { fontSize: 13, fontWeight: '700', color: colors.good, textAlign: 'right' },
  included: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, gap: 2 },
  qrNote: { borderWidth: 1, borderColor: '#E9B8A0', backgroundColor: '#FBF0EA', borderRadius: 12, padding: 12 },
  qrNoteText: { fontSize: 14, lineHeight: 20, color: '#6B4A3A' },
  notice: { borderWidth: 1, borderColor: '#E9B8A0', backgroundColor: '#FBF0EA', borderRadius: 14, padding: space.md, gap: space.sm },
  noticeHead: { fontSize: 15, fontWeight: '700', color: colors.text },
  noticeBody: { fontSize: 15, lineHeight: 21, color: '#6B4A3A' },
  warn: { borderWidth: 1, borderColor: '#F0D9A8', backgroundColor: '#FFF6E5', borderRadius: 12, padding: space.md },
  warnText: { fontSize: 15, color: '#8A5A12' },
  error: { fontSize: 15, color: colors.bad, textAlign: 'center' },
  testNote: { borderWidth: 1, borderStyle: 'dashed', borderColor: '#8A5A12', backgroundColor: '#FFF6E5', borderRadius: 12, padding: 12 },
  testNoteText: { fontSize: 13, lineHeight: 18, color: '#8A5A12' },
  placing: { flex: 1, justifyContent: 'center', padding: space.lg, gap: space.lg, backgroundColor: colors.background },
  placingStep: { fontSize: 20, fontWeight: '700', color: colors.text, minHeight: 28 },
  qrBox: { borderWidth: 1, borderColor: colors.border, backgroundColor: '#FFFDFB', borderRadius: 12, padding: space.md, alignItems: 'center', gap: 4 },
  payee: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5, color: colors.muted, textTransform: 'uppercase' },
  qr: { width: 224, height: 224, borderRadius: 8, backgroundColor: colors.card, marginVertical: space.sm },
  qrMissing: { backgroundColor: '#F7F1EC', alignItems: 'center', justifyContent: 'center', padding: space.md },
  payAmount: { fontSize: 26, fontWeight: '800', color: colors.accent, marginTop: space.xs },
  steps: { gap: 4 },
  receiptBox: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, gap: space.sm },
  summary: { gap: space.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: space.sm },
});
