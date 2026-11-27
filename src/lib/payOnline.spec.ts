// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync } from 'node:fs';

/* ══════════════════════════════════════════════════════════════════════════
   CARD, GCASH AND MAYA THROUGH PAYMONGO (owner, 2026-11-27).
     · off until the shop switches it on; any failure reads as off;
     · the browser asks our server for the PayMongo page, never with an amount;
     · /paid tells the customer where they stand, and changes no order;
     · while it is off, the pay step is the bank-transfer QR exactly as before.
   ══════════════════════════════════════════════════════════════════════════ */

const h = vi.hoisted(() => ({
  rpc: { data: { paymongo: true } as unknown, error: null as null | { message: string } },
  session: { access_token: 'tok-1' } as null | { access_token: string },
  user: null as null | { id: string },
  orderRow: null as null | { payment_status: string },
  reads: 0,
}));
vi.mock('./supabase', () => ({
  supabaseConfigured: true,
  supabase: {
    rpc: async () => h.rpc,
    auth: { getSession: async () => ({ data: { session: h.session } }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => { h.reads++; return { data: h.orderRow, error: null }; } }) }) }),
  },
}));
vi.mock('./authContext', () => ({ useAuth: () => ({ user: h.user }) }));

import { loadPayOnline, payOnlineUrl, cleanOrderNumber, PAY_ONLINE_NOTE } from './payOnline';
import PayOnline from '../components/PayOnline';
import Paid from '../pages/Paid';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  h.rpc = { data: { paymongo: true }, error: null };
  h.session = { access_token: 'tok-1' };
  h.user = null; h.orderRow = null; h.reads = 0;
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.useRealTimers(); });
const $ = (id: string) => host.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const settle = () => act(async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)); });

const answer = (status: number, body: unknown) => vi.fn(async (_u: RequestInfo | URL, _i?: RequestInit) => ({ ok: status < 300, status, json: async () => body }) as Response);

describe('the switch', () => {
  it('is on only when the database says so', async () => {
    expect(await loadPayOnline()).toBe(true);
    h.rpc = { data: { paymongo: false }, error: null };
    expect(await loadPayOnline()).toBe(false);
    h.rpc = { data: null, error: { message: 'function not found' } };
    expect(await loadPayOnline()).toBe(false);
    h.rpc = { data: { paymongo: 'yes' }, error: null };
    expect(await loadPayOnline()).toBe(false);
  });
});

describe('asking our server for the PayMongo page', () => {
  it('sends the order id and the sign-in, and no amount', async () => {
    const f = answer(200, { url: 'https://checkout.paymongo.com/cs_1' });
    expect(await payOnlineUrl('order-1', f as unknown as typeof fetch)).toBe('https://checkout.paymongo.com/cs_1');
    const [url, init] = f.mock.calls[0];
    expect(url).toBe('/api/pay');
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer tok-1');
    expect(JSON.parse(String(init?.body))).toEqual({ orderId: 'order-1' });
  });

  it('passes the server\'s words on, and never goes to a non-https page', async () => {
    await expect(payOnlineUrl('o', answer(409, { error: 'This order is already paid.' }) as unknown as typeof fetch)).rejects.toThrow('This order is already paid.');
    await expect(payOnlineUrl('o', answer(200, { url: 'http://evil.example' }) as unknown as typeof fetch)).rejects.toThrow('bank transfer');
  });

  it('asks to sign in again without a session', async () => {
    h.session = null;
    await expect(payOnlineUrl('o', answer(200, {}) as unknown as typeof fetch)).rejects.toThrow('sign in again');
  });

  it('keeps only a real order number from the return address', () => {
    expect(cleanOrderNumber('mp-2026-abc2345')).toBe('MP-2026-ABC2345');
    expect(cleanOrderNumber('<script>')).toBeNull();
    expect(cleanOrderNumber(null)).toBeNull();
  });
});

describe('the pay button', () => {
  it('opens the PayMongo page, with Bridgemedia named under it', async () => {
    const go = vi.fn();
    vi.stubGlobal('fetch', answer(200, { url: 'https://checkout.paymongo.com/cs_9' }));
    await act(async () => { root.render(createElement(PayOnline, { orderId: 'order-9', amountLabel: '₱1,965', go })); });
    expect($('pay-online-button')?.textContent).toContain('Pay ₱1,965 by card, GCash or Maya');
    expect($('pay-online-note')?.textContent).toBe(PAY_ONLINE_NOTE);
    expect(PAY_ONLINE_NOTE).toContain('Megyprints is a brand of Bridgemedia');
    await act(async () => { $('pay-online-button')!.click(); });
    await settle();
    expect(go).toHaveBeenCalledWith('https://checkout.paymongo.com/cs_9');
    vi.unstubAllGlobals();
  });

  it('says what went wrong and can be tapped again', async () => {
    const go = vi.fn();
    vi.stubGlobal('fetch', answer(503, { error: 'Card, GCash and Maya payments aren\'t available right now. Please pay by bank transfer.' }));
    await act(async () => { root.render(createElement(PayOnline, { orderId: 'order-9', amountLabel: '₱1,965', go })); });
    await act(async () => { $('pay-online-button')!.click(); });
    await settle();
    expect(go).not.toHaveBeenCalled();
    expect($('pay-online-error')?.textContent).toContain('bank transfer');
    expect(($('pay-online-button') as HTMLButtonElement).disabled).toBe(false);
    vi.unstubAllGlobals();
  });
});

describe('/paid, where PayMongo sends the customer back', () => {
  const open = async (q: string) => {
    await act(async () => { root.render(createElement(MemoryRouter, { initialEntries: [`/paid?${q}`] }, createElement(Paid))); });
    await settle();
  };

  it('after a cancel: nothing was charged', async () => {
    await open('order=MP-2026-ABC2345&state=cancelled');
    expect($('paid-title')?.textContent).toBe('The payment wasn\'t finished');
    expect($('paid-page')?.textContent).toContain('Nothing was charged for order MP-2026-ABC2345');
  });

  it('from the app (not signed in here): go back to the app', async () => {
    await open('order=MP-2026-ABC2345&state=done');
    expect($('paid-title')?.textContent).toContain('confirming your payment');
    expect($('paid-wait')?.textContent).toContain('go back to the app');
    expect(h.reads).toBe(0);
  });

  it('signed in: watches the order until it is paid', async () => {
    h.user = { id: 'u1' };
    h.orderRow = { payment_status: 'unpaid' };
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await open('order=MP-2026-ABC2345&state=done');
    expect($('paid-title')?.textContent).toContain('confirming');
    h.orderRow = { payment_status: 'paid' };
    await act(async () => { vi.advanceTimersByTime(3100); });
    await settle();
    expect($('paid-title')?.textContent).toBe('Paid. Thank you!');
    expect($('paid-orders')).not.toBeNull();
  });
});

describe('the checkout pay step', () => {
  const src = readFileSync('src/pages/Order.tsx', 'utf8');
  it('shows the PayMongo button only while it is switched on, and keeps one filled button', () => {
    expect(src).toContain('{payOnline && createdOrderRef.current && (\n            <PayOnline');
    expect(src).toContain("${payOnline && createdOrderRef.current ? 'border-2 border-blush-pink bg-white text-blush-pink' : 'bg-blush-pink text-white'}");
    expect(src).toContain("useState(false);\n  useEffect(() => { let alive = true; void loadPayOnline()");
  });
  it('has a public return page', () => {
    expect(readFileSync('src/App.tsx', 'utf8')).toContain('<Route path="/paid" element={<Paid />} />');
  });
});
