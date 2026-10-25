// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/* ═══════════════════════════════════════════════════════════════════════════
   "ASKED TO PAY" ON THE ORDERS PAGE (owner, 2026-10-26). The total the Pay
   screen showed, as the database saved it (0055), on each order: what the
   GoTyme deposit should match. Owner only; an event album is paid by its
   booking instead; orders placed before 0055 have none.
   ═══════════════════════════════════════════════════════════════════════════ */

vi.mock('../../lib/supabase', () => ({
  supabaseConfigured: true,
  supabase: {
    rpc: async () => ({ data: null, error: null }),
    from: () => ({ update: () => ({ eq: async () => ({ error: null }) }) }),
    storage: { from: () => ({ createSignedUrl: async () => ({ data: null, error: null }) }) },
  },
}));
vi.mock('../../lib/pressSheetFiles', () => ({
  downloadAlbumSheets: vi.fn(), downloadCoverSheet: vi.fn(), downloadPressTestSheet: vi.fn(), downloadSheetsAsJpeg: vi.fn(),
  downloadPrintFile: vi.fn(), downloadCoverFile: vi.fn(), orderSpine: () => 'spine',
}));

import OrdersPanel from './OrdersPanel';
import type { AdminOrder } from '../../lib/adminOrders';

const order = (over: Partial<AdminOrder> = {}): AdminOrder => ({
  id: 'o1', order_number: 'MP-2026-TEST001', status: 'pending_payment', payment_status: 'unpaid', amount: null, currency: 'PHP',
  album_size: '6x6', material: 'matte', cover: 'softcover', page_count: 46, hosting_years: 10, hd_memories: true,
  ship_name: 'Ana Reyes', ship_phone: null, ship_address: null, tracking: null,
  payment_reference: '1234 5678', payment_proof_path: null, payment_submitted_at: '2026-10-26T01:00:00Z',
  created_at: '2026-10-26T00:00:00Z', updated_at: '2026-10-26T00:00:00Z',
  quoted_amount: 1078,
  quote: { qr: 9, album: 890, total: 1078, years: 10, hd_fee: 49, qr_fee: 40, extra_qr: 2, term_fee: 99, extra_pages: 6, extra_pages_fee: 0 },
  ...over,
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement;
let root: Root;
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); });

const render = async (o: AdminOrder, owner = true) => {
  await act(async () => {
    root.render(createElement(OrdersPanel, {
      orders: [o], onChanged: async () => {}, canSeeFinancials: owner, printReadyIds: new Set(['o1']), coverReadyIds: new Set(['o1']),
    }));
  });
};
const quoted = () => host.querySelector('[data-testid="order-quoted"]');

describe('"Asked to pay" on an order', () => {
  it('the owner sees the total and what it is made of', async () => {
    await render(order());
    expect(quoted()?.textContent).toBe('Asked to pay ₱1,078 · album ₱890 + 2 extra QR ₱40 + 10 years ₱99 + HD ₱49');
  });

  it('the shop does not (the database sends them none either)', async () => {
    await render(order(), false);
    expect(quoted()).toBeNull();
  });

  it('an event album is paid by its booking: no amount to match', async () => {
    await render(order({ event_booking_number: 'EV-2026-ABCDEFG' }));
    expect(quoted()).toBeNull();
  });

  it('an order placed before the total was saved shows nothing, never ₱0', async () => {
    await render(order({ quoted_amount: null, quote: null }));
    expect(quoted()).toBeNull();
  });
});
