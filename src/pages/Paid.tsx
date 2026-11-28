/* Where PayMongo sends the customer back (/api/pay sets the addresses):
     /paid?order=MP-…&state=done        paid on PayMongo's page
     /paid?order=MP-…&state=cancelled   came back without paying
   The order is marked paid by our server when PayMongo tells it (a webhook),
   which can take a few seconds, so a signed-in customer watches it change
   here. Someone who paid from the app isn't signed in on this browser: they
   are told to go back to the app, where the order updates. Nothing on this
   page changes an order. */

import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Check, Clock, XCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/authContext';
import { cleanOrderNumber } from '../lib/payOnline';

/** How often, and for how long, a signed-in customer's order is re-read. */
export const PAID_POLL_MS = 3000;
export const PAID_POLL_FOR_MS = 120_000;

type Seen = 'waiting' | 'paid' | 'unknown';

export default function Paid() {
  const [params] = useSearchParams();
  const order = cleanOrderNumber(params.get('order'));
  const done = params.get('state') === 'done';
  const { user } = useAuth();
  const [seen, setSeen] = useState<Seen>('waiting');

  useEffect(() => {
    if (!done || !order || !user) return;
    let stopped = false;
    const started = Date.now();
    const look = async () => {
      if (stopped) return;
      const { data } = await supabase.from('orders').select('payment_status').eq('order_number', order).maybeSingle();
      if (stopped) return;
      if ((data as { payment_status?: string } | null)?.payment_status === 'paid') { setSeen('paid'); return; }
      if (Date.now() - started >= PAID_POLL_FOR_MS) { setSeen('unknown'); return; }
      window.setTimeout(() => { void look(); }, PAID_POLL_MS);
    };
    void look();
    return () => { stopped = true; };
  }, [done, order, user]);

  return (
    <div className="min-h-screen bg-cream pt-28 px-6 pb-16 flex items-start justify-center">
      <div className="w-full max-w-md bg-white rounded-2xl p-6 shadow-sm text-center" data-testid="paid-page">
        {!done ? (
          <>
            <XCircle size={40} className="mx-auto text-taupe" aria-hidden="true" />
            <h1 className="mt-3 font-display text-2xl font-bold text-dark" data-testid="paid-title">The payment wasn't finished</h1>
            <p className="mt-2 text-sm text-medium">Nothing was charged{order ? <> for order <span className="font-mono text-[#C98A5E]">{order}</span></> : null}.</p>
            <p className="mt-1 text-sm text-medium">Go back to Megyprints to pay again, or pay by bank transfer.</p>
          </>
        ) : seen === 'paid' ? (
          <>
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-peach text-white" aria-hidden="true"><Check size={24} strokeWidth={3} /></span>
            <h1 className="mt-3 font-display text-2xl font-bold text-dark" data-testid="paid-title">Paid. Thank you!</h1>
            <p className="mt-2 text-sm text-medium">Order <span className="font-mono text-[#C98A5E]">{order}</span> is paid. We'll print your album next.</p>
          </>
        ) : (
          <>
            <Clock size={40} className="mx-auto text-peach" aria-hidden="true" />
            <h1 className="mt-3 font-display text-2xl font-bold text-dark" data-testid="paid-title">Thank you! We're confirming your payment</h1>
            {order && <p className="mt-2 text-sm text-medium">Order <span className="font-mono text-[#C98A5E]">{order}</span></p>}
            <p className="mt-2 text-sm text-medium" data-testid="paid-wait">
              {user
                ? (seen === 'unknown' ? 'It\'s taking longer than usual. Check Your orders in a few minutes.' : 'This usually takes a few seconds.')
                : 'If you paid from the Megyprints app, go back to the app. Your order updates there.'}
            </p>
          </>
        )}
        {user && (
          <Link to="/orders" className="mt-5 inline-block rounded-xl border border-peach px-5 py-2.5 text-sm font-semibold text-cocoa" data-testid="paid-orders">See your orders</Link>
        )}
      </div>
    </div>
  );
}
