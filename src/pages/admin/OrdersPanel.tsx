/* Orders tab — the fulfillment queue. The operator sets a price, marks paid, and
   advances each order's status. All writes are admin-gated by RLS (migration 0005). */

import { useState } from 'react';
import { Loader2, Check } from 'lucide-react';
import {
  type AdminOrder, ORDER_STATUSES, STATUS_LABELS, updateOrder,
} from '../../lib/adminOrders';

export default function OrdersPanel({ orders, onChanged }: { orders: AdminOrder[]; onChanged: () => Promise<void> }) {
  if (orders.length === 0) {
    return <p className="text-sm text-[#9B9B9B] py-16 text-center">No orders yet.</p>;
  }
  return (
    <div className="space-y-3">
      {orders.map((o) => <OrderRow key={o.id} o={o} onChanged={onChanged} />)}
    </div>
  );
}

function OrderRow({ o, onChanged }: { o: AdminOrder; onChanged: () => Promise<void> }) {
  const [saving, setSaving] = useState(false);
  const [price, setPrice] = useState(o.amount != null ? String(o.amount) : '');
  const [err, setErr] = useState<string | null>(null);

  const save = async (patch: Parameters<typeof updateOrder>[1]) => {
    setSaving(true); setErr(null);
    const e = await updateOrder(o.id, patch);
    if (e) setErr(e); else await onChanged();
    setSaving(false);
  };

  const paid = o.payment_status === 'paid';
  const date = o.created_at.slice(0, 10);

  return (
    <div className="rounded-xl border border-[#E8E8E8] bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-[#2D2D2D]">{o.order_number}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full ${paid ? 'bg-[#E6F4EA] text-[#2E7D4A]' : 'bg-[#FFF3E0] text-[#B8791F]'}`}>
              {paid ? 'Paid' : 'Unpaid'}
            </span>
          </div>
          <div className="text-xs text-[#9B9B9B] mt-1">
            {o.ship_name || '—'}{o.ship_phone ? ` · ${o.ship_phone}` : ''} · {date}
          </div>
          <div className="text-xs text-[#9B9B9B]">
            {[o.album_size, o.material, o.cover].filter(Boolean).join(' · ') || '—'} · {o.page_count} pages
          </div>
          {o.ship_address && <div className="text-xs text-[#B9B9B9] mt-0.5 max-w-md">{o.ship_address}</div>}
        </div>

        <div className="flex items-center gap-2">
          {/* Price */}
          <div className="flex items-center gap-1">
            <span className="text-sm text-[#9B9B9B]">₱</span>
            <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="numeric" placeholder="price"
              className="w-20 h-8 px-2 rounded-lg border border-[#E8E8E8] text-sm outline-none focus:border-[#F4C2A1]" />
            <button onClick={() => save({ amount: price ? Number(price) : null })} disabled={saving}
              className="h-8 px-2 rounded-lg bg-[#F5F5F5] text-xs text-[#6B6B6B] disabled:opacity-50">Set</button>
          </div>
          {/* Mark paid */}
          {!paid && (
            <button onClick={() => save({ payment_status: 'paid', status: 'paid' })} disabled={saving}
              className="h-8 px-3 rounded-lg bg-[#E6F4EA] text-xs font-medium text-[#2E7D4A] flex items-center gap-1 disabled:opacity-50">
              <Check size={13} /> Mark paid
            </button>
          )}
          {/* Status */}
          <select value={o.status} onChange={(e) => save({ status: e.target.value as AdminOrder['status'] })} disabled={saving}
            className="h-8 px-2 rounded-lg border border-[#E8E8E8] text-sm outline-none focus:border-[#F4C2A1] bg-white">
            {ORDER_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
          </select>
          {saving && <Loader2 size={15} className="animate-spin text-[#9B9B9B]" />}
        </div>
      </div>
      {err && <p className="text-xs text-red-600 mt-2">{err}</p>}
    </div>
  );
}
