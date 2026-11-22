// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/* ═══════════════════════════════════════════════════════════════════════════
   AN ORDER THAT DIDN'T FINISH SENDING (MP-2026-9M5572U, 2026-11-22).

   A Megy Mini placed from the app: the order row, the cover and the first of
   its 4 videos arrived, then the phone stopped. The console showed only
   "Print file missing", and the order was moved to In production. Now
   (0068) the console says what never arrived and what the customer must do,
   Mark paid asks first, and In production is refused by the database (its
   words show under the order). Owner, 2026-11-22: "this is a bug if its paid
   and the order didnt push through".
   ═══════════════════════════════════════════════════════════════════════════ */

const mockDb = vi.hoisted(() => ({
  rpcs: [] as { name: string; args: unknown }[],
  updates: [] as unknown[],
  answer: {} as Record<string, { data: unknown; error: { message: string; code?: string } | null }>,
}));
vi.mock('../../lib/supabase', () => ({
  supabaseConfigured: true,
  supabase: {
    rpc: async (name: string, args: unknown) => { mockDb.rpcs.push({ name, args }); return mockDb.answer[name] ?? { data: null, error: null }; },
    from: () => ({ update: (p: unknown) => ({ eq: async () => { mockDb.updates.push(p); return { error: null }; } }) }),
    storage: { from: () => ({ createSignedUrl: async () => ({ data: null, error: null }) }) },
  },
}));
vi.mock('../../lib/pressSheetFiles', () => ({
  downloadAlbumSheets: vi.fn(), downloadCoverSheet: vi.fn(), downloadPressTestSheet: vi.fn(), downloadSheetsAsJpeg: vi.fn(),
  downloadPrintFile: vi.fn(), downloadCoverFile: vi.fn(), orderSpine: () => 'stapled, no spine',
}));

import OrdersPanel from './OrdersPanel';
import { fetchUnsentOrders, unsentNote, unsentWords, type AdminOrder } from '../../lib/adminOrders';

const MISSING = ['pages', 'video:83gph59m', 'video:ezftzzur', 'video:6nna5cr5', 'memory:6nna5cr5', 'memory:83gph59m', 'memory:ezftzzur', 'memory:k4jfdswb'];
const order = (over: Partial<AdminOrder> = {}): AdminOrder => ({
  id: 'o1', order_number: 'MP-2026-9M5572U', status: 'pending_payment', payment_status: 'unpaid', amount: null, currency: 'PHP',
  album_size: '5.8x8.3', material: 'glossy', cover: 'staple', page_count: 16, hosting_years: 5, hd_memories: false,
  ship_name: 'Test Customer', ship_phone: null, ship_address: null, tracking: null,
  payment_reference: null, payment_proof_path: null, payment_submitted_at: null,
  created_at: '2026-11-22T08:36:49Z', updated_at: '2026-11-22T08:36:49Z',
  quoted_amount: 570, tester_code: null, quote: null,
  ...over,
} as AdminOrder);

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
  mockDb.rpcs = []; mockDb.updates = []; mockDb.answer = {};
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.restoreAllMocks(); });

const render = async (o: AdminOrder, unsent: Map<string, string[]> | null) => {
  await act(async () => {
    root.render(createElement(OrdersPanel, {
      orders: [o], onChanged: async () => {}, canSeeFinancials: true, printReadyIds: new Set<string>(), coverReadyIds: new Set(['o1']), unsent,
    }));
  });
};
const $ = (id: string) => host.querySelector(`[data-testid="${id}"]`);

describe('the words', () => {
  it('what never arrived, as the database says it (0068 order_missing_words)', () => {
    expect(unsentWords(MISSING)).toBe('the pages, 3 memory videos and 4 QR codes');
    expect(unsentWords(['cover'])).toBe('the cover');
    expect(unsentWords(['pages', 'memory:abcd'])).toBe('the pages and 1 QR code');
  });
});

describe('the console', () => {
  it('says "Didn\'t finish sending", what never arrived and what the customer must do (not just "Print file missing")', async () => {
    await render(order(), new Map([['o1', MISSING]]));
    expect($('order-unsent')?.textContent).toContain("Didn't finish sending");
    expect($('order-unsent-note')?.textContent).toBe(unsentNote(MISSING));
    expect($('order-unsent-note')?.textContent).toContain('the pages, 3 memory videos and 4 QR codes never arrived');
    expect($('order-unsent-note')?.textContent).toContain('tap Finish sending');
    expect(host.textContent).not.toContain('Print file missing');
  });

  it('an order whose files are all in reads as before; a database before 0068 too', async () => {
    await render(order(), new Map());
    expect($('order-unsent')).toBeNull();
    expect(host.textContent).toContain('Print file missing'); // (this one has no pages file in the bucket)
    await render(order(), null);
    expect($('order-unsent')).toBeNull();
  });

  it('Mark paid on it asks first; "Cancel" leaves it unpaid', async () => {
    const ask = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await render(order(), new Map([['o1', MISSING]]));
    const select = host.querySelector('select') as HTMLSelectElement;
    await act(async () => { select.value = 'paid'; select.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(ask).toHaveBeenCalledWith("Order MP-2026-9M5572U didn't finish sending (the pages, 3 memory videos and 4 QR codes never arrived). Mark it paid anyway? It still can't go to production until the customer taps Finish sending.");
    expect(mockDb.updates).toEqual([]);
  });

  it('In production refused by the database (MP031): its words show under the order', async () => {
    const words = "This order didn't finish sending from the customer's phone: the pages, 3 memory videos and 4 QR codes never arrived, so it can't be printed yet.";
    mockDb.answer.set_order_status = { data: null, error: { code: 'MP031', message: words } };
    await render(order({ status: 'paid', payment_status: 'paid' }), new Map([['o1', MISSING]]));
    const select = host.querySelector('select') as HTMLSelectElement;
    await act(async () => { select.value = 'in_production'; select.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(host.textContent).toContain(words);
    expect(mockDb.rpcs.map((r) => r.name)).toEqual(['set_order_status']); // no term applied to a refused move
  });

  it('In production on a whole, paid order applies the memory term again (videos that arrived after Mark paid)', async () => {
    await render(order({ status: 'paid', payment_status: 'paid' }), new Map());
    const select = host.querySelector('select') as HTMLSelectElement;
    await act(async () => { select.value = 'in_production'; select.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(mockDb.rpcs.map((r) => r.name)).toEqual(['set_order_status', 'apply_order_hosting_term']);
  });
});

describe('reading it', () => {
  it('operator_orders_unsent for the open orders; nothing when it can\'t be read', async () => {
    mockDb.answer.operator_orders_unsent = { data: [{ order_id: 'o1', missing: MISSING }, { order_id: 'o2', missing: [] }], error: null };
    const m = await fetchUnsentOrders(['o1', 'o2']);
    expect([...m.entries()]).toEqual([['o1', MISSING]]);
    expect(mockDb.rpcs).toEqual([{ name: 'operator_orders_unsent', args: { p_ids: ['o1', 'o2'] } }]);
    mockDb.answer.operator_orders_unsent = { data: null, error: { message: 'Could not find the function public.operator_orders_unsent' } };
    expect((await fetchUnsentOrders(['o1'])).size).toBe(0);
    expect((await fetchUnsentOrders([])).size).toBe(0);
  });
});
