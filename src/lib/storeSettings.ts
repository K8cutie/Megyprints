/* ══════════════════════════════════════════════════════════════════════════
   Store settings — the store-wide price multiple (cost → customer price).

   Mirrors templateSettings.ts: a module-level cache loaded once on app start,
   a synchronous getter for checkout, and an owner-only save fn. The multiple is
   NOT sensitive on its own (cost lives only in client code, and the customer
   only ever sees final marked-up amounts) — so public read is fine and the row
   is guarded owner-only for WRITE via RLS.
   ══════════════════════════════════════════════════════════════════════════ */

import { supabase, supabaseConfigured } from './supabase';

const DEFAULT_MULTIPLE = 3;
let priceMultiple = DEFAULT_MULTIPLE;

/** Load the store-wide price multiple on app start. Fail-open to the default (3)
 *  on any error — a missing/blocked row must never break checkout. */
export async function loadStoreSettings(): Promise<void> {
  if (!supabaseConfigured) return;
  try {
    const { data, error } = await supabase
      .from('store_settings')
      .select('price_multiple')
      .eq('id', 1)
      .maybeSingle();
    if (error) { console.warn('store_settings load failed:', error.message); return; }
    if (data?.price_multiple != null) priceMultiple = Number(data.price_multiple);
  } catch (e) {
    console.warn('store_settings load error:', e);
  }
}

export function getPriceMultiple(): number { return priceMultiple; }

/** Owner-only (enforced by RLS). Updates the cache optimistically. Returns an
 *  error message on failure, or null on success. */
export async function setPriceMultiple(next: number): Promise<string | null> {
  priceMultiple = next;
  if (!supabaseConfigured) return 'Supabase not configured — change is local-only this session.';
  const { error } = await supabase.from('store_settings').upsert({
    id: 1,
    price_multiple: next,
    updated_at: new Date().toISOString(),
  });
  return error ? error.message : null;
}
