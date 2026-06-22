import { useState, useMemo } from 'react';
import type { MaterialType, CoverType, AlbumSizePreset } from "./builder/types";
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Check, ShoppingCart, BookOpen, Palette, HardDrive } from 'lucide-react';
import { MATERIALS, COVERS, ALBUM_SIZES, PRICE_CONFIG } from './builder/types';
import { useAuth } from '../lib/authContext';
import { createOrderFromLatestAlbum } from '../lib/orders';

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
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [orderNumber, setOrderNumber] = useState('');

  const totalPrice = useMemo(() => {
    const mat = MATERIALS.find((m) => m.type === material)?.priceFactor ?? 1;
    const cov = COVERS.find((c) => c.type === cover)?.priceFactor ?? 1;
    const base = PRICE_CONFIG.basePrice;
    return Math.round(base * mat * cov);
  }, [material, cover]);

  const handleSubmit = async () => {
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

    setSubmitting(true);
    try {
      // Recover the album the user built (id + local snapshot). The snapshot lets
      // a "built before signing in" album still be ordered; the id makes us order
      // the exact album they viewed rather than their most-recently-updated one.
      let pendingAlbumId: string | undefined;
      let pendingSnapshot: Record<string, unknown> | null = null;
      try {
        const raw = sessionStorage.getItem('megy-pending-order-album');
        if (raw) {
          const parsed = JSON.parse(raw) as { albumId?: string; snapshot?: Record<string, unknown> };
          pendingAlbumId = parsed.albumId;
          pendingSnapshot = parsed.snapshot ?? null;
        }
      } catch { /* ignore malformed stash — fall back to latest album */ }

      const order = await createOrderFromLatestAlbum({
        userId: user.id,
        specs: { material, cover, size },
        shipping: { name: name.trim(), phone: phone.trim(), address: address.trim() },
        amount: totalPrice,
        albumId: pendingAlbumId,
        albumSnapshot: pendingSnapshot,
      });
      try { sessionStorage.removeItem('megy-pending-order-album'); } catch { /* ignore */ }
      setOrderNumber(order.order_number);
      setSubmitted(true);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong placing your order.');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-[#FFF8F0] pt-28 px-6 flex items-center justify-center">
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center max-w-md">
          <div className="w-20 h-20 rounded-full bg-[#E4F0E0] flex items-center justify-center mx-auto mb-6">
            <Check size={40} className="text-[#2E7D4A]" />
          </div>
          <h2 className="font-display text-3xl font-bold text-[#2D2D2D]">Thank You!</h2>
          {orderNumber && (
            <p className="mt-3 text-sm font-medium text-[#2D2D2D]">
              Order <span className="font-mono text-[#C98A5E]">{orderNumber}</span>
            </p>
          )}
          <p className="text-[#6B6B6B] mt-2">Your order has been submitted. Our team will review your album and contact you within 24 hours.</p>
          <div className="mt-6 flex gap-3 justify-center">
            <button onClick={() => navigate('/builder')} className="px-6 py-2.5 bg-[#F4C2A1] text-white rounded-lg font-medium hover:brightness-105">Create Another</button>
            <button onClick={() => navigate('/')} className="px-6 py-2.5 border border-[#D4D4D4] text-[#6B6B6B] rounded-lg font-medium hover:bg-[#F0F0F0]">Home</button>
          </div>
        </motion.div>
      </div>
    );
  }

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
              <button onClick={handleSubmit} disabled={submitting}
                className="w-full mt-4 py-3 bg-[#F4C2A1] text-white font-semibold rounded-xl hover:brightness-105 transition-all flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-wait">
                <ShoppingCart size={16} /> {submitting ? 'Placing order…' : 'Submit Order'}
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
