// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/* ═══════════════════════════════════════════════════════════════════════════
   "PAID" IN THE STATUS DROPDOWN = MARK PAID (owner, 2026-10-26: "make choosing
   Paid in the status dropdown do exactly what Mark paid does (including the
   memory years)"). The dropdown went through set_order_status, which marks the
   payment paid but never ran apply_order_hosting_term, so a customer who
   bought more memory years than the included term kept the included term.
   ═══════════════════════════════════════════════════════════════════════════ */

const h = vi.hoisted(() => ({ calls: [] as unknown[][] }));
vi.mock('../../lib/supabase', () => ({
  supabaseConfigured: true,
  supabase: {
    rpc: async (name: string, args: unknown) => { h.calls.push(['rpc', name, args]); return { data: null, error: null }; },
    from: (table: string) => ({
      update: (patch: unknown) => ({
        eq: async (col: string, val: unknown) => { h.calls.push(['update', table, patch, col, val]); return { error: null }; },
      }),
    }),
    storage: { from: () => ({ createSignedUrl: async () => ({ data: { signedUrl: 'https://example.test/r' }, error: null }) }) },
  },
}));
vi.mock('../../lib/pressSheetFiles', () => ({
  downloadAlbumSheets: vi.fn(), downloadCoverSheet: vi.fn(), downloadPressTestSheet: vi.fn(), downloadSheetsAsJpeg: vi.fn(),
  downloadPrintFile: vi.fn(), downloadCoverFile: vi.fn(), orderSpine: () => 'spine',
}));

import OrdersPanel from './OrdersPanel';
import type { AdminOrder } from '../../lib/adminOrders';

const order: AdminOrder = {
  id: 'o1', order_number: 'MP-2026-TEST001', status: 'pending_payment', payment_status: 'pending', amount: 1500, currency: 'PHP',
  album_size: '6x6', material: 'matte', cover: 'softcover', page_count: 40, hosting_years: 10, hd_memories: false,
  ship_name: 'Ana Reyes', ship_phone: null, ship_address: null, tracking: null,
  payment_reference: '1234 5678', payment_proof_path: null, payment_submitted_at: '2026-10-26T01:00:00Z',
  created_at: '2026-10-26T00:00:00Z', updated_at: '2026-10-26T00:00:00Z',
};

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement;
let root: Root;
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); h.calls = []; });
afterEach(() => { act(() => root.unmount()); host.remove(); });

const settle = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
const render = async (owner: boolean) => {
  await act(async () => {
    root.render(createElement(OrdersPanel, {
      orders: [order], onChanged: async () => {}, canSeeFinancials: owner, printReadyIds: new Set(['o1']), coverReadyIds: new Set(['o1']),
    }));
  });
  await settle();
};
const markPaidButton = () => [...host.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Mark paid') ?? null;
const pick = async (status: string) => {
  const select = host.querySelector('select') as HTMLSelectElement;
  expect(select).not.toBeNull();
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(select, status);
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await settle();
};

describe('owner: "Paid" in the status dropdown', () => {
  it('sends exactly what Mark paid sends: the payment and the order paid, then the memory years', async () => {
    await render(true);
    const button = markPaidButton();
    expect(button).not.toBeNull();
    await act(async () => { button!.click(); });
    await settle();
    const markPaid = h.calls;
    expect(markPaid).toEqual([
      ['update', 'orders', { payment_status: 'paid', status: 'paid' }, 'id', 'o1'],
      ['rpc', 'apply_order_hosting_term', { p_order_id: 'o1' }],
    ]);

    h.calls = [];
    await pick('paid');
    expect(h.calls).toEqual(markPaid);
  });

  it('every other status still goes through the status-only function, and nothing else', async () => {
    await render(true);
    await pick('in_production');
    expect(h.calls).toEqual([['rpc', 'set_order_status', { p_id: 'o1', p_status: 'in_production' }]]);
  });
});

describe('fulfillment (the shop): "Paid" in the status dropdown', () => {
  it('has no Mark paid, and "Paid" stays the server\'s call (it refuses it there), never a direct write', async () => {
    await render(false);
    expect(markPaidButton()).toBeNull();
    await pick('paid');
    expect(h.calls).toEqual([['rpc', 'set_order_status', { p_id: 'o1', p_status: 'paid' }]]);
  });
});
