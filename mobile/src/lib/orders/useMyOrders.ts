/* The signed-in customer's orders (or one of them), and whether they could
   be read. Like My albums: a failed read is said as one (never "No orders
   yet"), with Try again, and it is tried again when the app comes back on
   screen. A cancel reads again, so the screen shows what the shop now has. */
import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { supabase } from '../supabase';
import { getAppOrder, listAppOrders, type AppOrder } from './myOrders';

interface Loaded<T> { key: string; attempt: number; value: T | null; error: string }

export interface Reading<T> {
  value: T | null;
  loading: boolean;
  /** Why it could not be read ('' when it was). */
  error: string;
  retry: () => void;
}

function useReading<T>(key: string | null, read: () => Promise<T>): Reading<T> {
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<Loaded<T> | null>(null);
  const retry = useCallback(() => setAttempt((a) => a + 1), []);

  useEffect(() => {
    if (!key) return;
    let alive = true;
    read()
      .then((value) => { if (alive) setLoaded({ key, attempt, value, error: '' }); })
      .catch((e: unknown) => {
        if (!alive) return;
        const error = e instanceof Error && e.message ? e.message : 'Something went wrong';
        setLoaded((l) => ({ key, attempt, value: l?.key === key ? l.value : null, error }));
      });
    return () => { alive = false; };
    // `read` changes with `key` (it is made from the same values).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt]);

  const mine = loaded && loaded.key === key ? loaded : null;
  useEffect(() => {
    if (!mine?.error) return;
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') retry(); });
    return () => sub.remove();
  }, [mine, retry]);

  return {
    value: mine?.value ?? null,
    loading: !!key && (!mine || (mine.attempt !== attempt && !!mine.error)),
    error: mine && mine.attempt === attempt ? mine.error : '',
    retry,
  };
}

/** My orders, newest first. */
export function useMyOrders(userId: string | undefined): Reading<AppOrder[]> {
  return useReading(userId ?? null, () => listAppOrders(supabase, userId as string));
}

/** One of my orders by id (null: not found, or not mine). */
export function useMyOrder(userId: string | undefined, orderId: string | undefined): Reading<AppOrder | null> {
  return useReading(userId && orderId ? `${userId}/${orderId}` : null, () => getAppOrder(supabase, userId as string, orderId as string));
}
