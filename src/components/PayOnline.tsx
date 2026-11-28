/* The "Pay by card, GCash or Maya" button on checkout's pay step. It shows
   only while the shop has PayMongo switched on (lib/payOnline). Tapping it
   opens PayMongo's own payment page for this order; PayMongo brings the
   customer back to /paid, and our server marks the order paid when PayMongo
   says so. */

import { useState } from 'react';
import { CreditCard, Loader2 } from 'lucide-react';
import { PAY_ONLINE_NOTE, payOnlineUrl } from '../lib/payOnline';

export default function PayOnline({ orderId, amountLabel, go = (url: string) => window.location.assign(url) }: {
  orderId: string;
  amountLabel: string;
  /** Where the browser goes (a test passes its own). */
  go?: (url: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const pay = async () => {
    setBusy(true);
    setError('');
    try {
      go(await payOnlineUrl(orderId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'We couldn\'t open the payment page. Please try again.');
      setBusy(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm mb-4" data-testid="pay-online">
      <button type="button" onClick={() => { void pay(); }} disabled={busy} data-testid="pay-online-button"
        className="w-full py-3.5 bg-blush-pink text-white text-base font-bold rounded-xl hover:brightness-105 transition-all flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-wait">
        {busy
          ? <><Loader2 size={16} className="animate-spin" /> Opening the payment page…</>
          : <><CreditCard size={16} /> Pay {amountLabel} by card, GCash or Maya</>}
      </button>
      <p className="mt-2 text-[11px] text-light text-center">You pay on PayMongo's secure page, then come back here.</p>
      <p className="mt-1 text-[11px] text-light text-center" data-testid="pay-online-note">{PAY_ONLINE_NOTE}</p>
      {error && <p className="mt-2 text-xs text-red-500 text-center" role="alert" data-testid="pay-online-error">{error}</p>}
    </div>
  );
}
