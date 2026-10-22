/* Orders tab — the fulfillment queue. Status changes go through the status-only
   DB function (safe for fulfillment). Price + Mark-paid are FINANCIAL and only
   render when canSeeFinancials (owner) — fulfillment never sees the peso amount. */

import { useState } from 'react';
import { Loader2, Check, Download, AlertTriangle, Receipt, Printer, FileImage } from 'lucide-react';
import {
  type AdminOrder, type OrderPatch, ORDER_STATUSES, STATUS_LABELS, updateOrder, setOrderStatus, printFilesOf,
} from '../../lib/adminOrders';
import { supabase } from '../../lib/supabase';
import {
  downloadAlbumSheets, downloadCoverSheet, downloadPressTestSheet, downloadSheetsAsJpeg, downloadPrintFile, downloadCoverFile, orderSpine,
} from '../../lib/pressSheetFiles';

export default function OrdersPanel({ orders, onChanged, canSeeFinancials, printReadyIds, coverReadyIds = null }: {
  orders: AdminOrder[];
  onChanged: () => Promise<void>;
  canSeeFinancials: boolean;
  /** Order ids that have a "<id>.pdf" in the private print-pdfs bucket. Any
   *  order NOT in this set is missing its print file and must not be fulfilled blind. */
  printReadyIds: Set<string>;
  /** Order ids that have their "<id>-cover.pdf"; null while unknown. */
  coverReadyIds?: Set<string> | null;
}) {
  if (orders.length === 0) {
    return <p className="text-sm text-light py-16 text-center">No orders yet.</p>;
  }
  return (
    <div className="space-y-3">
      <PressHowTo />
      {orders.map((o) => {
        const files = printFilesOf(o);
        const printReady = printReadyIds.has(files);
        return <OrderRow key={o.id} o={o} onChanged={onChanged} canSeeFinancials={canSeeFinancials} printReady={printReady}
          coverMissing={printReady && coverReadyIds !== null && !coverReadyIds.has(files) && COVER_STILL_NEEDED.includes(o.status)} />;
      })}
    </div>
  );
}

/** Until it's printed, a missing cover still matters. */
const COVER_STILL_NEEDED: AdminOrder['status'][] = ['pending_payment', 'paid', 'in_production'];
/** Orders froze the album's cover design from 0036 (applied 2026-10-04). */
const COVER_SAVED_WITH_ALBUM_SINCE = '2026-10-04';

/** How to print on the shop's 12.5 × 19 sheets, and the one-sheet printer check. */
function PressHowTo() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const testSheet = async () => {
    setBusy(true); setErr(null);
    try { await downloadPressTestSheet(); } catch (e) { setErr(e instanceof Error ? e.message : 'Could not make the test sheet.'); }
    setBusy(false);
  };
  return (
    <details className="rounded-xl border border-line bg-white p-4" data-testid="press-how-to">
      <summary className="cursor-pointer text-sm font-semibold text-dark">How to print on 12.5 × 19 sheets</summary>
      <ol className="mt-3 space-y-1.5 text-sm text-medium list-decimal pl-5">
        <li>Print the test sheet once first. It checks the size, the edge and the flip.</li>
        <li><b>Print sheets</b>: print both sides, flip on the long edge, at actual size (100%). Don't use "fit to page".</li>
        <li>The pages are in order: sheet 1 has the first ones (1, 3, 5… on the front, 2, 4, 6… on the back). Cut each sheet on the marks. On 6×4, 6×6, 6×8 and 8×6 the pages touch each other: cut exactly on the marks, and across the sheet along the edges of the small black blocks.</li>
        <li>Stack the pieces front side up in page order: left to right, top to bottom, sheet 1&apos;s on top, then sheet 2&apos;s, and so on. The pages are now in order.</li>
        <li>Blank sides: orders from 21 Oct 2026 start with page 1, and end with a blank side when the album has an odd number of pages. Older orders start with a blank side (it faces the inside of the front cover), and end with one when the page count is even. After <b>Print sheets</b>, the line under the order says which.</li>
        <li><b>Cover sheet</b>: print one side only. Cut on the marks; the dashed marks are the spine edges.</li>
        <li><b>Sheets as JPEG</b>: the same sheets and cover sheet as 300 DPI pictures in one zip, for a printer that can't open the PDF. Each picture is one side of a sheet, numbered in print order: print them in number order, both sides (01 on the front of sheet 1, 02 on its back, 03 on the front of sheet 2…), at actual size (100%).</li>
      </ol>
      <button onClick={testSheet} disabled={busy}
        className="mt-3 h-9 px-4 rounded-lg bg-paper text-sm font-medium text-dark flex items-center gap-2 disabled:opacity-50">
        {busy ? <Loader2 size={14} className="animate-spin" /> : <Printer size={14} />} Download printer test sheet
      </button>
      {err && <p className="text-xs text-red-600 mt-2">{err}</p>}
    </details>
  );
}

function OrderRow({ o, onChanged, canSeeFinancials, printReady, coverMissing }: {
  o: AdminOrder; onChanged: () => Promise<void>; canSeeFinancials: boolean; printReady: boolean; coverMissing?: boolean;
}) {
  const [saving, setSaving] = useState(false);
  const [price, setPrice] = useState(o.amount != null ? String(o.amount) : '');
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  // What a long download is doing ("Making the JPEG pictures: 3 of 25…").
  const [progress, setProgress] = useState<string | null>(null);

  // The print files, as they are or laid out on the shop's 12.5 × 19 sheet
  // (pressSheetFiles). None of them has a font.
  const pressFile = async (make: (progress: (line: string) => void) => Promise<string>) => {
    setSaving(true); setErr(null); setNote(null); setProgress(null);
    try { setNote(await make(setProgress)); } catch (e) { setErr(e instanceof Error ? e.message : 'Could not make the sheet file.'); }
    setProgress(null);
    setSaving(false);
  };

  const run = async (fn: () => Promise<string | null>) => {
    setSaving(true); setErr(null);
    const e = await fn();
    if (e) setErr(e); else await onChanged();
    setSaving(false);
  };
  const saveFin = (patch: OrderPatch) => run(() => updateOrder(o.id, patch));
  const changeStatus = (status: AdminOrder['status']) => run(() => setOrderStatus(o.id, status));

  // Commit the manually-typed price. The raw input is free text, so a comma,
  // a peso sign, or a stray letter would make `Number(price)` NaN — which
  // supabase-js serializes to null, leaving the order LOOKING priced (the input
  // showed a number) while amount is actually null. Sanitize, then only save a
  // finite positive amount; an empty field explicitly clears the price.
  const commitPrice = () => {
    const raw = price.trim().replace(/[₱,\s]/g, '');
    if (raw === '') { saveFin({ amount: null }); return; }
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) { setErr('Enter a valid peso amount (numbers only).'); return; }
    saveFin({ amount: n });
  };

  // The customer's receipt (0033) — private bucket, operators only.
  const openReceipt = async () => {
    if (!o.payment_proof_path) return;
    setSaving(true); setErr(null);
    const { data, error } = await supabase.storage
      .from('payment-proofs')
      .createSignedUrl(o.payment_proof_path, 120);
    setSaving(false);
    if (error || !data?.signedUrl) { setErr('Receipt is not readable right now.'); return; }
    window.open(data.signedUrl, '_blank');
  };

  const paid = o.payment_status === 'paid';
  const date = o.created_at.slice(0, 10);
  const saysPaid = !paid && !!o.payment_submitted_at;

  return (
    <div className="rounded-xl border border-line bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-dark">{o.order_number}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full ${paid ? 'bg-[#E6F4EA] text-success' : saysPaid ? 'bg-[#E8F0FE] text-[#2F5BB7]' : 'bg-[#FFF3E0] text-[#B8791F]'}`}
              title={saysPaid ? `Customer marked it sent on ${o.payment_submitted_at!.slice(0, 16).replace('T', ' ')} — match it in the GoTyme app, then Mark paid.` : undefined}>
              {paid ? 'Paid' : saysPaid ? 'Customer says paid' : 'Unpaid'}
            </span>
            {o.copy_of_order_number && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-[#F1ECFF] text-[#7A5EC9]" data-testid="order-copy-of"
                title="A guest's copy of an event album: print it from that order's files (Print PDF and Cover PDF here already do).">
                Copy of {o.copy_of_order_number}
              </span>
            )}
            {o.event_booking_number && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-[#E6F4EA] text-success" data-testid="order-event-album"
                title="An event album: paid by its booking, not by transfer.">
                Event album · {o.event_booking_number}
              </span>
            )}
            {!printReady && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-[#FDE7E7] text-[#C0392B] flex items-center gap-1"
                title="No print-ready PDF is in the fulfillment bucket for this order. Do not print until the customer re-orders from the device that holds the photos.">
                <AlertTriangle size={12} /> Print file missing
              </span>
            )}
            {coverMissing && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-[#FDE7E7] text-[#C0392B] flex items-center gap-1" data-testid="order-cover-missing"
                title={o.created_at < COVER_SAVED_WITH_ALBUM_SINCE
                  // my_orders_missing_cover (0051) skips orders that froze no cover design.
                  ? "The cover file didn't arrive, and this order is from before covers were saved with the album, so the customer gets no Send the cover button. Message them about the cover."
                  : "The cover file didn't arrive. Only the customer's phone can make it (the photos are there): ask them to open Your orders on the phone they made the album on and tap Send the cover."}>
                <AlertTriangle size={12} /> Cover missing
              </span>
            )}
          </div>
          <div className="text-xs text-light mt-1">
            {o.ship_name || '—'}{o.ship_phone ? ` · ${o.ship_phone}` : ''} · {date}
          </div>
          <div className="text-xs text-light">
            {[o.album_size, o.material, o.cover].filter(Boolean).join(' · ') || '—'} · {o.page_count} pages · <span data-testid="order-spine">{orderSpine(o)}</span>{o.hosting_years ? ` · memories ${o.hosting_years} yrs` : ''}{o.hd_memories ? ' · HD' : ''}
          </div>
          {o.ship_address && <div className="text-xs text-[#B9B9B9] mt-0.5 max-w-md">{o.ship_address}</div>}
          {(o.payment_reference || o.payment_submitted_at) && (
            <div className="text-xs text-medium mt-1">
              Transfer{o.payment_reference ? <> ref <span className="font-mono text-dark">{o.payment_reference}</span></> : ' sent'}
              {o.payment_submitted_at ? ` · ${o.payment_submitted_at.slice(0, 16).replace('T', ' ')}` : ''}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {canSeeFinancials && (
            <>
              <div className="flex items-center gap-1">
                <span className="text-sm text-light">₱</span>
                <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="numeric" placeholder="price"
                  className="w-20 h-8 px-2 rounded-lg border border-line text-sm outline-none focus:border-peach" />
                <button onClick={commitPrice} disabled={saving}
                  className="h-8 px-2 rounded-lg bg-paper text-xs text-medium disabled:opacity-50">Set</button>
              </div>
              {!paid && (
                <button onClick={() => saveFin({ payment_status: 'paid', status: 'paid' })} disabled={saving}
                  className="h-8 px-3 rounded-lg bg-[#E6F4EA] text-xs font-medium text-success flex items-center gap-1 disabled:opacity-50">
                  <Check size={13} /> Mark paid
                </button>
              )}
            </>
          )}
          {o.payment_proof_path && (
            <button onClick={openReceipt} disabled={saving}
              className="h-8 px-3 rounded-lg bg-[#E8F0FE] text-xs font-medium text-[#2F5BB7] flex items-center gap-1 disabled:opacity-50">
              <Receipt size={13} /> Receipt
            </button>
          )}
          {paid && (
            <button onClick={() => pressFile(() => downloadAlbumSheets(o))} disabled={saving} data-testid="order-print-sheets"
              title="The album pages laid out on 12.5 × 19 sheets, both sides, with cut marks."
              className="h-8 px-3 rounded-lg bg-[#E6F4EA] text-xs font-medium text-success flex items-center gap-1 disabled:opacity-50">
              <Printer size={13} /> Print sheets
            </button>
          )}
          {paid && (
            <button onClick={() => pressFile(() => downloadCoverSheet(o))} disabled={saving} data-testid="order-cover-sheet"
              title="The cover on one 12.5 × 19 sheet, with cut and spine marks."
              className="h-8 px-3 rounded-lg bg-[#E6F4EA] text-xs font-medium text-success flex items-center gap-1 disabled:opacity-50">
              <Printer size={13} /> Cover sheet
            </button>
          )}
          {paid && (
            <button onClick={() => pressFile((p) => downloadSheetsAsJpeg(o, p))} disabled={saving} data-testid="order-sheets-jpeg"
              title="Every sheet side and the cover sheet as 300 DPI JPEG pictures, in one zip, for a printer that can't open the PDF."
              className="h-8 px-3 rounded-lg bg-[#E6F4EA] text-xs font-medium text-success flex items-center gap-1 disabled:opacity-50">
              <FileImage size={13} /> Sheets as JPEG
            </button>
          )}
          {paid && (
            <button onClick={() => pressFile(() => downloadPrintFile(o))} disabled={saving} data-testid="order-print-pdf"
              className="h-8 px-3 rounded-lg bg-blush text-xs font-medium text-[#C98A5E] flex items-center gap-1 disabled:opacity-50">
              <Download size={13} /> Print PDF
            </button>
          )}
          {paid && (
            <button onClick={() => pressFile(() => downloadCoverFile(o))} disabled={saving} data-testid="order-cover-pdf"
              className="h-8 px-3 rounded-lg bg-[#F1ECFF] text-xs font-medium text-[#7A5EC9] flex items-center gap-1 disabled:opacity-50">
              <Download size={13} /> Cover PDF
            </button>
          )}
          <select value={o.status} onChange={(e) => changeStatus(e.target.value as AdminOrder['status'])} disabled={saving}
            className="h-8 px-2 rounded-lg border border-line text-sm outline-none focus:border-peach bg-white">
            {ORDER_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
          </select>
          {saving && <Loader2 size={15} className="animate-spin text-light" />}
        </div>
      </div>
      {err && <p className="text-xs text-red-600 mt-2">{err}</p>}
      {progress && saving && <p className="text-xs text-medium mt-2 flex items-center gap-1.5" data-testid="order-press-progress"><Loader2 size={12} className="animate-spin" /> {progress}</p>}
      {note && !err && <p className="text-xs text-success mt-2" data-testid="order-press-note">✓ {note}</p>}
    </div>
  );
}
