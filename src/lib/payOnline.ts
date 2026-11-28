/* Card, GCash and Maya through PayMongo (owner, 2026-11-27), next to the
   GoTyme bank-transfer QR (lib/payment.ts).

   The shop switches it on in the database (store_settings.paymongo_mode,
   0077: 'owners' while testing, 'everyone' when live); until then nothing
   here shows. Paying opens PayMongo's own page: our
   server (/api/pay) makes the checkout for the order's own total, and
   PayMongo tells the server when it's paid, which marks the order paid.
   The browser never sends an amount. */

import { supabase, supabaseConfigured } from './supabase';

/** Is PayMongo switched on? Any failure reads as "no": the QR still works. */
export async function loadPayOnline(): Promise<boolean> {
  if (!supabaseConfigured) return false;
  try {
    const { data, error } = await supabase.rpc('public_pay_options');
    if (error || !data || typeof data !== 'object') return false;
    return (data as { paymongo?: unknown }).paymongo === true;
  } catch {
    return false;
  }
}

/** The words under the button. Bridgemedia sells for Megyprints for now
 *  (interim agreement, 2026-11-26), and its name is on the statement. */
export const PAY_ONLINE_NOTE = 'Megyprints is a brand of Bridgemedia. Your card or e-wallet statement shows BRIDGEMEDIA.';

/** Ask our server for the PayMongo page for this order. Returns its address,
 *  or throws with words a customer can act on. */
export async function payOnlineUrl(orderId: string, fetcher: typeof fetch = fetch): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Please sign in again to pay.');
  let res: Response;
  try {
    res = await fetcher('/api/pay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ orderId }),
    });
  } catch {
    throw new Error('No connection. Check your internet and try again.');
  }
  const body = (await res.json().catch(() => null)) as { url?: unknown; error?: unknown } | null;
  if (res.ok && typeof body?.url === 'string' && body.url.startsWith('https://')) return body.url;
  throw new Error(typeof body?.error === 'string' && body.error ? body.error : 'We couldn\'t open the payment page. Please try again, or pay by bank transfer.');
}

/** The order number as PayMongo sends it back to /paid (MP-XXXXX), or null. */
export function cleanOrderNumber(raw: string | null | undefined): string | null {
  const s = String(raw ?? '').trim().toUpperCase();
  return /^[A-Z0-9-]{4,24}$/.test(s) ? s : null;
}
