/* Orders tab — the fulfillment queue. Status changes go through the status-only
   DB function (safe for fulfillment). Price + Mark-paid are FINANCIAL and only
   render when canSeeFinancials (owner) — fulfillment never sees the peso amount. */

import { useState } from 'react';
import { Loader2, Check, Download, AlertTriangle } from 'lucide-react';
import {
  type AdminOrder, type OrderPatch, ORDER_STATUSES, STATUS_LABELS, updateOrder, setOrderStatus,
} from '../../lib/adminOrders';
import { supabase } from '../../lib/supabase';

export default function OrdersPanel({ orders, onChanged, canSeeFinancials, printReadyIds }: {
  orders: AdminOrder[];
  onChanged: () => Promise<void>;
  canSeeFinancials: boolean;
  /** Order ids that have a "<id>.pdf" in the private print-pdfs bucket. Any
   *  order NOT in this set is missing its print file and must not be fulfilled blind. */
  printReadyIds: Set<string>;
}) {
  if (orders.length === 0) {
    return <p className="text-sm text-[#9B9B9B] py-16 text-center">No orders yet.</p>;
  }
  return (
    <div className="space-y-3">
      {orders.map((o) => <OrderRow key={o.id} o={o} onChanged={onChanged} canSeeFinancials={canSeeFinancials} printReady={printReadyIds.has(o.id)} />)}
    </div>
  );
}

function OrderRow({ o, onChanged, canSeeFinancials, printReady }: {
  o: AdminOrder; onChanged: () => Promise<void>; canSeeFinancials: boolean; printReady: boolean;
}) {
  const [saving, setSaving] = useState(false);
  const [price, setPrice] = useState(o.amount != null ? String(o.amount) : '');
  const [err, setErr] = useState<string | null>(null);

  const run = async (fn: () => Promise<string | null>) => {
    setSaving(true); setErr(null);
    const e = await fn();
    if (e) setErr(e); else await onChanged();
    setSaving(false);
  };
  const saveFin = (patch: OrderPatch) => run(() => updateOrder(o.id, patch));
  const changeStatus = (status: AdminOrder['status']) => run(() => setOrderStatus(o.id, status));

  // Pull the print-ready PDF (operators only — RLS blocks customers). Built on
  // the customer's device at order time and stored at "<order_id>.pdf".
  const downloadPrintPdf = async () => {
    setSaving(true); setErr(null);
    const { data, error } = await supabase.storage
      .from('print-pdfs')
      .createSignedUrl(`${o.id}.pdf`, 120, { download: `megyprints-${o.order_number}.pdf` });
    setSaving(false);
    if (error || !data?.signedUrl) { setErr('Print file not ready for this order yet.'); return; }
    window.open(data.signedUrl, '_blank');
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
            {!printReady && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-[#FDE7E7] text-[#C0392B] flex items-center gap-1"
                title="No print-ready PDF is in the fulfillment bucket for this order. Do not print until the customer re-orders from the device that holds the photos.">
                <AlertTriangle size={12} /> Print file missing
              </span>
            )}
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
          {canSeeFinancials && (
            <>
              <div className="flex items-center gap-1">
                <span className="text-sm text-[#9B9B9B]">₱</span>
                <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="numeric" placeholder="price"
                  className="w-20 h-8 px-2 rounded-lg border border-[#E8E8E8] text-sm outline-none focus:border-[#F4C2A1]" />
                <button onClick={() => saveFin({ amount: price ? Number(price) : null })} disabled={saving}
                  className="h-8 px-2 rounded-lg bg-[#F5F5F5] text-xs text-[#6B6B6B] disabled:opacity-50">Set</button>
              </div>
              {!paid && (
                <button onClick={() => saveFin({ payment_status: 'paid', status: 'paid' })} disabled={saving}
                  className="h-8 px-3 rounded-lg bg-[#E6F4EA] text-xs font-medium text-[#2E7D4A] flex items-center gap-1 disabled:opacity-50">
                  <Check size={13} /> Mark paid
                </button>
              )}
            </>
          )}
          {paid && (
            <button onClick={downloadPrintPdf} disabled={saving}
              className="h-8 px-3 rounded-lg bg-[#FFF1E8] text-xs font-medium text-[#C98A5E] flex items-center gap-1 disabled:opacity-50">
              <Download size={13} /> Print PDF
            </button>
          )}
          <select value={o.status} onChange={(e) => changeStatus(e.target.value as AdminOrder['status'])} disabled={saving}
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
