import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Package, Loader2, Landmark } from 'lucide-react';
import { useAuth } from '../lib/authContext';
import { listMyOrders, type MyOrder } from '../lib/myOrders';
import { trackOf } from '../lib/orderTracker';
import { PAYEE } from '../lib/payment';
import { ALBUM_SIZES } from './builder/types';
import OrderTracker from '../components/OrderTracker';
import { cleanAlbumName, isDefaultAlbumName } from '../lib/albumName';

/* ══════════════════════════════════════════════════════════════════════════
   Your orders — every order, where it is now (its real status), and what to
   do if it's waiting on the customer. The thank-you screen was the only place
   an order showed, and it was gone once its tab was (1-star testers,
   2026-10-04, the Quitter: "Home has no orders section").
   ══════════════════════════════════════════════════════════════════════════ */

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-PH', { day: 'numeric', month: 'long', year: 'numeric' });
};
const peso = (n: number | null) => (n == null ? '' : `₱${Number(n).toLocaleString('en-PH')}`);

export default function MyOrders() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<MyOrder[] | null>(null);
  const [err, setErr] = useState('');
  // Opened for one order (checkout's "Open order MP-…"): that card first in view.
  const [params] = useSearchParams();
  const focusId = params.get('order');

  useEffect(() => {
    if (!user) return;
    let alive = true;
    listMyOrders(user.id)
      .then((r) => { if (alive) setOrders(r); })
      .catch((e: Error) => { if (alive) setErr(e.message); });
    return () => { alive = false; };
  }, [user]);

  return (
    // pt-24: below the fixed header — the title was drawn over the logo (RC).
    <div className="max-w-3xl mx-auto px-4 pt-24 pb-10">
      <div className="flex items-center gap-2 mb-1">
        <Package className="text-blush-pink" size={22} />
        <h1 className="font-display text-2xl font-semibold text-dark">Your orders</h1>
      </div>
      <p className="text-sm text-medium mb-6">Where each album is now. We text you at each big step too.</p>

      {err && <p className="text-sm text-red-500 mb-4">We couldn't load your orders: {err}</p>}
      {orders === null && !err && (
        <div className="flex items-center gap-2 text-sm text-light py-10 justify-center">
          <Loader2 size={16} className="animate-spin" /> Loading…
        </div>
      )}
      {orders && orders.length === 0 && (
        <div className="text-center py-16 text-light" data-testid="orders-empty">
          <Package size={40} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm mb-4">No orders yet.</p>
          <Link to="/builder" className="inline-block px-5 py-2.5 bg-blush-pink text-white rounded-lg text-sm font-semibold hover:brightness-105">Make an album</Link>
        </div>
      )}

      <div className="space-y-4">
        {orders?.map((o) => <OrderCard key={o.id} order={o} focused={o.id === focusId} />)}
      </div>
    </div>
  );
}

function OrderCard({ order, focused }: { order: MyOrder; focused?: boolean }) {
  const track = trackOf(order);
  const size = ALBUM_SIZES.find((s) => s.preset === order.album_size)?.name ?? order.album_size ?? '';
  const albumName = isDefaultAlbumName(order.album_title) ? '' : cleanAlbumName(order.album_title);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (focused) ref.current?.scrollIntoView?.({ block: 'start' }); }, [focused]);
  return (
    <div ref={ref} className={`bg-white rounded-2xl p-5 shadow-sm ${focused ? 'ring-2 ring-peach' : ''}`}
      data-testid="order-card" data-focused={focused ? 'true' : undefined}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {albumName && <p className="text-base font-display font-semibold text-dark truncate" data-testid="order-album-name">{albumName}</p>}
          <p className="text-sm font-semibold text-dark">Order <span className="font-mono text-[#C98A5E]">{order.order_number}</span></p>
          <p className="text-xs text-medium mt-0.5">
            Placed {fmtDate(order.created_at)}{size ? ` · ${size}` : ''}{order.page_count ? ` · ${order.page_count} pages` : ''}
          </p>
        </div>
        <span className="font-display text-lg font-bold text-blush-pink shrink-0">{peso(order.amount)}</span>
      </div>
      <p className={`mt-3 text-sm font-semibold ${track.cancelled ? 'text-red-600' : 'text-dark'}`} data-testid="order-headline">{track.headline}</p>

      {track.cancelled ? (
        <p className="mt-1 text-xs text-medium">This order was cancelled. If that's a surprise, <Link to="/contact" className="underline font-semibold">message us</Link>.</p>
      ) : (
        <div className="mt-2"><OrderTracker track={track} compact /></div>
      )}

      {track.awaitingPayment && (
        <div className="mt-3 rounded-xl border border-peach bg-blush px-4 py-3 text-xs text-cocoa" data-testid="order-how-to-pay">
          <p className="flex items-center gap-1.5 font-semibold text-dark mb-1"><Landmark size={14} /> Send {peso(order.amount)} by bank transfer to finish</p>
          <p>Open your bank or e-wallet app, choose <b>Scan QR</b> / <b>InstaPay</b> and scan this code ({PAYEE.bank} · {PAYEE.name}, account ending {PAYEE.accountLast4}). Put <span className="font-mono">{order.order_number}</span> in the note if your app asks.</p>
          <img src={PAYEE.qrSrc} alt={`${PAYEE.bank} InstaPay QR for ${PAYEE.name}`} className="mt-2 w-36 h-36 object-contain rounded-lg bg-white" draggable={false} />
          <p className="mt-2">Already paid? <Link to="/contact" className="underline font-semibold">Send us your receipt</Link> and we'll match it.</p>
        </div>
      )}

      {/* A second copy: the album as it is now, through the Order door (its
          checks and save), straight to checkout (RC; round 3: it opened the
          editor on page 1, with no order button on screen). */}
      {order.album_id && !track.awaitingPayment && (
        <Link to={`/builder?album=${order.album_id}&order=again`} data-testid="order-again"
          className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-peach text-xs font-semibold text-cocoa hover:bg-blush">
          Order this album again
        </Link>
      )}

      {order.tracking && track.stage >= 4 && (
        <p className="mt-3 text-xs text-medium">Courier tracking number: <span className="font-mono text-dark">{order.tracking}</span></p>
      )}
    </div>
  );
}
