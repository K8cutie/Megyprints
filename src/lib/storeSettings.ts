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

/* ── Prices come back with the connection (1-star testers round 2, CD-1) ──
   Opened offline, checkout sat at ₱0 / "Pricing unavailable — please refresh"
   long after the connection was back: the schedule was fetched once, at app
   start, and never again. Now a load that didn't get the schedule tries again
   — at once when the browser comes back online, else after 3 s, 6 s, … up to
   every minute — and whoever shows prices hears when they arrive. */
const listeners = new Set<() => void>();
/** Called whenever the schedule (or size curation) changes. Returns the unsubscribe. */
export function onStoreSettingsChange(cb: () => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}
function notify() { listeners.forEach((cb) => { try { cb(); } catch { /* a listener's problem */ } }); }

const RETRY_FIRST_MS = 3000;
const RETRY_MAX_MS = 60_000;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryDelay = RETRY_FIRST_MS;
function scheduleRetry() {
  if (schedule || retryTimer || typeof window === 'undefined') return;
  retryTimer = setTimeout(() => { retryTimer = null; void loadStoreSettings(); }, retryDelay);
  retryDelay = Math.min(retryDelay * 2, RETRY_MAX_MS);
}
/** Try again now (the connection is back, or the customer asked). */
export function retryStoreSettings(): Promise<void> {
  if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
  retryDelay = RETRY_FIRST_MS;
  return loadStoreSettings();
}
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { if (!schedule) void retryStoreSettings(); });
}

let inflight: Promise<void> | null = null;
/** Load the customer price schedule (on app start, and again until it lands). */
export function loadStoreSettings(): Promise<void> {
  if (!supabaseConfigured) { markReady(); return Promise.resolve(); }
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const { data, error } = await supabase.rpc('public_price_schedule');
      if (error) { console.warn('price schedule load failed:', error.message); return; }
      if (data && typeof data === 'object') {
        schedule = data as PriceSchedule;
        if (Array.isArray(schedule.disabled_sizes)) {
          disabledSizes = schedule.disabled_sizes as AlbumSizePreset[];
        }
        notify();
      }
    } catch (e) {
      console.warn('price schedule load error:', e);
    } finally {
      inflight = null;
      markReady();
      if (!schedule) scheduleRetry();
    }
  })();
  return inflight;
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

/** Owner-only (definer RPC, owner-gated in SQL). Sets the flat per-album
 *  hosting reserve and reloads the schedule so checkout picks it up at once. */
export async function setHostingReserve(next: number): Promise<string | null> {
  if (!supabaseConfigured) return 'Supabase not configured — change is local-only this session.';
  const { error } = await supabase.rpc('set_hosting_reserve', { p_amount: Math.round(next) });
  if (error) return error.message;
  await loadStoreSettings();
  return null;
}

/** Owner-only (definer RPC, shape-validated in SQL). Replaces the hosting
 *  tiers and reloads the schedule. */
export async function setHostingTiers(tiers: { years: number; price: number }[]): Promise<string | null> {
  if (!supabaseConfigured) return 'Supabase not configured — change is local-only this session.';
  const { error } = await supabase.rpc('set_hosting_tiers', { p_tiers: tiers });
  if (error) return error.message;
  await loadStoreSettings();
  return null;
}

/** Owner-only (definer RPC). Sets the one-time HD memory upgrade price. */
export async function setHdMemoriesPrice(next: number): Promise<string | null> {
  if (!supabaseConfigured) return 'Supabase not configured — change is local-only this session.';
  const { error } = await supabase.rpc('set_hd_memories_price', { p_amount: Math.round(next) });
  if (error) return error.message;
  await loadStoreSettings();
  return null;
}

/** Owner-only (definer RPC, 0041). Sets the shipping built into every album
 *  price ("Free shipping" at checkout) and reloads the schedule. */
export async function setShippingAllowance(next: number): Promise<string | null> {
  if (!supabaseConfigured) return 'Supabase not configured — change is local-only this session.';
  const { error } = await supabase.rpc('set_shipping_allowance', { p_amount: Math.round(next) });
  if (error) return error.message;
  await loadStoreSettings();
  return null;
}

/** Owner-only (definer RPC, 0041). Sets the crossed-out "was" price — the old
 *  multiple and its last day (YYYY-MM-DD) — or clears it with nulls. The SQL
 *  refuses an end date more than 6 months out. */
export async function setPriceCompare(multiple: number | null, until: string | null): Promise<string | null> {
  if (!supabaseConfigured) return 'Supabase not configured — change is local-only this session.';
  const { error } = await supabase.rpc('set_price_compare', { p_multiple: multiple, p_until: until });
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
