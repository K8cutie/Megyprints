/* ══════════════════════════════════════════════════════════════════════════
   CARD, GCASH AND MAYA THROUGH PAYMONGO IN THE APP (owner, 2026-11-27).
     • off until the shop switches it on (public_pay_options, 0077); any
       failure reads as off, and the pay step is the bank QR as before;
     • on, for a real order with a total: "Pay ₱X by card, GCash or Maya"
       is the one filled button, and "I've sent" turns into an outline;
     • the app asks the website's /api/pay for the PayMongo page (never with
       an amount), opens it, and when the browser closes reads the order
       until it's paid, then moves on as "I've sent" does.
   The server side (amount, signature, marking paid) is the website's
   api/pay.mjs and its tests (PR #341).
   ══════════════════════════════════════════════════════════════════════════ */
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

const mockDb = {
  rpc: { data: { paymongo: true } as unknown, error: null as null | { message: string } },
  session: { access_token: 'tok-1' } as null | { access_token: string },
  paid: [false, true] as boolean[],
  reads: 0,
};
jest.mock('../src/lib/supabase', () => ({
  supabaseConfigured: true,
  supabase: {
    rpc: async () => mockDb.rpc,
    auth: { getSession: async () => ({ data: { session: mockDb.session } }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => {
      const paid = mockDb.paid[Math.min(mockDb.reads, mockDb.paid.length - 1)];
      mockDb.reads++;
      return { data: { payment_status: paid ? 'paid' : 'unpaid' }, error: null };
    } }) }) }),
  },
}));
const mockOpened: string[] = [];
jest.mock('expo-web-browser', () => ({ openBrowserAsync: async (url: string) => { mockOpened.push(url); return { type: 'dismiss' }; } }));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: async () => ({ canceled: true, assets: null }) }));

import { PaymentStep } from '../src/components/checkout/PaymentStep';
import { PAY_ONLINE_NOTE, loadPayOnline, payOnlineUrl, waitForPaid } from '../src/lib/checkout/payOnline';

const ORDER = { id: '11111111-2222-4333-8444-555555555555', order_number: 'MP-2026-ABC2345', created_at: new Date().toISOString(), album_id: 'album-1' };
let fetchCalls: { url: string; init: { method: string; headers?: Record<string, string>; body?: string } }[] = [];
let fetchAnswer: { ok: boolean; body: unknown } = { ok: true, body: { url: 'https://checkout.paymongo.com/cs_1' } };

beforeEach(() => {
  mockDb.rpc = { data: { paymongo: true }, error: null };
  mockDb.session = { access_token: 'tok-1' };
  mockDb.paid = [false, true];
  mockDb.reads = 0;
  mockOpened.length = 0;
  fetchCalls = [];
  fetchAnswer = { ok: true, body: { url: 'https://checkout.paymongo.com/cs_1' } };
  global.fetch = (async (url: string, init: { method: string; headers?: Record<string, string>; body?: string }) => {
    fetchCalls.push({ url, init });
    return { ok: fetchAnswer.ok, json: async () => fetchAnswer.body };
  }) as unknown as typeof fetch;
});

describe('the switch', () => {
  it('is on only when the database says so', async () => {
    expect(await loadPayOnline()).toBe(true);
    mockDb.rpc = { data: { paymongo: false }, error: null };
    expect(await loadPayOnline()).toBe(false);
    mockDb.rpc = { data: null, error: { message: 'Could not find the function' } };
    expect(await loadPayOnline()).toBe(false);
  });
});

describe('asking the website for the PayMongo page', () => {
  it('sends the order id and the sign-in to /api/pay, and no amount', async () => {
    expect(await payOnlineUrl(ORDER.id)).toBe('https://checkout.paymongo.com/cs_1');
    expect(fetchCalls[0].url).toBe('https://megyprints.vercel.app/api/pay');
    expect(fetchCalls[0].init.headers?.Authorization).toBe('Bearer tok-1');
    expect(fetchCalls[0].init.headers?.Origin).toBe('https://megyprints.vercel.app');
    expect(JSON.parse(fetchCalls[0].init.body ?? '')).toEqual({ orderId: ORDER.id });
  });

  it('passes the server\'s words on, and never opens a non-https page', async () => {
    fetchAnswer = { ok: false, body: { error: 'This order is already paid.' } };
    await expect(payOnlineUrl(ORDER.id)).rejects.toThrow('This order is already paid.');
    fetchAnswer = { ok: true, body: { url: 'http://evil.example' } };
    await expect(payOnlineUrl(ORDER.id)).rejects.toThrow('bank transfer');
  });

  it('reads the order until it is paid, a few times at most', async () => {
    const sleep = jest.fn(async () => {});
    let n = 0;
    expect(await waitForPaid('o', { tries: 5, sleep, check: async () => ++n >= 3 })).toBe(true);
    expect(n).toBe(3);
    expect(await waitForPaid('o', { tries: 4, sleep, check: async () => false })).toBe(false);
  });
});

describe('the pay step', () => {
  it('switched on: pays on PayMongo\'s page, then moves on once the order is paid', async () => {
    const onPaid = jest.fn();
    await render(<PaymentStep amount={1965} order={ORDER} live onBack={() => {}} onPaid={onPaid} />);
    expect(await screen.findByTestId('pay-online-button')).toBeTruthy();
    expect(screen.getByText('Pay ₱1,965 by card, GCash or Maya')).toBeTruthy();
    expect(screen.getByTestId('pay-online-note').props.children).toBe(PAY_ONLINE_NOTE);
    expect(PAY_ONLINE_NOTE).toContain('Megyprints is a brand of Bridgemedia');
    expect(screen.getByTestId('pay-or-transfer')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('pay-online-button'));
    await waitFor(() => expect(onPaid).toHaveBeenCalledWith(null), { timeout: 8000 });
    expect(mockOpened).toEqual(['https://checkout.paymongo.com/cs_1']);
  }, 15000);

  it('switched off: the bank transfer step exactly as before', async () => {
    mockDb.rpc = { data: { paymongo: false }, error: null };
    await render(<PaymentStep amount={1965} order={ORDER} live onBack={() => {}} />);
    await waitFor(() => expect(screen.getByTestId('pay-sent')).toBeTruthy());
    expect(screen.queryByTestId('pay-online')).toBeNull();
    expect(screen.getByText(/Pay by bank transfer to finish\./)).toBeTruthy();
  });

  it('never shows for the test album, or an order with no saved total', async () => {
    const { unmount } = await render(<PaymentStep amount={1965} order={null} onBack={() => {}} />);
    await waitFor(() => expect(screen.getByTestId('pay-sent')).toBeTruthy());
    expect(screen.queryByTestId('pay-online')).toBeNull();
    await unmount();
    await render(<PaymentStep amount={null} order={ORDER} live onBack={() => {}} />);
    await waitFor(() => expect(screen.getByTestId('pay-sent')).toBeTruthy());
    expect(screen.queryByTestId('pay-online')).toBeNull();
  });

  it('says what went wrong, and the customer can try again', async () => {
    fetchAnswer = { ok: false, body: { error: 'Card, GCash and Maya payments aren\'t on yet. Please pay by bank transfer.' } };
    await render(<PaymentStep amount={1965} order={ORDER} live onBack={() => {}} />);
    await fireEvent.press(await screen.findByTestId('pay-online-button'));
    expect(await screen.findByTestId('pay-online-error')).toBeTruthy();
    expect(screen.getByTestId('pay-online-error').props.children).toContain('bank transfer');
    expect(mockOpened).toEqual([]);
  });
});
