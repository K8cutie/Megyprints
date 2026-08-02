/* ══════════════════════════════════════════════════════════════════════════
   Store settings — the customer price schedule + the owner's size curation.

   Before 0024 this read store_settings directly and cached price_multiple, which
   meant the multiplier was fetched with the public anon key and — alongside the
   cost constants that used to sit in pricing.ts — handed a competitor the whole
   margin. Now it calls public_price_schedule(), which returns pre-multiplied
   rates only (see pricing.ts and migration 0024).

   FAIL-CLOSED ON PRICE. If the schedule can't load, getPriceSchedule() stays
   null and checkout must refuse to price. That is a deliberate change from the
   old fail-open-to-default-multiple behaviour: quoting a guessed price on a
   money path is worse than blocking, and there is no longer a client-side cost
   model to guess from. Size curation still fails OPEN (show every size), since
   the worst case there is offering a size the owner meant to hide.
   ══════════════════════════════════════════════════════════════════════════ */

import { supabase, supabaseConfigured } from './supabase';
import type { AlbumSizePreset } from '../pages/builder/types';
import type { PriceSchedule, PricingModel } from './pricing';

let schedule: PriceSchedule | null = null;
// Album sizes the owner has turned OFF (hidden from the customer size picker).
// Default empty = every size offered.
let disabledSizes: AlbumSizePreset[] = [];

// Readiness gate. Checkout awaits this before showing a price, so it never
// renders against a half-loaded cache. `ready` flips once the load settles —
// success, failure, or no-Supabase — because in every case the cache is then the
// authoritative answer (null included).
let ready = false;
let resolveReady: () => void;
const readyPromise: Promise<void> = new Promise((r) => { resolveReady = r; });
export function isStoreSettingsReady(): boolean { return ready; }
export function storeSettingsReady(): Promise<void> { return readyPromise; }
function markReady() { if (!ready) { ready = true; resolveReady(); } }

/** Load the customer price schedule on app start. */
export async function loadStoreSettings(): Promise<void> {
  if (!supabaseConfigured) { markReady(); return; }
  try {
    const { data, error } = await supabase.rpc('public_price_schedule');
    if (error) { console.warn('price schedule load failed:', error.message); return; }
    if (data && typeof data === 'object') {
      schedule = data as PriceSchedule;
      if (Array.isArray(schedule.disabled_sizes)) {
        disabledSizes = schedule.disabled_sizes as AlbumSizePreset[];
      }
    }
  } catch (e) {
    console.warn('price schedule load error:', e);
  } finally {
    markReady();
  }
}

/** The customer price schedule, or null if it could not be loaded — in which
 *  case the caller MUST NOT quote a price. */
export function getPriceSchedule(): PriceSchedule | null { return schedule; }

/** Sizes the owner has disabled (hidden from the picker). */
export function getDisabledSizes(): AlbumSizePreset[] { return disabledSizes; }

/** Owner-only (RLS). Updates the cache optimistically. Only touches
 *  disabled_sizes — the price_multiple on the same row is left as-is. */
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

/** Owner-only (enforced by RLS). Reloads the schedule afterwards so the cached
 *  customer prices reflect the new multiple immediately. */
export async function setPriceMultiple(next: number): Promise<string | null> {
  if (!supabaseConfigured) return 'Supabase not configured — change is local-only this session.';
  const { error } = await supabase.from('store_settings').upsert({
    id: 1,
    price_multiple: next,
    updated_at: new Date().toISOString(),
  });
  if (error) return error.message;
  await loadStoreSettings();
  return null;
}

/** Owner-only. The raw cost model behind the schedule, for the admin Pricing
 *  panel. Rejected by the database for anyone else, so a non-owner reaching this
 *  gets an error rather than the figures. */
export async function loadOwnerPricingModel(): Promise<PricingModel | null> {
  if (!supabaseConfigured) return null;
  const { data, error } = await supabase.rpc('owner_pricing_model');
  if (error) { console.warn('owner pricing model load failed:', error.message); return null; }
  return (data as PricingModel) ?? null;
}
