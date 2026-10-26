// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/* ═══════════════════════════════════════════════════════════════════════════
   A TESTER ORDER ON THE ORDERS PAGE (owner, 2026-10-26: "order arrives Paid
   and marked as a tester order"). Everyone in the shop sees the tag, so a test
   isn't printed by mistake; the owner also sees what it would have cost.
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

const quote = { qr: 9, album: 890, total: 1078, years: 10, hd_fee: 49, qr_fee: 40, extra_qr: 2, term_fee: 99, extra_pages: 6, extra_pages_fee: 0 };
const order = (over: Partial<AdminOrder> = {}): AdminOrder => ({
  id: 'o1', order_number: 'MP-2026-TEST001', status: 'paid', payment_status: 'paid', amount: 0, currency: 'PHP',
  album_size: '6x6', material: 'matte', cover: 'softcover', page_count: 46, hosting_years: 10, hd_memories: true,
  ship_name: 'Ana Reyes', ship_phone: null, ship_address: null, tracking: null,
  payment_reference: null, payment_proof_path: null, payment_submitted_at: null,
  created_at: '2026-10-26T00:00:00Z', updated_at: '2026-10-26T00:00:00Z',
  quoted_amount: 0, tester_code: 'MEGYTEST',
  quote: { ...quote, tester: { code: 'MEGYTEST', real_total: 1078 } },
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
const $ = (id: string) => host.querySelector(`[data-testid="${id}"]`);

describe('a tester order', () => {
  it('is tagged for everyone in the shop, owner or not', async () => {
    await render(order(), false);
    expect($('order-tester')?.textContent).toBe('Tester order · MEGYTEST');
    expect($('order-quoted')).toBeNull(); // the money stays the owner's
  });

  it('the owner sees ₱0 asked, the code, and the real price in its parts', async () => {
    await render(order());
    expect($('order-tester')?.textContent).toBe('Tester order · MEGYTEST');
    expect($('order-quoted')?.textContent).toBe('Asked to pay ₱0 with tester code MEGYTEST · real price ₱1,078: album ₱890 + 2 extra QR ₱40 + 10 years ₱99 + HD ₱49');
  });

  it('an order without the code has no tag and reads as before', async () => {
    await render(order({ tester_code: null, quoted_amount: 1078, quote, status: 'pending_payment', payment_status: 'unpaid', amount: null }));
    expect($('order-tester')).toBeNull();
    expect($('order-quoted')?.textContent).toBe('Asked to pay ₱1,078 · album ₱890 + 2 extra QR ₱40 + 10 years ₱99 + HD ₱49');
  });
});
