/* ══════════════════════════════════════════════════════════════════════════
   CARD, GCASH AND MAYA THROUGH PAYMONGO (owner, 2026-11-27), the app's side
   of the website's src/lib/payOnline.ts.

   Off until the shop switches it on (store_settings.paymongo_on, 0077,
   read through public_pay_options): no app release needed to turn it on.
   Paying opens PayMongo's own page in the phone's browser. The website's
   /api/pay makes that checkout for the order's own total (the app never
   sends an amount), and marks the order paid when PayMongo tells it. When
   the browser closes, the app reads the order again to see if it's paid.
   ══════════════════════════════════════════════════════════════════════════ */
import { supabase, supabaseConfigured } from '../supabase';
import { siteFetch } from '../siteOrigin';
import { WEBSITE_URL } from './site';

/** The website's endpoint (api/pay.mjs): an endpoint, not a public/ file,
 *  so it isn't built with siteFile. Follows EXPO_PUBLIC_WEBSITE_URL. */
export const PAY_ENDPOINT = `${WEBSITE_URL}/api/pay`;

/** The words under the button: Bridgemedia sells for Megyprints for now. */
export const PAY_ONLINE_NOTE = 'Megyprints is a brand of Bridgemedia. Your card or e-wallet statement shows BRIDGEMEDIA.';

/** Is PayMongo switched on? Any failure reads as "no": bank transfer still works. */
export async function loadPayOnline(db: Pick<typeof supabase, 'rpc'> = supabase): Promise<boolean> {
  if (!supabaseConfigured) return false;
  try {
    const { data, error } = await db.rpc('public_pay_options');
    if (error || !data || typeof data !== 'object') return false;
    return (data as { paymongo?: unknown }).paymongo === true;
  } catch {
    return false;
  }
}

type Fetcher = (url: string, init: { method: string; headers?: Record<string, string>; body?: string }) => Promise<{ ok: boolean; json: () => Promise<unknown> }>;

/** The PayMongo page for this order, from the website's /api/pay. Throws
 *  with words the customer can act on. */
export async function payOnlineUrl(orderId: string, fetchFn: Fetcher = fetch as unknown as Fetcher, db: Pick<typeof supabase, 'auth'> = supabase): Promise<string> {
  const { data } = await db.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Please sign in again to pay.');
  let res: Awaited<ReturnType<Fetcher>>;
  try {
    res = await siteFetch(fetchFn)(PAY_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ orderId }),
    });
  } catch {
    throw new Error('No connection. Check your internet and try again.');
  }
  const body = (await res.json().catch(() => null)) as { url?: unknown; error?: unknown } | null;
  if (res.ok && typeof body?.url === 'string' && body.url.startsWith('https://')) return body.url;
  throw new Error(typeof body?.error === 'string' && body.error ? body.error : "We couldn't open the payment page. Please try again, or pay by bank transfer.");
}

/** Has the shop marked this order paid? (Customers read their own orders.) */
export async function isOrderPaid(orderId: string, db: Pick<typeof supabase, 'from'> = supabase): Promise<boolean> {
  const { data } = await db.from('orders').select('payment_status').eq('id', orderId).maybeSingle();
  return (data as { payment_status?: string } | null)?.payment_status === 'paid';
}

/** After the browser closes: read the order a few times, since PayMongo's
 *  message to our server can take a few seconds. True once it's paid. */
export async function waitForPaid(
  orderId: string,
  { tries = 10, everyMs = 3000, check = isOrderPaid, sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms)) }: {
    tries?: number; everyMs?: number; check?: (id: string) => Promise<boolean>; sleep?: (ms: number) => Promise<void>;
  } = {},
): Promise<boolean> {
  for (let i = 0; i < tries; i++) {
    if (await check(orderId).catch(() => false)) return true;
    if (i < tries - 1) await sleep(everyMs);
  }
  return false;
}
