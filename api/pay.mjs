// /api/pay — card, GCash and Maya through PayMongo (owner, 2026-11-27).
//
// One function, two callers (Vercel Hobby allows 12 functions; this keeps it
// to one slot):
//
//   1. THE CUSTOMER (website or app), signed in:
//        POST /api/pay  { orderId }  with  Authorization: Bearer <session>
//      → { url } of a PayMongo checkout for that order's own total. The
//      amount always comes from the order row (quoted_amount, priced by the
//      database at insert, 0055), never from the request. Asking again for
//      the same order reuses its open checkout instead of making a second.
//
//   2. PAYMONGO, when a checkout is paid (webhook "checkout_session.payment.paid"):
//        POST /api/pay  with header  Paymongo-Signature: t=…,te=…,li=…
//      The signature is HMAC-SHA256 of "<t>.<raw body>" with the webhook's
//      secret. Only a signed event in the key's own mode (test or live) is
//      read; then mark_order_paid_by_gateway (0077) checks the money and marks
//      the order paid. Repeats are harmless (it answers 'already_paid').
//
// Off until the owner turns it on: store_settings.paymongo_on (0077), read
// through public_pay_options(). Environment (Vercel):
//   PAYMONGO_SECRET_KEY      sk_test_… while testing, sk_live_… after activation
//   PAYMONGO_WEBHOOK_SECRET  the webhook endpoint's secret key (Dashboard → Developers → Webhooks)
//   PAYMONGO_METHODS         optional, e.g. "card,gcash,paymaya,qrph" (the methods the account has)
//   SITE_URL                 optional, defaults to https://megyprints.vercel.app
//   VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
// Bridgemedia is the seller of record: Megyprints is a brand of Bridgemedia,
// and the customer's statement shows BRIDGEMEDIA (interim agreement, 11-26).

import { createHmac, timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { rejectIfAbusive } from './_guard.mjs';

export const PAYMONGO_API = 'https://api.paymongo.com/v1';
export const DEFAULT_METHODS = ['card', 'gcash', 'paymaya', 'qrph'];
const ALLOWED_METHODS = new Set(['card', 'gcash', 'paymaya', 'grab_pay', 'qrph', 'dob', 'dob_ubp',
  'brankas_bdo', 'brankas_landbank', 'brankas_metrobank', 'billease', 'shopee_pay']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** A webhook event is a few KB; refuse anything far bigger before hashing it. */
const MAX_WEBHOOK_BYTES = 256 * 1024;

// ── Pure helpers (tested in pay.spec.mjs) ───────────────────────────────────

/** The payment methods to offer: PAYMONGO_METHODS if it names known ones, else the default. */
export function methodsFrom(env = process.env.PAYMONGO_METHODS) {
  const list = String(env ?? '').split(',').map((s) => s.trim()).filter((s) => ALLOWED_METHODS.has(s));
  return list.length ? [...new Set(list)] : DEFAULT_METHODS;
}

/** 'live' for an sk_live_ key, 'test' for sk_test_, null for anything else. */
export function keyMode(secretKey) {
  if (typeof secretKey !== 'string') return null;
  if (secretKey.startsWith('sk_live_')) return 'live';
  if (secretKey.startsWith('sk_test_')) return 'test';
  return null;
}

/** The site address the checkout sends the customer back to (no trailing slash). */
export function siteUrl(env = process.env.SITE_URL) {
  const s = String(env || 'https://megyprints.vercel.app').trim().replace(/\/+$/, '');
  return /^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(s) ? s : 'https://megyprints.vercel.app';
}

/** The PayMongo checkout request for an order. Amount in centavos. */
export function checkoutBody(order, { methods = DEFAULT_METHODS, site = siteUrl() } = {}) {
  const number = String(order.order_number);
  const back = (state) => `${site}/#/paid?order=${encodeURIComponent(number)}&state=${state}`;
  return {
    data: {
      attributes: {
        line_items: [{
          amount: order.quoted_amount * 100,
          currency: 'PHP',
          name: `Megyprints order ${number}`,
          quantity: 1,
        }],
        payment_method_types: methods,
        success_url: back('done'),
        cancel_url: back('cancelled'),
        reference_number: number,
        description: `Megyprints order ${number}. Megyprints is a brand of Bridgemedia.`,
        metadata: { order_id: String(order.id), order_number: number },
        send_email_receipt: false,
        show_description: true,
        show_line_items: true,
      },
    },
  };
}

/** Parse "t=…,te=…,li=…" into { t, te, li } ('' for a missing part). */
export function parseSignature(header) {
  const out = { t: '', te: '', li: '' };
  for (const part of String(header || '').split(',')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    if (k in out) out[k] = part.slice(i + 1).trim();
  }
  return out;
}

/** True when the header signs this exact raw body with this secret, in this mode. */
export function signatureOk(header, rawBody, secret, mode) {
  if (!secret || (mode !== 'test' && mode !== 'live')) return false;
  const { t, te, li } = parseSignature(header);
  const given = mode === 'live' ? li : te;
  if (!t || !/^[0-9a-f]{64}$/i.test(given)) return false;
  const want = createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex');
  return timingSafeEqual(Buffer.from(want, 'hex'), Buffer.from(given.toLowerCase(), 'hex'));
}

/** What a paid-checkout event says, or null if it isn't one we act on.
 *  Envelope (docs, Webhook events): data.attributes.type / livemode /
 *  data (the checkout session: id, attributes.metadata, attributes.payments). */
export function paidCheckoutFrom(event) {
  const a = event?.data?.attributes;
  if (!a || a.type !== 'checkout_session.payment.paid') return null;
  const cs = a.data;
  const orderId = cs?.attributes?.metadata?.order_id;
  if (typeof orderId !== 'string' || !UUID.test(orderId)) return null;
  const payments = Array.isArray(cs?.attributes?.payments) ? cs.attributes.payments : [];
  const paid = payments.find((p) => p?.attributes?.status === 'paid');
  const amount = paid?.attributes?.amount;
  if (!paid || !Number.isInteger(amount)) return null;
  return {
    livemode: a.livemode === true,
    orderId,
    checkoutId: typeof cs.id === 'string' ? cs.id : null,
    paymentId: typeof paid.id === 'string' ? paid.id : null,
    amount,
  };
}

// ── Plumbing ────────────────────────────────────────────────────────────────

function bearer(req) {
  const h = req.headers.authorization || req.headers.Authorization || '';
  const m = /^Bearer\s+(.+)$/i.exec(String(h));
  return m ? m[1].trim() : '';
}

/** The request body exactly as PayMongo sent it: the signature covers these
 *  bytes, so it is read from the stream (req.body is never touched first). */
async function rawBodyOf(req) {
  if (typeof req.rawBody === 'string') return req.rawBody;
  const chunks = [];
  let n = 0;
  for await (const c of req) {
    n += c.length;
    if (n > MAX_WEBHOOK_BYTES) return null;
    chunks.push(typeof c === 'string' ? Buffer.from(c) : c);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function paymongo(path, secretKey, init = {}) {
  return fetch(`${PAYMONGO_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Basic ${Buffer.from(`${secretKey}:`).toString('base64')}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(init.headers || {}),
    },
  });
}

function serviceClient() {
  return createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// ── 2. PayMongo's webhook ───────────────────────────────────────────────────

async function handleWebhook(req, res) {
  const secretKey = process.env.PAYMONGO_SECRET_KEY;
  const mode = keyMode(secretKey);
  const raw = await rawBodyOf(req);
  if (raw == null) { res.status(413).json({ error: 'too large' }); return; }
  if (!signatureOk(req.headers['paymongo-signature'], raw, process.env.PAYMONGO_WEBHOOK_SECRET, mode)) {
    res.status(401).json({ error: 'bad signature' });
    return;
  }
  let event;
  try { event = JSON.parse(raw); } catch { res.status(400).json({ error: 'bad json' }); return; }

  const paid = paidCheckoutFrom(event);
  // Other events, or one from the other mode: acknowledged, nothing done.
  if (!paid || paid.livemode !== (mode === 'live')) { res.status(200).json({ ok: true, ignored: true }); return; }

  const { data, error } = await serviceClient().rpc('mark_order_paid_by_gateway', {
    p_order_id: paid.orderId,
    p_amount_centavos: paid.amount,
    p_payment_id: paid.paymentId,
    p_checkout_id: paid.checkoutId,
  });
  if (error) {
    // The database didn't answer: a 5xx makes PayMongo try again later.
    console.error('[pay] mark paid failed', paid.orderId, error.message);
    res.status(500).json({ error: 'try again' });
    return;
  }
  if (data !== 'paid' && data !== 'already_paid') {
    // Money came in for an order we couldn't mark paid: the owner must look.
    console.error('[pay] NEEDS OWNER', data, paid.orderId, paid.paymentId, paid.amount);
  }
  res.status(200).json({ ok: true, result: data });
}

// ── 1. The customer asks to pay ─────────────────────────────────────────────

async function handleCheckout(req, res) {
  if (rejectIfAbusive(req, res)) return;
  const secretKey = process.env.PAYMONGO_SECRET_KEY;
  if (!keyMode(secretKey) || !process.env.VITE_SUPABASE_URL || !process.env.VITE_SUPABASE_ANON_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    res.status(503).json({ error: 'Card, GCash and Maya payments aren\'t available right now. Please pay by bank transfer.' });
    return;
  }
  const token = bearer(req);
  if (!token) { res.status(401).json({ error: 'Please sign in again.' }); return; }
  const orderId = req.body && typeof req.body === 'object' ? req.body.orderId : null;
  if (typeof orderId !== 'string' || !UUID.test(orderId)) { res.status(400).json({ error: 'Which order?' }); return; }

  const asUser = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userErr } = await asUser.auth.getUser(token);
  const uid = userData?.user?.id;
  if (userErr || !uid) { res.status(401).json({ error: 'Please sign in again.' }); return; }

  const admin = serviceClient();
  const { data: opts } = await admin.rpc('public_pay_options');
  if (!opts || opts.paymongo !== true) {
    res.status(409).json({ error: 'Card, GCash and Maya payments aren\'t on yet. Please pay by bank transfer.' });
    return;
  }

  const { data: order, error: orderErr } = await admin
    .from('orders')
    .select('id, user_id, order_number, status, payment_status, quoted_amount, paymongo_checkout_id')
    .eq('id', orderId)
    .maybeSingle();
  if (orderErr) { res.status(500).json({ error: 'Something went wrong. Please try again.' }); return; }
  if (!order || order.user_id !== uid) { res.status(404).json({ error: 'We couldn\'t find that order.' }); return; }
  if (order.status !== 'pending_payment' || order.payment_status !== 'unpaid') {
    res.status(409).json({ error: order.payment_status === 'paid' ? 'This order is already paid.' : 'This order can\'t be paid now.' });
    return;
  }
  if (!Number.isInteger(order.quoted_amount) || order.quoted_amount <= 0) {
    res.status(409).json({ error: 'This order has no total yet. Please message us.' });
    return;
  }

  // An open checkout for the same total is reused: one order, one checkout.
  if (order.paymongo_checkout_id) {
    try {
      const r = await paymongo(`/checkout_sessions/${encodeURIComponent(order.paymongo_checkout_id)}`, secretKey);
      if (r.ok) {
        const cs = (await r.json())?.data;
        const amount = cs?.attributes?.line_items?.[0]?.amount;
        if (cs?.attributes?.status === 'active' && amount === order.quoted_amount * 100 && cs.attributes.checkout_url) {
          res.status(200).json({ url: cs.attributes.checkout_url });
          return;
        }
      }
    } catch { /* fall through and make a new one */ }
  }

  let cs;
  try {
    const r = await paymongo('/checkout_sessions', secretKey, {
      method: 'POST',
      body: JSON.stringify(checkoutBody(order, { methods: methodsFrom(), site: siteUrl() })),
    });
    const body = await r.json().catch(() => null);
    if (!r.ok) {
      console.error('[pay] checkout refused', r.status, JSON.stringify(body?.errors ?? body).slice(0, 500));
      res.status(502).json({ error: 'PayMongo didn\'t open the payment page. Please try again, or pay by bank transfer.' });
      return;
    }
    cs = body?.data;
  } catch (e) {
    console.error('[pay] checkout failed', e instanceof Error ? e.message : e);
    res.status(502).json({ error: 'We couldn\'t reach PayMongo. Please try again, or pay by bank transfer.' });
    return;
  }
  const url = cs?.attributes?.checkout_url;
  if (typeof url !== 'string' || !url.startsWith('https://')) {
    res.status(502).json({ error: 'PayMongo didn\'t open the payment page. Please try again, or pay by bank transfer.' });
    return;
  }
  if (typeof cs.id === 'string') {
    await admin.from('orders').update({ paymongo_checkout_id: cs.id }).eq('id', order.id).eq('payment_status', 'unpaid');
  }
  res.status(200).json({ url });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }
  if (req.headers['paymongo-signature']) { await handleWebhook(req, res); return; }
  await handleCheckout(req, res);
}
