import { useState, useMemo, useEffect } from 'react';
import type { MaterialType, CoverType, AlbumSizePreset } from "./builder/types";
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Check, ShoppingCart, BookOpen, Palette, HardDrive, CreditCard, Printer, Loader2, Download, Package } from 'lucide-react';
import { MATERIALS, COVERS, ALBUM_SIZES, PRICE_CONFIG } from './builder/types';
import { useAuth } from '../lib/authContext';
import { createOrderFromLatestAlbum } from '../lib/orders';
import { getPendingPrintJob } from '../lib/printQueue';
import { downloadAlbumPdf } from './builder/generateAlbumPdf';

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
  const [material, setMaterial] = useState<MaterialType>('matte');
  const [cover, setCover] = useState<CoverType>('softcover');
  const [size, setSize] = useState<AlbumSizePreset>('8x8');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const [step, setStep] = useState<Step>('form');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [orderNumber, setOrderNumber] = useState('');
  const [trackStage, setTrackStage] = useState(0);
  const [pdfState, setPdfState] = useState<'idle' | 'working' | 'done' | 'error'>('idle');

  const totalPrice = useMemo(() => {
    const mat = MATERIALS.find((m) => m.type === material)?.priceFactor ?? 1;
    const cov = COVERS.find((c) => c.type === cover)?.priceFactor ?? 1;
    const base = PRICE_CONFIG.basePrice;
    return Math.round(base * mat * cov);
  }, [material, cover]);

  // ── Form → Payment ──
  const handleProceedToPayment = () => {
    setErrorMsg('');
    const newErrors: Record<string, boolean> = {};
    if (!name.trim()) newErrors.name = true;
    if (!phone.trim()) newErrors.phone = true;
    if (!address.trim()) newErrors.address = true;
    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;
    if (!user) {
      setErrorMsg('Please sign in to place your order — that\'s how we tie it to your album and contact you.');
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
        specs: { material, cover, size },
        shipping: { name: name.trim(), phone: phone.trim(), address: address.trim() },
        amount: totalPrice,
      });
      setOrderNumber(order.order_number);
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

  // ── Real print-ready PDF (built from the job stashed by the Preview) ──
  const handleDownloadPdf = async () => {
    const job = getPendingPrintJob();
    if (!job || job.pages.length === 0) {
      setPdfState('error');
      return;
    }
    setPdfState('working');
    try {
      await downloadAlbumPdf(job.pages, job.photos, job.albumSize, `megyprints-${orderNumber || 'album'}.pdf`);
      setPdfState('done');
    } catch (err) {
      console.error('Print PDF failed:', err);
      setPdfState('error');
    }
  };

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

          {/* Print-ready PDF — the artifact that goes to the printer */}
          {printerReached && (
            <div className="bg-white rounded-2xl p-6 shadow-sm mt-4">
              <h3 className="font-display text-base font-semibold text-[#2D2D2D] mb-1 flex items-center gap-2"><Printer size={16} /> Print-ready file</h3>
              <p className="text-xs text-[#6B6B6B] mb-3">This is the 300 DPI PDF our printer uses to produce your album.</p>
              <button
                onClick={handleDownloadPdf}
                disabled={pdfState === 'working'}
                className="w-full py-3 bg-[#F4C2A1] text-white font-semibold rounded-xl hover:brightness-105 transition-all flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-wait"
              >
                {pdfState === 'working'
                  ? <><Loader2 size={16} className="animate-spin" /> Building print file…</>
                  : <><Download size={16} /> Download print-ready PDF</>}
              </button>
              {pdfState === 'done' && <p className="mt-2 text-xs text-[#2E7D4A] text-center">Print file downloaded ✓</p>}
              {pdfState === 'error' && <p className="mt-2 text-xs text-red-500 text-center">Couldn't build the print file. Make sure you came here straight from the album preview.</p>}
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
              <div className="flex justify-between"><span className="text-[#6B6B6B]">Album</span><span>{ALBUM_SIZES.find((s) => s.preset === size)?.name} · {MATERIALS.find((m) => m.type === material)?.name} · {COVERS.find((c) => c.type === cover)?.name}</span></div>
              <div className="flex justify-between text-lg font-semibold pt-1"><span>Total</span><span>₱{totalPrice}</span></div>
            </div>
            <button
              onClick={handlePay}
              disabled={submitting}
              className="w-full py-3.5 bg-[#E8A598] text-white text-base font-bold rounded-xl hover:brightness-105 transition-all flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-wait"
            >
              {submitting ? <><Loader2 size={16} className="animate-spin" /> Processing payment…</> : <>Pay ₱{totalPrice}</>}
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

            {/* Size */}
            <div className="bg-white rounded-2xl p-6 shadow-sm">
              <h3 className="font-display text-lg font-semibold text-[#2D2D2D] mb-4 flex items-center gap-2"><BookOpen size={18} /> Album Size</h3>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
                {ALBUM_SIZES.map((s) => (
                  <button key={s.preset} onClick={() => setSize(s.preset)}
                    className="py-2.5 px-3 rounded-xl border-2 text-center transition-all text-sm"
                    style={{ borderColor: size === s.preset ? '#F4C2A1' : '#E8E8E8', backgroundColor: size === s.preset ? '#FFF8F0' : '#fff' }}>
                    {s.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Form */}
            <div className="bg-white rounded-2xl p-6 shadow-sm">
              <h3 className="font-display text-lg font-semibold text-[#2D2D2D] mb-4">Your Details</h3>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-[#6B6B6B] mb-1 block">Full Name</label>
                  <input value={name} onChange={(e) => setName(e.target.value)}
                    className={`w-full border rounded-lg px-3 py-2 text-sm ${errors.name ? 'border-red-400' : 'border-[#E8E8E8]'}`} placeholder="Juan Dela Cruz" />
                </div>
                <div>
                  <label className="text-xs text-[#6B6B6B] mb-1 block">Phone Number</label>
                  <input value={phone} onChange={(e) => setPhone(e.target.value)}
                    className={`w-full border rounded-lg px-3 py-2 text-sm ${errors.phone ? 'border-red-400' : 'border-[#E8E8E8]'}`} placeholder="+63 9XX XXX XXXX" />
                </div>
                <div>
                  <label className="text-xs text-[#6B6B6B] mb-1 block">Delivery Address</label>
                  <textarea value={address} onChange={(e) => setAddress(e.target.value)}
                    className={`w-full border rounded-lg px-3 py-2 text-sm h-20 resize-none ${errors.address ? 'border-red-400' : 'border-[#E8E8E8]'}`} placeholder="Complete address..." />
                </div>
              </div>
            </div>
          </div>

          {/* Right: Summary */}
          <div>
            <div className="bg-white rounded-2xl p-6 shadow-sm sticky top-24">
              <h3 className="font-display text-lg font-semibold text-[#2D2D2D] mb-4">Order Summary</h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between"><span className="text-[#6B6B6B]">Material</span><span>{MATERIALS.find((m) => m.type === material)?.name}</span></div>
                <div className="flex justify-between"><span className="text-[#6B6B6B]">Cover</span><span>{COVERS.find((c) => c.type === cover)?.name}</span></div>
                <div className="flex justify-between"><span className="text-[#6B6B6B]">Size</span><span>{ALBUM_SIZES.find((s) => s.preset === size)?.name}</span></div>
                <div className="border-t border-[#F0F0F0] pt-3 mt-3">
                  <div className="flex justify-between text-lg font-semibold"><span>Total</span><span>₱{totalPrice}</span></div>
                  <p className="text-[10px] text-[#9B9B9B] mt-1">*Sample pricing. Actual price may vary.</p>
                </div>
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
