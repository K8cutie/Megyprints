/* Overview tab — at-a-glance fulfillment stats from the orders table. */

import { useMemo } from 'react';
import { type AdminOrder, STATUS_LABELS, type OrderStatus } from '../../lib/adminOrders';

const OPEN_STATUSES: OrderStatus[] = ['paid', 'in_production', 'printed'];

export default function OverviewPanel({ orders }: { orders: AdminOrder[] }) {
  const stats = useMemo(() => {
    const byStatus = {} as Record<OrderStatus, number>;
    let revenue = 0;
    for (const o of orders) {
      byStatus[o.status] = (byStatus[o.status] ?? 0) + 1;
      if (o.payment_status === 'paid' && o.amount) revenue += Number(o.amount);
    }
    const toFulfill = OPEN_STATUSES.reduce((n, s) => n + (byStatus[s] ?? 0), 0);
    const awaitingPayment = byStatus.pending_payment ?? 0;
    return { total: orders.length, byStatus, revenue, toFulfill, awaitingPayment };
  }, [orders]);

  const cards = [
    { label: 'Total orders', value: stats.total },
    { label: 'Awaiting payment', value: stats.awaitingPayment },
    { label: 'To fulfill', value: stats.toFulfill, hint: 'paid · in production · printed' },
    { label: 'Revenue (paid)', value: `₱${stats.revenue.toLocaleString()}` },
  ];

  return (
    <div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {cards.map((c) => (
          <div key={c.label} className="rounded-xl border border-line bg-white p-4">
            <div className="text-2xl font-semibold text-dark">{c.value}</div>
            <div className="text-sm text-medium mt-1">{c.label}</div>
            {c.hint && <div className="text-xs text-[#B9B9B9] mt-0.5">{c.hint}</div>}
          </div>
        ))}
      </div>

      <h2 className="text-sm font-semibold text-dark mb-3">Orders by status</h2>
      <div className="rounded-xl border border-line bg-white divide-y divide-line-soft">
        {(Object.keys(STATUS_LABELS) as OrderStatus[]).map((s) => (
          <div key={s} className="flex items-center justify-between px-4 py-2.5 text-sm">
            <span className="text-ink-warm">{STATUS_LABELS[s]}</span>
            <span className="font-medium text-dark">{stats.byStatus[s] ?? 0}</span>
          </div>
        ))}
      </div>

      {orders.length === 0 && (
        <p className="text-sm text-light mt-6 text-center">
          No orders yet. They'll appear here the moment a customer checks out.
        </p>
      )}
    </div>
  );
}
