/* Bookings tab (owner only) — Megyprints Events for 15 or more guests (0043).
   Each request: who, when, where, how many. The owner sets the deal here; the
   cost to make comes from the same pricing model as the Pricing tab, and a
   deposit that doesn't cover it can't be sent (the database refuses it too).
   Then: confirm the deposit (the date is booked), confirm the balance. */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Check, Receipt, RefreshCw, Phone } from 'lucide-react';
import { loadOwnerPricingModel } from '../../lib/storeSettings';
import type { PricingModel } from '../../lib/pricing';
import {
  balanceOf, costToMake, dealProblem, eventTypeLabel, peso, type DealDraft, type EventBooking, type PaymentKind,
} from '../../lib/eventBookings';
import { closeBooking, fetchOwnerBookings, markBookingPaid, receiptUrl, setBookingDeal } from '../../lib/adminBookings';
import { ALBUM_SIZES } from '../builder/types';

/** A database time as the owner reads it: Manila, not UTC (a deposit sent
 *  at 7 AM on the 10th showed as 23:01 on the 9th). */
const manila = (iso: string, withTime = true) =>
  new Date(iso).toLocaleString('en-PH', {
    timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric',
    ...(withTime ? { hour: 'numeric', minute: '2-digit' } : {}),
  });

const STATUS_LABEL: Record<EventBooking['status'], string> = {
  requested: 'New request', quoted: 'Deal sent', booked: 'Booked', paid: 'Paid in full',
  completed: 'Completed', declined: 'Declined', cancelled: 'Cancelled',
};
const STATUS_STYLE: Record<EventBooking['status'], string> = {
  requested: 'bg-[#FFF3E0] text-[#B8791F]', quoted: 'bg-[#E8F0FE] text-[#2F5BB7]', booked: 'bg-[#E6F4EA] text-success',
  paid: 'bg-[#E6F4EA] text-success', completed: 'bg-paper text-medium', declined: 'bg-paper text-medium', cancelled: 'bg-paper text-medium',
};

export default function BookingsPanel() {
  const [rows, setRows] = useState<EventBooking[] | null>(null);
  const [model, setModel] = useState<PricingModel | null>(null);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    setErr('');
    try {
      const [list, m] = await Promise.all([fetchOwnerBookings(), loadOwnerPricingModel()]);
      setRows(list);
      setModel(m);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Couldn’t load bookings.');
      setRows([]);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  if (rows === null) return <div className="py-24 flex justify-center text-light"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-medium">Event bookings, newest first.</p>
        <button onClick={() => void load()} className="text-sm text-medium flex items-center gap-1 px-3 py-1.5 rounded-lg hover:bg-paper">
          <RefreshCw size={14} /> Refresh
        </button>
      </div>
      {err && <p className="text-sm text-red-600 mb-3">Couldn’t load bookings: {err}. Is migration 0043 applied?</p>}
      {rows.length === 0 && !err && <p className="text-sm text-light py-16 text-center" data-testid="bookings-empty">No booking requests yet.</p>}
      <div className="space-y-3">
        {rows.map((b) => <BookingRow key={b.id} b={b} model={model} onChanged={load} />)}
      </div>
    </div>
  );
}

function BookingRow({ b, model, onChanged }: { b: EventBooking; model: PricingModel | null; onChanged: () => Promise<void> }) {
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [closing, setClosing] = useState<'declined' | 'cancelled' | null>(null);
  const [reason, setReason] = useState('');
  const balance = balanceOf(b);
  const open = b.status === 'requested' || b.status === 'quoted';
  const dealEditable = open && !b.deposit_submitted_at;

  const run = async (fn: () => Promise<string | null>) => {
    setSaving(true); setErr('');
    const e = await fn();
    if (e) setErr(e); else await onChanged();
    setSaving(false);
  };
  const confirm = (kind: PaymentKind) => run(() => markBookingPaid(b.id, kind));
  const openReceipt = async (path: string) => {
    const url = await receiptUrl(path);
    if (url) window.open(url, '_blank'); else setErr('That receipt isn’t readable right now.');
  };

  return (
    <div className="rounded-xl border border-line bg-white p-4" data-testid="booking-row" data-status={b.status}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-dark">{b.booking_number}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_STYLE[b.status]}`}>{STATUS_LABEL[b.status]}</span>
          </div>
          <p className="text-sm text-dark mt-1">{eventTypeLabel(b.event_type)} · {b.event_date} · {b.guest_count} guests</p>
          <p className="text-xs text-medium">{b.venue ?? '—'}</p>
          <p className="text-xs text-medium mt-0.5 flex items-center gap-1 flex-wrap">
            {b.host_name ?? '(account deleted)'}
            {b.mobile && <> · <a href={`tel:${b.mobile}`} className="text-[#2F5BB7] inline-flex items-center gap-0.5"><Phone size={11} /> {b.mobile}</a></>}
            {' · '}requested {manila(b.created_at, false)}
          </p>
          {b.notes && <p className="text-xs text-light mt-1 whitespace-pre-line max-w-xl">{b.notes}</p>}
          {b.close_reason && <p className="text-xs text-light mt-1">Reason: {b.close_reason}</p>}
        </div>
        {saving && <Loader2 size={15} className="animate-spin text-light" />}
      </div>

      {b.deal_total != null && (
        <div className="mt-3 text-xs text-medium rounded-lg bg-paper px-3 py-2" data-testid="booking-row-deal">
          Deal {peso(b.deal_total)} · deposit {peso(b.deal_deposit)}{b.deposit_paid_at ? ' (paid)' : ''}
          {balance != null && balance > 0 ? <> · balance {peso(balance)}{b.balance_paid_at ? ' (paid)' : ''}</> : null}
          {' · '}cost to make {peso(b.deal_cost)}
          {' · '}{b.deal_album_size} {b.deal_cover === 'soft' ? 'softcover' : 'hardbound'}, {b.deal_pages} pages
          {b.deal_includes && <span className="block mt-0.5 whitespace-pre-line">{b.deal_includes}</span>}
        </div>
      )}

      {/* The deposit: the host says it's sent (and maybe attached a receipt);
          match it in the GoTyme app, then confirm. */}
      {b.status === 'quoted' && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          {b.deposit_submitted_at
            ? <span className="text-[#2F5BB7]">Host says the deposit is sent{b.deposit_reference ? <> · ref <span className="font-mono text-dark">{b.deposit_reference}</span></> : ''} · {manila(b.deposit_submitted_at)}</span>
            : <span className="text-light">Waiting for the deposit.</span>}
          {b.deposit_proof_path && (
            <button onClick={() => void openReceipt(b.deposit_proof_path!)} className="h-8 px-3 rounded-lg bg-[#E8F0FE] font-medium text-[#2F5BB7] flex items-center gap-1">
              <Receipt size={13} /> Deposit receipt
            </button>
          )}
          <button onClick={() => void confirm('deposit')} disabled={saving} data-testid="booking-mark-deposit"
            className="h-8 px-3 rounded-lg bg-[#E6F4EA] font-medium text-success flex items-center gap-1 disabled:opacity-50">
            <Check size={13} /> Mark deposit paid
          </button>
        </div>
      )}
      {b.status === 'booked' && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          {b.balance_submitted_at
            ? <span className="text-[#2F5BB7]">Host says the balance is sent{b.balance_reference ? <> · ref <span className="font-mono text-dark">{b.balance_reference}</span></> : ''} · {manila(b.balance_submitted_at)}</span>
            : <span className="text-light">Booked. Waiting for the {peso(balance)} balance (due before the album prints).</span>}
          {b.balance_proof_path && (
            <button onClick={() => void openReceipt(b.balance_proof_path!)} className="h-8 px-3 rounded-lg bg-[#E8F0FE] font-medium text-[#2F5BB7] flex items-center gap-1">
              <Receipt size={13} /> Balance receipt
            </button>
          )}
          <button onClick={() => void confirm('balance')} disabled={saving} data-testid="booking-mark-balance"
            className="h-8 px-3 rounded-lg bg-[#E6F4EA] font-medium text-success flex items-center gap-1 disabled:opacity-50">
            <Check size={13} /> Mark balance paid
          </button>
        </div>
      )}

      {dealEditable && (
        model
          ? <DealEditor b={b} model={model} saving={saving} onSend={(d, cost) => run(() => setBookingDeal(b.id, d, cost))} />
          : <p className="mt-3 text-xs text-red-600">Your cost model didn’t load, so a deal can’t be priced right now. Refresh to try again.</p>
      )}

      {(open || b.status === 'booked' || b.status === 'paid') && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          {!closing ? (
            <>
              {open && (
                <button onClick={() => setClosing('declined')} className="h-8 px-3 rounded-lg border border-line text-medium" data-testid="booking-decline">Decline</button>
              )}
              <button onClick={() => setClosing('cancelled')} className="h-8 px-3 rounded-lg border border-line text-medium" data-testid="booking-owner-cancel">Cancel booking</button>
            </>
          ) : (
            <>
              <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder="Reason the host will see (optional)"
                className="h-8 px-2 rounded-lg border border-line text-xs outline-none focus:border-peach w-64" data-testid="booking-close-reason" />
              <button onClick={() => void run(() => closeBooking(b.id, closing, reason))} disabled={saving} data-testid="booking-close-yes"
                className="h-8 px-3 rounded-lg bg-[#FDE7E7] font-medium text-[#C0392B]">
                Yes, {closing === 'declined' ? 'decline' : 'cancel'} {b.booking_number}
              </button>
              <button onClick={() => { setClosing(null); setReason(''); }} className="h-8 px-3 rounded-lg border border-line text-medium">Keep it</button>
            </>
          )}
        </div>
      )}
      {err && <p className="text-xs text-red-600 mt-2" role="alert" data-testid="booking-row-error">{err}</p>}
    </div>
  );
}

const num = (s: string) => {
  const t = s.trim().replace(/[₱,\s]/g, '');
  return t === '' ? NaN : Number(t);
};

function DealEditor({ b, model, saving, onSend }: {
  b: EventBooking; model: PricingModel; saving: boolean; onSend: (d: DealDraft, cost: ReturnType<typeof costToMake>) => Promise<void>;
}) {
  const sizes = ALBUM_SIZES.filter((s) => model.sizes[s.preset]);
  const [size, setSize] = useState<DealDraft['size']>(b.deal_album_size ?? (model.sizes['8x8'] ? '8x8' : sizes[0]?.preset ?? '8x8'));
  const [cover, setCover] = useState<DealDraft['cover']>(b.deal_cover ?? 'hard');
  const [pages, setPages] = useState(String(b.deal_pages ?? model.min_pages));
  const [other, setOther] = useState('');
  const [total, setTotal] = useState(b.deal_total != null ? String(b.deal_total) : '');
  const [deposit, setDeposit] = useState(b.deal_deposit != null ? String(b.deal_deposit) : '');
  const [includes, setIncludes] = useState(b.deal_includes ?? '');
  // The problem shows once Send was tried, and follows the fields from then
  // on: a fixed deposit clears it (a stale "too low" under a good deposit
  // misled, walk 2026-10-10).
  const [tried, setTried] = useState(false);

  const draft: DealDraft = {
    size, cover, pages: Number(pages), otherCosts: Number.isFinite(num(other)) ? num(other) : 0,
    total: num(total), deposit: num(deposit), includes,
  };
  const cost = useMemo(
    () => costToMake(model, b.guest_count, { size, cover, pages: Number(pages) || model.min_pages, otherCosts: draft.otherCosts }),
    [model, b.guest_count, size, cover, pages, draft.otherCosts],
  );
  const extra = Number.isFinite(draft.deposit) ? draft.deposit - cost.total : NaN;
  const problem = tried ? dealProblem(draft, cost, model.min_pages) : null;

  const send = async () => {
    setTried(true);
    if (dealProblem(draft, cost, model.min_pages)) return;
    await onSend(draft, cost);
  };

  const input = 'h-8 px-2 rounded-lg border border-line text-sm outline-none focus:border-peach bg-white';
  return (
    <div className="mt-3 rounded-lg border border-line-soft p-3 space-y-2" data-testid="deal-editor">
      <p className="text-xs font-semibold text-dark">{b.status === 'quoted' ? 'Change the deal' : 'Set the deal'}</p>
      <div className="flex flex-wrap items-center gap-2 text-xs text-medium">
        <label className="flex items-center gap-1">Album
          <select value={size} onChange={(e) => setSize(e.target.value as DealDraft['size'])} className={input} data-testid="deal-size">
            {sizes.map((s) => <option key={s.preset} value={s.preset}>{s.name}</option>)}
          </select>
        </label>
        <select value={cover} onChange={(e) => setCover(e.target.value as DealDraft['cover'])} className={input} data-testid="deal-cover" aria-label="Cover">
          <option value="hard">Hardbound</option>
          <option value="soft">Softcover</option>
        </select>
        <label className="flex items-center gap-1">Pages
          <input value={pages} onChange={(e) => setPages(e.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric" className={`${input} w-16`} data-testid="deal-pages" />
        </label>
        <label className="flex items-center gap-1">Other costs ₱
          <input value={other} onChange={(e) => setOther(e.target.value)} inputMode="decimal" placeholder="table cards, travel…" className={`${input} w-36`} data-testid="deal-other" />
        </label>
      </div>
      <p className="text-xs text-medium" data-testid="deal-cost">
        Cost to make: <b className="text-dark">{peso(cost.total)}</b> (album {peso(cost.album)} + photo storage {peso(cost.storage)}{cost.other ? ` + other ${peso(cost.other)}` : ''})
      </p>
      <div className="flex flex-wrap items-center gap-2 text-xs text-medium">
        <label className="flex items-center gap-1">Total ₱
          <input value={total} onChange={(e) => setTotal(e.target.value)} inputMode="decimal" className={`${input} w-28`} data-testid="deal-total" />
        </label>
        <label className="flex items-center gap-1">Deposit ₱
          <input value={deposit} onChange={(e) => setDeposit(e.target.value)} inputMode="decimal" className={`${input} w-28`} data-testid="deal-deposit" />
        </label>
        {Number.isFinite(extra) && (
          <span className={extra > 0 ? 'text-success' : 'text-[#C0392B]'} data-testid="deal-extra">
            {extra > 0
              ? `Deposit covers the cost + ${peso(extra)} extra`
              : extra === 0
                ? 'Deposit only equals the cost. It has to be more.'
                : `Deposit is ${peso(-extra)} short of the cost`}
          </span>
        )}
      </div>
      <textarea value={includes} onChange={(e) => setIncludes(e.target.value)} rows={2} maxLength={2000}
        placeholder="What's included, as the host will read it (e.g. table QR cards for 20 tables, the venue screen)"
        className="w-full px-2 py-1.5 rounded-lg border border-line text-sm outline-none focus:border-peach" data-testid="deal-includes" />
      <button onClick={() => void send()} disabled={saving} data-testid="deal-send"
        className="h-9 px-4 rounded-lg text-white text-sm font-semibold disabled:opacity-60" style={{ background: '#BF5E3E' }}>
        {b.status === 'quoted' ? 'Send the new deal' : 'Send this deal'}
      </button>
      {problem && <p className="text-xs text-red-600" role="alert" data-testid="deal-problem">{problem}</p>}
    </div>
  );
}
