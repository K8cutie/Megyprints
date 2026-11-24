/* The page a scanned order tag opens (/o/<number>, printed on the back of
   every album: lib/orderScan.ts says who goes where). Only the order number
   is shown here: nothing about the person or the price. */
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Loader2, Package } from 'lucide-react';
import { useAuth } from '../lib/authContext';
import { useAuthModal } from '../components/AuthModalProvider';
import { resolveRole } from '../lib/roles';
import { supabase } from '../lib/supabase';
import { isOrderNumber } from './builder/orderTag';
import { orderScanDestination } from '../lib/orderScan';

export default function OrderScan() {
  const { number: raw = '' } = useParams();
  const number = raw.toUpperCase();
  const valid = isOrderNumber(number);
  const { user, loading } = useAuth();
  const { openLogin } = useAuthModal();
  const navigate = useNavigate();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!valid || loading || !user) return;
    let alive = true;
    setChecked(false);
    void (async () => {
      const role = await resolveRole(user.email);
      // A customer sees only their own orders (the database decides).
      const own = role ? null : await supabase.from('orders').select('id').eq('order_number', number).maybeSingle();
      if (!alive) return;
      const to = orderScanDestination({ number, role, ownOrderId: (own?.data as { id?: string } | null)?.id ?? null });
      if (to) navigate(to, { replace: true });
      else setChecked(true);
    })();
    return () => { alive = false; };
  }, [valid, loading, user, number, navigate]);

  const busy = valid && (loading || (!!user && !checked));

  return (
    <div className="max-w-md mx-auto px-4 pt-28 pb-16 text-center">
      <Package className="mx-auto text-blush-pink" size={28} />
      {!valid ? (
        <>
          <h1 className="font-display text-2xl font-semibold text-dark mt-3">Not an order number</h1>
          <p className="text-sm text-medium mt-2">This code isn't a Megy Prints order number.</p>
        </>
      ) : (
        <>
          <h1 className="font-display text-2xl font-semibold text-dark mt-3" data-testid="scan-number">
            Order <span className="font-mono text-[#C98A5E]">{number}</span>
          </h1>
          <p className="text-sm text-medium mt-2">
            This number is printed on the back of a Megy Prints album. It helps us keep track of the album while we print it and deliver it.
          </p>
          {busy && <p className="text-sm text-light mt-6 flex items-center justify-center gap-2"><Loader2 size={15} className="animate-spin" /> Checking…</p>}
          {!busy && !user && (
            <div className="mt-6">
              <p className="text-sm text-medium">Is this your album? Sign in to see your order.</p>
              <button onClick={openLogin} data-testid="scan-sign-in"
                className="mt-3 px-5 py-2.5 rounded-lg font-semibold text-white" style={{ background: '#BF5E3E' }}>
                Sign in
              </button>
            </div>
          )}
          {!busy && user && <p className="text-sm text-medium mt-6" data-testid="scan-not-yours">This order isn't on your account.</p>}
        </>
      )}
      <Link to="/" className="inline-block mt-8 text-sm text-[#C98A5E] underline">Go to Megy Prints</Link>
    </div>
  );
}
