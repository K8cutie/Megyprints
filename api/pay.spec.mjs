import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'node:crypto';
import { Readable } from 'node:stream';
import { readFileSync } from 'node:fs';

/* ══════════════════════════════════════════════════════════════════════════
   /api/pay — PayMongo checkout + webhook (owner, 2026-11-27).
   These lock:
     · the amount is the order's own quoted total (centavos), never the request's;
     · only the order's owner, signed in, can open a checkout, and only while
       it is unpaid and PayMongo is switched on;
     · an open checkout for the same total is reused (one order, one checkout);
     · a webhook is read only when its signature matches the raw body, in the
       key's own mode; anything else changes nothing;
     · a paid event reaches mark_order_paid_by_gateway with the paid payment's
       amount; repeats and other events answer 200.
   ══════════════════════════════════════════════════════════════════════════ */

process.env.VITE_SUPABASE_URL = 'https://example-project.supabase.co';
process.env.VITE_SUPABASE_ANON_KEY = 'anon-test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-test';
process.env.PAYMONGO_SECRET_KEY = 'sk_test_abc123';
process.env.PAYMONGO_WEBHOOK_SECRET = 'whsk_test_secret';
delete process.env.PAYMONGO_METHODS;
delete process.env.SITE_URL;

const ORDER_ID = '11111111-2222-4333-8444-555555555555';
let db;
const freshDb = () => ({
  user: { id: 'user-1' },
  payOptions: { paymongo: true },
  isOwner: true,
  order: { id: ORDER_ID, user_id: 'user-1', order_number: 'MP-7K2Q9', status: 'pending_payment', payment_status: 'unpaid', quoted_amount: 1965, paymongo_checkout_id: null },
  markResult: { data: 'paid', error: null },
  calls: [],
  updates: [],
});

vi.mock('@supabase/supabase-js', () => ({
  createClient: (_url, key) => ({
    auth: { getUser: async () => ({ data: { user: key === 'anon-test' ? db.user : null }, error: db.user ? null : { message: 'no' } }) },
    rpc: async (name, args) => {
      db.calls.push([name, args]);
      if (name === 'public_pay_options') return { data: key === 'anon-test' ? db.payOptions : null, error: null };
      if (name === 'is_owner') return { data: key === 'anon-test' ? db.isOwner : false, error: null };
      if (name === 'mark_order_paid_by_gateway') return db.markResult;
      return { data: null, error: { message: 'unknown rpc' } };
    },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: db.order, error: null }) }) }),
      update: (row) => ({ eq: () => ({ eq: async () => { db.updates.push(row); return { error: null }; } }) }),
    }),
  }),
}));

const pay = await import('./pay.mjs');
const handler = pay.default;

let fetchCalls;
let fetchAnswers;
beforeEach(() => {
  db = freshDb();
  fetchCalls = [];
  fetchAnswers = [];
  vi.stubGlobal('fetch', async (url, init = {}) => {
    fetchCalls.push({ url, init });
    const a = fetchAnswers.shift() ?? { status: 200, body: { data: { id: 'cs_newCheckout123', attributes: { checkout_url: 'https://checkout.paymongo.com/cs_new#x', status: 'active' } } } };
    return { ok: a.status < 300, status: a.status, json: async () => a.body };
  });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function fakeRes() {
  const res = { statusCode: 0, body: null, headers: {} };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  res.setHeader = (k, v) => { res.headers[k] = v; };
  return res;
}
const checkoutReq = (body = { orderId: ORDER_ID }, token = 'user-token') => ({
  method: 'POST',
  headers: { authorization: token ? `Bearer ${token}` : '', 'x-real-ip': `10.0.0.${Math.floor(Math.random() * 250)}` },
  body,
});
function webhookReq(event, { secret = 'whsk_test_secret', mode = 'te', tamper = false } = {}) {
  const raw = JSON.stringify(event);
  const t = '1700000000';
  const sig = createHmac('sha256', secret).update(`${t}.${raw}`).digest('hex');
  const header = mode === 'te' ? `t=${t},te=${sig},li=` : `t=${t},te=,li=${sig}`;
  const stream = Readable.from([Buffer.from(tamper ? raw.replace('1965', '1') : raw)]);
  return Object.assign(stream, { method: 'POST', headers: { 'paymongo-signature': header } });
}
const paidEvent = (over = {}) => ({
  data: {
    id: 'evt_1',
    type: 'event',
    attributes: {
      type: 'checkout_session.payment.paid',
      livemode: false,
      data: {
        id: 'cs_abc123456',
        type: 'checkout_session',
        attributes: {
          reference_number: 'MP-7K2Q9',
          metadata: { order_id: ORDER_ID, order_number: 'MP-7K2Q9' },
          payments: [{ id: 'pay_xyz987', type: 'payment', attributes: { amount: 196500, status: 'paid' } }],
        },
      },
      ...over,
    },
  },
});

describe('the checkout request', () => {
  it('is priced from the order row in centavos, with the order number and our return page', () => {
    const b = pay.checkoutBody({ id: ORDER_ID, order_number: 'MP-7K2Q9', quoted_amount: 1965 }, { site: 'https://megyprints.vercel.app' }).data.attributes;
    expect(b.line_items).toEqual([{ amount: 196500, currency: 'PHP', name: 'Megyprints order MP-7K2Q9', quantity: 1 }]);
    expect(b.payment_method_types).toEqual(['card', 'gcash', 'paymaya', 'qrph']);
    expect(b.reference_number).toBe('MP-7K2Q9');
    expect(b.metadata).toEqual({ order_id: ORDER_ID, order_number: 'MP-7K2Q9' });
    expect(b.success_url).toBe('https://megyprints.vercel.app/#/paid?order=MP-7K2Q9&state=done');
    expect(b.cancel_url).toBe('https://megyprints.vercel.app/#/paid?order=MP-7K2Q9&state=cancelled');
    expect(b.description).toContain('Megyprints is a brand of Bridgemedia');
  });

  it('offers only payment methods PayMongo knows, from PAYMONGO_METHODS', () => {
    expect(pay.methodsFrom('card, gcash,bitcoin')).toEqual(['card', 'gcash']);
    expect(pay.methodsFrom('')).toEqual(['card', 'gcash', 'paymaya', 'qrph']);
  });

  it('returns only to an https site address', () => {
    expect(pay.siteUrl('https://megyprints.com/')).toBe('https://megyprints.com');
    expect(pay.siteUrl('javascript:alert(1)')).toBe('https://megyprints.vercel.app');
  });
});

describe('a customer asks to pay', () => {
  it('gets a PayMongo checkout for the order total, and the checkout is kept on the order', async () => {
    const res = fakeRes();
    await handler(checkoutReq(), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ url: 'https://checkout.paymongo.com/cs_new#x' });
    const sent = JSON.parse(fetchCalls[0].init.body).data.attributes;
    expect(fetchCalls[0].url).toBe('https://api.paymongo.com/v1/checkout_sessions');
    expect(fetchCalls[0].init.headers.Authorization).toBe(`Basic ${Buffer.from('sk_test_abc123:').toString('base64')}`);
    expect(sent.line_items[0].amount).toBe(196500);
    expect(db.updates).toEqual([{ paymongo_checkout_id: 'cs_newCheckout123' }]);
  });

  it('never takes an amount from the request', async () => {
    const res = fakeRes();
    await handler(checkoutReq({ orderId: ORDER_ID, amount: 1, quoted_amount: 1 }), res);
    expect(JSON.parse(fetchCalls[0].init.body).data.attributes.line_items[0].amount).toBe(196500);
  });

  it('reuses the open checkout for the same total', async () => {
    db.order.paymongo_checkout_id = 'cs_existing12345';
    fetchAnswers.push({ status: 200, body: { data: { id: 'cs_existing12345', attributes: { status: 'active', checkout_url: 'https://checkout.paymongo.com/old', line_items: [{ amount: 196500 }] } } } });
    const res = fakeRes();
    await handler(checkoutReq(), res);
    expect(res.body).toEqual({ url: 'https://checkout.paymongo.com/old' });
    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].url).toBe('https://api.paymongo.com/v1/checkout_sessions/cs_existing12345');
  });

  it('makes a new checkout when the old one is for a different total', async () => {
    db.order.paymongo_checkout_id = 'cs_existing12345';
    fetchAnswers.push({ status: 200, body: { data: { attributes: { status: 'active', checkout_url: 'https://checkout.paymongo.com/old', line_items: [{ amount: 100 }] } } } });
    const res = fakeRes();
    await handler(checkoutReq(), res);
    expect(res.body).toEqual({ url: 'https://checkout.paymongo.com/cs_new#x' });
    expect(fetchCalls).toHaveLength(2);
  });

  it.each([
    ['not signed in', () => { db.user = null; }, 401],
    ['someone else\'s order', () => { db.order.user_id = 'user-2'; }, 404],
    ['already paid', () => { db.order.status = 'paid'; db.order.payment_status = 'paid'; }, 409],
    ['cancelled', () => { db.order.status = 'cancelled'; }, 409],
    ['PayMongo switched off', () => { db.payOptions = { paymongo: false }; }, 409],
    ['a test key and not an owner account', () => { db.isOwner = false; }, 409],
    ['no total', () => { db.order.quoted_amount = null; }, 409],
  ])('is refused when %s, and PayMongo is never called', async (_name, setup, code) => {
    setup();
    const res = fakeRes();
    await handler(checkoutReq(), res);
    expect(res.statusCode).toBe(code);
    expect(fetchCalls).toHaveLength(0);
  });

  it('with a live key, serves customers who are not owners', async () => {
    process.env.PAYMONGO_SECRET_KEY = 'sk_live_abc123';
    db.isOwner = false;
    const res = fakeRes();
    await handler(checkoutReq(), res);
    process.env.PAYMONGO_SECRET_KEY = 'sk_test_abc123';
    expect(res.statusCode).toBe(200);
  });

  it('asks whether it is on as the customer, not as the server', async () => {
    const res = fakeRes();
    await handler(checkoutReq(), res);
    expect(db.calls.map((c) => c[0])).toEqual(['public_pay_options', 'is_owner']);
  });

  it('is refused without a real order id', async () => {
    const res = fakeRes();
    await handler(checkoutReq({ orderId: '1 or 1=1' }), res);
    expect(res.statusCode).toBe(400);
  });

  it('says so in words when PayMongo refuses', async () => {
    fetchAnswers.push({ status: 400, body: { errors: [{ detail: 'bad' }] } });
    const res = fakeRes();
    await handler(checkoutReq(), res);
    expect(res.statusCode).toBe(502);
    expect(res.body.error).toContain('bank transfer');
    expect(db.updates).toEqual([]);
  });
});

describe('the webhook signature', () => {
  const raw = '{"a":1}';
  const sig = (s) => createHmac('sha256', s).update(`123.${raw}`).digest('hex');
  it('matches the test part with a test key and the live part with a live key', () => {
    expect(pay.signatureOk(`t=123,te=${sig('k')},li=`, raw, 'k', 'test')).toBe(true);
    expect(pay.signatureOk(`t=123,te=${sig('k')},li=`, raw, 'k', 'live')).toBe(false);
    expect(pay.signatureOk(`t=123,te=,li=${sig('k')}`, raw, 'k', 'live')).toBe(true);
  });
  it('fails on a wrong secret, a changed body, a missing part, or no secret', () => {
    expect(pay.signatureOk(`t=123,te=${sig('other')},li=`, raw, 'k', 'test')).toBe(false);
    expect(pay.signatureOk(`t=123,te=${sig('k')},li=`, '{"a":2}', 'k', 'test')).toBe(false);
    expect(pay.signatureOk(`te=${sig('k')}`, raw, 'k', 'test')).toBe(false);
    expect(pay.signatureOk(`t=123,te=${sig('k')},li=`, raw, '', 'test')).toBe(false);
    expect(pay.signatureOk('garbage', raw, 'k', 'test')).toBe(false);
  });
  it('knows the mode from the key', () => {
    expect(pay.keyMode('sk_live_x')).toBe('live');
    expect(pay.keyMode('sk_test_x')).toBe('test');
    expect(pay.keyMode('pk_test_x')).toBe(null);
  });
});

describe('PayMongo says a checkout is paid', () => {
  it('marks the order paid with the paid payment\'s amount', async () => {
    const res = fakeRes();
    await handler(webhookReq(paidEvent()), res);
    expect(res.statusCode).toBe(200);
    expect(db.calls).toEqual([['mark_order_paid_by_gateway', { p_order_id: ORDER_ID, p_amount_centavos: 196500, p_payment_id: 'pay_xyz987', p_checkout_id: 'cs_abc123456' }]]);
    expect(res.body).toEqual({ ok: true, result: 'paid' });
  });

  it('changes nothing when the signature doesn\'t match the body', async () => {
    const res = fakeRes();
    await handler(webhookReq(paidEvent(), { tamper: true }), res);
    expect(res.statusCode).toBe(401);
    expect(db.calls).toEqual([]);
  });

  it('changes nothing when signed with another secret', async () => {
    const res = fakeRes();
    await handler(webhookReq(paidEvent(), { secret: 'whsk_attacker' }), res);
    expect(res.statusCode).toBe(401);
    expect(db.calls).toEqual([]);
  });

  it('ignores a live event while the key is a test key', async () => {
    const res = fakeRes();
    await handler(webhookReq(paidEvent({ livemode: true })), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.ignored).toBe(true);
    expect(db.calls).toEqual([]);
  });

  it('acknowledges other events without doing anything', async () => {
    const res = fakeRes();
    await handler(webhookReq(paidEvent({ type: 'payment.failed' })), res);
    expect(res.statusCode).toBe(200);
    expect(db.calls).toEqual([]);
  });

  it('answers 200 to a repeat, and flags an amount that doesn\'t match for the owner', async () => {
    db.markResult = { data: 'already_paid', error: null };
    const res1 = fakeRes();
    await handler(webhookReq(paidEvent()), res1);
    expect(res1.statusCode).toBe(200);
    db.markResult = { data: 'amount_mismatch', error: null };
    const res2 = fakeRes();
    await handler(webhookReq(paidEvent()), res2);
    expect(res2.statusCode).toBe(200);
    expect(console.error).toHaveBeenCalledWith('[pay] NEEDS OWNER', 'amount_mismatch', ORDER_ID, 'pay_xyz987', 196500);
  });

  it('asks PayMongo to try again when the database doesn\'t answer', async () => {
    db.markResult = { data: null, error: { message: 'timeout' } };
    const res = fakeRes();
    await handler(webhookReq(paidEvent()), res);
    expect(res.statusCode).toBe(500);
  });

  it('reads only the payment marked paid', () => {
    const e = paidEvent();
    e.data.attributes.data.attributes.payments.unshift({ id: 'pay_failed', attributes: { amount: 196500, status: 'failed' } });
    expect(pay.paidCheckoutFrom(e)?.paymentId).toBe('pay_xyz987');
    const none = paidEvent();
    none.data.attributes.data.attributes.payments = [];
    expect(pay.paidCheckoutFrom(none)).toBeNull();
  });
});

describe('the database side (0077)', () => {
  const sql = readFileSync('supabase/migrations/0077_paymongo_checkout.sql', 'utf8');
  it('lets only the server mark an order paid, and checks the amount', () => {
    expect(sql).toContain('revoke all on function public.mark_order_paid_by_gateway(uuid, bigint, text, text) from public, anon, authenticated;');
    expect(sql).toContain('grant execute on function public.mark_order_paid_by_gateway(uuid, bigint, text, text) to service_role;');
    expect(sql).toContain('p_amount_centavos <> o.quoted_amount::bigint * 100');
    expect(sql).toMatch(/for update;/);
  });
  it('is off until the owner turns it on, and has an owners-only setting for testing', () => {
    expect(sql).toContain("add column if not exists paymongo_mode text not null default 'off'");
    expect(sql).toContain("check (paymongo_mode in ('off', 'owners', 'everyone'))");
    expect(sql).toContain("s.paymongo_mode = 'everyone' or (s.paymongo_mode = 'owners' and public.is_owner())");
  });
});
