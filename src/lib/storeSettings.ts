/* ══════════════════════════════════════════════════════════════════════════
   Store settings — the store-wide price multiple (cost → customer price).

   Mirrors templateSettings.ts: a module-level cache loaded once on app start,
   a synchronous getter for checkout, and an owner-only save fn. The multiple is
   NOT sensitive on its own (cost lives only in client code, and the customer
   only ever sees final marked-up amounts) — so public read is fine and the row
   is guarded owner-only for WRITE via RLS.
   ══════════════════════════════════════════════════════════════════════════ */

import { supabase, supabaseConfigured } from './supabase';
import type { AlbumSizePreset } from '../pages/builder/types';

const DEFAULT_MULTIPLE = 3;
let priceMultiple = DEFAULT_MULTIPLE;
// Album sizes the owner has turned OFF (hidden from the customer size picker).
// Default empty = every size offered; resilient to the 0016 column not existing.
let disabledSizes: AlbumSizePreset[] = [];

/** Load the store-wide settings on app start. Fail-open to defaults on any error —
 *  a missing/blocked row (or an un-applied 0016 column) must never break checkout
 *  or hide every size. `select('*')` tolerates the disabled_sizes column being
 *  absent (pre-migration): it just won't be in the row. */
export async function loadStoreSettings(): Promise<void> {
  if (!supabaseConfigured) return;
  try {
    const { data, error } = await supabase
      .from('store_settings')
      .select('*')
      .eq('id', 1)
      .maybeSingle();
    if (error) { console.warn('store_settings load failed:', error.message); return; }
    if (data?.price_multiple != null) priceMultiple = Number(data.price_multiple);
    if (Array.isArray(data?.disabled_sizes)) disabledSizes = data.disabled_sizes as AlbumSizePreset[];
  } catch (e) {
    console.warn('store_settings load error:', e);
  }
}

export function getPriceMultiple(): number { return priceMultiple; }

/** Sizes the owner has disabled (hidden from the picker). */
export function getDisabledSizes(): AlbumSizePreset[] { return disabledSizes; }

/** Owner-only (RLS). Updates the cache optimistically. Only touches disabled_sizes
 *  — the price_multiple on the same row is left as-is. */
export async function setDisabledSizes(next: AlbumSizePreset[]): Promise<string | null> {
  disabledSizes = next;
  if (!supabaseConfigured) return 'Supabase not configured — change is local-only this session.';
  const { error } = await supabase.from('store_settings').upsert({
    id: 1,
    disabled_sizes: next,
    updated_at: new Date().toISOString(),
  });
  return error ? error.message : null;
}

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
