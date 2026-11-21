// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/* ═══════════════════════════════════════════════════════════════════════════
   A DELIVERED ORDER WITH NO PRINT FILE IS NOT A FAULT (0064). The nightly job
   removes a delivered order's print and cover files DELIVERED_FILES_KEEP_DAYS
   after delivery, so the red "Print file missing" (do not print!) must not
   show for it: it gets a quiet grey "Delivered · print file not kept" that
   says how to reprint. Every other order with no print file keeps the red.
   ═══════════════════════════════════════════════════════════════════════════ */

vi.mock('../../lib/supabase', () => ({
  supabaseConfigured: true,
  supabase: {
    rpc: async () => ({ data: null, error: null }),
    from: () => ({ update: () => ({ eq: async () => ({ error: null }) }) }),
    storage: { from: () => ({ createSignedUrl: async () => ({ data: { signedUrl: 'https://example.test/r' }, error: null }) }) },
  },
}));
vi.mock('../../lib/pressSheetFiles', () => ({
  downloadAlbumSheets: vi.fn(), downloadCoverSheet: vi.fn(), downloadPressTestSheet: vi.fn(), downloadSheetsAsJpeg: vi.fn(),
  downloadPrintFile: vi.fn(), downloadCoverFile: vi.fn(), orderSpine: () => 'spine',
}));

import OrdersPanel from './OrdersPanel';
import type { AdminOrder } from '../../lib/adminOrders';
import { DELIVERED_FILES_KEEP_DAYS } from '../../lib/orderExpiry';

const base: AdminOrder = {
  id: 'o1', order_number: 'MP-2026-TEST001', status: 'delivered', payment_status: 'paid', amount: 1500, currency: 'PHP',
  album_size: '6x6', material: 'matte', cover: 'softcover', page_count: 40, hosting_years: 10, hd_memories: false,
  ship_name: 'Test Customer', ship_phone: null, ship_address: null, tracking: null,
  payment_reference: null, payment_proof_path: null, payment_submitted_at: null,
  created_at: '2026-06-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z',
};

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement;
let root: Root;
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); });

const render = async (order: AdminOrder, ready: boolean) => {
  await act(async () => {
    root.render(createElement(OrdersPanel, {
      orders: [order], onChanged: async () => {}, canSeeFinancials: true,
      printReadyIds: new Set(ready ? ['o1'] : []), coverReadyIds: new Set(ready ? ['o1'] : []),
    }));
  });
};
const grey = () => host.querySelector('[data-testid="order-print-file-not-kept"]');
const red = () => host.querySelector('[data-testid="order-print-file-missing"]');

describe('a delivered order whose print file was removed', () => {
  it('shows the quiet "not kept" label with how to reprint, not the red warning', async () => {
    await render(base, false);
    expect(red()).toBeNull();
    expect(grey()?.textContent).toBe('Delivered · print file not kept');
    expect(grey()?.getAttribute('title')).toContain(`${DELIVERED_FILES_KEEP_DAYS} days`);
    expect(grey()?.getAttribute('title')).toContain('orders it again');
  });
  it('shows neither while the file is still there', async () => {
    await render(base, true);
    expect(red()).toBeNull();
    expect(grey()).toBeNull();
  });
});

describe('any other order with no print file', () => {
  it.each(['paid', 'in_production', 'printed', 'shipped', 'pending_payment'] as const)('%s: still the red "Print file missing"', async (status) => {
    await render({ ...base, status }, false);
    expect(grey()).toBeNull();
    expect(red()?.textContent).toContain('Print file missing');
  });
});
