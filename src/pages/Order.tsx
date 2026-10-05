import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import type { MaterialType, CoverType, AlbumSizePreset, AlbumPage, UploadedPhoto } from "./builder/types";
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Check, ShoppingCart, BookOpen, Palette, HardDrive, Printer, Loader2, QrCode, Wifi, Landmark, Paperclip } from 'lucide-react';
import { MATERIALS, COVERS, ALBUM_SIZES, DEFAULT_COVER_DESIGN } from './builder/types';
import { useAuth } from '../lib/authContext';
import { useAuthModal } from '../components/AuthModalProvider';
import { createOrderFromAlbum, uploadOrderPrintPdf, uploadOrderCoverPdf } from '../lib/orders';
import { getPendingPrintJob, setPendingPrintJob, readOrderHandoff, noteOrderHandoff, type PrintJob } from '../lib/printQueue';
import { draftAlbumForAccount } from '../lib/draftAlbum';
import { serializeAlbum, upsertAlbumRow } from '../lib/useAlbumSync';
import { rebuildPrintJobFromAlbum } from '../lib/printJobRebuild';
import { resolveOrderAlbumId, assertAlbumSavedForOrder, AlbumNotSavedError } from '../lib/orderAlbum';
import { readLocalDraftSummary, readDraftAlbumForOrder } from '../lib/localDraft';
import { saveCheckoutOrder, resumableCheckoutOrder, saveCheckoutForm, readCheckoutForm, type CheckoutOrder, type CheckoutStage } from '../lib/checkoutSession';
import { useIndexedDBPhotos } from '../lib/useIndexedDBPhotos';
import { priceBreakdown, countQrMemories, hostingTiersOf, includedHostingYears, hdMemoriesPriceOf, FREE_QR_MEMORIES, EXTRA_QR_RATE, MIN_PAGES, type Binding } from '../lib/pricing';
import { uploadStagedClips, prefetchStagedClipUploads, stagedClipBytes, removeStagedClip, currentClipQuality, type ClipUploadPhase } from '../lib/memoryClips';
import { PAYEE, checkProof, uploadPaymentProof, submitPaymentProof, cleanReference, referenceProblem } from '../lib/payment';
import { updateMemoryDestination } from '../lib/qrMemories';
import { getPriceSchedule, isStoreSettingsReady, storeSettingsReady, onStoreSettingsChange, retryStoreSettings } from '../lib/storeSettings';
import { ensureMemoriesForFills } from '../lib/qrMemories';
import { reportError } from '../lib/report';
import { normalizeFullName, isValidFullName, normalizePHPhone, formatPHPhoneDisplay, validateAddress, EMPTY_ADDRESS, type AddressValue } from '../lib/contact';
import AddressPicker from '../components/AddressPicker';
import { scrollPageToTop } from '../lib/pageScroll';
import { startFreshAlbum } from '../lib/albumSession';
import { albumPhotoCount, photosShortBy, tooFewToOrderMessage, TooFewPhotosError } from './builder/albumMinimum';
import { trackOf } from '../lib/orderTracker';
import { missingPhotos, missingPhotosMessage } from '../lib/photoPresence';
import { getMyOrder, openOrderForAlbum, type MyOrder } from '../lib/myOrders';
import OrderTracker from '../components/OrderTracker';

// The front cover at checkout — lazy: it brings the page renderer.
const CoverThumb = lazy(() => import('./builder/CoverThumb'));

type Step = 'form' | 'payment' | 'tracking';


export default function Order() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { openLogin } = useAuthModal();
  const idbPhotos = useIndexedDBPhotos();
  // Remembers a created order across retries so a second Pay tap (e.g. after a
  // transient upload failure) reuses the same order row instead of duplicating it.
  // Freeze the specs used to CREATE the order alongside its id. A retry reuses
  // the same order row, whose material/cover/size were fixed at creation — so the
  // print/cover PDF must be built from these frozen specs, not the live pickers
  // (which the user may change between a failed attempt and the retry), or the
  // stored order and the uploaded PDF silently diverge.
  // albumId = the album the order row froze; a PDF rebuild must read that one.
  const createdOrderRef = useRef<
    { id: string; order_number: string; albumId: string; material: MaterialType; cover: CoverType; albumSize: AlbumSizePreset } | null
  >(null);
  const [material, setMaterial] = useState<MaterialType>('matte');
  const [cover, setCover] = useState<CoverType>('softcover');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState<AddressValue>(EMPTY_ADDRESS);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [addressErrors, setAddressErrors] = useState<Partial<Record<keyof AddressValue, string>>>({});
  const [step, setStep] = useState<Step>('form');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  // The album isn't in the account (a guest who signed in here), or it is
  // short of the 40-photo minimum: offer the way back to it.
  const [albumNotSaved, setAlbumNotSaved] = useState(false);
  const [orderNumber, setOrderNumber] = useState('');
  // The placed order as the shop has it now (its real status) — the tracker
  // follows it. It was a fixed picture stuck at "Payment sent".
  const [placedOrder, setPlacedOrder] = useState<MyOrder | null>(null);
  // This album's order still waiting for payment, if any: said up front, and a
  // second order is asked, never placed silently (1-star testers round 2, Q1).
  const [openOrder, setOpenOrder] = useState<MyOrder | null>(null);
  const [askSecond, setAskSecond] = useState(false);
  const secondOkRef = useRef(false);
  useEffect(() => {
    const orderId = createdOrderRef.current?.id;
    if (step !== 'tracking' || !user || !orderId) return;
    let alive = true;
    const refresh = () => { getMyOrder(user.id, orderId).then((o) => { if (alive && o) setPlacedOrder(o); }).catch(() => { /* keep what's shown */ }); };
    refresh();
    const timer = window.setInterval(refresh, 60_000);
    return () => { alive = false; window.clearInterval(timer); };
  }, [step, user]);
  const [prepMsg, setPrepMsg] = useState('');
  // Manual transfer (0033): the receipt + bank reference the customer attaches.
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofError, setProofError] = useState('');
  const [payRef, setPayRef] = useState('');
  const [refError, setRefError] = useState('');
  const [qrMissing, setQrMissing] = useState(false);
  // The amount the order was placed at — what the payment screen asks for,
  // even after a reload (checkoutSession), never a recomputed one.
  const [placedAmount, setPlacedAmount] = useState<number | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const addressRef = useRef<HTMLDivElement>(null);

  // Price the ACTUAL album the customer built — NEVER a default. The album
  // comes with the print job the Preview hands over (set at "Order"). A reload
  // wipes that (it lives in memory), and checkout used to fall back to 8×8 /
  // 40 pages: a 9×9 album was priced ₱1,710 instead of ₱2,886 (1-star testers,
  // 2026-10-04). Now it is rebuilt from the account, or — for a guest — read
  // from this device's draft just to price it (the print file is always built
  // from the full album, see placeOrder). Until one answers nothing is priced;
  // when none can, checkout says so and offers the way back to the album.
  // Cover choice maps to binding (non-softcover → hardbound).
  // `cover`: the front cover page and the photos it draws from, when the album
  // came with its print job (the device-draft path prices only).
  type OrderAlbumInfo = { albumId?: string; albumSize: AlbumSizePreset; pages: AlbumPage[]; editedAt: number; cover?: { page: AlbumPage; photos: UploadedPhoto[] } };
  const fromJob = (j: PrintJob): OrderAlbumInfo =>
    ({ albumId: j.albumId, albumSize: j.albumSize, pages: j.pages, editedAt: readLocalDraftSummary()?.editedAt ?? 0,
      cover: j.coverFront ? { page: j.coverFront, photos: j.photos } : undefined });
  const orderRecordRef = useRef<Omit<CheckoutOrder, 'stage'> | null>(null);
  const restoredRef = useRef(false);
  function restoreCheckout(album: OrderAlbumInfo) {
    if (restoredRef.current) return;
    restoredRef.current = true;
    const form = readCheckoutForm(album.albumId);
    if (form) {
      setName(form.name); setPhone(form.phone); setAddress(form.address);
      setMaterial(form.material); setCover(form.cover);
    }
    const o = resumableCheckoutOrder(album.albumId, album.editedAt);
    if (!o) return;
    createdOrderRef.current = { id: o.orderId, order_number: o.orderNumber, albumId: o.albumId, material: o.material, cover: o.cover, albumSize: o.albumSize };
    orderRecordRef.current = { albumId: o.albumId, orderId: o.orderId, orderNumber: o.orderNumber, material: o.material, cover: o.cover, albumSize: o.albumSize, amount: o.amount, albumEditedAt: o.albumEditedAt };
    setOrderNumber(o.orderNumber);
    setMaterial(o.material);
    setCover(o.cover);
    setPlacedAmount(o.amount);
    if (o.stage === 'payment') setStep('payment');
    else if (o.stage === 'tracking') setStep('tracking');
  }
  const [albumInfo, setAlbumInfo] = useState<OrderAlbumInfo | 'loading' | 'missing'>('loading');
  // The album arrives here — handed over in memory, rebuilt from the account,
  // or (pricing only) read from the device draft — and the checkout it had
  // in this tab comes back with it (restoreCheckout, below).
  useEffect(() => {
    if (albumInfo !== 'loading') return;
    let alive = true;
    void (async () => {
      const arrived = (i: OrderAlbumInfo | 'missing') => {
        if (!alive) return;
        setAlbumInfo(i);
        if (i !== 'missing') restoreCheckout(i);
      };
      const handed = getPendingPrintJob();
      if (handed && handed.pages.length > 0) { arrived(fromJob(handed)); return; }
      const albumId = readOrderHandoff()?.albumId ?? readLocalDraftSummary()?.albumId;
      if (user) {
        try {
          const j = await rebuildPrintJobFromAlbum(user.id, idbPhotos.get, albumId);
          if (j && j.pages.length > 0) {
            if (alive) setPendingPrintJob(j);
            arrived(fromJob(j));
            return;
          }
        } catch { /* not in the account (yet) — the device's draft can still price it */ }
      }
      const d = readDraftAlbumForOrder(albumId);
      arrived(d
        ? { albumId: d.albumId ?? albumId, albumSize: d.albumSize as AlbumSizePreset, pages: d.pages as AlbumPage[], editedAt: d.editedAt }
        : 'missing');
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [albumInfo, user]);
  const info = typeof albumInfo === 'object' ? albumInfo : null;
  useEffect(() => {
    if (!user || !info?.albumId || step !== 'form') return;
    let alive = true;
    openOrderForAlbum(user.id, info.albumId)
      .then((o) => {
        // The order this checkout itself made (a retry after a failed upload) is not "another".
        if (alive) setOpenOrder(o && o.id !== createdOrderRef.current?.id ? o : null);
      })
      .catch(() => { /* can't tell: checkout goes on as before */ });
    return () => { alive = false; };
  }, [user, info?.albumId, step]);
  const albumSize: AlbumSizePreset = info?.albumSize ?? '8x8';
  const pageCount = info?.pages.length ?? MIN_PAGES;
  // QR memories on the album — the first FREE_QR_MEMORIES are included, each
  // one past that is an add-on line (counted per QR code, link or clip alike).
  const qrCount = countQrMemories(info?.pages ?? []);
  // Every QR on the album — both homes — for the checkout belt + clip uploads.
  const allQrFills = (info?.pages ?? []).flatMap((p) => [...(p.qrFills ?? []), ...(p.textSlotQr ?? [])]);
  const clipCodes = allQrFills.filter((f) => f?.kind === 'clip').map((f) => f!.code);
  // HD (1080p) memories — chosen with the first memory in the builder, priced
  // here. Standard 720p is included, so this bills only when HD was picked.
  const hdMemories = qrCount > 0 && currentClipQuality() === 'hd';
  // Memory-hosting TERM (0030): the included term unless the customer upgrades.
  const [hostingYears, setHostingYears] = useState<number | null>(null);
  const binding: Binding = cover === 'softcover' ? 'soft' : 'hard';
  // THE 40-PHOTO GATE (builder/albumMinimum): the Preview's Order stops a
  // short album, but /order can be opened directly (an old tab, a bookmark).
  const jobPhotos = info ? albumPhotoCount(info.pages) : null;
  const jobTooFew = jobPhotos != null && photosShortBy(jobPhotos) > 0;

  // ── Early clip upload ──────────────────────────────────────────────────
  // Opening this page is already a commit signal, so the memory videos start
  // uploading NOW and overlap with the address form instead of stacking up
  // behind the Pay tap (7 × 2-min 720p clips ≈ 230 MB — minutes on mobile).
  // The Pay tap still runs the same upload as the REQUIRED backstop; it is
  // serialized with this one and skips whatever already landed.
  const clipKey = clipCodes.join(',');
  const [clipPrep, setClipPrep] = useState<{ phase: ClipUploadPhase | 'ready' | 'failed' | null; done: number; total: number; bytes: number | null }>({ phase: null, done: 0, total: 0, bytes: null });
  useEffect(() => {
    if (!clipKey) return;
    const codes = clipKey.split(',');
    let alive = true;
    void stagedClipBytes(codes).then((bytes) => { if (alive) setClipPrep((c) => ({ ...c, bytes })); });
    void prefetchStagedClipUploads(codes, (done, total, phase) => { if (alive) setClipPrep((c) => ({ ...c, phase, done, total })); })
      .then((ok) => { if (alive) setClipPrep((c) => ({ ...c, phase: ok ? 'ready' : 'failed' })); });
    return () => { alive = false; };
  }, [clipKey]);

  // The price schedule loads async on app start (0024 — the cost model is no
  // longer in the bundle, so there is nothing to fall back to). Track readiness
  // so we re-read once it lands, and BLOCK payment until it does: a wrong price
  // on a money path is worse than a blocked one.
  const [settingsReady, setSettingsReady] = useState(isStoreSettingsReady());
  useEffect(() => {
    if (settingsReady) return;
    let alive = true;
    void storeSettingsReady().then(() => { if (alive) setSettingsReady(true); });
    return () => { alive = false; };
  }, [settingsReady]);
  // Prices that arrive later (back online, a retry) re-render checkout (CD-1).
  const [, setPriceTick] = useState(0);
  useEffect(() => onStoreSettingsChange(() => setPriceTick((n) => n + 1)), []);
  const [retryingPrices, setRetryingPrices] = useState(false);
  const retryPrices = () => {
    if (retryingPrices) return;
    setRetryingPrices(true);
    void retryStoreSettings().finally(() => setRetryingPrices(false));
  };
  const schedule = getPriceSchedule(); // re-read each render; non-null once loaded
  const tiers = schedule ? hostingTiersOf(schedule) : [];
  const includedYears = schedule ? includedHostingYears(schedule) : null;
  const effectiveYears = qrCount > 0 ? (hostingYears ?? includedYears) : null;
  const hdPrice = schedule ? hdMemoriesPriceOf(schedule) : 0;

  // Cheap arithmetic — recomputed per render on purpose (schedule is read fresh).
  const breakdown = schedule
    ? priceBreakdown(schedule, albumSize, binding, pageCount, qrCount, effectiveYears, hdMemories)
    : { items: [], total: 0 };
  const totalPrice = breakdown.total;
  // Loaded AND priceable. `settingsReady` alone only means the load settled — it
  // can settle with no schedule (offline, RPC blocked), and quoting ₱0 then would
  // charge nothing for a real album.
  const priceReady = settingsReady && schedule !== null && info !== null;

  // ── Back after a reload (checkoutSession) ──
  // An order already placed in this checkout returns to where it was — the
  // payment or thank-you screen, or the form with the SAME order row behind
  // Place order — instead of a second, duplicate order. And the form comes
  // back as typed.
  useEffect(() => {
    if (!info?.albumId || step !== 'form') return;
    saveCheckoutForm({ albumId: info.albumId, name, phone, address, material, cover });
  }, [info, step, name, phone, address, material, cover]);
  const recordOrder = (stage: CheckoutStage) => {
    if (orderRecordRef.current) saveCheckoutOrder({ ...orderRecordRef.current, stage });
  };

  // Every new screen opens at its top: the payment amount and the order
  // number were below the fold, the phone left at the footer (testers).
  useEffect(() => { scrollPageToTop(); }, [step]);
  // Signing in answers "You must be signed in to check out" — don't leave it up.
  const shownError = user && errorMsg.startsWith('You must be signed in') ? '' : errorMsg;

  // ── Form → Payment ──
  const handleProceedToPayment = () => {
    setErrorMsg('');
    const cleanName = normalizeFullName(name);
    const canonicalPhone = normalizePHPhone(phone);
    const addrErrs = validateAddress(address);

    const newErrors: Record<string, string> = {};
    if (!isValidFullName(cleanName)) newErrors.name = 'Please enter your full name.';
    if (!canonicalPhone) newErrors.phone = 'Enter a valid PH mobile number, e.g. 0917 123 4567.';
    setErrors(newErrors);
    setAddressErrors(addrErrs);
    if (Object.keys(newErrors).length > 0 || Object.keys(addrErrs).length > 0) {
      // The errors sit above the button, off-screen on a phone: a tap that
      // seemed to do nothing (testers). Go to the first thing to fix.
      const first = newErrors.name ? nameRef.current : newErrors.phone ? phoneRef.current : addressRef.current;
      first?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (first instanceof HTMLInputElement) first.focus({ preventScroll: true });
      return;
    }

    // Reflect the cleaned/canonical values back so the user sees exactly what
    // we'll store (and the order later re-derives the same E.164 phone).
    setName(cleanName);
    setPhone(formatPHPhoneDisplay(canonicalPhone!));

    if (!user) {
      setErrorMsg('You must be signed in to check out — it ties the order to your album and lets us contact you.');
      openLogin();
      return;
    }
    // This album already has an order waiting for payment: ask first.
    if (openOrder && !secondOkRef.current) {
      setAskSecond(true);
      return;
    }
    void placeOrder();
  };
  const placeSecondOrder = () => {
    secondOkRef.current = true;
    setAskSecond(false);
    void placeOrder();
  };
  const openExistingOrder = () => { if (openOrder) navigate(`/orders?order=${openOrder.id}`); };

  /** Save this device's draft of the album to the signed-in account (a guest
   *  who signed up at checkout). Never another account's draft. */
  const saveDraftToAccount = async (albumId: string): Promise<boolean> => {
    if (!user) return false;
    const draft = draftAlbumForAccount(user.id, albumId);
    if (!draft) return false;
    setPrepMsg('Saving your album to your account…');
    const { error } = await upsertAlbumRow({ ...serializeAlbum(draft), user_id: user.id, id: draft.id });
    if (error) return false;
    noteOrderHandoff({ albumId, saved: true });
    return true;
  };

  // ── Place the order → REQUIRED print-PDF upload → show the payment QR ──
  // Manual bank transfer (0033): the order row exists BEFORE the customer pays
  // so its number can be the transfer reference; it stays pending_payment
  // until the operator matches the deposit and taps "Mark paid".
  // The print-ready PDF is generated on THIS device (the photos live only in
  // this browser's IndexedDB) and uploaded to the private fulfillment bucket. It
  // is a BLOCKING step: an order must never reach the "Sent to print" screen
  // without its PDF in the bucket. On any failure we surface a clear error and
  // leave the user on the Pay button to retry.
  const placeOrder = async () => {
    setErrorMsg('');
    setAlbumNotSaved(false);
    // Short of 40 photos: no order row, nothing uploaded.
    const handed = getPendingPrintJob();
    if (handed && photosShortBy(albumPhotoCount(handed.pages)) > 0) {
      setErrorMsg(tooFewToOrderMessage(albumPhotoCount(handed.pages)));
      setAlbumNotSaved(true);
      return;
    }
    // Photos not on this device: the print would have blank frames. Never.
    const gone = handed ? missingPhotos(handed.pages, handed.photos, handed.coverFront) : null;
    if (gone && gone.count > 0) {
      setErrorMsg(missingPhotosMessage(gone));
      setAlbumNotSaved(true);
      return;
    }
    setSubmitting(true);
    try {
      // 1. Create the order — but only once. A retry after a failed upload reuses
      //    the same order row (no duplicate); a PDF already in the bucket from
      //    the earlier attempt counts as uploaded.
      let order = createdOrderRef.current;
      if (!order) {
        // WHICH album: the one handed over from the Preview, or — when a reload
        // (the Google sign-in round-trip) wiped that — the album in this
        // device's draft. Never simply "the latest": a customer keeps several.
        const albumId = resolveOrderAlbumId(getPendingPrintJob(), readLocalDraftSummary());
        // A guest's album never reached the account (the builder saves it on the
        // way to checkout, but only for a signed-in customer). They signed up
        // HERE: save it to the new account now. It used to stop them with "Open
        // it in the builder and tap Order again", and that detour wiped their
        // address (1-star testers, 2026-10-04).
        const handoff = readOrderHandoff();
        if (albumId && handoff?.albumId === albumId && !handoff.saved) await saveDraftToAccount(albumId);
        assertAlbumSavedForOrder(readOrderHandoff(), albumId);
        const orderIt = () => createOrderFromAlbum({
          userId: user!.id,
          albumId,
          specs: { material, cover, size: albumSize },
          // createOrderFromAlbum normalizes name/phone + composes the address
          // from these structured PSGC parts (single source of truth).
          shipping: { name, phone, address },
          amount: totalPrice,
          hostingYears: effectiveYears,
          hdMemories,
        });
        let created;
        try {
          created = await orderIt();
        } catch (e) {
          // The account has no copy of this album (it never got its save):
          // save this device's draft, then order it.
          if (!(e instanceof AlbumNotSavedError) || !albumId || !(await saveDraftToAccount(albumId))) throw e;
          created = await orderIt();
        }
        createdOrderRef.current = {
          id: created.id, order_number: created.order_number, albumId: created.album_id,
          material, cover, albumSize, // freeze the specs the order row was built with
        };
        order = createdOrderRef.current;
        setPlacedAmount(totalPrice);
        orderRecordRef.current = {
          albumId: created.album_id, orderId: created.id, orderNumber: created.order_number,
          material, cover, albumSize, amount: totalPrice, albumEditedAt: info?.editedAt ?? 0,
        };
        recordOrder('placed');
      }
      setOrderNumber(order.order_number);

      // 2. Resolve the print job durably. The in-memory job (getPendingPrintJob)
      //    is wiped by any full reload — most commonly the Google sign-in redirect
      //    at checkout — so when it's gone we rebuild it from the SAME album the
      //    order froze + the photo blobs in this browser's IndexedDB.
      setPrepMsg('Preparing your album for printing…');
      let printJob = getPendingPrintJob();
      if (!printJob || printJob.pages.length === 0) {
        printJob = await rebuildPrintJobFromAlbum(user!.id, idbPhotos.get, order.albumId);
      }
      if (!printJob || printJob.pages.length === 0) {
        throw new Error(
          "We couldn't prepare your album for printing on this device. Please open your album in the builder on the device where you created it, then order again — your photos live only in that browser.",
        );
      }
      // The album rebuilt after a reload is short of 40 photos: stop before
      // anything prints (the order row stays unpaid, like an abandoned checkout).
      if (photosShortBy(albumPhotoCount(printJob.pages)) > 0) throw new TooFewPhotosError(albumPhotoCount(printJob.pages));

      // 2b. REQUIRED: upload every staged memory CLIP (0030). A printed QR must
      //     never point at a missing video, so a failed upload stops checkout —
      //     the customer stays on Pay and retries (idempotent: finished clips
      //     are skipped, an existing object counts as done).
      let replacedCodes: string[] = [];
      if (clipCodes.length) {
        setPrepMsg('Uploading your memory videos…');
        const r = await uploadStagedClips(clipCodes, (d, t, phase) => {
          if (d >= t) return;
          setPrepMsg(phase === 'compress'
            ? `Preparing memory video ${d + 1} of ${t}…`
            : `Uploading memory video ${d + 1} of ${t}…`);
        });
        replacedCodes = r.replaced;
      }

      // 3. REQUIRED: build + upload the print PDF. If gen throws or the upload
      //    errors it propagates to the outer catch, the order does NOT advance,
      //    and the user stays on Pay to retry. (Create-only upload, never upsert:
      //    customers can't read this bucket, so an upsert is refused by RLS.)
      await uploadOrderPrintPdf(order.id, printJob);

      // 3b. BEST-EFFORT: build + upload the front·spine·back cover wrap as its own
      //     "<id>-cover.pdf". Spine width is finalised HERE from the chosen cover
      //     material + this print job's page count. Deliberately NON-blocking: it
      //     requires migration 0017 (the RLS name gate) to be live, so if this
      //     code deploys before 0017 is applied, a required upload would REJECT and
      //     break EVERY checkout. Instead we fail loud but let the order proceed —
      //     the interior PDF is already up, and the operator's "Cover PDF" button
      //     visibly reports a missing cover. Flip to required once 0017 is
      //     confirmed applied in prod.
      try {
        await uploadOrderCoverPdf(order.id, {
          // Frozen specs from order creation — NOT the live pickers — so the cover
          // wrap always matches the material/cover/size stored on the order row,
          // even on a retry after the user changed a selection.
          albumSize: order.albumSize,
          pageCount: printJob.pages.length,
          cover: order.cover,
          // Cover-as-pages: when the FRONT cover page is present the wrap
          // composites it + a derived spine + the reserved Megy Prints back
          // panel; otherwise it falls back to the legacy CoverDesign form output.
          coverDesign: printJob.coverDesign ?? DEFAULT_COVER_DESIGN,
          coverFront: printJob.coverFront,
          photos: printJob.photos,
        });
      } catch (e) {
        console.error('Cover PDF upload failed (order still placed; check migration 0017 is applied):', e);
        reportError(e, { path: 'checkout', step: 'cover_pdf', orderId: order.id });
      }

      // 4. Reliability belt (best-effort, non-blocking): ensure every QR "living
      //    memory" we're about to PRINT has a resolvable row. Runs AFTER the
      //    required upload so a QR hiccup can't block the PDF. Runs over the exact
      //    print-job pages — the same source the PDF is built from — so a QR added
      //    just before checkout can't ship with a dead /m/:code even if the
      //    throttled cloud save hasn't flushed it. INSERT-only; never clobbers a relink.
      //    For hosted CLIPS this belt is REQUIRED (the row is created only here,
      //    stamped with the paid term); for legacy links it stays best-effort.
      const jobFills = printJob.pages.flatMap((p) => [...(p.qrFills ?? []), ...(p.textSlotQr ?? [])]);
      const hasClips = jobFills.some((f) => f?.kind === 'clip');
      try {
        if (jobFills.length) {
          setPrepMsg('Saving your memories…');
          // The client may only stamp the INCLUDED term (RLS caps it — 0030);
          // the PAID term is applied by the operator at "Mark paid" from the
          // order's hosting_years, exactly as the price is set server-side.
          const ok = await ensureMemoriesForFills(jobFills, { hostingYears: includedYears });
          if (!ok && hasClips) throw new Error('Could not save your memory videos to your account. Please try again.');
          // A replaced clip may live at a new extension → re-point the row.
          for (const code of replacedCodes) {
            const f = jobFills.find((x) => x?.code === code);
            if (f) await updateMemoryDestination(code, f.destination);
          }
        }
      } catch (e) {
        console.error('QR memories ensure (print job) failed:', e);
        reportError(e, { path: 'checkout', step: 'qr_ensure', orderId: order.id });
        if (hasClips) throw e;
      }
      // Staged clips are safely in the bucket + rows: free the device storage.
      for (const code of clipCodes) void removeStagedClip(code);
      setPrepMsg('');

      // 5. Only NOW — with the PDF safely in the bucket — show the payment QR.
      recordOrder('payment');
      setStep('payment');
    } catch (err) {
      setPrepMsg('');
      // The money path must never fail silently in production — the customer sees
      // the message, and the operator/owner sees the cause in Sentry/the endpoint.
      if (!(err instanceof TooFewPhotosError)) reportError(err, { path: 'checkout', step: 'place_order', orderId: createdOrderRef.current?.id });
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong placing your order.');
      setAlbumNotSaved(err instanceof AlbumNotSavedError || err instanceof TooFewPhotosError);
    } finally {
      setSubmitting(false);
    }
  };

  // ── "I've sent the payment": attach the receipt + reference, then wait ──
  // Both are optional — a customer who can't screenshot still gets through,
  // and the operator confirms from the GoTyme app either way. Only the record
  // step is required; a failed receipt upload is reported but does not block.
  const handlePaymentSent = async () => {
    const order = createdOrderRef.current;
    if (!order) { setErrorMsg('Your order was not created yet — go back and try again.'); return; }
    setErrorMsg('');
    const refBad = referenceProblem(payRef);
    if (refBad) { setRefError(refBad); return; }
    setSubmitting(true);
    try {
      let proofPath: string | null = null;
      if (proofFile) {
        setPrepMsg('Attaching your receipt…');
        try { proofPath = await uploadPaymentProof(order.id, proofFile); }
        catch (e) { reportError(e, { path: 'checkout', step: 'payment_proof', orderId: order.id }); setProofError(e instanceof Error ? e.message : 'Receipt upload failed.'); }
      }
      setPrepMsg('Recording your payment…');
      await submitPaymentProof(order.id, { reference: cleanReference(payRef), proofPath });
      setPrepMsg('');
      recordOrder('tracking');
      setStep('tracking');
    } catch (err) {
      setPrepMsg('');
      reportError(err, { path: 'checkout', step: 'payment_sent', orderId: order.id });
      setErrorMsg(err instanceof Error ? err.message : 'Could not record your payment. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const onPickProof = (f: File | null) => {
    setProofError('');
    if (!f) { setProofFile(null); return; }
    const bad = checkProof(f);
    if (bad) { setProofError(bad); setProofFile(null); return; }
    setProofFile(f);
  };

  /* ══════════════ TRACKING ══════════════ */
  if (step === 'tracking') {
    // Until the order row answers, it is where the customer just put it.
    const track = trackOf(placedOrder ?? { status: 'pending_payment', payment_submitted_at: 'now' });
    const printerReached = track.stage >= 2; // printing onward
    const finished = track.finished;
    return (
      <div className="min-h-screen bg-cream pt-28 px-6 pb-16 flex items-start justify-center">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-lg">
          <div className="text-center mb-8">
            <h2 className="font-display text-3xl font-bold text-dark">
              {track.cancelled ? 'This order was cancelled' : finished ? 'Your album has arrived! 🎉' : track.stage === 0 ? 'Thank you — we\'re confirming your payment' : track.headline}
            </h2>
            {orderNumber && (
              <p className="mt-2 text-sm font-medium text-dark">Order <span className="font-mono text-[#C98A5E]">{orderNumber}</span></p>
            )}
            <p className="mt-2 text-xs text-taupe max-w-sm mx-auto">We match transfers in our bank app during business hours and text you at <b className="text-dark">{phone}</b> once it's confirmed. Your album goes to print right after.</p>
          </div>

          {/* Status tracker — the order's real status (orderTracker). */}
          {!track.cancelled && (
            <div className="bg-white rounded-2xl p-6 shadow-sm">
              <OrderTracker track={track} />
              <p className="mt-3 text-xs text-medium">You can check on this order any time in <Link to="/orders" className="underline font-semibold text-dark">Your orders</Link>.</p>
            </div>
          )}

          {/* Print-ready file goes straight to Megyprints — customers don't get
              the PDF (so it can't be printed elsewhere). Just reassure them. */}
          {printerReached && (
            <div className="bg-white rounded-2xl p-6 shadow-sm mt-4">
              <h3 className="font-display text-base font-semibold text-dark mb-1 flex items-center gap-2"><Printer size={16} /> Sent to print</h3>
              <p className="text-xs text-medium">Your print-ready album has been sent to Megyprints. We'll print it on premium paper and ship it to your address — no action needed on your end. 💛</p>
            </div>
          )}

          <div className="mt-6 flex gap-3 justify-center">
            {/* A NEW album. It reopened the one just ordered, ready to order
                again (1-star testers); that one is safe in the account. */}
            <button onClick={() => { startFreshAlbum(user?.id); navigate('/builder'); }} data-testid="order-create-another"
              className="px-6 py-2.5 bg-peach text-white rounded-lg font-medium hover:brightness-105">Create Another</button>
            <button onClick={() => navigate('/orders')} data-testid="order-your-orders" className="px-6 py-2.5 border border-[#D4D4D4] text-medium rounded-lg font-medium hover:bg-line-soft">Your orders</button>
            <button onClick={() => navigate('/')} className="px-6 py-2.5 border border-[#D4D4D4] text-medium rounded-lg font-medium hover:bg-line-soft">Home</button>
          </div>
        </motion.div>
      </div>
    );
  }

  /* ══════════════ PAYMENT (placeholder) ══════════════ */
  if (step === 'payment') {
    // Read the order NUMBER from state, not the ref, during render (react-hooks/refs).
    const placed = orderNumber ? { order_number: orderNumber } : null;
    const amountLabel = `₱${(placedAmount ?? totalPrice).toLocaleString('en-PH')}`;
    return (
      <div className="min-h-screen bg-cream pt-28 px-6 pb-16 flex items-start justify-center">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
          <h1 className="font-display text-3xl font-bold text-dark text-center mb-1">Send {amountLabel}</h1>
          {placed && <p className="text-center text-sm text-medium mb-5">Order <span className="font-mono text-[#C98A5E]">{placed.order_number}</span> is placed. Pay by bank transfer to finish.</p>}
          <div className="bg-white rounded-2xl p-6 shadow-sm">
            {/* The QR — scanned from any PH bank or e-wallet app (InstaPay / QR Ph). */}
            <div className="rounded-xl border border-line-soft bg-[#FFFDFB] p-4 text-center">
              <div className="flex items-center justify-center gap-2 text-medium mb-2"><Landmark size={16} /> <span className="text-xs font-semibold uppercase tracking-wide">{PAYEE.bank} · {PAYEE.rail}</span></div>
              {!qrMissing ? (
                <img src={PAYEE.qrSrc} alt={`${PAYEE.bank} InstaPay QR for ${PAYEE.name}`} onError={() => setQrMissing(true)}
                  className="mx-auto w-56 h-56 object-contain rounded-lg bg-white" draggable={false} />
              ) : (
                <div className="mx-auto w-56 h-56 rounded-lg bg-[#F7F1EC] flex items-center justify-center text-xs text-taupe px-4">The QR code isn't available right now — message us and we'll send the account details.</div>
              )}
              <p className="mt-3 text-base font-semibold text-dark">{PAYEE.name}</p>
              <p className="text-xs text-taupe">Account ending in <span className="font-mono">{PAYEE.accountLast4}</span></p>
              <p className="mt-2 font-display text-2xl font-bold text-blush-pink">{amountLabel}</p>
            </div>

            <ol className="mt-4 space-y-1.5 text-xs text-ink-mid list-decimal pl-4">
              <li>Open your bank or e-wallet app (GCash, Maya, BPI, BDO, UnionBank…).</li>
              <li>Choose <b>Scan QR</b> / <b>InstaPay</b> and scan the code above.</li>
              <li>Send exactly <b className="text-dark">{amountLabel}</b>{placed && <> and put <span className="font-mono text-[#C98A5E]">{placed.order_number}</span> in the note if your app asks</>}.</li>
              <li>Attach your receipt below — it speeds up confirmation.</li>
            </ol>
            <p className="mt-2 text-[11px] text-light">Your app may charge a small InstaPay fee. We don't add any.</p>

            {/* Receipt + reference (0033). Optional, but it lets the operator match the deposit at a glance. */}
            <div className="mt-4 rounded-xl border border-line-soft p-3">
              <p className="block text-xs font-semibold text-dark mb-1.5">Receipt screenshot <span className="font-normal text-light">(optional)</span></p>
              {/* A real control a keyboard reaches (Tab, then Enter or Space opens the
                  file picker): the input was display:none, so the receipt the
                  steps ask for was mouse-only (1-star testers round 2, KB-3). */}
              <label className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-dashed border-peach bg-cream text-xs text-cocoa cursor-pointer hover:bg-blush focus-within:ring-2 focus-within:ring-peach focus-within:ring-offset-1">
                <Paperclip size={14} className="shrink-0" />
                <span className="truncate">{proofFile ? `${proofFile.name} · ${Math.max(1, Math.round(proofFile.size / 1024))} KB` : 'Attach the transfer receipt (JPG, PNG or PDF)'}</span>
                <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="sr-only" data-testid="pay-receipt-input" onChange={(e) => onPickProof(e.target.files?.[0] ?? null)} />
              </label>
              {proofError && <p className="mt-1.5 text-[11px] text-red-500">{proofError}</p>}
              <label htmlFor="pay-reference" className="block text-xs font-semibold text-dark mt-3 mb-1.5">Reference no. <span className="font-normal text-light">(optional — from your bank's receipt)</span></label>
              <input id="pay-reference" value={payRef} onChange={(e) => { setPayRef(e.target.value); setRefError(''); }} inputMode="text" autoComplete="off" placeholder="e.g. 2026091012345678" maxLength={64}
                aria-invalid={!!refError} data-testid="pay-reference"
                className={`w-full px-3 py-2 rounded-lg border text-sm outline-none focus:border-peach ${refError ? 'border-red-400' : 'border-line'}`} />
              {refError && <p className="mt-1.5 text-[11px] text-red-500" data-testid="pay-reference-error">{refError}</p>}
            </div>

            <button
              onClick={handlePaymentSent}
              disabled={submitting}
              className="w-full mt-4 py-3.5 bg-blush-pink text-white text-base font-bold rounded-xl hover:brightness-105 transition-all flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-wait"
            >
              {submitting
                ? <><Loader2 size={16} className="animate-spin" /> {prepMsg || 'Saving…'}</>
                : <><Check size={16} /> I've sent {amountLabel}</>}
            </button>
            <p className="mt-3 text-[11px] text-light text-center">We confirm transfers in our bank app during business hours, then print. Nothing is charged automatically.</p>
            {shownError && <p className="mt-3 text-xs text-red-500 text-center">{shownError}</p>}
            <details className="mt-3 text-xs text-light">
              <summary className="cursor-pointer text-center hover:text-medium">Order summary</summary>
            <div className="space-y-2 text-sm border-y border-line-soft py-4 mt-2">
              {info?.cover && (
                <div className="flex justify-center pb-2">
                  <Suspense fallback={null}><CoverThumb page={info.cover.page} photos={info.cover.photos} albumSize={albumSize} width={72} /></Suspense>
                </div>
              )}
              <div className="flex justify-between gap-3"><span className="text-medium shrink-0">Album</span><span className="font-semibold text-blush-pink text-right">{ALBUM_SIZES.find((s) => s.preset === albumSize)?.name} · {MATERIALS.find((m) => m.type === material)?.name} · {COVERS.find((c) => c.type === cover)?.name}</span></div>
              {breakdown.items.map((item) => (
                <div key={item.label} className="flex justify-between gap-3">
                  <span className="text-medium">{item.label}</span>
                  <span className="font-medium text-dark text-right whitespace-nowrap">₱{item.amount.toLocaleString('en-PH')}</span>
                </div>
              ))}
              <div className="flex justify-between items-baseline pt-1 border-t border-line-soft"><span className="font-semibold text-dark">Total</span><span className="font-display text-2xl font-bold text-blush-pink">₱{totalPrice.toLocaleString('en-PH')}</span></div>
            </div>
            </details>
          </div>
        </motion.div>
      </div>
    );
  }

  /* ══════════════ FORM (checkout) ══════════════ */
  return (
    <div className="min-h-screen bg-cream pt-24 pb-12 px-6">
      <div className="max-w-[900px] mx-auto">
        <h1 className="font-display text-4xl font-bold text-dark text-center mb-8">Finalize Your Order</h1>

        {openOrder && (
          <div role="status" data-testid="order-already-open"
            className="mb-6 rounded-2xl border border-peach bg-blush px-5 py-4 text-sm text-cocoa">
            <p className="font-semibold text-dark">
              This album already has an order {openOrder.payment_submitted_at ? "— you sent the payment and we're confirming it" : 'waiting for payment'}: <span className="font-mono">{openOrder.order_number}</span>, placed {new Date(openOrder.created_at).toLocaleDateString('en-PH', { day: 'numeric', month: 'long' })}.
            </p>
            <p className="mt-1">{openOrder.payment_submitted_at ? "You don't need a new one." : "To finish it, pay that order. You don't need a new one."} Changed the album since? Place a new order below and we'll print the new one.</p>
            <button type="button" onClick={openExistingOrder} data-testid="order-open-existing"
              className="mt-3 px-4 py-2 rounded-lg bg-blush-pink text-white font-semibold hover:brightness-105">
              Open order {openOrder.order_number}
            </button>
          </div>
        )}

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Left: Options */}
          <div className="lg:col-span-2 space-y-6">
            {/* Material */}
            <div className="bg-white rounded-2xl p-6 shadow-sm">
              <h3 className="font-display text-lg font-semibold text-dark mb-4 flex items-center gap-2"><Palette size={18} /> Paper Material</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {MATERIALS.map((m) => (
                  <button key={m.type} onClick={() => setMaterial(m.type)}
                    className="p-3 rounded-xl border-2 text-left transition-all"
                    style={{ borderColor: material === m.type ? '#B85C38' : '#E8E8E8', backgroundColor: material === m.type ? '#F6E7DF' : '#fff' }}>
                    <span className="font-medium text-sm text-dark">{m.name}</span>
                    <span className="block text-xs text-light mt-1">{m.description}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Cover */}
            <div className="bg-white rounded-2xl p-6 shadow-sm">
              <h3 className="font-display text-lg font-semibold text-dark mb-4 flex items-center gap-2"><HardDrive size={18} /> Cover Type</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {COVERS.map((c) => (
                  <button key={c.type} onClick={() => setCover(c.type)}
                    className="p-3 rounded-xl border-2 text-left transition-all"
                    style={{ borderColor: cover === c.type ? '#B85C38' : '#E8E8E8', backgroundColor: cover === c.type ? '#F6E7DF' : '#fff' }}>
                    <span className="font-medium text-sm text-dark">{c.name}</span>
                    <span className="block text-xs text-light mt-1">{c.description}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Size — locked to the album you built when a design is in progress */}
            <div className="bg-white rounded-2xl p-6 shadow-sm">
              <h3 className="font-display text-lg font-semibold text-dark mb-4 flex items-center gap-2"><BookOpen size={18} /> Album Size</h3>
              {info ? (
                <div className="flex items-center justify-between rounded-xl border-2 border-peach bg-cream px-4 py-3">
                  <span className="text-sm text-medium">From your design</span>
                  <span className="text-sm font-semibold text-dark" data-testid="order-album-size">{ALBUM_SIZES.find((s) => s.preset === albumSize)?.name}</span>
                </div>
              ) : albumInfo === 'loading' ? (
                <p className="flex items-center gap-2 text-sm text-medium"><Loader2 size={16} className="animate-spin" /> Loading your album…</p>
              ) : (
                <p className="text-sm text-medium">No album found on this device.</p>
              )}
            </div>

            {/* Form */}
            <div className="bg-white rounded-2xl p-6 shadow-sm">
              <h3 className="font-display text-lg font-semibold text-dark mb-4">Your Details</h3>
              <div className="space-y-3">
                <div>
                  <label htmlFor="order-name" className="text-xs text-medium mb-1 block">Full Name</label>
                  <input id="order-name" ref={nameRef} value={name}
                    onChange={(e) => { setName(e.target.value); if (errors.name) setErrors((p) => ({ ...p, name: '' })); }}
                    autoComplete="name" maxLength={80}
                    aria-invalid={!!errors.name}
                    className={`w-full border rounded-lg px-3 py-2 text-sm ${errors.name ? 'border-red-400' : 'border-line'}`} placeholder="Juan Dela Cruz" />
                  {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
                </div>
                <div>
                  <label htmlFor="order-phone" className="text-xs text-medium mb-1 block">Phone Number</label>
                  <input id="order-phone" ref={phoneRef} value={phone}
                    onChange={(e) => { setPhone(e.target.value); if (errors.phone) setErrors((p) => ({ ...p, phone: '' })); }}
                    onBlur={() => { const c = normalizePHPhone(phone); if (c) setPhone(formatPHPhoneDisplay(c)); }}
                    inputMode="tel" autoComplete="tel" maxLength={20}
                    aria-invalid={!!errors.phone}
                    className={`w-full border rounded-lg px-3 py-2 text-sm ${errors.phone ? 'border-red-400' : 'border-line'}`} placeholder="+63 9XX XXX XXXX" />
                  {errors.phone && <p className="text-xs text-red-500 mt-1">{errors.phone}</p>}
                </div>
                <div ref={addressRef}>
                  <label className="text-xs text-medium mb-2 block">Delivery Address</label>
                  <AddressPicker
                    value={address}
                    onChange={(v) => { setAddress(v); if (Object.keys(addressErrors).length) setAddressErrors({}); }}
                    errors={addressErrors}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Right: Summary */}
          <div>
            <div className="bg-white rounded-2xl p-6 shadow-sm sticky top-24">
              <h3 className="font-display text-lg font-semibold text-dark mb-4">Order Summary</h3>
              {/* What you're paying for: the front of the book, as it prints. */}
              {info?.cover && (
                <div className="flex items-center gap-3 mb-4 pb-4 border-b border-line-soft">
                  <Suspense fallback={<div className="shrink-0 rounded bg-blush" style={{ width: 88, height: 88 }} />}>
                    <CoverThumb page={info.cover.page} photos={info.cover.photos} albumSize={albumSize} />
                  </Suspense>
                  <div className="text-sm leading-snug">
                    <p className="font-semibold text-dark">Your cover</p>
                    <p className="text-xs text-medium">{pageCount} pages inside, printed as they look in your preview.</p>
                  </div>
                </div>
              )}
              <div className="space-y-3 text-sm">
                <div className="flex justify-between items-center gap-3"><span className="text-medium">Material</span><span className="font-semibold text-blush-pink text-right">{MATERIALS.find((m) => m.type === material)?.name}</span></div>
                <div className="flex justify-between items-center gap-3"><span className="text-medium">Cover</span><span className="font-semibold text-blush-pink text-right">{COVERS.find((c) => c.type === cover)?.name}</span></div>
                <div className="flex justify-between items-center gap-3"><span className="text-medium">Size</span><span className="font-semibold text-blush-pink text-right">{ALBUM_SIZES.find((s) => s.preset === albumSize)?.name}</span></div>
                <div className="border-t border-line-soft pt-3 mt-3 space-y-2">
                  {breakdown.items.map((item) => (
                    <div key={item.label} className="flex justify-between gap-3 text-[13px]">
                      <span className="text-medium">{item.label}</span>
                      <span className="font-medium text-dark text-right whitespace-nowrap">₱{item.amount.toLocaleString('en-PH')}</span>
                    </div>
                  ))}
                  <div className="flex justify-between items-baseline pt-2 border-t border-line-soft"><span className="font-semibold text-dark">Total</span><span className="font-display text-2xl font-bold text-blush-pink" data-testid="order-total">{priceReady ? `₱${totalPrice.toLocaleString('en-PH')}` : '—'}</span></div>
                </div>
              </div>
              <div className="mt-4 flex items-start gap-2 rounded-xl bg-blush border border-peach/60 px-3 py-2.5">
                <QrCode size={16} className="text-blush-pink shrink-0 mt-0.5" />
                <p className="text-xs text-cocoa leading-snug">
                  <b className="text-dark">{FREE_QR_MEMORIES} living-memory QRs included</b> — a video plays when anyone scans your printed album. Extra QRs are ₱{EXTRA_QR_RATE} each.
                  {qrCount > 0 && <> This album has <b className="text-dark">{qrCount}</b>.</>}
                  {qrCount > 0 && hdPrice > 0 && (
                    <> Quality: <b className="text-dark">{hdMemories ? `HD 1080p (+₱${hdPrice})` : 'Standard 720p'}</b>, set in the builder.</>
                  )}
                </p>
              </div>
              {clipCodes.length > 0 && (
                <div className="mt-2 flex items-start gap-2 rounded-xl border border-line-soft bg-white px-3 py-2.5" role="status" aria-live="polite">
                  {clipPrep.phase === 'ready'
                    ? <Check size={16} className="text-[#5AA469] shrink-0 mt-0.5" />
                    : clipPrep.phase === 'failed'
                      ? <Wifi size={16} className="text-blush-pink shrink-0 mt-0.5" />
                      : <Loader2 size={16} className="animate-spin text-[#C98A5E] shrink-0 mt-0.5" />}
                  <p className="text-xs text-cocoa leading-snug">
                    {clipPrep.phase === 'ready' ? (
                      <><b className="text-dark">Your {clipCodes.length === 1 ? 'memory video is' : `${clipCodes.length} memory videos are`} uploaded.</b> Nothing to wait for at payment.</>
                    ) : clipPrep.phase === 'failed' ? (
                      <><b className="text-dark">Upload paused.</b> We'll try again when you tap Pay — a Wi-Fi connection helps.</>
                    ) : (
                      <>
                        <b className="text-dark">
                          {clipPrep.phase === 'compress'
                            ? `Preparing memory video ${Math.min(clipPrep.done + 1, clipPrep.total || 1)} of ${clipPrep.total || clipCodes.length}…`
                            : clipPrep.phase === 'upload'
                              ? `Uploading memory video ${Math.min(clipPrep.done + 1, clipPrep.total || 1)} of ${clipPrep.total || clipCodes.length}…`
                              : `Uploading your ${clipCodes.length === 1 ? 'memory video' : `${clipCodes.length} memory videos`}…`}
                        </b>
                        {' '}This runs while you fill in your details
                        {clipPrep.bytes != null && clipPrep.bytes > 0 && <> ({Math.max(1, Math.round(clipPrep.bytes / 1_048_576))} MB)</>}
                        . Best on Wi-Fi.
                      </>
                    )}
                  </p>
                </div>
              )}
              {qrCount > 0 && tiers.length > 0 && (
                <div className="mt-3 rounded-xl border border-line-soft bg-white px-3 py-3">
                  <p className="text-xs font-semibold text-dark">How long should your memories stay live?</p>
                  <p className="text-[11px] text-light mb-2">Your videos play from the printed QR for the whole term. Renew anytime after.</p>
                  <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Memory hosting term">
                    {tiers.map((t) => {
                      const active = (hostingYears ?? includedYears) === t.years;
                      return (
                        <button key={t.years} type="button" role="radio" aria-checked={active}
                          onClick={() => setHostingYears(t.years)}
                          className={`rounded-lg border px-3 py-2 text-left transition ${active ? 'border-blush-pink bg-blush' : 'border-line hover:border-peach'}`}>
                          <div className="text-sm font-semibold text-dark">{t.years} years</div>
                          <div className="text-[11px] text-cocoa">{t.price > 0 ? `+₱${t.price}` : 'Included'}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              {albumInfo === 'missing' ? (
                <div role="alert" data-testid="order-no-album"
                  className="mt-4 rounded-xl border border-[#F0D9A8] bg-[#FFF6E5] px-3 py-3 text-sm text-[#8A5A12]">
                  We can't find the album you're ordering. Open it and tap Order again.
                </div>
              ) : jobTooFew ? (
                <div role="alert" data-testid="order-too-few-photos"
                  className="mt-4 rounded-xl border border-[#F0D9A8] bg-[#FFF6E5] px-3 py-3 text-sm text-[#8A5A12]">
                  {tooFewToOrderMessage(jobPhotos!)}
                </div>
              ) : (
              <button onClick={priceReady ? handleProceedToPayment : (settingsReady && albumInfo !== 'loading' ? retryPrices : undefined)}
                disabled={submitting || (!priceReady && (!settingsReady || albumInfo === 'loading' || retryingPrices))}
                data-testid="order-place"
                className="w-full mt-4 py-3 bg-peach text-white font-semibold rounded-xl hover:brightness-105 transition-all flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-wait">
                {submitting ? <><Loader2 size={16} className="animate-spin" /> {prepMsg || 'Placing your order…'}</>
                  : priceReady ? <><ShoppingCart size={16} /> Place order · pay {`₱${totalPrice.toLocaleString('en-PH')}`} by bank transfer</>
                    : !settingsReady || albumInfo === 'loading' ? <><Loader2 size={16} className="animate-spin" /> Loading price…</>
                      // A tap that answers: try the prices again (they also come back on their own).
                      : retryingPrices ? <><Loader2 size={16} className="animate-spin" /> Loading price…</>
                        : <>Prices didn't load — tap to try again</>}
              </button>
              )}
              {askSecond && openOrder && (
                <div role="alert" data-testid="order-second-ask"
                  className="mt-3 rounded-xl border border-peach bg-blush px-3 py-3 text-sm text-cocoa">
                  <p>This album already has order <span className="font-mono">{openOrder.order_number}</span> {openOrder.payment_submitted_at ? 'with its payment sent' : 'waiting for payment'}. Place a second order for it?</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button type="button" onClick={openExistingOrder} data-testid="order-second-open"
                      className="px-3 py-2 rounded-lg bg-blush-pink text-white font-semibold hover:brightness-105">
                      Open order {openOrder.order_number}
                    </button>
                    <button type="button" onClick={placeSecondOrder} data-testid="order-second-yes"
                      className="px-3 py-2 rounded-lg border border-peach bg-white font-semibold hover:bg-blush">
                      Yes, place a second order
                    </button>
                  </div>
                </div>
              )}
              {shownError && (
                <p className="mt-3 text-xs text-red-500 text-center" role="alert">{shownError}</p>
              )}
              {(albumNotSaved || jobTooFew || albumInfo === 'missing') && (
                <button onClick={() => navigate('/builder')} data-testid="order-open-album"
                  className="w-full mt-3 py-2.5 rounded-xl border border-peach text-cocoa text-sm font-semibold hover:bg-blush transition-colors flex items-center justify-center gap-2">
                  <BookOpen size={16} /> Open my album
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
