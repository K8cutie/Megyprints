/* ══════════════════════════════════════════════════════════════════════════
   "THIS ALBUM ALREADY HAS AN ORDER": the album's order still waiting for
   payment, said at the top of checkout, and a second order asked, never
   placed silently (1-star testers round 2, Q1).

   Read only: the same query as the website's openOrderForAlbum
   (src/lib/myOrders.ts), this account's orders only, by id. The words are
   the website's (src/pages/Order.tsx).
   ══════════════════════════════════════════════════════════════════════════ */
import type { SupabaseClient } from '@supabase/supabase-js';

export interface OpenOrder {
  id: string;
  order_number: string;
  status: string;
  created_at: string;
  payment_submitted_at: string | null;
}

export const OPEN_ORDER_COLUMNS = 'id, order_number, status, amount, created_at, payment_submitted_at, album_size, page_count, tracking, album_title:album_snapshot->>title, album_id, tester_code';

export async function openOrderForAlbum(client: Pick<SupabaseClient, 'from'>, userId: string, albumId: string): Promise<OpenOrder | null> {
  const { data, error } = await client
    .from('orders')
    .select(OPEN_ORDER_COLUMNS)
    .eq('user_id', userId)
    .eq('album_id', albumId)
    .eq('status', 'pending_payment')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as OpenOrder | null) ?? null;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "October 26", in Manila time, as the website's toLocaleDateString('en-PH',
 *  { day: 'numeric', month: 'long' }) says it on a phone in the Philippines
 *  (the English of the Philippines puts the month first). Written out here
 *  so the phone says the same whatever date data its JavaScript has. */
export function placedOn(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const d = new Date(t + 8 * 3_600_000);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/** The box at the top of checkout. */
export function openOrderWords(o: OpenOrder): { headline: string; body: string; button: string } {
  return {
    headline: `This album already has an order ${o.payment_submitted_at ? "— you sent the payment and we're confirming it" : 'waiting for payment'}: ${o.order_number}, placed ${placedOn(o.created_at)}.`,
    body: `${o.payment_submitted_at ? "You don't need a new one." : "To finish it, pay that order. You don't need a new one."} Changed the album since? Place a new order below and we'll print the new one.`,
    button: `Open order ${o.order_number}`,
  };
}

/** The question under Place order before a second order. */
export function secondOrderQuestion(o: OpenOrder): string {
  return `This album already has order ${o.order_number} ${o.payment_submitted_at ? 'with its payment sent' : 'waiting for payment'}. Place a second order for it?`;
}
