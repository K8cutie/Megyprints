// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/* ══════════════════════════════════════════════════════════════════════════
   AN ORDER CAN BE FOUND AGAIN, AND SAYS WHERE IT IS (1-star testers,
   2026-10-04, the Quitter): after "I've sent ₱2,886" the thank-you tracker
   was the only place the order showed — reload or Home and it was gone ("Home
   has no orders section"). And that tracker was a fixed picture: it sat at
   "Payment sent" whatever the shop did. Now Your orders lists every order
   with its REAL status, the thank-you tracker follows the order too, and the
   account menu and the thank-you screen lead there.
   ══════════════════════════════════════════════════════════════════════════ */

const h = vi.hoisted(() => ({
  user: { id: 'user-1', email: 'c@example.test', user_metadata: {} } as unknown,
  orders: [] as unknown[],
  query: [] as [string, ...unknown[]][],
}));
vi.mock('../lib/authContext', () => ({ useAuth: () => ({ user: h.user, logout: vi.fn(), loading: false }) }));
vi.mock('../components/AuthModalProvider', () => ({ useAuthModal: () => ({ openLogin: vi.fn(), openSignup: vi.fn() }) }));
vi.mock('../lib/roles', () => ({ resolveRole: async () => null }));
vi.mock('../lib/supabase', () => {
  const chain = {
    select: (...a: unknown[]) => { h.query.push(['select', ...a]); return chain; },
    eq: (...a: unknown[]) => { h.query.push(['eq', ...a]); return chain; },
    order: async (...a: unknown[]) => { h.query.push(['order', ...a]); return { data: h.orders, error: null }; },
    maybeSingle: async () => ({ data: h.orders[0] ?? null, error: null }),
  };
  return { supabase: { from: (t: string) => { h.query.push(['from', t]); return chain; } } };
});

import { trackOf, TRACK_STAGES } from '../lib/orderTracker';
import { listMyOrders } from '../lib/myOrders';
import MyOrders from './MyOrders';
import AuthNav from '../components/AuthNav';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement;
let root: Root;
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); h.query = []; h.orders = []; });
afterEach(() => { act(() => root.unmount()); host.remove(); });
const render = async (el: ReturnType<typeof createElement>) => {
  await act(async () => { root.render(createElement(MemoryRouter, null, el)); });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
};

describe('where an order is, from its real status', () => {
  it.each([
    [{ status: 'pending_payment', payment_submitted_at: null }, 0, 'Waiting for your payment', true],
    [{ status: 'pending_payment', payment_submitted_at: '2026-10-04T10:00:00Z' }, 0, "Payment sent — we're confirming it", false],
    [{ status: 'paid' }, 1, 'Payment confirmed — printing soon', false],
    [{ status: 'in_production' }, 2, 'Printing your album', false],
    [{ status: 'printed' }, 3, 'Printed — packing it for you', false],
    [{ status: 'shipped' }, 4, 'On its way to you', false],
    [{ status: 'delivered' }, 5, 'Delivered', false],
  ])('%o → step %i, "%s"', (order, stage, headline, awaiting) => {
    const t = trackOf(order);
    expect({ stage: t.stage, headline: t.headline, awaitingPayment: t.awaitingPayment, cancelled: t.cancelled }).toEqual({ stage, headline, awaitingPayment: awaiting, cancelled: false });
    expect(t.finished).toBe(stage === TRACK_STAGES.length - 1);
    expect(t.labels[0]).toBe(awaiting ? 'Waiting for your payment' : TRACK_STAGES[0]);
  });
  it('cancelled', () => {
    expect(trackOf({ status: 'cancelled' })).toMatchObject({ cancelled: true, headline: 'Cancelled', finished: false });
  });
});

describe('Your orders asks for the customer\'s OWN orders', () => {
  it('by user id (an operator can read every order), newest first', async () => {
    await listMyOrders('user-1');
    expect(h.query).toContainEqual(['from', 'orders']);
    expect(h.query).toContainEqual(['eq', 'user_id', 'user-1']);
    expect(h.query).toContainEqual(['order', 'created_at', { ascending: false }]);
  });
});

const order = (o: Record<string, unknown>) => ({
  id: String(o.order_number), order_number: 'MP-2026-AAAA', status: 'pending_payment', amount: 2886, created_at: '2026-10-04T08:00:00Z',
  payment_submitted_at: null, album_size: '9x9', page_count: 40, tracking: null, ...o,
});

describe('the Your orders page', () => {
  it('each order: its number, what is happening now, the steps reached — and how to pay when it waits on the customer', async () => {
    h.orders = [
      order({ order_number: 'MP-2026-WAIT' }),
      order({ order_number: 'MP-2026-SHIP', status: 'shipped', payment_submitted_at: '2026-10-01T00:00:00Z', tracking: 'LBC-123456' }),
      order({ order_number: 'MP-2026-GONE', status: 'cancelled' }),
    ];
    await render(createElement(MyOrders));
    const cards = [...host.querySelectorAll('[data-testid="order-card"]')];
    expect(cards.map((c) => c.querySelector('[data-testid="order-headline"]')?.textContent)).toEqual(['Waiting for your payment', 'On its way to you', 'Cancelled']);
    const reached = (c: Element) => c.querySelectorAll('[data-reached="true"]').length;
    expect(reached(cards[0])).toBe(1);
    expect(reached(cards[1])).toBe(5);
    expect(cards[0].textContent).toContain('MP-2026-WAIT');
    expect(cards[0].textContent).toContain('₱2,886');
    expect(cards[0].querySelector('[data-testid="order-how-to-pay"]')).not.toBeNull();
    expect(cards[1].querySelector('[data-testid="order-how-to-pay"]')).toBeNull();
    expect(cards[1].textContent).toContain('LBC-123456');
    expect(cards[2].querySelector('[data-testid="order-tracker"]')).toBeNull();
    expect(cards[2].textContent).toContain('This order was cancelled');
  });
  it('no orders yet → says so, and offers to make one', async () => {
    await render(createElement(MyOrders));
    expect(host.querySelector('[data-testid="orders-empty"]')?.textContent).toContain('No orders yet.');
  });
});

describe('the way there', () => {
  it('the account menu (desktop bar and phone menu) leads to Your orders', async () => {
    await render(createElement(AuthNav));
    expect(host.querySelector('[data-testid="nav-orders"]')?.getAttribute('href')).toBe('/orders');
    await render(createElement(AuthNav, { variant: 'menu' }));
    expect(host.querySelector('[data-testid="menu-orders"]')?.getAttribute('href')).toBe('/orders');
  });
  it('the thank-you screen follows the real order and leads to Your orders (source guard)', () => {
    const src = readFileSync(resolve(__dirname, 'Order.tsx'), 'utf8');
    expect(src).toMatch(/const track = trackOf\(placedOrder \?\? \{ status: 'pending_payment', payment_submitted_at: 'now' \}\);/);
    expect(src).toMatch(/getMyOrder\(user\.id, orderId\)/);
    expect(src).toMatch(/window\.setInterval\(refresh, 60_000\)/);
    expect(src).toMatch(/<OrderTracker track=\{track\} \/>/);
    expect(src).toMatch(/navigate\('\/orders'\)/);
    expect(src).not.toMatch(/setTrackStage/);
    const app = readFileSync(resolve(__dirname, '../App.tsx'), 'utf8');
    expect(app).toMatch(/<Route path="\/orders" element=\{<ProtectedRoute><MyOrders \/><\/ProtectedRoute>\} \/>/);
  });
});
