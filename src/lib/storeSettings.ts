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
import { parseLaunchPrice, parseVideoOffer, type LaunchPrice, type PriceSchedule, type PricingModel, type VideoOffer } from './pricing';

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

/** The launch price while one runs (public_launch_price, 0072), or null. It
 *  only adds a crossed-out regular price, so any failure (a database before
 *  0072, no connection) is "no launch price" and never blocks the prices. */
async function loadLaunchPrice(): Promise<LaunchPrice | null> {
  try {
    const { data, error } = await supabase.rpc('public_launch_price');
    return error ? null : parseLaunchPrice(data);
  } catch {
    return null;
  }
}

/** A database that doesn't have the function asked for (PostgREST's code, or
 *  Postgres's), as opposed to one that couldn't be reached. */
export function isMissingFunction(e: { code?: string; message?: string } | null | undefined): boolean {
  return !!e && (e.code === 'PGRST202' || e.code === '42883' || /could not find the function/i.test(e.message ?? ''));
}

/** How extra videos are sold (public_video_offer, 0078). It sets what videos
 *  cost, so it is part of the prices: a failed read is a failed load (no
 *  price, tried again), and only a database before 0078 (no such function)
 *  means the 0066 packs (video_offer null → videoOfferOf's legacy rule). */
async function loadVideoOffer(): Promise<{ ok: true; offer: VideoOffer | null } | { ok: false }> {
  try {
    const { data, error } = await supabase.rpc('public_video_offer');
    if (!error) return { ok: true, offer: parseVideoOffer(data) };
    return isMissingFunction(error) ? { ok: true, offer: null } : { ok: false };
  } catch {
    return { ok: false };
  }
}

let inflight: Promise<void> | null = null;
/** Load the customer price schedule (on app start, and again until it lands). */
export function loadStoreSettings(): Promise<void> {
  if (!supabaseConfigured) { markReady(); return Promise.resolve(); }
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const [{ data, error }, launch, video] = await Promise.all([supabase.rpc('public_price_schedule'), loadLaunchPrice(), loadVideoOffer()]);
      if (error) { console.warn('price schedule load failed:', error.message); return; }
      if (!video.ok) { console.warn('video prices did not load'); return; }
      if (data && typeof data === 'object') {
        schedule = { ...(data as PriceSchedule), launch, video_offer: video.offer };
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

/** Owner-only (definer RPC, 0067). Sets the longer-video prices: up to 3
 *  minutes and up to 5 minutes, once per album. */
export async function setLongVideoPrices(threeMin: number, fiveMin: number): Promise<string | null> {
  if (!supabaseConfigured) return 'Supabase not configured — change is local-only this session.';
  const { error } = await supabase.rpc('set_long_video_prices', { p_3min: Math.round(threeMin), p_5min: Math.round(fiveMin) });
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

/** Owner-only (pricing_model is owner-only, 0058). The launch price as set,
 *  running or not, for the Pricing panel; null when it can't be read (not the
 *  owner, or a database before 0072). */
export async function loadOwnerLaunchPrice(): Promise<{ pct: number | null; until: string | null } | null> {
  if (!supabaseConfigured) return null;
  try {
    const { data, error } = await supabase.from('pricing_model').select('launch_pct, launch_until').eq('id', 1).maybeSingle();
    if (error || !data) return null;
    const row = data as { launch_pct: number | null; launch_until: string | null };
    return { pct: row.launch_pct ?? null, until: row.launch_until ?? null };
  } catch {
    return null;
  }
}

/** Owner-only (definer RPC, 0072). Sets the launch price — a whole % off and
 *  its last day (YYYY-MM-DD) — or ends it with nulls. The SQL refuses more
 *  than 90% and an end date past 6 months. Reloads the schedule. */
export async function setLaunchPrice(pct: number | null, until: string | null): Promise<string | null> {
  if (!supabaseConfigured) return 'Supabase not configured — change is local-only this session.';
  const { error } = await supabase.rpc('set_launch_price', { p_pct: pct, p_until: until });
  if (error) return error.message;
  await loadStoreSettings();
  return null;
}

/** Owner-only (pricing_model is owner-only, 0058). The video sale as set,
 *  running or not, and the prices it sells at, for the Pricing panel; null
 *  when it can't be read (not the owner, or a database before 0078). */
export async function loadOwnerVideoSale(): Promise<{ name: string | null; until: string | null; single: number; packSize: number; packPrice: number } | null> {
  if (!supabaseConfigured) return null;
  try {
    const { data, error } = await supabase.from('pricing_model')
      .select('video_sale_name, video_sale_until, video_price, video_pack_size, video_pack_price').eq('id', 1).maybeSingle();
    if (error || !data) return null;
    const r = data as { video_sale_name: string | null; video_sale_until: string | null; video_price: number; video_pack_size: number; video_pack_price: number };
    return { name: r.video_sale_name ?? null, until: r.video_sale_until ?? null, single: r.video_price, packSize: r.video_pack_size, packPrice: r.video_pack_price };
  } catch {
    return null;
  }
}

/** Owner-only (definer RPC, 0078). Starts or changes the video sale — its
 *  name and last day (YYYY-MM-DD) — or ends it with nulls. The SQL refuses an
 *  end date past 6 months and a name over 30 letters. Reloads the schedule. */
export async function setVideoSale(name: string | null, until: string | null): Promise<string | null> {
  if (!supabaseConfigured) return 'Supabase not configured — change is local-only this session.';
  const { error } = await supabase.rpc('set_video_sale', { p_name: name, p_until: until });
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

/** Owner-only (definer RPC, 0062). Megy Mini: on or off, its price, its price
 *  inside a package, the shipping fee charged on top (needed to turn it on)
 *  and the free videos. Reloads the schedule. */
export async function setMegyMini(next: { on: boolean; price: number; packagePrice: number; shippingFee: number | null; freeQr: number }): Promise<string | null> {
  if (!supabaseConfigured) return 'Supabase not configured — change is local-only this session.';
  const { error } = await supabase.rpc('set_megy_mini', {
    p_on: next.on,
    p_price: Math.round(next.price),
    p_package_price: Math.round(next.packagePrice),
    p_shipping_fee: next.shippingFee == null ? null : Math.round(next.shippingFee),
    p_free_qr: Math.round(next.freeQr),
  });
  if (error) return error.message;
  await loadStoreSettings();
  return null;
}

/** Owner-only (definer RPC, 0074). Sets or clears album prices by size and
 *  cover — the price of the smallest album, shipping and hosting included:
 *  `{ '8x8': { soft: 1505, hard: 1965 } }`. null clears one (that cover goes
 *  back to the store multiple); a cover left out is left alone. The SQL
 *  refuses a price under the floor (Bridgemedia cost + shipping + hosting).
 *  Reloads the schedule so checkout picks it up at once. */
export async function setSizePrices(
  prices: Partial<Record<AlbumSizePreset, { soft?: number | null; hard?: number | null }>>,
): Promise<string | null> {
  if (!supabaseConfigured) return 'Supabase not configured — change is local-only this session.';
  const { error } = await supabase.rpc('set_size_prices', { p_prices: prices });
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
