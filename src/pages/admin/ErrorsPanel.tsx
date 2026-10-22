/* ══════════════════════════════════════════════════════════════════════════
   Errors — what went wrong on customers' phones (0051). A checkout lost its
   cover on 2026-10-22 and nobody knew: the report went to the phone's own
   console. Reports now land here, newest first, kept 30 days.
   Checkout and Your orders come first (a failure there can cost an order);
   everything else is folded below.
   ══════════════════════════════════════════════════════════════════════════ */

import { useEffect, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { fetchClientErrors, deviceOf, whereOf, isMoneyPath, type ClientError } from '../../lib/clientErrors';
import type { AdminOrder } from '../../lib/adminOrders';

const when = (iso: string) => new Date(iso).toLocaleString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export default function ErrorsPanel({ orders }: { orders: AdminOrder[] }) {
  const [rows, setRows] = useState<ClientError[] | null>(null);
  const [dropped, setDropped] = useState(0);
  const [err, setErr] = useState('');
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    fetchClientErrors()
      .then((r) => { if (alive) { setRows(r.rows); setDropped(r.droppedToday); } })
      .catch((e: Error) => { if (alive) setErr(e.message); });
    return () => { alive = false; };
  }, [tick]);
  const refresh = () => { setErr(''); setRows(null); setTick((n) => n + 1); };

  const orderNumber = (id: unknown) => (typeof id === 'string' ? orders.find((o) => o.id === id)?.order_number ?? `order ${id.slice(0, 8)}` : null);
  const money = rows?.filter(isMoneyPath) ?? [];
  const other = rows?.filter((r) => !isMoneyPath(r)) ?? [];

  return (
    <div className="space-y-4" data-testid="errors-panel">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-medium">Errors on customers' phones and computers, newest first. Kept 30 days.</p>
        <button type="button" onClick={refresh} className="text-sm text-medium flex items-center gap-1 px-3 py-1.5 rounded-lg hover:bg-paper shrink-0">
          <RefreshCw size={14} /> Refresh
        </button>
      </div>
      <p className="text-xs text-medium" data-testid="errors-not-proof">
        A customer's browser sends these, so they can be made up. Use them to find problems, never as proof of a payment.
      </p>
      {dropped > 0 && (
        <p className="text-sm text-[#C0392B]" role="status" data-testid="errors-dropped">
          {dropped} {dropped === 1 ? 'report was' : 'reports were'} turned away today by the daily limits, so some errors may be missing here.
        </p>
      )}
      {err && <p className="text-sm text-red-600" role="alert">Couldn't load errors: {err}</p>}
      {rows === null && !err && <div className="py-16 flex justify-center text-light"><Loader2 className="w-6 h-6 animate-spin" /></div>}
      {rows && (
        <>
          <section>
            <h2 className="text-sm font-semibold text-dark mb-2">Checkout and Your orders ({money.length})</h2>
            {money.length === 0
              ? <p className="text-sm text-light">None in the last 30 days.</p>
              : <ul className="space-y-2">{money.map((e) => <ErrorRow key={e.id} e={e} order={orderNumber(e.context?.orderId)} />)}</ul>}
          </section>
          <details className="bg-white rounded-xl border border-line px-4 py-3">
            <summary className="text-sm font-semibold text-dark cursor-pointer">Everything else ({other.length})</summary>
            {other.length === 0
              ? <p className="mt-2 text-sm text-light">None.</p>
              : <ul className="mt-3 space-y-2">{other.map((e) => <ErrorRow key={e.id} e={e} order={orderNumber(e.context?.orderId)} />)}</ul>}
          </details>
        </>
      )}
    </div>
  );
}

function ErrorRow({ e, order }: { e: ClientError; order: string | null }) {
  const page = e.url ? e.url.replace(/^https?:\/\/[^/]+/, '') || '/' : '';
  return (
    <li className="bg-white rounded-xl border border-line px-4 py-3 text-sm" data-testid="error-row">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-medium">
        <span>{when(e.created_at)}</span>
        <span className="font-semibold text-dark">{whereOf(e)}</span>
        {order && <span className="font-mono text-[#C98A5E]">{order}</span>}
        <span>{deviceOf(e.user_agent)}</span>
      </div>
      <p className="mt-1 text-dark break-words">{e.message}</p>
      {(e.stack || page) && (
        <details className="mt-1">
          <summary className="text-xs text-light cursor-pointer">Details</summary>
          {page && <p className="mt-1 text-xs text-medium break-all">Page: {page}</p>}
          {e.stack && <pre className="mt-1 text-[11px] text-medium whitespace-pre-wrap break-all max-h-48 overflow-auto">{e.stack}</pre>}
        </details>
      )}
    </li>
  );
}
