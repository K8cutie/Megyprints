import { useState, useEffect, useRef } from 'react';
import type { MaterialType, CoverType, AlbumSizePreset } from "./builder/types";
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Check, ShoppingCart, BookOpen, Palette, HardDrive, CreditCard, Printer, Loader2, Package, QrCode } from 'lucide-react';
import { MATERIALS, COVERS, ALBUM_SIZES, DEFAULT_ALBUM_SIZE, DEFAULT_COVER_DESIGN } from './builder/types';
import { useAuth } from '../lib/authContext';
import { useAuthModal } from '../components/AuthModalProvider';
import { createOrderFromLatestAlbum, uploadOrderPrintPdf, uploadOrderCoverPdf } from '../lib/orders';
import { getPendingPrintJob } from '../lib/printQueue';
import { rebuildPrintJobFromLatestAlbum } from '../lib/printJobRebuild';
import { useIndexedDBPhotos } from '../lib/useIndexedDBPhotos';
import { priceBreakdown, countQrMemories, hostingTiersOf, includedHostingYears, hdMemoriesPriceOf, FREE_QR_MEMORIES, EXTRA_QR_RATE, MIN_PAGES, type Binding } from '../lib/pricing';
import { uploadStagedClips, removeStagedClip, currentClipQuality } from '../lib/memoryClips';
import { updateMemoryDestination } from '../lib/qrMemories';
import { getPriceSchedule, isStoreSettingsReady, storeSettingsReady } from '../lib/storeSettings';
import { ensureMemoriesForFills } from '../lib/qrMemories';
import { reportError } from '../lib/report';
import { normalizeFullName, isValidFullName, normalizePHPhone, formatPHPhoneDisplay, validateAddress, EMPTY_ADDRESS, type AddressValue } from '../lib/contact';
import AddressPicker from '../components/AddressPicker';

type Step = 'form' | 'payment' | 'tracking';

// The fulfillment journey shown on the tracker.
const TRACK_STAGES = [
  { label: 'Payment received', icon: Check },
  { label: 'Sent to the printer', icon: Package },
  { label: 'Printing your album', icon: Printer },
  { label: 'Finished', icon: Check },
] as const;

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
  const createdOrderRef = useRef<
    { id: string; order_number: string; material: MaterialType; cover: CoverType; albumSize: AlbumSizePreset } | null
  >(null);
  const [material, setMaterial] = useState<MaterialType>('matte');
  const [cover, setCover] = useState<CoverType>('softcover');
  const [size, setSize] = useState<AlbumSizePreset>('8x8');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState<AddressValue>(EMPTY_ADDRESS);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [addressErrors, setAddressErrors] = useState<Partial<Record<keyof AddressValue, string>>>({});
  const [step, setStep] = useState<Step>('form');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [orderNumber, setOrderNumber] = useState('');
  const [trackStage, setTrackStage] = useState(0);
  const [prepMsg, setPrepMsg] = useState('');

  // Price the ACTUAL album the customer built. Size + page count come from the
  // print job (set at "ORDER ALBUM"); fall back sensibly if someone hits /order
  // directly. Cover choice maps to binding (non-softcover → hardbound).
  const job = getPendingPrintJob();
  const albumSize: AlbumSizePreset = job?.albumSize ?? size ?? DEFAULT_ALBUM_SIZE;
  const pageCount = job?.pages.length ?? MIN_PAGES;
  // QR memories on the album — the first FREE_QR_MEMORIES are included, each
  // one past that is an add-on line (counted per QR code, link or clip alike).
  const qrCount = countQrMemories(job?.pages ?? []);
  // Every QR on the album — both homes — for the checkout belt + clip uploads.
  const allQrFills = (job?.pages ?? []).flatMap((p) => [...(p.qrFills ?? []), ...(p.textSlotQr ?? [])]);
  const clipCodes = allQrFills.filter((f) => f?.kind === 'clip').map((f) => f!.code);
  // HD (1080p) memories — chosen with the first memory in the builder, priced
  // here. Standard 720p is included, so this bills only when HD was picked.
  const hdMemories = qrCount > 0 && currentClipQuality() === 'hd';
  // Memory-hosting TERM (0030): the included term unless the customer upgrades.
  const [hostingYears, setHostingYears] = useState<number | null>(null);
  const binding: Binding = cover === 'softcover' ? 'soft' : 'hard';
  const hasJob = job != null;

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
  const priceReady = settingsReady && schedule !== null;

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
    if (Object.keys(newErrors).length > 0 || Object.keys(addrErrs).length > 0) return;

    // Reflect the cleaned/canonical values back so the user sees exactly what
    // we'll store (and the order later re-derives the same E.164 phone).
    setName(cleanName);
    setPhone(formatPHPhoneDisplay(canonicalPhone!));

    if (!user) {
      setErrorMsg('You must be signed in to check out — it ties the order to your album and lets us contact you.');
      openLogin();
      return;
    }
    setStep('payment');
  };

  // ── Placeholder payment → create order → REQUIRED print-PDF upload → tracking ──
  // The print-ready PDF is generated on THIS device (the photos live only in
  // this browser's IndexedDB) and uploaded to the private fulfillment bucket. It
  // is a BLOCKING step: an order must never reach the "Sent to print" screen
  // without its PDF in the bucket. On any failure we surface a clear error and
  // leave the user on the Pay button to retry.
  const handlePay = async () => {
    setErrorMsg('');
    setSubmitting(true);
    try {
      // Simulated payment — no real gateway. (Xendit slots in here later.)
      await new Promise((r) => setTimeout(r, 1200));

      // 1. Create the order — but only once. A retry after a failed upload reuses
      //    the same order row (no duplicate) since the storage upload upserts.
      let order = createdOrderRef.current;
      if (!order) {
        const created = await createOrderFromLatestAlbum({
          userId: user!.id,
          specs: { material, cover, size: albumSize },
          // createOrderFromLatestAlbum normalizes name/phone + composes the address
          // from these structured PSGC parts (single source of truth).
          shipping: { name, phone, address },
          amount: totalPrice,
          hostingYears: effectiveYears,
          hdMemories,
        });
        createdOrderRef.current = {
          id: created.id, order_number: created.order_number,
          material, cover, albumSize, // freeze the specs the order row was built with
        };
        order = createdOrderRef.current;
      }
      setOrderNumber(order.order_number);

      // 2. Resolve the print job durably. The in-memory job (getPendingPrintJob)
      //    is wiped by any full reload — most commonly the Google sign-in redirect
      //    at checkout — so when it's gone we rebuild it from the SAME latest album
      //    the order snapshots + the photo blobs in this browser's IndexedDB.
      setPrepMsg('Preparing your album for printing…');
      let printJob = getPendingPrintJob();
      if (!printJob || printJob.pages.length === 0) {
        printJob = await rebuildPrintJobFromLatestAlbum(user!.id, idbPhotos.get);
      }
      if (!printJob || printJob.pages.length === 0) {
        throw new Error(
          "We couldn't prepare your album for printing on this device. Please open your album in the builder on the device where you created it, then order again — your photos live only in that browser.",
        );
      }

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
      //    and the user stays on Pay to retry. (upsert:true → re-upload is safe.)
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

      // 5. Only NOW — with the PDF safely in the bucket — advance to tracking.
      setTrackStage(0);
      setStep('tracking');
    } catch (err) {
      setPrepMsg('');
      // The money path must never fail silently in production — the customer sees
      // the message, and the operator/owner sees the cause in Sentry/the endpoint.
      reportError(err, { path: 'checkout', step: 'pay', orderId: createdOrderRef.current?.id });
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong placing your order.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Tracker auto-advances through the fulfillment stages ──
  useEffect(() => {
    if (step !== 'tracking') return;
    if (trackStage >= TRACK_STAGES.length - 1) return;
    const t = setTimeout(() => setTrackStage((s) => s + 1), 2400);
    return () => clearTimeout(t);
  }, [step, trackStage]);

  /* ══════════════ TRACKING ══════════════ */
  if (step === 'tracking') {
    const printerReached = trackStage >= 1; // "Sent to the printer" onward
    const finished = trackStage >= TRACK_STAGES.length - 1;
    return (
      <div className="min-h-screen bg-cream pt-28 px-6 pb-16 flex items-start justify-center">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-lg">
          <div className="text-center mb-8">
            <h2 className="font-display text-3xl font-bold text-dark">{finished ? 'Your album is finished! 🎉' : 'Order in progress…'}</h2>
            {orderNumber && (
              <p className="mt-2 text-sm font-medium text-dark">Order <span className="font-mono text-[#C98A5E]">{orderNumber}</span></p>
            )}
          </div>

          {/* Status tracker */}
          <div className="bg-white rounded-2xl p-6 shadow-sm">
            <div className="space-y-1">
              {TRACK_STAGES.map((stage, i) => {
                const done = i < trackStage;
                const active = i === trackStage && !finished;
                const reached = i <= trackStage;
                const Icon = stage.icon;
                return (
                  <div key={stage.label} className="flex items-center gap-3 py-2">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-colors ${reached ? 'bg-soft-sage text-success' : 'bg-line-soft text-[#C4C4C4]'}`}>
                      {active ? <Loader2 size={18} className="animate-spin text-[#C98A5E]" /> : done || (finished && i === TRACK_STAGES.length - 1) ? <Check size={18} /> : <Icon size={18} />}
                    </div>
                    <span className={`text-sm font-medium ${reached ? 'text-dark' : 'text-light'}`}>{stage.label}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Print-ready file goes straight to Megyprints — customers don't get
              the PDF (so it can't be printed elsewhere). Just reassure them. */}
          {printerReached && (
            <div className="bg-white rounded-2xl p-6 shadow-sm mt-4">
              <h3 className="font-display text-base font-semibold text-dark mb-1 flex items-center gap-2"><Printer size={16} /> Sent to print</h3>
              <p className="text-xs text-medium">Your print-ready album has been sent to Megyprints. We'll print it on premium paper and ship it to your address — no action needed on your end. 💛</p>
            </div>
          )}

          {finished && (
            <div className="mt-6 flex gap-3 justify-center">
              <button onClick={() => navigate('/builder')} className="px-6 py-2.5 bg-peach text-white rounded-lg font-medium hover:brightness-105">Create Another</button>
              <button onClick={() => navigate('/')} className="px-6 py-2.5 border border-[#D4D4D4] text-medium rounded-lg font-medium hover:bg-line-soft">Home</button>
            </div>
          )}
        </motion.div>
      </div>
    );
  }

  /* ══════════════ PAYMENT (placeholder) ══════════════ */
  if (step === 'payment') {
    return (
      <div className="min-h-screen bg-cream pt-28 px-6 pb-16 flex items-start justify-center">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
          <h1 className="font-display text-3xl font-bold text-dark text-center mb-6">Payment</h1>
          <div className="bg-white rounded-2xl p-6 shadow-sm">
            <div className="flex items-center gap-2 text-medium mb-4"><CreditCard size={18} /> <span className="text-sm font-medium">Pay for your album</span></div>
            <div className="space-y-2 text-sm border-y border-line-soft py-4 mb-4">
              <div className="flex justify-between gap-3"><span className="text-medium shrink-0">Album</span><span className="font-semibold text-blush-pink text-right">{ALBUM_SIZES.find((s) => s.preset === albumSize)?.name} · {MATERIALS.find((m) => m.type === material)?.name} · {COVERS.find((c) => c.type === cover)?.name}</span></div>
              {breakdown.items.map((item) => (
                <div key={item.label} className="flex justify-between gap-3">
                  <span className="text-medium">{item.label}</span>
                  <span className="font-medium text-dark text-right whitespace-nowrap">₱{item.amount.toLocaleString('en-PH')}</span>
                </div>
              ))}
              <div className="flex justify-between items-baseline pt-1 border-t border-line-soft"><span className="font-semibold text-dark">Total</span><span className="font-display text-2xl font-bold text-blush-pink">₱{totalPrice.toLocaleString('en-PH')}</span></div>
            </div>
            <button
              onClick={handlePay}
              disabled={submitting || !priceReady}
              className="w-full py-3.5 bg-blush-pink text-white text-base font-bold rounded-xl hover:brightness-105 transition-all flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-wait"
            >
              {submitting
                ? <><Loader2 size={16} className="animate-spin" /> {prepMsg || 'Processing payment…'}</>
                : !settingsReady
                  ? <><Loader2 size={16} className="animate-spin" /> Loading price…</>
                  : !schedule
                    ? <>Pricing unavailable — please refresh</>
                    : <>Pay ₱{totalPrice}</>}
            </button>
            <p className="mt-3 text-[11px] text-light text-center">🔒 Simulated payment — no real charge. (Xendit checkout goes here later.)</p>
            {errorMsg && <p className="mt-3 text-xs text-red-500 text-center">{errorMsg}</p>}
            <button onClick={() => { setStep('form'); setErrorMsg(''); }} disabled={submitting} className="w-full mt-3 text-xs text-light hover:text-medium disabled:opacity-50">← Back to details</button>
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
                    style={{ borderColor: material === m.type ? '#F4C2A1' : '#E8E8E8', backgroundColor: material === m.type ? '#FFF8F0' : '#fff' }}>
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
                    style={{ borderColor: cover === c.type ? '#F4C2A1' : '#E8E8E8', backgroundColor: cover === c.type ? '#FFF8F0' : '#fff' }}>
                    <span className="font-medium text-sm text-dark">{c.name}</span>
                    <span className="block text-xs text-light mt-1">{c.description}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Size — locked to the album you built when a design is in progress */}
            <div className="bg-white rounded-2xl p-6 shadow-sm">
              <h3 className="font-display text-lg font-semibold text-dark mb-4 flex items-center gap-2"><BookOpen size={18} /> Album Size</h3>
              {hasJob ? (
                <div className="flex items-center justify-between rounded-xl border-2 border-peach bg-cream px-4 py-3">
                  <span className="text-sm text-medium">From your design</span>
                  <span className="text-sm font-semibold text-dark">{ALBUM_SIZES.find((s) => s.preset === albumSize)?.name}</span>
                </div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
                  {ALBUM_SIZES.map((s) => (
                    <button key={s.preset} onClick={() => setSize(s.preset)}
                      className="py-2.5 px-3 rounded-xl border-2 text-center transition-all text-sm"
                      style={{ borderColor: size === s.preset ? '#F4C2A1' : '#E8E8E8', backgroundColor: size === s.preset ? '#FFF8F0' : '#fff' }}>
                      {s.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Form */}
            <div className="bg-white rounded-2xl p-6 shadow-sm">
              <h3 className="font-display text-lg font-semibold text-dark mb-4">Your Details</h3>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-medium mb-1 block">Full Name</label>
                  <input value={name}
                    onChange={(e) => { setName(e.target.value); if (errors.name) setErrors((p) => ({ ...p, name: '' })); }}
                    autoComplete="name" maxLength={80}
                    aria-invalid={!!errors.name}
                    className={`w-full border rounded-lg px-3 py-2 text-sm ${errors.name ? 'border-red-400' : 'border-line'}`} placeholder="Juan Dela Cruz" />
                  {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
                </div>
                <div>
                  <label className="text-xs text-medium mb-1 block">Phone Number</label>
                  <input value={phone}
                    onChange={(e) => { setPhone(e.target.value); if (errors.phone) setErrors((p) => ({ ...p, phone: '' })); }}
                    onBlur={() => { const c = normalizePHPhone(phone); if (c) setPhone(formatPHPhoneDisplay(c)); }}
                    inputMode="tel" autoComplete="tel" maxLength={20}
                    aria-invalid={!!errors.phone}
                    className={`w-full border rounded-lg px-3 py-2 text-sm ${errors.phone ? 'border-red-400' : 'border-line'}`} placeholder="+63 9XX XXX XXXX" />
                  {errors.phone && <p className="text-xs text-red-500 mt-1">{errors.phone}</p>}
                </div>
                <div>
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
                  <div className="flex justify-between items-baseline pt-2 border-t border-line-soft"><span className="font-semibold text-dark">Total</span><span className="font-display text-2xl font-bold text-blush-pink">₱{totalPrice.toLocaleString('en-PH')}</span></div>
                </div>
              </div>
              <div className="mt-4 flex items-start gap-2 rounded-xl bg-[#FBEDE7] border border-peach/60 px-3 py-2.5">
                <QrCode size={16} className="text-blush-pink shrink-0 mt-0.5" />
                <p className="text-xs text-cocoa leading-snug">
                  <b className="text-dark">{FREE_QR_MEMORIES} living-memory QRs included</b> — a video plays when anyone scans your printed album. Extra QRs are ₱{EXTRA_QR_RATE} each.
                  {qrCount > 0 && <> This album has <b className="text-dark">{qrCount}</b>.</>}
                  {qrCount > 0 && hdPrice > 0 && (
                    <> Quality: <b className="text-dark">{hdMemories ? `HD 1080p (+₱${hdPrice})` : 'Standard 720p'}</b>, set in the builder.</>
                  )}
                </p>
              </div>
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
                          className={`rounded-lg border px-3 py-2 text-left transition ${active ? 'border-blush-pink bg-[#FFF3EC]' : 'border-line hover:border-peach'}`}>
                          <div className="text-sm font-semibold text-dark">{t.years} years</div>
                          <div className="text-[11px] text-cocoa">{t.price > 0 ? `+₱${t.price}` : 'Included'}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              <button onClick={handleProceedToPayment} disabled={!priceReady}
                className="w-full mt-4 py-3 bg-peach text-white font-semibold rounded-xl hover:brightness-105 transition-all flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-wait">
                {priceReady ? <><ShoppingCart size={16} /> Proceed to Payment</>
                  : !settingsReady ? <><Loader2 size={16} className="animate-spin" /> Loading price…</>
                    : <>Pricing unavailable — please refresh</>}
              </button>
              {errorMsg && (
                <p className="mt-3 text-xs text-red-500 text-center">{errorMsg}</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
