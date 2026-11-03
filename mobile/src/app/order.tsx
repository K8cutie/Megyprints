/* ══════════════════════════════════════════════════════════════════════════
   CHECKOUT (Phase 5 screens): the website's Order page on the phone.

   form → Place order → placing (the bar, screen kept on) → payment
   (GoTyme / InstaPay QR, the amount, the order number for the transfer note
   once there is one, "Attach the transfer receipt", "I've sent ₱X"). The
   payment step is components/checkout/PaymentStep.tsx (Your orders opens it
   too, for an order waiting for payment).

   Everything a customer reads is the website's (src/pages/Order.tsx), and
   every rule is the website's: shared code (prices, contact and address
   rules, 40 photos, the cover that fits the press, the bar) or a mirror
   that a test runs beside the website's own function (see lib/checkout/).

   Opened from the Preview's "Order this album" (with the album's id), it
   orders that album FOR REAL: its pages from the app's album, its copy in
   the account read back by its id (lib/checkout/orderStart.ts, the
   website's selectOrderAlbum); Place order makes the print files on the
   phone and sends the order (lib/checkout/phoneSend.ts, sendOrder.ts), the
   bar following the real steps; a tester order ends "Test order placed", a
   paid one opens its payment step, where "I've sent" records the payment.

   Opened from the home screen's test button (no id): the test album
   (fixtureAlbum.ts), and THAT WRITES NOTHING: Place order runs the website's checks,
   builds exactly what the website would send (the order row, the memory
   rows, the files), shows it in a test panel, and stops: no order, no
   upload, no tester-code check (that call counts tries in the database).
   The price is real: the live price list, read only.
   ══════════════════════════════════════════════════════════════════════════ */
import { router, useLocalSearchParams } from 'expo-router';
import { useKeepAwake } from 'expo-keep-awake';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type ScrollViewInstance } from 'react-native';
import { EMPTY_ADDRESS, type AddressValue } from '@web/lib/contact';
import { trackOf } from '@web/lib/orderTracker';
import { countQrMemories, EXTRA_QR_RATE, FREE_QR_MEMORIES } from '@web/lib/pricing';
import { albumPhotoCount, photosShortBy, tooFewToOrderMessage } from '@web/pages/builder/albumMinimum';
import { coverChoiceNote, coverFitsSheet } from '@web/pages/builder/printSheet';
import { ALBUM_SIZES, COVERS, MATERIALS, type CoverType, type MaterialType } from '@web/pages/builder/types';
import { Button } from '../components/Button';
import { AddressFields } from '../components/checkout/AddressFields';
import { CoverThumb } from '../components/checkout/CoverThumb';
import { Field } from '../components/checkout/Field';
import { PaymentStep } from '../components/checkout/PaymentStep';
import { PlaceProgressBar } from '../components/checkout/PlaceProgressBar';
import { Sending } from '../components/checkout/Sending';
import { TestPanel } from '../components/checkout/TestPanel';
import { TesterCodeBox } from '../components/checkout/TesterCodeBox';
import { TermsAgreeLine } from '../components/LegalLinks';
import { useAuth } from '../lib/auth';
import { checkCheckout, phoneOnBlur, type AddressErrors } from '../lib/checkout/checkoutForm';
import { fixtureCheckoutAlbum } from '../lib/checkout/fixtureAlbum';
import { checkoutAlbumFrom, loadOrderAlbumRow } from '../lib/checkout/orderStart';
import { useOptionalBuilder } from '../builder/BuilderProvider';
import type { OrderAlbumRow } from '../lib/checkout/orderPayload';
import { TesterCodeGoneError } from '../lib/checkout/testerCode';
import type { PlacedOrder } from '../lib/checkout/sendOrder';
import { askedToPay, openOrderForAlbum, openOrderView, openOrderWords, placedOn, secondOrderQuestion, type OpenOrder } from '../lib/checkout/openOrder';
import { albumQrFills, placeOrderPlan, type PlaceOrderPlan } from '../lib/checkout/orderPayload';
import { placeFrames, type PlaceFrame } from '../lib/checkout/placeRun';
import { checkoutPrice, peso, placeOrderLabel } from '../lib/checkout/price';
import { loadPriceSchedule, usePriceSchedule } from '../lib/checkout/priceSchedule';
import { checkTesterCode, checkTesterCodeOffline, testerLine, type TesterCode } from '../lib/checkout/testerCode';
import { supabase, supabaseConfigured } from '../lib/supabase';
import { colors, space } from '../lib/theme';
import { albumClipTier } from '../lib/memories/albumTier';
import { dropEventLink, readEventLink, saveEventLink } from '../lib/events/albumEventLink';
import * as EV from '../lib/events/eventDeal';
import { MissingClipError, missingClipMessage, type ClipQuality } from '../lib/memories/clips';

type Step = 'form' | 'placing' | 'placed' | 'payment' | 'existing' | 'done';

const DEFAULT_MATERIAL: MaterialType = 'matte';
const DEFAULT_COVER: CoverType = 'softcover';

export default function OrderScreen() {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  // The album "Order this album" opened checkout with (its id), or the test
  // album (48 sample photos, made by the shared album maker) from the home
  // screen's test button.
  const { albumId: ownId } = useLocalSearchParams<{ albumId?: string }>();
  const own = useOptionalBuilder();
  const ordersOwn = !!ownId && !!own;
  // The account's copy of it, read by its id once signed in (never another album).
  const [ownRow, setOwnRow] = useState<OrderAlbumRow | null>(null);
  const [ownRowError, setOwnRowError] = useState('');
  useEffect(() => {
    if (!ordersOwn || !userId || !ownId) return;
    let live = true;
    setOwnRowError('');
    loadOrderAlbumRow(supabase, userId, ownId)
      .then((row) => { if (live) setOwnRow(row); })
      .catch((e: unknown) => { if (live) setOwnRowError(e instanceof Error ? e.message : String(e)); });
    return () => { live = false; };
  }, [ordersOwn, userId, ownId]);
  const fixture = useMemo(() => (ordersOwn ? null : fixtureCheckoutAlbum()), [ordersOwn]);
  // Ordering your own album sends it for real (the test album never does).
  const live = ordersOwn;
  const ownText = own?.text ?? null;
  // The order a try made: Place order again reuses it (never a second order).
  const placedRef = useRef<PlacedOrder | null>(null);
  const [placedOrder, setPlacedOrder] = useState<PlacedOrder | null>(null);
  // The end: a tester order placed, or a payment sent.
  const [done, setDone] = useState<{ number: string; test: boolean; receiptError: string | null; booking?: string } | null>(null);
  const b = own?.builder;
  const album = useMemo(() => (ordersOwn && b
    // Until the account's copy is read, a stand-in row with the album's id:
    // Place order waits for the real one (startPlacing).
    ? checkoutAlbumFrom(b, ownRow ?? { id: ownId!, title: b.albumTitle, album_type: null, album_size: b.albumSize, selected_template: null, photos_per_page: null, pages: b.albumPages, photos: [], cover_photo: null })
    : fixture!), [ordersOwn, b, b?.albumPages, b?.coverFront, b?.albumTitle, ownRow, ownId, fixture]);
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
  // How long the memories stay live (the website's hostingYears): null = the included term.
  const [hostingYears, setHostingYears] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  const [signInAsk, setSignInAsk] = useState(false);
  const [openAlbumAsk, setOpenAlbumAsk] = useState(false);
  const [openOrder, setOpenOrder] = useState<OpenOrder | null>(null);
  // The order "Open order MP-…" opened (it stays put while the form re-reads).
  const [shownOrder, setShownOrder] = useState<OpenOrder | null>(null);
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
  // An event album's cover is its deal's (below).
  const [eventLink, setEventLink] = useState<EV.EventAlbumLink | null | undefined>(undefined);
  useEffect(() => {
    if (eventLink || coverFits || !firstChoice || step !== 'form') return;
    setCover(firstChoice);
  }, [coverFits, firstChoice, step, eventLink]);

  // AN EVENT'S ALBUM (the website's Order.tsx; lib/events/eventDeal.ts). The
  // link is kept on this phone; without one, the host's bookings still
  // waiting for their album are offered ("Use booking EV-… for this album").
  const eventAlbumId = ordersOwn ? album.albumId : null;
  useEffect(() => {
    if (!eventAlbumId) { setEventLink(null); return; }
    let alive = true;
    void readEventLink(eventAlbumId).then((l) => { if (alive) setEventLink(l); });
    return () => { alive = false; };
  }, [eventAlbumId]);
  const [waitingBookings, setWaitingBookings] = useState<EV.EventBooking[]>([]);
  useEffect(() => {
    if (eventLink !== null || !userId || !eventAlbumId) return;
    let alive = true;
    EV.listMyBookings(supabase as never, userId)
      .then((all) => { if (alive) setWaitingBookings(EV.bookingsWaitingForAlbum(all)); })
      .catch(() => { /* no offer: checkout works as a normal album */ });
    return () => { alive = false; };
  }, [userId, eventAlbumId, eventLink]);
  const [eventBooking, setEventBooking] = useState<EV.EventBooking | null | undefined>(undefined);
  useEffect(() => {
    if (!eventLink || !userId) return;
    let alive = true;
    setEventBooking(undefined);
    EV.getMyBooking(supabase as never, userId, eventLink.bookingId)
      .then((bk) => { if (alive) setEventBooking(bk); })
      .catch(() => { if (alive) setEventBooking(null); });
    return () => { alive = false; };
  }, [eventLink?.bookingId, userId]); // eslint-disable-line react-hooks/exhaustive-deps
  const eventDeal = eventLink && eventBooking !== undefined ? EV.eventDealState(eventLink, eventBooking, { size: albumSize, pages: pageCount }) : null;
  const coveredByBooking = eventDeal?.state === 'covered';
  // The deal fixes the cover; undoing gives back the one they had picked.
  useEffect(() => { if (eventLink) setCover(EV.dealCover(eventLink.cover)); }, [eventLink?.cover]); // eslint-disable-line react-hooks/exhaustive-deps
  const coverBeforeLink = useRef<CoverType | null>(null);
  const linkThisBooking = (bk: EV.EventBooking) => {
    const link = EV.linkFromBooking(bk);
    if (!link || !eventAlbumId) return;
    coverBeforeLink.current = cover;
    void saveEventLink(eventAlbumId, link);
    setEventLink(link);
  };
  const notMyEventAlbum = () => {
    if (!eventAlbumId) return;
    void dropEventLink(eventAlbumId);
    if (coverBeforeLink.current) setCover(coverBeforeLink.current);
    setEventLink(null);
    setEventBooking(undefined);
    setMessage('');
  };

  // HD memories: the quality the album's videos were made for (the website's
  // albumTier), read before the price is shown.
  const clipKey = albumQrFills(album.pages).filter((f) => f?.kind === 'clip').map((f) => f!.code).join(',');
  const [clipTier, setClipTier] = useState<{ key: string; tier: ClipQuality } | null>(null);
  useEffect(() => {
    if (!clipKey) return;
    let alive = true;
    void albumClipTier(clipKey.split(',')).then((tier) => { if (alive) setClipTier({ key: clipKey, tier }); });
    return () => { alive = false; };
  }, [clipKey]);
  const clipTierReady = !clipKey || clipTier?.key === clipKey;
  const hdMemories = !eventLink && qrCount > 0 && !!clipKey && clipTier?.key === clipKey && clipTier.tier === 'hd';
  // An event album: the included term, no tester code (its booking pays).
  const priced = checkoutPrice(prices.schedule, { albumSize, cover, pageCount, qrCount, hostingYears: eventLink ? null : hostingYears, hdMemories, tester: eventLink ? null : tester });
  const price = clipTierReady ? priced : { ...priced, ready: false };

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
    // The order freezes the account's copy: not until it is read.
    if (ordersOwn && !ownRow) {
      setMessage(ownRowError || 'Getting your album from your account… Tap Place order again in a moment.');
      return;
    }
    // The print files are drawn with the album's fonts: not until they are ready.
    if (live && !ownText) {
      setMessage('Getting your album ready… Tap Place order again in a moment.');
      return;
    }
    try {
      const p = placeOrderPlan({
        userId,
        album: album.row,
        pages: album.pages,
        specs: { material, cover, size: albumSize },
        shipping: { name: cleanName, phone: cleanPhone, address },
        hostingYears: price.effectiveYears,
        hdMemories,
        testerCode: eventLink ? null : tester?.code ?? null,
        includedYears: price.includedYears,
        eventBookingId: eventLink && coveredByBooking ? eventLink.bookingId : null,
      });
      setPlan(p);
      setPlacedAmount(price.payTotal);
      setStep('placing');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Something went wrong placing your order.');
    }
  };

  const onPlace = () => {
    // An event album its booking can't pay for (yet): say why, place nothing.
    if (eventLink && eventDeal?.state !== 'covered') {
      setMessage(eventDeal?.state === 'blocked' ? eventDeal.message : EV.CHECKING_TRY_AGAIN);
      return;
    }
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
  // "Open order MP-…": that order, in the app (see openOrderView): its
  // payment step while nobody has paid it, else where it is. The question
  // about a second order is closed: back on the form, Place order asks again.
  const openExistingOrder = () => {
    if (!openOrder) return;
    setShownOrder(openOrder);
    setAskSecond(false);
    setStep('existing');
  };

  if (step === 'placing' && plan && live && ownText) {
    return (
      <Sending
        plan={plan} album={album} cover={cover} material={material} text={ownText} placed={placedRef.current}
        bookingNumber={eventLink?.bookingNumber ?? null}
        onOrder={(o) => { placedRef.current = o; }}
        onSent={(r) => {
          placedRef.current = r.order;
          setPlacedOrder(r.order);
          if (r.paidByTester) { setDone({ number: r.order.order_number, test: true, receiptError: null }); setStep('done'); return; }
          if (r.paidByBooking && eventLink) { setDone({ number: r.order.order_number, test: false, receiptError: null, booking: eventLink.bookingNumber }); setStep('done'); return; }
          setStep('payment');
        }}
        onFailed={(e) => {
          if (e instanceof TesterCodeGoneError) setTester(null);
          // A memory video that's gone: the website's words, naming its pages.
          if (e instanceof MissingClipError) { setMessage(missingClipMessage(album.pages, e.codes)); setStep('form'); return; }
          setMessage(e instanceof Error ? e.message : 'Something went wrong placing your order.');
          setStep('form');
        }}
      />
    );
  }

  if (step === 'placing' && plan) {
    return <Placing frames={frames} onDone={() => setStep('placed')} />;
  }

  if (step === 'done' && done) {
    return <Done number={done.number} test={done.test} receiptError={done.receiptError} booking={done.booking} />;
  }

  if (step === 'placed' && plan) {
    return (
      <ScrollView contentContainerStyle={styles.page}>
        <Text style={styles.h1}>Stopped before sending</Text>
        <Text style={styles.body}>This test version does not place orders yet. Your order was not placed, and nothing was sent: no order, no files.</Text>
        {tester && <Text style={styles.body}>This was a test order. Nothing is charged, and nothing will be printed or sent.</Text>}
        <TestPanel
          title="Test version: what Place order would send"
          note={`The same order the website would send for this album${tester ? ', address and tester code' : ' and address'}. The order number and the price come from the database. The cover and the pages are not made in this version.${tester?.unchecked ? ` The code ${tester.code} was not checked with the shop (that check is a database write): in this version any code of 4 to 24 letters and numbers shows as free.` : ''}`}
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

  if (step === 'existing' && shownOrder) {
    if (openOrderView(shownOrder) === 'pay') {
      return <PaymentStep amount={askedToPay(shownOrder)} order={shownOrder} live={live} onBack={() => setStep('form')}
        onPaid={(receiptError) => { setDone({ number: shownOrder.order_number, test: false, receiptError }); setStep('done'); }} />;
    }
    return <ExistingOrder order={shownOrder} onBack={() => setStep('form')} />;
  }

  if (step === 'payment') {
    const albumLine = [ALBUM_SIZES.find((s) => s.preset === albumSize)?.name, MATERIALS.find((m) => m.type === material)?.name, COVERS.find((c) => c.type === cover)?.name].join(' · ');
    const summary = { albumLine, breakdown: price.breakdown.items, total: price.total, wasTotal: price.wasTotal };
    if (live && placedOrder) {
      return <PaymentStep amount={placedAmount} order={{ id: placedOrder.id, order_number: placedOrder.order_number, created_at: new Date().toISOString() }} summary={summary} live
        onBack={() => setStep('form')}
        onPaid={(receiptError) => { setDone({ number: placedOrder.order_number, test: false, receiptError }); setStep('done'); }} />;
    }
    return <PaymentStep amount={placedAmount} order={null} summary={summary} onBack={() => setStep('form')} />;
  }

  /* ══════════════ FORM ══════════════ */
  const sizeName = ALBUM_SIZES.find((s) => s.preset === albumSize)?.name ?? albumSize;
  const materialName = MATERIALS.find((m) => m.type === material)?.name ?? material;
  const coverName = COVERS.find((c) => c.type === cover)?.name ?? cover;
  const words = openOrder ? openOrderWords(openOrder) : null;

  return (
    <ScrollView ref={scrollRef} contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      {ordersOwn && <View testID="order-own-album" />}
      {!!ownRowError && (
        <View style={styles.notice} testID="order-not-saved">
          <Text style={styles.noticeBody}>{ownRowError}</Text>
          <Button label="Back to my album" kind="plain" onPress={() => router.back()} testID="order-back-to-album" />
        </View>
      )}
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
          {/* Outlined: Place order below is the one filled button on the form. */}
          <Button label={words.button} kind="plain" onPress={openExistingOrder} testID="order-open-existing" />
        </View>
      )}

      {!!eventLink && (
        <View style={[styles.notice, coveredByBooking && styles.dealOk]} testID="order-event-deal">
          <Text style={styles.noticeHead}>{EV.dealTitle(eventLink.bookingNumber)}</Text>
          <Text style={styles.noticeBody} testID="order-event-deal-text">
            {eventDeal === null ? EV.CHECKING_BOOKING : eventDeal.state === 'covered' ? EV.COVERED : eventDeal.state === 'blocked' ? eventDeal.message : ''}
          </Text>
          {eventLink.atCheckout && <Button label={EV.NOT_MINE} kind="plain" onPress={notMyEventAlbum} testID="order-event-unlink" />}
        </View>
      )}
      {!eventLink && waitingBookings.length > 0 && (
        <View style={styles.notice} testID="order-event-offer">
          <Text style={styles.noticeHead}>{EV.OFFER_TITLE}</Text>
          <Text style={styles.noticeBody}>{EV.OFFER_BODY}</Text>
          {waitingBookings.map((bk) => (
            <Button key={bk.id} label={EV.useBooking(bk.booking_number)} kind="plain" onPress={() => linkThisBooking(bk)} testID={`order-event-use-${bk.booking_number}`} />
          ))}
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
        {(eventLink ? COVERS.filter((c) => c.type === cover) : coverChoices).map((c) => (
          <Choice key={c.type} on={cover === c.type} title={c.name} body={c.description} onPress={() => { if (!eventLink) setCover(c.type); }} />
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
        {/* An event album is part of its booking's deal: it never shows the album price. */}
        {eventLink
          ? <Row label={EV.albumLine(eventLink.bookingNumber)} value="₱0" testID="order-event-line" />
          : price.breakdown.items.map((item) => <Row key={item.label} label={item.label} value={peso(item.amount)} />)}
        <Row label="Shipping" value="Free" good testID="order-shipping" />
        {!eventLink && tester && price.ready && <Row label={testerLine(tester)} value={`−${peso(price.total - price.payTotal)}`} good testID="order-tester-line" />}
        <View style={styles.totalRow}>
          <Text style={styles.strong}>Total</Text>
          <Text style={styles.total} testID="order-total">
            {!eventLink && price.ready && tester && <Text style={styles.was}>{peso(price.total)}  </Text>}
            {!eventLink && price.ready && !tester && price.wasTotal !== null && <Text style={styles.was}>{peso(price.wasTotal)}  </Text>}
            {eventLink ? '₱0' : price.ready ? peso(price.payTotal) : '—'}
          </Text>
        </View>
        {coveredByBooking && <Text style={styles.savings} testID="order-covered">{EV.COVERED_LINE}</Text>}
        {!!eventLink && !coveredByBooking && <Text style={styles.small} testID="order-covered-later">{EV.COVERED_LATER}</Text>}
        {!eventLink && price.ready && !tester && price.wasTotal !== null && (
          <Text style={styles.savings} testID="order-savings">New lower price: you save {peso(price.wasTotal - price.total)}</Text>
        )}
        {/* Your own album: the database checks the code, as on the website (its
            trigger takes a code only from an account that checked it). The
            test album writes nothing, so it checks the code's shape only. */}
        {!eventLink && price.ready && <TesterCodeBox tester={tester} onChange={setTester} check={(typed) => (live && userId ? checkTesterCode(supabase, typed, supabaseConfigured) : checkTesterCodeOffline(typed, !!userId))} />}
        <View style={styles.included} testID="order-included">
          <Text style={styles.strongSmall}>Included with your album</Text>
          <Text style={styles.small}>✓ Free shipping{price.freeShippingValue > 0 ? ` (${peso(price.freeShippingValue)} value)` : ''}</Text>
          <Text style={styles.small}>✓ {FREE_QR_MEMORIES} living-memory QRs ({peso(FREE_QR_MEMORIES * EXTRA_QR_RATE)} value)</Text>
          {price.includedYears !== null && <Text style={styles.small}>✓ {price.includedYears} years of memory hosting</Text>}
        </View>
        {qrCount > 0 && price.tiers.length > 0 && !eventLink && (
          // Order.tsx: "How long should your memories stay live?"
          <View style={styles.terms} testID="order-terms">
            <Text style={styles.strongSmall}>How long should your memories stay live?</Text>
            <Text style={styles.small}>Your videos play from the printed QR for the whole term. Renew anytime after.</Text>
            <View style={styles.termRow} accessibilityRole="radiogroup" accessibilityLabel="Memory hosting term">
              {price.tiers.map((t) => {
                const active = (hostingYears ?? price.includedYears) === t.years;
                return (
                  <Pressable key={t.years} accessibilityRole="radio" accessibilityState={{ checked: active }} onPress={() => setHostingYears(t.years)}
                    style={[styles.term, active && styles.termOn]} testID={`order-term-${t.years}`}>
                    <Text style={styles.termYears}>{t.years} years</Text>
                    <Text style={styles.small}>{t.price > 0 ? `+₱${t.price}` : 'Included'}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}
        <View style={styles.qrNote} testID="order-qr-note">
          <Text style={styles.qrNoteText}>
            {eventLink
              ? <><Text style={styles.strongSmall}>{EV.EVENT_MEMORIES}</Text> — a video plays when anyone scans your printed album.</>
              : <><Text style={styles.strongSmall}>{FREE_QR_MEMORIES} living-memory QRs included</Text> — a video plays when anyone scans your printed album. Extra QRs are ₱{EXTRA_QR_RATE} each.</>}
            {qrCount > 0 && <> This album has <Text style={styles.strongSmall}>{qrCount}</Text>.</>}
          </Text>
        </View>
      </Section>

      {tooFew ? (
        <View style={styles.warn} testID="order-too-few-photos"><Text style={styles.warnText}>{tooFewToOrderMessage(photosIn)}</Text></View>
      ) : askSecond && openOrder ? null : (
        <>
          <Button
            label={eventLink ? EV.PLACE_EVENT : placeOrderLabel({ ready: price.ready, loading: prices.loading, retrying: prices.retrying, tester: !!tester, total: price.total })}
            busy={!price.ready && (prices.loading || prices.retrying)}
            onPress={onPlace}
            testID="order-place"
          />
          {/* The website's line under Place order (Order.tsx, #233). */}
          <TermsAgreeLine by="placing an order" testID="order-agree" />
        </>
      )}

      {/* The question takes Place order's place: its filled button is the order
          already there, the second order is outlined. */}
      {askSecond && openOrder && words && (
        <View style={styles.notice} testID="order-second-ask">
          <Text style={styles.noticeBody}>{secondOrderQuestion(openOrder)}</Text>
          <Button label={words.button} onPress={openExistingOrder} testID="order-second-open" />
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

/** The end of checkout, in the website's words (its tracking step's
 *  headline): a tester order placed, or a payment sent for the shop to
 *  confirm. */
function Done({ number, test, receiptError, booking }: { number: string; test: boolean; receiptError: string | null; booking?: string }) {
  // An event album its booking paid for: the order is paid (the website's tracking headline for it).
  const title = booking ? trackOf({ status: 'paid' }).headline : test ? 'Test order placed' : "Thank you — we're confirming your payment";
  return (
    <ScrollView contentContainerStyle={styles.page} testID="order-done">
      <Text style={[styles.h1, styles.center]}>{title}</Text>
      <Text style={[styles.strong, styles.center]} testID="order-done-number">Order {number}</Text>
      {booking
        ? <Text style={[styles.small, styles.center]} testID="order-paid-by-booking">{EV.paidByBooking(booking)}</Text>
        : test
          ? <Text style={[styles.small, styles.center]}>Thank you for testing Megy Prints!</Text>
          : <Text style={[styles.small, styles.center]}>We confirm transfers in our bank app during business hours, then print. Nothing is charged automatically.</Text>}
      {!!receiptError && <Text style={styles.error}>{receiptError}</Text>}
      <Button label="Done" onPress={() => { if (router.canDismiss?.()) router.dismissAll(); else router.replace('/'); }} testID="order-done-close" />
    </ScrollView>
  );
}

/* ══════════════ AN ORDER ALREADY PLACED, NOT WAITING FOR PAYMENT ══════════════ */
/** Where an order "Open order MP-…" opened is, in the website's words (the
 *  shared orderTracker), when there is nothing to pay: the payment was sent
 *  and the shop is confirming it, or it is a tester-code order. */
function ExistingOrder({ order, onBack }: { order: OpenOrder; onBack: () => void }) {
  const track = trackOf(order);
  const total = askedToPay(order);
  return (
    <ScrollView contentContainerStyle={styles.page} testID="order-existing">
      <Text style={styles.h1}>Order {order.order_number}</Text>
      <Text style={styles.small}>Placed {placedOn(order.created_at)}{total !== null && !track.test ? ` · ${peso(total)}` : ''}</Text>
      <View style={styles.card}>
        <Text style={styles.strong} testID="order-existing-headline">{track.headline}</Text>
        {!track.test && <Text style={styles.small}>We confirm transfers in our bank app during business hours, then print. Nothing is charged automatically.</Text>}
      </View>
      <Button label="Back to your order" onPress={onBack} testID="existing-back" />
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
  center: { textAlign: 'center' },
  page: { padding: space.md, gap: space.md, paddingBottom: space.xl * 2, backgroundColor: colors.background },
  flex: { flex: 1 },
  h1: { fontSize: 28, fontWeight: '800', color: colors.text },
  h2: { fontSize: 19, fontWeight: '800', color: colors.text },
  body: { fontSize: 17, lineHeight: 24, color: colors.text },
  strong: { fontSize: 16, fontWeight: '700', color: colors.text },
  strongSmall: { fontSize: 14, fontWeight: '700', color: colors.text },
  small: { fontSize: 14, lineHeight: 20, color: colors.muted },
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
  dealOk: { borderColor: '#BFE3C8', backgroundColor: '#EEF8F1' },
  terms: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, gap: 4 },
  termRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  term: { width: '48%', borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  termOn: { borderColor: colors.accent, backgroundColor: '#FBF0EA' },
  termYears: { fontSize: 14, fontWeight: '700', color: colors.text },
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
});
