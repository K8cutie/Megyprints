import { useState, useEffect, useRef } from 'react';
import type { MaterialType, CoverType, AlbumSizePreset } from "./builder/types";
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Check, ShoppingCart, BookOpen, Palette, HardDrive, Printer, Loader2, Package, QrCode, Wifi, Landmark, Paperclip, Clock } from 'lucide-react';
import { MATERIALS, COVERS, ALBUM_SIZES, DEFAULT_ALBUM_SIZE, DEFAULT_COVER_DESIGN } from './builder/types';
import { useAuth } from '../lib/authContext';
import { useAuthModal } from '../components/AuthModalProvider';
import { createOrderFromLatestAlbum, uploadOrderPrintPdf, uploadOrderCoverPdf } from '../lib/orders';
import { getPendingPrintJob } from '../lib/printQueue';
import { rebuildPrintJobFromLatestAlbum } from '../lib/printJobRebuild';
import { useIndexedDBPhotos } from '../lib/useIndexedDBPhotos';
import { priceBreakdown, countQrMemories, hostingTiersOf, includedHostingYears, hdMemoriesPriceOf, FREE_QR_MEMORIES, EXTRA_QR_RATE, MIN_PAGES, type Binding } from '../lib/pricing';
import { uploadStagedClips, prefetchStagedClipUploads, stagedClipBytes, removeStagedClip, currentClipQuality, type ClipUploadPhase } from '../lib/memoryClips';
import { PAYEE, checkProof, uploadPaymentProof, submitPaymentProof, cleanReference } from '../lib/payment';
import { updateMemoryDestination } from '../lib/qrMemories';
import { getPriceSchedule, isStoreSettingsReady, storeSettingsReady } from '../lib/storeSettings';
import { ensureMemoriesForFills } from '../lib/qrMemories';
import { reportError } from '../lib/report';
import { normalizeFullName, isValidFullName, normalizePHPhone, formatPHPhoneDisplay, validateAddress, EMPTY_ADDRESS, type AddressValue } from '../lib/contact';
import AddressPicker from '../components/AddressPicker';

type Step = 'form' | 'payment' | 'tracking';

// The fulfillment journey shown on the tracker.
const TRACK_STAGES = [
  { label: 'Payment sent — we\'re confirming it', icon: Clock },
  { label: 'Payment confirmed', icon: Check },
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
  // Manual transfer (0033): the receipt + bank reference the customer attaches.
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofError, setProofError] = useState('');
  const [payRef, setPayRef] = useState('');
  const [qrMissing, setQrMissing] = useState(false);

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
    void placeOrder();
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
    setSubmitting(true);
    try {
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

      // 5. Only NOW — with the PDF safely in the bucket — show the payment QR.
      setStep('payment');
    } catch (err) {
      setPrepMsg('');
      // The money path must never fail silently in production — the customer sees
      // the message, and the operator/owner sees the cause in Sentry/the endpoint.
      reportError(err, { path: 'checkout', step: 'place_order', orderId: createdOrderRef.current?.id });
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong placing your order.');
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
      setTrackStage(0);
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
    const printerReached = trackStage >= 2; // "Sent to the printer" onward
    const finished = trackStage >= TRACK_STAGES.length - 1;
    return (
      <div className="min-h-screen bg-[#FFF8F0] pt-28 px-6 pb-16 flex items-start justify-center">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-lg">
          <div className="text-center mb-8">
            <h2 className="font-display text-3xl font-bold text-[#2D2D2D]">{finished ? 'Your album is finished! 🎉' : 'Thank you — we\'re confirming your payment'}</h2>
            {orderNumber && (
              <p className="mt-2 text-sm font-medium text-[#2D2D2D]">Order <span className="font-mono text-[#C98A5E]">{orderNumber}</span></p>
            )}
            <p className="mt-2 text-xs text-[#8B7E7A] max-w-sm mx-auto">We match transfers in our bank app during business hours and text you at <b className="text-[#2D2D2D]">{phone}</b> once it's confirmed. Your album goes to print right after.</p>
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
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-colors ${reached ? 'bg-[#E4F0E0] text-[#2E7D4A]' : 'bg-[#F0F0F0] text-[#C4C4C4]'}`}>
                      {active ? <Loader2 size={18} className="animate-spin text-[#C98A5E]" /> : done || (finished && i === TRACK_STAGES.length - 1) ? <Check size={18} /> : <Icon size={18} />}
                    </div>
                    <span className={`text-sm font-medium ${reached ? 'text-[#2D2D2D]' : 'text-[#9B9B9B]'}`}>{stage.label}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Print-ready file goes straight to Megyprints — customers don't get
              the PDF (so it can't be printed elsewhere). Just reassure them. */}
          {printerReached && (
            <div className="bg-white rounded-2xl p-6 shadow-sm mt-4">
              <h3 className="font-display text-base font-semibold text-[#2D2D2D] mb-1 flex items-center gap-2"><Printer size={16} /> Sent to print</h3>
              <p className="text-xs text-[#6B6B6B]">Your print-ready album has been sent to Megyprints. We'll print it on premium paper and ship it to your address — no action needed on your end. 💛</p>
            </div>
          )}

          <div className="mt-6 flex gap-3 justify-center">
            <button onClick={() => navigate('/builder')} className="px-6 py-2.5 bg-[#F4C2A1] text-white rounded-lg font-medium hover:brightness-105">Create Another</button>
            <button onClick={() => navigate('/')} className="px-6 py-2.5 border border-[#D4D4D4] text-[#6B6B6B] rounded-lg font-medium hover:bg-[#F0F0F0]">Home</button>
          </div>
        </motion.div>
      </div>
    );
  }

  /* ══════════════ PAYMENT (placeholder) ══════════════ */
  if (step === 'payment') {
    // Read the order NUMBER from state, not the ref, during render (react-hooks/refs).
    const placed = orderNumber ? { order_number: orderNumber } : null;
    const amountLabel = `₱${totalPrice.toLocaleString('en-PH')}`;
    return (
      <div className="min-h-screen bg-[#FFF8F0] pt-28 px-6 pb-16 flex items-start justify-center">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
          <h1 className="font-display text-3xl font-bold text-[#2D2D2D] text-center mb-1">Send {amountLabel}</h1>
          {placed && <p className="text-center text-sm text-[#6B6B6B] mb-5">Order <span className="font-mono text-[#C98A5E]">{placed.order_number}</span> is placed. Pay by bank transfer to finish.</p>}
          <div className="bg-white rounded-2xl p-6 shadow-sm">
            {/* The QR — scanned from any PH bank or e-wallet app (InstaPay / QR Ph). */}
            <div className="rounded-xl border border-[#F0F0F0] bg-[#FFFDFB] p-4 text-center">
              <div className="flex items-center justify-center gap-2 text-[#6B6B6B] mb-2"><Landmark size={16} /> <span className="text-xs font-semibold uppercase tracking-wide">{PAYEE.bank} · {PAYEE.rail}</span></div>
              {!qrMissing ? (
                <img src={PAYEE.qrSrc} alt={`${PAYEE.bank} InstaPay QR for ${PAYEE.name}`} onError={() => setQrMissing(true)}
                  className="mx-auto w-56 h-56 object-contain rounded-lg bg-white" draggable={false} />
              ) : (
                <div className="mx-auto w-56 h-56 rounded-lg bg-[#F7F1EC] flex items-center justify-center text-xs text-[#8B7E7A] px-4">The QR code isn't available right now — message us and we'll send the account details.</div>
              )}
              <p className="mt-3 text-base font-semibold text-[#2D2D2D]">{PAYEE.name}</p>
              <p className="text-xs text-[#8B7E7A]">Account ending in <span className="font-mono">{PAYEE.accountLast4}</span></p>
              <p className="mt-2 font-display text-2xl font-bold text-[#E8A598]">{amountLabel}</p>
            </div>

            <ol className="mt-4 space-y-1.5 text-xs text-[#5A5A5A] list-decimal pl-4">
              <li>Open your bank or e-wallet app (GCash, Maya, BPI, BDO, UnionBank…).</li>
              <li>Choose <b>Scan QR</b> / <b>InstaPay</b> and scan the code above.</li>
              <li>Send exactly <b className="text-[#2D2D2D]">{amountLabel}</b>{placed && <> and put <span className="font-mono text-[#C98A5E]">{placed.order_number}</span> in the note if your app asks</>}.</li>
              <li>Attach your receipt below — it speeds up confirmation.</li>
            </ol>
            <p className="mt-2 text-[11px] text-[#9B9B9B]">Your app may charge a small InstaPay fee. We don't add any.</p>

            {/* Receipt + reference (0033). Optional, but it lets the operator match the deposit at a glance. */}
            <div className="mt-4 rounded-xl border border-[#F0F0F0] p-3">
              <label className="block text-xs font-semibold text-[#2D2D2D] mb-1.5">Receipt screenshot <span className="font-normal text-[#9B9B9B]">(optional)</span></label>
              <label className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-dashed border-[#F4C2A1] bg-[#FFF8F0] text-xs text-[#8B6F47] cursor-pointer hover:bg-[#FDE8E4]">
                <Paperclip size={14} className="shrink-0" />
                <span className="truncate">{proofFile ? `${proofFile.name} · ${Math.max(1, Math.round(proofFile.size / 1024))} KB` : 'Attach the transfer receipt (JPG, PNG or PDF)'}</span>
                <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" onChange={(e) => onPickProof(e.target.files?.[0] ?? null)} />
              </label>
              {proofError && <p className="mt-1.5 text-[11px] text-red-500">{proofError}</p>}
              <label className="block text-xs font-semibold text-[#2D2D2D] mt-3 mb-1.5">Reference no. <span className="font-normal text-[#9B9B9B]">(optional — from your bank's receipt)</span></label>
              <input value={payRef} onChange={(e) => setPayRef(e.target.value)} inputMode="text" autoComplete="off" placeholder="e.g. 2026091012345678" maxLength={64}
                className="w-full px-3 py-2 rounded-lg border border-[#E8E8E8] text-sm outline-none focus:border-[#F4C2A1]" />
            </div>

            <button
              onClick={handlePaymentSent}
              disabled={submitting}
              className="w-full mt-4 py-3.5 bg-[#E8A598] text-white text-base font-bold rounded-xl hover:brightness-105 transition-all flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-wait"
            >
              {submitting
                ? <><Loader2 size={16} className="animate-spin" /> {prepMsg || 'Saving…'}</>
                : <><Check size={16} /> I've sent {amountLabel}</>}
            </button>
            <p className="mt-3 text-[11px] text-[#9B9B9B] text-center">We confirm transfers in our bank app during business hours, then print. Nothing is charged automatically.</p>
            {errorMsg && <p className="mt-3 text-xs text-red-500 text-center">{errorMsg}</p>}
            <details className="mt-3 text-xs text-[#9B9B9B]">
              <summary className="cursor-pointer text-center hover:text-[#6B6B6B]">Order summary</summary>
            <div className="space-y-2 text-sm border-y border-[#F0F0F0] py-4 mt-2">
              <div className="flex justify-between gap-3"><span className="text-[#6B6B6B] shrink-0">Album</span><span className="font-semibold text-[#E8A598] text-right">{ALBUM_SIZES.find((s) => s.preset === albumSize)?.name} · {MATERIALS.find((m) => m.type === material)?.name} · {COVERS.find((c) => c.type === cover)?.name}</span></div>
              {breakdown.items.map((item) => (
                <div key={item.label} className="flex justify-between gap-3">
                  <span className="text-[#6B6B6B]">{item.label}</span>
                  <span className="font-medium text-[#2D2D2D] text-right whitespace-nowrap">₱{item.amount.toLocaleString('en-PH')}</span>
                </div>
              ))}
              <div className="flex justify-between items-baseline pt-1 border-t border-[#F0F0F0]"><span className="font-semibold text-[#2D2D2D]">Total</span><span className="font-display text-2xl font-bold text-[#E8A598]">₱{totalPrice.toLocaleString('en-PH')}</span></div>
            </div>
            </details>
          </div>
        </motion.div>
      </div>
    );
  }

  /* ══════════════ FORM (checkout) ══════════════ */
  return (
    <div className="min-h-screen bg-[#FFF8F0] pt-24 pb-12 px-6">
      <div className="max-w-[900px] mx-auto">
        <h1 className="font-display text-4xl font-bold text-[#2D2D2D] text-center mb-8">Finalize Your Order</h1>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Left: Options */}
          <div className="lg:col-span-2 space-y-6">
            {/* Material */}
            <div className="bg-white rounded-2xl p-6 shadow-sm">
              <h3 className="font-display text-lg font-semibold text-[#2D2D2D] mb-4 flex items-center gap-2"><Palette size={18} /> Paper Material</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {MATERIALS.map((m) => (
                  <button key={m.type} onClick={() => setMaterial(m.type)}
                    className="p-3 rounded-xl border-2 text-left transition-all"
                    style={{ borderColor: material === m.type ? '#F4C2A1' : '#E8E8E8', backgroundColor: material === m.type ? '#FFF8F0' : '#fff' }}>
                    <span className="font-medium text-sm text-[#2D2D2D]">{m.name}</span>
                    <span className="block text-xs text-[#9B9B9B] mt-1">{m.description}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Cover */}
            <div className="bg-white rounded-2xl p-6 shadow-sm">
              <h3 className="font-display text-lg font-semibold text-[#2D2D2D] mb-4 flex items-center gap-2"><HardDrive size={18} /> Cover Type</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {COVERS.map((c) => (
                  <button key={c.type} onClick={() => setCover(c.type)}
                    className="p-3 rounded-xl border-2 text-left transition-all"
                    style={{ borderColor: cover === c.type ? '#F4C2A1' : '#E8E8E8', backgroundColor: cover === c.type ? '#FFF8F0' : '#fff' }}>
                    <span className="font-medium text-sm text-[#2D2D2D]">{c.name}</span>
                    <span className="block text-xs text-[#9B9B9B] mt-1">{c.description}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Size — locked to the album you built when a design is in progress */}
            <div className="bg-white rounded-2xl p-6 shadow-sm">
              <h3 className="font-display text-lg font-semibold text-[#2D2D2D] mb-4 flex items-center gap-2"><BookOpen size={18} /> Album Size</h3>
              {hasJob ? (
                <div className="flex items-center justify-between rounded-xl border-2 border-[#F4C2A1] bg-[#FFF8F0] px-4 py-3">
                  <span className="text-sm text-[#6B6B6B]">From your design</span>
                  <span className="text-sm font-semibold text-[#2D2D2D]">{ALBUM_SIZES.find((s) => s.preset === albumSize)?.name}</span>
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
              <h3 className="font-display text-lg font-semibold text-[#2D2D2D] mb-4">Your Details</h3>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-[#6B6B6B] mb-1 block">Full Name</label>
                  <input value={name}
                    onChange={(e) => { setName(e.target.value); if (errors.name) setErrors((p) => ({ ...p, name: '' })); }}
                    autoComplete="name" maxLength={80}
                    aria-invalid={!!errors.name}
                    className={`w-full border rounded-lg px-3 py-2 text-sm ${errors.name ? 'border-red-400' : 'border-[#E8E8E8]'}`} placeholder="Juan Dela Cruz" />
                  {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
                </div>
                <div>
                  <label className="text-xs text-[#6B6B6B] mb-1 block">Phone Number</label>
                  <input value={phone}
                    onChange={(e) => { setPhone(e.target.value); if (errors.phone) setErrors((p) => ({ ...p, phone: '' })); }}
                    onBlur={() => { const c = normalizePHPhone(phone); if (c) setPhone(formatPHPhoneDisplay(c)); }}
                    inputMode="tel" autoComplete="tel" maxLength={20}
                    aria-invalid={!!errors.phone}
                    className={`w-full border rounded-lg px-3 py-2 text-sm ${errors.phone ? 'border-red-400' : 'border-[#E8E8E8]'}`} placeholder="+63 9XX XXX XXXX" />
                  {errors.phone && <p className="text-xs text-red-500 mt-1">{errors.phone}</p>}
                </div>
                <div>
                  <label className="text-xs text-[#6B6B6B] mb-2 block">Delivery Address</label>
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
              <h3 className="font-display text-lg font-semibold text-[#2D2D2D] mb-4">Order Summary</h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between items-center gap-3"><span className="text-[#6B6B6B]">Material</span><span className="font-semibold text-[#E8A598] text-right">{MATERIALS.find((m) => m.type === material)?.name}</span></div>
                <div className="flex justify-between items-center gap-3"><span className="text-[#6B6B6B]">Cover</span><span className="font-semibold text-[#E8A598] text-right">{COVERS.find((c) => c.type === cover)?.name}</span></div>
                <div className="flex justify-between items-center gap-3"><span className="text-[#6B6B6B]">Size</span><span className="font-semibold text-[#E8A598] text-right">{ALBUM_SIZES.find((s) => s.preset === albumSize)?.name}</span></div>
                <div className="border-t border-[#F0F0F0] pt-3 mt-3 space-y-2">
                  {breakdown.items.map((item) => (
                    <div key={item.label} className="flex justify-between gap-3 text-[13px]">
                      <span className="text-[#6B6B6B]">{item.label}</span>
                      <span className="font-medium text-[#2D2D2D] text-right whitespace-nowrap">₱{item.amount.toLocaleString('en-PH')}</span>
                    </div>
                  ))}
                  <div className="flex justify-between items-baseline pt-2 border-t border-[#F0F0F0]"><span className="font-semibold text-[#2D2D2D]">Total</span><span className="font-display text-2xl font-bold text-[#E8A598]">₱{totalPrice.toLocaleString('en-PH')}</span></div>
                </div>
              </div>
              <div className="mt-4 flex items-start gap-2 rounded-xl bg-[#FBEDE7] border border-[#F4C2A1]/60 px-3 py-2.5">
                <QrCode size={16} className="text-[#E8A598] shrink-0 mt-0.5" />
                <p className="text-xs text-[#8B6F47] leading-snug">
                  <b className="text-[#2D2D2D]">{FREE_QR_MEMORIES} living-memory QRs included</b> — a video plays when anyone scans your printed album. Extra QRs are ₱{EXTRA_QR_RATE} each.
                  {qrCount > 0 && <> This album has <b className="text-[#2D2D2D]">{qrCount}</b>.</>}
                  {qrCount > 0 && hdPrice > 0 && (
                    <> Quality: <b className="text-[#2D2D2D]">{hdMemories ? `HD 1080p (+₱${hdPrice})` : 'Standard 720p'}</b>, set in the builder.</>
                  )}
                </p>
              </div>
              {clipCodes.length > 0 && (
                <div className="mt-2 flex items-start gap-2 rounded-xl border border-[#F0F0F0] bg-white px-3 py-2.5" role="status" aria-live="polite">
                  {clipPrep.phase === 'ready'
                    ? <Check size={16} className="text-[#5AA469] shrink-0 mt-0.5" />
                    : clipPrep.phase === 'failed'
                      ? <Wifi size={16} className="text-[#E8A598] shrink-0 mt-0.5" />
                      : <Loader2 size={16} className="animate-spin text-[#C98A5E] shrink-0 mt-0.5" />}
                  <p className="text-xs text-[#8B6F47] leading-snug">
                    {clipPrep.phase === 'ready' ? (
                      <><b className="text-[#2D2D2D]">Your {clipCodes.length === 1 ? 'memory video is' : `${clipCodes.length} memory videos are`} uploaded.</b> Nothing to wait for at payment.</>
                    ) : clipPrep.phase === 'failed' ? (
                      <><b className="text-[#2D2D2D]">Upload paused.</b> We'll try again when you tap Pay — a Wi-Fi connection helps.</>
                    ) : (
                      <>
                        <b className="text-[#2D2D2D]">
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
                <div className="mt-3 rounded-xl border border-[#F0F0F0] bg-white px-3 py-3">
                  <p className="text-xs font-semibold text-[#2D2D2D]">How long should your memories stay live?</p>
                  <p className="text-[11px] text-[#9B9B9B] mb-2">Your videos play from the printed QR for the whole term. Renew anytime after.</p>
                  <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Memory hosting term">
                    {tiers.map((t) => {
                      const active = (hostingYears ?? includedYears) === t.years;
                      return (
                        <button key={t.years} type="button" role="radio" aria-checked={active}
                          onClick={() => setHostingYears(t.years)}
                          className={`rounded-lg border px-3 py-2 text-left transition ${active ? 'border-[#E8A598] bg-[#FFF3EC]' : 'border-[#E8E8E8] hover:border-[#F4C2A1]'}`}>
                          <div className="text-sm font-semibold text-[#2D2D2D]">{t.years} years</div>
                          <div className="text-[11px] text-[#8B6F47]">{t.price > 0 ? `+₱${t.price}` : 'Included'}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              <button onClick={handleProceedToPayment} disabled={!priceReady || submitting}
                className="w-full mt-4 py-3 bg-[#F4C2A1] text-white font-semibold rounded-xl hover:brightness-105 transition-all flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-wait">
                {submitting ? <><Loader2 size={16} className="animate-spin" /> {prepMsg || 'Placing your order…'}</>
                  : priceReady ? <><ShoppingCart size={16} /> Place order · pay {`₱${totalPrice.toLocaleString('en-PH')}`} by bank transfer</>
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
