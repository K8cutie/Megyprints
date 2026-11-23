// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/* ═══════════════════════════════════════════════════════════════════════════
   EVERY PRINT DOWNLOAD IS LAID OUT ON THE PRESS SHEET (2026-11-23).

   The press takes one sheet, 12.5 × 19. The order row also had "Print PDF"
   and "Cover PDF": the phone's files, one loose album-size page per PDF page.
   For Megy Mini MP-2026-KG8EJAC the owner opened "Print PDF" and got 16 loose
   A5 pages: "Our printer can out 19.5 x 12 prints. What were you thinking."
   The loose-page buttons are gone; what is left is sheets only.
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
  orderSpine: () => 'stapled, no spine',
}));

import OrdersPanel from './OrdersPanel';
import type { AdminOrder } from '../../lib/adminOrders';

const paidOrder = (over: Partial<AdminOrder>): AdminOrder => ({
  id: 'o1', order_number: 'MP-2026-KG8EJAC', status: 'paid', payment_status: 'paid', amount: 570, currency: 'PHP',
  album_size: '5.8x8.3', material: 'glossy', cover: 'staple', page_count: 16, hosting_years: 5, hd_memories: false,
  ship_name: 'Test Customer', ship_phone: null, ship_address: null, tracking: null,
  payment_reference: null, payment_proof_path: null, payment_submitted_at: null,
  created_at: '2026-11-23T08:00:00Z', updated_at: '2026-11-23T08:00:00Z',
  quoted_amount: 570, tester_code: null, quote: null,
  ...over,
} as AdminOrder);

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement;
let root: Root;
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); });

const render = async (o: AdminOrder, owner: boolean) => {
  await act(async () => {
    root.render(createElement(OrdersPanel, {
      orders: [o], onChanged: async () => {}, canSeeFinancials: owner, printReadyIds: new Set(['o1']), coverReadyIds: new Set(['o1']),
    }));
  });
};
const buttonLabels = () => [...host.querySelectorAll('button')].map((b) => b.textContent?.trim() ?? '');

describe('a paid order: print downloads', () => {
  for (const [what, o] of [
    ['a Megy Mini', paidOrder({})],
    ['an album', paidOrder({ order_number: 'MP-2026-ALBUM01', album_size: '8x8', cover: 'softcover', material: 'matte', page_count: 40 })],
  ] as const) {
    for (const owner of [true, false]) {
      it(`${what} (${owner ? 'owner' : 'fulfillment'}): sheets only, no loose-page file`, async () => {
        await render(o, owner);
        expect(host.querySelector('[data-testid="order-print-sheets"]')).not.toBeNull();
        expect(host.querySelector('[data-testid="order-cover-sheet"]')).not.toBeNull();
        expect(host.querySelector('[data-testid="order-sheets-jpeg"]')).not.toBeNull();
        expect(host.querySelector('[data-testid="order-print-pdf"]')).toBeNull();
        expect(host.querySelector('[data-testid="order-cover-pdf"]')).toBeNull();
        expect(buttonLabels()).not.toContain('Print PDF');
        expect(buttonLabels()).not.toContain('Cover PDF');
      });
    }
  }
});
