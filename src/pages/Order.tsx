import { useState, useMemo, useEffect } from 'react';
import type { MaterialType, CoverType, AlbumSizePreset } from "./builder/types";
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Check, ShoppingCart, BookOpen, Palette, HardDrive, CreditCard, Printer, Loader2, Package, QrCode } from 'lucide-react';
import { MATERIALS, COVERS, ALBUM_SIZES, DEFAULT_ALBUM_SIZE } from './builder/types';
import { useAuth } from '../lib/authContext';
import { useAuthModal } from '../components/AuthModalProvider';
import { createOrderFromLatestAlbum, uploadOrderPrintPdf } from '../lib/orders';
import { getPendingPrintJob } from '../lib/printQueue';
import { priceBreakdown, MIN_PAGES, type Binding } from '../lib/pricing';
import { getPriceMultiple } from '../lib/storeSettings';
import { ensureMemoriesForFills } from '../lib/qrMemories';
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
  const binding: Binding = cover === 'softcover' ? 'soft' : 'hard';
  const hasJob = job != null;
  const multiple = getPriceMultiple(); // persisted store multiple (loaded on app start)

  const breakdown = useMemo(
    () => priceBreakdown(albumSize, binding, pageCount, multiple),
    [albumSize, binding, pageCount, multiple],
  );
  const totalPrice = breakdown.total;

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

  // ── Placeholder payment → create order → tracking ──
  const handlePay = async () => {
    setErrorMsg('');
    setSubmitting(true);
    try {
      // Simulated payment — no real gateway. (Xendit slots in here later.)
      await new Promise((r) => setTimeout(r, 1200));
      const order = await createOrderFromLatestAlbum({
        userId: user!.id,
        specs: { material, cover, size: albumSize },
        // createOrderFromLatestAlbum normalizes name/phone + composes the address
        // from these structured PSGC parts (single source of truth).
        shipping: { name, phone, address },
        amount: totalPrice,
      });
      setOrderNumber(order.order_number);
      // Build the print-ready PDF NOW (the photos live in THIS browser) and send
      // it to the private fulfillment bucket. Only Megyprints can download it —
      // the customer never gets the file. Best-effort: the order still stands if
      // this hiccups (we log it so it can be regenerated from a re-opened album).
      if (job && job.pages.length > 0) {
        setPrepMsg('Preparing your album for printing…');
        try {
          await uploadOrderPrintPdf(order.id, job);
        } catch (e) {
          console.error('Print PDF upload failed:', e);
        }
        // Reliability belt: ensure every QR "living memory" we're about to PRINT
        // has a resolvable row. Runs over the exact print-job pages — the same
        // source the PDF is built from — so a QR added just before checkout can't
        // ship with a dead /m/:code even if the throttled cloud save hasn't
        // flushed the qrFill to the DB album yet. INSERT-only; never clobbers a
        // relink. Best-effort — the order still stands if this hiccups.
        try {
          const qrFills = job.pages.flatMap((p) => p.qrFills ?? []);
          if (qrFills.length) await ensureMemoriesForFills(qrFills);
        } catch (e) {
          console.error('QR memories ensure (print job) failed:', e);
        }
        setPrepMsg('');
      }
      setTrackStage(0);
      setStep('tracking');
    } catch (err) {
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
      <div className="min-h-screen bg-[#FFF8F0] pt-28 px-6 pb-16 flex items-start justify-center">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-lg">
          <div className="text-center mb-8">
            <h2 className="font-display text-3xl font-bold text-[#2D2D2D]">{finished ? 'Your album is finished! 🎉' : 'Order in progress…'}</h2>
            {orderNumber && (
              <p className="mt-2 text-sm font-medium text-[#2D2D2D]">Order <span className="font-mono text-[#C98A5E]">{orderNumber}</span></p>
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

          {finished && (
            <div className="mt-6 flex gap-3 justify-center">
              <button onClick={() => navigate('/builder')} className="px-6 py-2.5 bg-[#F4C2A1] text-white rounded-lg font-medium hover:brightness-105">Create Another</button>
              <button onClick={() => navigate('/')} className="px-6 py-2.5 border border-[#D4D4D4] text-[#6B6B6B] rounded-lg font-medium hover:bg-[#F0F0F0]">Home</button>
            </div>
          )}
        </motion.div>
      </div>
    );
  }

  /* ══════════════ PAYMENT (placeholder) ══════════════ */
  if (step === 'payment') {
    return (
      <div className="min-h-screen bg-[#FFF8F0] pt-28 px-6 pb-16 flex items-start justify-center">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
          <h1 className="font-display text-3xl font-bold text-[#2D2D2D] text-center mb-6">Payment</h1>
          <div className="bg-white rounded-2xl p-6 shadow-sm">
            <div className="flex items-center gap-2 text-[#6B6B6B] mb-4"><CreditCard size={18} /> <span className="text-sm font-medium">Pay for your album</span></div>
            <div className="space-y-2 text-sm border-y border-[#F0F0F0] py-4 mb-4">
              <div className="flex justify-between gap-3"><span className="text-[#6B6B6B] shrink-0">Album</span><span className="font-semibold text-[#E8A598] text-right">{ALBUM_SIZES.find((s) => s.preset === albumSize)?.name} · {MATERIALS.find((m) => m.type === material)?.name} · {COVERS.find((c) => c.type === cover)?.name}</span></div>
              {breakdown.items.map((item) => (
                <div key={item.label} className="flex justify-between gap-3">
                  <span className="text-[#6B6B6B]">{item.label}</span>
                  <span className="font-medium text-[#2D2D2D] text-right whitespace-nowrap">₱{item.amount.toLocaleString('en-PH')}</span>
                </div>
              ))}
              <div className="flex justify-between items-baseline pt-1 border-t border-[#F0F0F0]"><span className="font-semibold text-[#2D2D2D]">Total</span><span className="font-display text-2xl font-bold text-[#E8A598]">₱{totalPrice.toLocaleString('en-PH')}</span></div>
            </div>
            <button
              onClick={handlePay}
              disabled={submitting}
              className="w-full py-3.5 bg-[#E8A598] text-white text-base font-bold rounded-xl hover:brightness-105 transition-all flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-wait"
            >
              {submitting ? <><Loader2 size={16} className="animate-spin" /> {prepMsg || 'Processing payment…'}</> : <>Pay ₱{totalPrice}</>}
            </button>
            <p className="mt-3 text-[11px] text-[#9B9B9B] text-center">🔒 Simulated payment — no real charge. (Xendit checkout goes here later.)</p>
            {errorMsg && <p className="mt-3 text-xs text-red-500 text-center">{errorMsg}</p>}
            <button onClick={() => { setStep('form'); setErrorMsg(''); }} disabled={submitting} className="w-full mt-3 text-xs text-[#9B9B9B] hover:text-[#6B6B6B] disabled:opacity-50">← Back to details</button>
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
                  <b className="text-[#2D2D2D]">Free living-memory QR included</b> — add a video that plays when anyone scans your printed album.
                </p>
              </div>
              <button onClick={handleProceedToPayment}
                className="w-full mt-4 py-3 bg-[#F4C2A1] text-white font-semibold rounded-xl hover:brightness-105 transition-all flex items-center justify-center gap-2">
                <ShoppingCart size={16} /> Proceed to Payment
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
