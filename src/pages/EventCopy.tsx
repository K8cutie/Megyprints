import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Loader2, BookOpen, Check } from 'lucide-react';
import { useAuth } from '../lib/authContext';
import { useAuthModal } from '../components/AuthModalProvider';
import AddressPicker from '../components/AddressPicker';
import BankTransferPay from '../components/BankTransferPay';
import { supabase } from '../lib/supabase';
import { getPriceSchedule, isStoreSettingsReady, storeSettingsReady } from '../lib/storeSettings';
import { priceBreakdown } from '../lib/pricing';
import { uploadPaymentProof, submitPaymentProof } from '../lib/payment';
import {
  normalizeFullName, isValidFullName, normalizePHPhone, validateAddress, composeAddress, normalizeStreet, EMPTY_ADDRESS, type AddressValue,
} from '../lib/contact';
import { ALBUM_SIZES } from './builder/types';
import type { AlbumSizePreset } from './builder/types';

/* ══════════════════════════════════════════════════════════════════════════
   /e/:code/copy — a guest orders their own copy of the hosts' album (0045),
   when the hosts turned it on and their album is paid. Same album, normal
   price, the guest's own delivery address, paid by the same GoTyme QR. It
   prints from the hosts' files: guests don't have the photos.
   ══════════════════════════════════════════════════════════════════════════ */

interface Offer { title: string; album_size: AlbumSizePreset; cover: string; material: string; page_count: number }

export default function EventCopy() {
  const { code = '' } = useParams();
  const { user } = useAuth();
  const { openLogin } = useAuthModal();
  const [offer, setOffer] = useState<Offer | null | 'loading'>('loading');
  const [ready, setReady] = useState(isStoreSettingsReady());
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState<AddressValue>(EMPTY_ADDRESS);
  const [errs, setErrs] = useState<{ name?: string; phone?: string }>({});
  const [addrErrs, setAddrErrs] = useState<Partial<Record<keyof AddressValue, string>>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [placed, setPlaced] = useState<{ id: string; number: string } | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    let alive = true;
    void supabase.rpc('event_copy_offer', { p_code: code }).then(({ data }) => { if (alive) setOffer((data as Offer | null) ?? null); });
    if (!ready) void storeSettingsReady().then(() => { if (alive) setReady(true); });
    return () => { alive = false; };
  }, [code, ready]);

  const schedule = getPriceSchedule();
  if (offer === 'loading') return <Wrap><div className="py-20 flex justify-center text-light"><Loader2 className="animate-spin" /></div></Wrap>;
  if (!offer) {
    return (
      <Wrap>
        <div className="bg-white rounded-2xl p-6 shadow-sm text-center" data-testid="copy-unavailable">
          <p className="font-semibold text-dark">Copies of this album aren’t available yet.</p>
          <p className="mt-1 text-sm text-medium">The hosts choose whether guests can order a copy, once their album is ordered.</p>
          <Link to={`/e/${code}`} className="mt-3 inline-block underline text-sm font-semibold text-cocoa">Back to the event</Link>
        </div>
      </Wrap>
    );
  }

  const binding = offer.cover === 'softcover' ? 'soft' : 'hard';
  const total = schedule ? priceBreakdown(schedule, offer.album_size, binding, offer.page_count).total : null;
  const size = ALBUM_SIZES.find((s) => s.preset === offer.album_size)?.name ?? offer.album_size;

  const place = async () => {
    setErr('');
    const cleanName = normalizeFullName(name);
    const e164 = normalizePHPhone(phone);
    const next: { name?: string; phone?: string } = {};
    if (!isValidFullName(cleanName)) next.name = 'Please enter your full name.';
    if (!e164) next.phone = 'Enter a PH mobile number, e.g. 0917 123 4567.';
    const a = validateAddress(address);
    setErrs(next);
    setAddrErrs(a);
    if (Object.keys(next).length || Object.keys(a).length) return;
    if (!user) { setErr('Sign in to order your copy. Your details stay here.'); openLogin(); return; }
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc('place_event_copy_order', {
        p_code: code,
        p_ship: {
          name: cleanName, phone: e164, address: composeAddress(address), region: address.regionName, province: address.provinceName,
          city: address.cityName, barangay: address.barangayName, street: normalizeStreet(address.street), zip: address.zip.trim(),
        },
      });
      if (error) throw new Error(error.message);
      const d = data as { order_id: string; order_number: string };
      setPlaced({ id: d.order_id, number: d.order_number });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'We couldn’t place your order. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  if (placed && sent) {
    return (
      <Wrap>
        <div className="bg-white rounded-2xl p-6 shadow-sm text-center" data-testid="copy-done">
          <Check className="mx-auto text-success" />
          <h1 className="mt-2 font-display text-2xl font-bold text-dark">Thank you! We’re confirming your payment</h1>
          <p className="mt-1 text-sm text-medium">Order <span className="font-mono">{placed.number}</span>. We print your copy and ship it to you. Follow it in <Link to="/orders" className="underline font-semibold">Your orders</Link>.</p>
        </div>
      </Wrap>
    );
  }

  return (
    <Wrap>
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#9A4A2C]">Megyprints Events</p>
      <h1 className="mt-1 font-display text-3xl font-bold text-dark">Your own copy of {offer.title || 'the album'}</h1>
      <div className="mt-4 bg-white rounded-2xl p-5 shadow-sm flex items-start gap-3" data-testid="copy-offer">
        <BookOpen className="text-blush-pink shrink-0" />
        <div className="text-sm">
          <p className="font-semibold text-dark">The same printed album as the hosts’</p>
          <p className="text-medium">{size} · {binding === 'soft' ? 'Softcover' : 'Hardbound'} · {offer.page_count} pages</p>
          <p className="mt-1 font-display text-xl font-bold text-blush-pink" data-testid="copy-price">{total != null ? `₱${total.toLocaleString('en-PH')}` : ready ? 'Price unavailable right now' : 'Loading price…'}</p>
        </div>
      </div>

      {placed ? (
        <div className="mt-4 bg-white rounded-2xl p-5 shadow-sm">
          <p className="text-sm text-dark">Order <span className="font-mono">{placed.number}</span> is placed. Pay by bank transfer to finish.</p>
          {total != null && (
            <BankTransferPay amount={total} note={placed.number} what="payment"
              onSent={async (file, reference) => {
                let proofPath: string | null = null;
                if (file) { try { proofPath = await uploadPaymentProof(placed.id, file); } catch { /* the transfer note still matches it */ } }
                await submitPaymentProof(placed.id, { reference, proofPath });
                setSent(true);
              }} />
          )}
        </div>
      ) : (
        <div className="mt-4 bg-white rounded-2xl p-5 shadow-sm space-y-3">
          <h2 className="font-semibold text-dark">Where should we send it?</h2>
          <label className="block text-sm">
            <span className="block text-xs text-medium mb-1">Full name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={80} data-testid="copy-name"
              className={`w-full border rounded-lg px-3 py-2 text-sm ${errs.name ? 'border-red-400' : 'border-line'}`} />
            {errs.name && <span className="text-xs text-red-500">{errs.name}</span>}
          </label>
          <label className="block text-sm">
            <span className="block text-xs text-medium mb-1">Mobile number</span>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" maxLength={20} placeholder="0917 123 4567" data-testid="copy-phone"
              className={`w-full border rounded-lg px-3 py-2 text-sm ${errs.phone ? 'border-red-400' : 'border-line'}`} />
            {errs.phone && <span className="text-xs text-red-500">{errs.phone}</span>}
          </label>
          <AddressPicker value={address} onChange={(v) => { setAddress(v); setAddrErrs({}); }} errors={addrErrs} />
          <button type="button" onClick={() => void place()} disabled={busy || total == null} data-testid="copy-place"
            className="w-full py-3 rounded-xl bg-blush-pink text-white font-semibold hover:brightness-105 disabled:opacity-60 flex items-center justify-center gap-2">
            {busy ? <><Loader2 size={16} className="animate-spin" /> Placing your order…</> : `Order my copy${total != null ? ` · ₱${total.toLocaleString('en-PH')}` : ''}`}
          </button>
          {err && <p className="text-sm text-red-600 text-center" role="alert" data-testid="copy-error">{err}</p>}
        </div>
      )}
    </Wrap>
  );
}

function Wrap({ children }: { children: React.ReactNode }) {
  return <div className="bg-cream min-h-screen"><div className="max-w-xl mx-auto px-4 pt-24 pb-16">{children}</div></div>;
}
