/* ══════════════════════════════════════════════════════════════════════════
   Pricing — customer math on a server-issued schedule.

   The raw cost model (sheet cost, per-size hardbound cost, the size premium)
   USED to live here as module constants. It shipped in the JS bundle, so the
   whole cost structure and — combined with the then-public
   store_settings.price_multiple — the margin were readable with devtools. Both
   now live in the `pricing_model` table (migration 0024), owner-readable only.

   The customer path gets `PriceSchedule` from public_price_schedule(): the
   PRE-MULTIPLIED rates, which reproduce the exact same totals but cannot be
   separated back into cost × multiple. Final prices stay public — it's a shop —
   the structure behind them doesn't.

   There is deliberately NO fallback cost model in this file. If the schedule
   fails to load, checkout must refuse to price rather than guess: a wrong price
   on a money path is worse than a blocked one, and any hardcoded fallback would
   put the costs straight back into the bundle.

   The owner-side helpers (costOf / ownerPriceOf / perPageCost) take the model as
   an argument. They are only reachable with a model the Pricing panel fetched
   from owner_pricing_model(), so they carry no secret of their own.
   ══════════════════════════════════════════════════════════════════════════ */

import type { AlbumSizePreset } from '../pages/builder/types';
import type { MiniOffer } from './megyMini';

export type Binding = 'soft' | 'hard';

/** Minimum billable pages. Public by nature — the customer is told "40 pages
 *  included" — so unlike the cost constants this one is fine in the bundle. The
 *  schedule carries the authoritative value; this is the render-time default. */
export const MIN_PAGES = 40;

/** Display names. Purely presentational — the customer reads these off the size
 *  picker — so these stay client-side; only the cost figures moved to the DB. */
export const SIZE_LABELS: Record<AlbumSizePreset, string> = {
  '6x4': '6×4', '8x6': '8×6', '6x8': '6×8', '6x6': '6×6',
  '8x8': '8×8', '11.5x8': '11.5×8', '8.5x11': '8.5×11',
  // The Megy Mini's page (lib/megyMini): never an album size.
  '5.8x8.3': 'A5',
};

/** Owner-only view of the cost model — the shape of owner_pricing_model(). */
export interface PricingModel {
  sheet_cost: number;
  soft_cover_cost: number;
  soft_bind_cost: number;
  min_pages: number;
  price_multiple: number;
  /** Flat per-album amount buffered into every price to fund ~10 years of
   *  living-memory video hosting (owner, 2026-09-09; migration 0029). Added
   *  AFTER the rounded markup like the size premium — never multiplied. */
  hosting_reserve: number;
  /** Hosting TERMS sold at checkout (owner, 2026-09-09; migration 0030). The
   *  first tier is the included term (price 0); longer terms are flat add-ons,
   *  never multiplied. */
  hosting_tiers: HostingTier[];
  /** One-time HD (1080p) memory upgrade, flat (owner, 2026-09-10; migration
   *  0032). Standard 720p is included; HD is a value tier, not cost recovery. */
  hd_memories_price: number;
  /** Longer videos, one time per album (owner, 2026-11-20; migration 0067).
   *  Absent before 0067. */
  video_3min_price?: number;
  video_5min_price?: number;
  sizes: Record<AlbumSizePreset, { pps: number; hb: number; surcharge: number }>;
  /** Shipping built into every album price (owner, 2026-10-08; migration
   *  0041), so checkout can say "Free shipping". Flat, added after the markup
   *  like the hosting reserve — never multiplied. Absent before 0041 → 0. */
  shipping_allowance?: number;
  /** The multiple we really charged before (4×, 25 Jul – 8 Oct 2026), shown as
   *  the crossed-out "was" price until `compare_until`. Null = no was price. */
  compare_multiple?: number | null;
  /** Last day (Asia/Manila, YYYY-MM-DD) the was price shows. */
  compare_until?: string | null;
  /** MEGY MINI (0062; absent before it). On sale only with a shipping fee. */
  mini_on?: boolean;
  mini_price?: number;
  mini_package_price?: number;
  mini_shipping_fee?: number | null;
  mini_free_qr?: number;
  /** Owner's view only: what one Mini costs to make, and the hosting kept
   *  for its videos (inside its price, not added to it). */
  mini_cost?: number;
  mini_hosting_reserve?: number;
}

export interface HostingTier { years: number; price: number }

/** The previous real prices, pre-multiplied like the live rates, hosting
 *  reserve folded in (no shipping — those prices shipped free with nothing
 *  added). Present only until `until`. */
export interface CompareAt {
  until: string;
  sheet_rate: number;
  sizes: Record<AlbumSizePreset, { soft_rate: number; hard_rate: number }>;
}

/** What a fresh store sells before the owner retunes it (mirrors the 0030
 *  default). Also the client fallback when a schedule predates 0030 — but in
 *  that case hosted mode is OFF (see hostedMemoriesEnabled), so nothing is
 *  charged from these. */
export const DEFAULT_HOSTING_TIERS: HostingTier[] = [
  { years: 5, price: 0 }, { years: 10, price: 99 }, { years: 15, price: 149 }, { years: 20, price: 199 },
];

/** Customer-facing schedule — the shape of public_price_schedule(). Carries no
 *  cost and no multiple, only their product. */
export interface PriceSchedule {
  min_pages: number;
  sheet_rate: number;
  /** Flat per-album hosting reserve (see PricingModel). Optional so a schedule
   *  cached by a client older than 0029 still prices — as 0. */
  hosting_reserve?: number;
  /** Hosting terms (see PricingModel). Absent on a pre-0030 schedule. */
  hosting_tiers?: HostingTier[];
  /** HD memory upgrade price. Absent on a pre-0032 schedule → free/no offer. */
  hd_memories_price?: number;
  /** Longer videos, up to 3 or 5 minutes (0067). Absent → videos stay up to
   *  2 minutes. Read through longVideoPricesOf(). */
  long_video_prices?: { '3': number; '5': number } | null;
  /** What the free shipping is worth (the allowance already inside the rates),
   *  for the "Free shipping (₱X value)" line. Absent before 0041 → no value shown. */
  free_shipping_value?: number;
  /** The crossed-out "was" prices, while they run (0041). */
  compare_at?: CompareAt | null;
  /** The launch price (0072), put here by the loaders from
   *  public_launch_price(); absent or null = none. Read it through launchOf(). */
  launch?: LaunchPrice | null;
  disabled_sizes: AlbumSizePreset[];
  sizes: Record<AlbumSizePreset, { pps: number; soft_rate: number; hard_rate: number }>;
  /** Megy Mini while it is on sale (0062); null or absent otherwise. Read it
   *  through miniOfferOf(), never directly. */
  mini?: MiniOffer | null;
}

/** Printed sheets for a page count. Pages are laid up `pps` to a sheet and the
 *  minimum always bills, so this is the one place the page→sheet step lives. */
export function sheetsFor(pps: number, minPages: number, pages: number): number {
  return Math.ceil(Math.max(minPages, pages) / pps);
}

// ── Customer side ───────────────────────────────────────────────────────────

/** Final customer price from the schedule. Equals the operator's
 *  ownerPriceOf() exactly — locked by spec, since the two diverging would mean
 *  charging one number and reporting another. */
export function priceOf(
  schedule: PriceSchedule,
  size: AlbumSizePreset,
  binding: Binding,
  pages: number,
): number {
  const s = schedule.sizes[size];
  const sheets = sheetsFor(s.pps, schedule.min_pages, pages);
  const coverRate = binding === 'hard' ? s.hard_rate : s.soft_rate;
  return Math.round(sheets * schedule.sheet_rate + coverRate) + hostingReserveOf(schedule);
}

/** Valid, ascending hosting tiers from a schedule/model; [] when absent or
 *  malformed (a broken owner save must never crash checkout). */
export function hostingTiersOf(src: { hosting_tiers?: unknown }): HostingTier[] {
  const raw = src.hosting_tiers;
  if (!Array.isArray(raw)) return [];
  const tiers = raw
    .filter((t): t is HostingTier => !!t && typeof t === 'object'
      && Number.isFinite(Number((t as HostingTier).years)) && Number.isFinite(Number((t as HostingTier).price)))
    .map((t) => ({ years: Math.round(Number(t.years)), price: Math.max(0, Math.round(Number(t.price))) }))
    .filter((t) => t.years >= 1);
  tiers.sort((a, b) => a.years - b.years);
  return tiers;
}

/** The included term (the cheapest tier), or null when no tiers are sold. */
export function includedHostingYears(src: { hosting_tiers?: unknown }): number | null {
  const tiers = hostingTiersOf(src);
  return tiers.length ? tiers[0].years : null;
}

/** Pesos for a chosen term. Unknown/absent term → 0 (never over-charge on a
 *  stale client). */
export function hostingTermCharge(src: { hosting_tiers?: unknown }, years: number | null | undefined): number {
  if (years == null) return 0;
  const tier = hostingTiersOf(src).find((t) => t.years === years);
  return tier ? tier.price : 0;
}

/** The HD upgrade price, tolerant of a pre-0032 schedule (no field → 0, which
 *  also means the upgrade is not offered). */
export function hdMemoriesPriceOf(src: { hd_memories_price?: unknown }): number {
  const n = Number(src.hd_memories_price);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

/** Pesos owed for the HD upgrade on this album. Charged only when the album
 *  actually carries memories — an HD flag with no QR memories bills nothing. */
export function hdMemoriesCharge(src: { hd_memories_price?: unknown }, hd: boolean, qrMemories: number): number {
  return hd && qrMemories > 0 ? hdMemoriesPriceOf(src) : 0;
}

/* ── LONGER VIDEOS (owner, 2026-11-20; migration 0067) ─────────────────────
   Memory videos are up to 2 minutes. An album can have longer ones for a
   one-time price set by its LONGEST video: up to 3 minutes or up to 5
   minutes (720p; HD is its own upgrade on top). Delete the long videos and
   the charge goes. order_quote() charges the same (orderQuote.spec). */
export type VideoMinutes = 2 | 3 | 5;
/** The length every album includes. */
export const BASE_VIDEO_SECONDS = 120;
/** The longest a video can be, with the 5-minute upgrade. */
export const LONGEST_VIDEO_SECONDS = 300;

/** The longer-video prices, or null when the price list doesn't sell them
 *  (a pre-0067 schedule: videos stay up to 2 minutes). */
export function longVideoPricesOf(src: { long_video_prices?: unknown }): { 3: number; 5: number } | null {
  const p = src.long_video_prices;
  if (!p || typeof p !== 'object') return null;
  const three = Number((p as Record<string, unknown>)['3']);
  const five = Number((p as Record<string, unknown>)['5']);
  if (!Number.isFinite(three) || !Number.isFinite(five) || three < 0 || five < 0) return null;
  return { 3: Math.round(three), 5: Math.round(five) };
}

/** The tier one video needs: 2 (included), 3 or 5 minutes, or null when it is
 *  longer than 5 minutes. A length we couldn't read counts as included. */
export function videoMinutesFor(seconds: number | null | undefined): VideoMinutes | null {
  if (seconds == null || !Number.isFinite(seconds)) return 2;
  if (seconds <= BASE_VIDEO_SECONDS + 0.5) return 2;
  if (seconds <= 180.5) return 3;
  if (seconds <= LONGEST_VIDEO_SECONDS + 0.5) return 5;
  return null;
}

/** The album's tier: its longest video's (a video too long for any tier
 *  counts as 5; the picker never lets one in). */
export function albumVideoMinutes(lengths: readonly (number | null | undefined)[]): VideoMinutes {
  let tier: VideoMinutes = 2;
  for (const s of lengths) {
    const t = videoMinutesFor(s) ?? 5;
    if (t > tier) tier = t;
  }
  return tier;
}

/** The longest video the picker takes: 5 minutes when the price list sells
 *  longer videos, else 2. */
export function maxVideoSecondsOf(src: { long_video_prices?: unknown }): number {
  return longVideoPricesOf(src) ? LONGEST_VIDEO_SECONDS : BASE_VIDEO_SECONDS;
}

/** Pesos owed for longer videos on this album (order_quote's long_fee):
 *  only when the album carries video memories. */
export function longVideoCharge(src: { long_video_prices?: unknown }, minutes: number | null | undefined, qrMemories: number): number {
  if (qrMemories <= 0 || (minutes !== 3 && minutes !== 5)) return 0;
  const prices = longVideoPricesOf(src);
  return prices ? Math.max(0, prices[minutes]) : 0;
}

/** The bill's line for it. */
export function longVideoLine(minutes: 3 | 5): string {
  return `Longer videos · up to ${minutes} minutes, one time`;
}

/** The flat reserve, tolerant of a pre-0029 schedule (no field → 0). */
export function hostingReserveOf(schedule: Pick<PriceSchedule, 'hosting_reserve'>): number {
  const r = Number(schedule.hosting_reserve);
  return Number.isFinite(r) && r > 0 ? Math.round(r) : 0;
}

/** The shipping built into the price, from the owner model (pre-0041 → 0). */
export function shippingAllowanceOf(model: Pick<PricingModel, 'shipping_allowance'>): number {
  const r = Number(model.shipping_allowance);
  return Number.isFinite(r) && r > 0 ? Math.round(r) : 0;
}

/** What "Free shipping" is worth on a customer schedule (pre-0041 → 0, so no
 *  value is claimed — the shipping is still free, it just isn't priced in). */
export function freeShippingValueOf(schedule: Pick<PriceSchedule, 'free_shipping_value'>): number {
  const r = Number(schedule.free_shipping_value);
  return Number.isFinite(r) && r > 0 ? Math.round(r) : 0;
}

/** Today in the Philippines as YYYY-MM-DD — the was price ends on a Manila
 *  date, not at UTC midnight. */
export function manilaToday(now: Date = new Date()): string {
  return new Date(now.getTime() + 8 * 3_600_000).toISOString().slice(0, 10);
}

/** The crossed-out "was" price of the print (album + extra pages) — what this
 *  exact album cost before the price drop — or null when there is none, it
 *  has ended, or it isn't higher than today's price. */
export function compareAtPriceOf(
  schedule: PriceSchedule,
  size: AlbumSizePreset,
  binding: Binding,
  pages: number,
  today: string = manilaToday(),
): number | null {
  const c = schedule.compare_at;
  const r = c?.sizes?.[size];
  if (!c || !r || typeof c.until !== 'string' || today > c.until) return null;
  const rate = binding === 'hard' ? Number(r.hard_rate) : Number(r.soft_rate);
  const sheetRate = Number(c.sheet_rate);
  if (!Number.isFinite(rate) || !Number.isFinite(sheetRate)) return null;
  const sheets = sheetsFor(schedule.sizes[size].pps, schedule.min_pages, pages);
  const was = Math.round(sheets * sheetRate + rate);
  return was > priceOf(schedule, size, binding, pages) ? was : null;
}

/* ── LAUNCH PRICE (owner, 2026-11-24: "Yes, 40% to Mar 31") ──────────────────
   Megy Prints is a premium product. Today's album prices are its LAUNCH
   price: N% off a regular price we really start charging the day after
   `until`. The crossed-out number is that regular price, so the "% off" is
   true for the album it sits on. Honest only while it ends: the database
   (0072 set_launch_price) refuses an end date more than 6 months out, and
   public_launch_price() stops sending it after `until` (Manila date).
   Albums only: the Megy Mini keeps its own price with no % off, and the
   add-ons (videos, HD, hosting years) are never discounted. While a launch
   price runs it replaces the old "was" price (0041). */

/** What public_launch_price() sends while a launch price runs. */
export interface LaunchPrice {
  /** Whole percent off the regular price, 1–90. */
  pct: number;
  /** The last day (Asia/Manila, YYYY-MM-DD) it runs. */
  until: string;
}

/** A launch price as the database sent it, or null when it isn't one that
 *  can be shown honestly (a whole % from 1 to 90 and a real end date). */
export function parseLaunchPrice(data: unknown): LaunchPrice | null {
  if (!data || typeof data !== 'object') return null;
  const { pct, until } = data as { pct?: unknown; until?: unknown };
  const p = Number(pct);
  if (!Number.isInteger(p) || p < 1 || p > 90) return null;
  if (typeof until !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(until)) return null;
  return { pct: p, until };
}

/** The launch price running on `today` (Manila), or null. */
export function launchOf(
  schedule: Pick<PriceSchedule, 'launch'> | null | undefined,
  today: string = manilaToday(),
): LaunchPrice | null {
  const l = parseLaunchPrice(schedule?.launch);
  return l && today <= l.until ? l : null;
}

/** The regular price of the print (album + extra pages) while a launch price
 *  runs: today's price is `pct`% off it, so regular = today ÷ (1 − pct/100).
 *  Null when none runs, or the size isn't an album on the price list (the
 *  Megy Mini never is). */
export function launchRegularOf(
  schedule: PriceSchedule,
  size: AlbumSizePreset,
  binding: Binding,
  pages: number,
  today: string = manilaToday(),
): number | null {
  const l = launchOf(schedule, today);
  if (!l || !schedule.sizes?.[size]) return null;
  const now = priceOf(schedule, size, binding, pages);
  if (!Number.isFinite(now) || now <= 0) return null;
  return Math.round(now / (1 - l.pct / 100));
}

/** The crossed-out price of the print: the launch price's regular price while
 *  it runs, else the old "was" price (0041), else null. */
export function crossedOutPrintOf(
  schedule: PriceSchedule,
  size: AlbumSizePreset,
  binding: Binding,
  pages: number,
  today: string = manilaToday(),
): number | null {
  return launchRegularOf(schedule, size, binding, pages, today)
    ?? compareAtPriceOf(schedule, size, binding, pages, today);
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

/** "March 31, 2027" from "2027-03-31" (written out: phones differ in the
 *  date words they carry). */
export function longDate(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return MONTHS[m - 1] ? `${MONTHS[m - 1]} ${d}, ${y}` : ymd;
}

/** The line under the total, the same in the app and on the website. */
export function launchLine(l: LaunchPrice): string {
  return `Launch price: ${l.pct}% off the album until ${longDate(l.until)}`;
}

/** What the pages past the included minimum add to the price. Pages print
 *  `pps` to a sheet and the price is per sheet, so 10 more pages on an 8×8
 *  (4 a sheet) are 3 more sheets: ₱318. The summary used to show
 *  "10 × ₱27 = ₱270" and hid the other ₱48 in the line still labelled
 *  "40 pages" (1-star testers round 3, the Indecisive One). */
export function extraPagesCharge(
  schedule: PriceSchedule, size: AlbumSizePreset, binding: Binding, pages: number,
): { pages: number; sheets: number; amount: number } {
  const min = schedule.min_pages;
  const pps = schedule.sizes[size].pps;
  return {
    pages: Math.max(0, pages - min),
    sheets: sheetsFor(pps, min, pages) - sheetsFor(pps, min, min),
    amount: priceOf(schedule, size, binding, pages) - priceOf(schedule, size, binding, min),
  };
}

export interface PriceLine { label: string; amount: number }
export interface PriceBreakdown { items: PriceLine[]; total: number }

// ── Video memories (living-memory QRs) ──────────────────────────────────────
// Owner, 2026-11-19: "2 free video memory, once they see that add they'd want
// more … 3 videos per 100 php". Every album includes FREE_QR_MEMORIES (a Megy
// Mini: its own offer's free_qr); past those, videos come in packs of
// QR_PACK_SIZE for QR_PACK_PRICE: 1–3 extra = ₱100, 4–6 = ₱200, and so on.
// Counted per QR code (hosted clip or pasted link alike). The database prices
// the order the same way (0066 order_quote; orderQuote.spec holds them equal).
export const FREE_QR_MEMORIES = 2;
export const QR_PACK_SIZE = 3;
export const QR_PACK_PRICE = 100;

/** Packs of QR_PACK_SIZE needed for `count` QR memories, `free` included. */
export function qrPacksFor(count: number, free: number = FREE_QR_MEMORIES): number {
  const extra = Math.max(0, Math.floor(count) - Math.max(0, Math.floor(free)));
  return Math.ceil(extra / QR_PACK_SIZE);
}

/** Pesos owed for `count` QR memories on one album (or a Mini, with its own `free`). */
export function qrMemoryCharge(count: number, free: number = FREE_QR_MEMORIES): number {
  return qrPacksFor(count, free) * QR_PACK_PRICE;
}

/** The bill's line for extra videos: "2 included, 4 extra (2 packs of 3 × ₱100)". */
export function qrPacksLine(count: number, free: number): string {
  const extra = Math.max(0, Math.floor(count) - Math.max(0, Math.floor(free)));
  const packs = qrPacksFor(count, free);
  return `${free} included, ${extra} extra (${packs} ${packs === 1 ? 'pack' : 'packs'} of ${QR_PACK_SIZE} × ₱${QR_PACK_PRICE})`;
}

/** How extra videos are sold, in a few words: "3 more for ₱100". */
export const QR_PACK_OFFER = `${QR_PACK_SIZE} more for ₱${QR_PACK_PRICE}`;
/** The same as a sentence, after "2 … included": "Add more in packs of 3 for ₱100." */
export const QR_PACK_SENTENCE = `Add more in packs of ${QR_PACK_SIZE} for ₱${QR_PACK_PRICE}.`;

/* ── THE PACK OFFER (owner's design 2026-10-26: "they click on the golden
   button and a pop-up appears"; re-asked 2026-11-24 after a Mini took a 3rd
   video with no word) ────────────────────────────────────────────────────
   Adding a video when `used` are already on the album: does THIS one start a
   new paid pack? Yes right after the free videos are used up, and again each
   time a pack of QR_PACK_SIZE fills. Then the customer is told before they
   pick: what it costs and that it is paid with the album at checkout. Between
   those points the next video fits in a pack already counted: nothing to say. */
export function videoStartsNewPack(used: number, free: number = FREE_QR_MEMORIES): boolean {
  const u = Math.max(0, Math.floor(used));
  const f = Math.max(0, Math.floor(free));
  return u >= f && (u - f) % QR_PACK_SIZE === 0;
}

/** The pop-up's title: the free videos used up, or the extra ones. */
export function packOfferTitle(used: number, free: number = FREE_QR_MEMORIES): string {
  const extra = Math.max(0, Math.floor(used) - Math.floor(free));
  return extra === 0
    ? `You've used your ${free} free videos`
    : `Your ${extra} extra videos are used`;
}
/** The pop-up's line under the title. */
export const PACK_OFFER_BODY = `Add ${QR_PACK_SIZE} more video memories for ₱${QR_PACK_PRICE}. You pay it with your album at checkout.`;
/** The pop-up's one filled button. */
export const PACK_OFFER_YES = `Add ${QR_PACK_SIZE} more · ₱${QR_PACK_PRICE}`;
/** The pop-up's way out. */
export const PACK_OFFER_NO = 'Not now';

/** Structural view of a page for counting — both QR homes: a QR slot on a
 *  photo layout (`qrFills`) and a QR in a combo/caption box (`textSlotQr`). */
export interface QrCountablePage {
  qrFills?: (unknown | null)[] | null;
  textSlotQr?: (unknown | null)[] | null;
}

/** QR memories an album carries — what the add-on line bills. */
export function countQrMemories(pages: readonly QrCountablePage[]): number {
  let n = 0;
  for (const p of pages) {
    for (const f of p.qrFills ?? []) if (f) n++;
    for (const f of p.textSlotQr ?? []) if (f) n++;
  }
  return n;
}

/** CUSTOMER-FACING. Marked-up amounts only. The album line is always the
 *  price of the included pages, whatever the page count, and the extra-pages
 *  line is everything the pages past them add, so items sum exactly to the
 *  total. */
export function priceBreakdown(
  schedule: PriceSchedule,
  size: AlbumSizePreset,
  binding: Binding,
  pages: number,
  /** QR memories on the album (see FREE_QR_MEMORIES). Omitted = none. */
  qrMemories = 0,
  /** Chosen hosting term in years (see hosting_tiers). Omitted = included term. */
  hostingYears: number | null = null,
  /** HD (1080p) memories chosen for this album. Omitted = standard 720p. */
  hdMemories = false,
  /** The album's longest-video tier (albumVideoMinutes). Omitted = 2. */
  videoMinutes: number | null = null,
): PriceBreakdown {
  const bindingLabel = binding === 'hard' ? 'Hardbound' : 'Softcover';
  const sizeLabel = SIZE_LABELS[size];
  const minPages = schedule.min_pages;
  const printTotal = priceOf(schedule, size, binding, pages);
  const qrCharge = qrMemoryCharge(qrMemories);
  const termCharge = hostingTermCharge(schedule, hostingYears);
  const hdCharge = hdMemoriesCharge(schedule, hdMemories, qrMemories);
  const longCharge = longVideoCharge(schedule, videoMinutes, qrMemories);
  const total = printTotal + qrCharge + termCharge + hdCharge + longCharge;

  const extra = Math.max(0, pages - minPages);
  const items: PriceLine[] = [];

  if (extra > 0) {
    const more = extraPagesCharge(schedule, size, binding, pages);
    const pps = schedule.sizes[size].pps;
    items.push({
      label: `Album — ${sizeLabel} ${bindingLabel} · ${minPages} pages · ${FREE_QR_MEMORIES} QR memories included`,
      amount: printTotal - more.amount,
    });
    items.push({
      label: `Extra pages · ${extra} (pages print ${pps} to a sheet: ${more.sheets} more ${more.sheets === 1 ? 'sheet' : 'sheets'})`,
      amount: more.amount,
    });
  } else {
    items.push({
      label: `Album — ${sizeLabel} ${bindingLabel} · ${minPages} pages · ${FREE_QR_MEMORIES} QR memories included`,
      amount: printTotal,
    });
  }

  if (qrCharge > 0) {
    items.push({
      label: `Living-memory QR · ${qrPacksLine(qrMemories, FREE_QR_MEMORIES)}`,
      amount: qrCharge,
    });
  }

  if (termCharge > 0 && hostingYears != null) {
    const included = includedHostingYears(schedule);
    items.push({
      label: `Memories stay live · ${hostingYears} years${included ? ` (${included} included)` : ''}`,
      amount: termCharge,
    });
  }

  if (hdCharge > 0) {
    items.push({ label: 'HD memories · 1080p, one time', amount: hdCharge });
  }
  if (longCharge > 0) {
    items.push({ label: longVideoLine(videoMinutes as 3 | 5), amount: longCharge });
  }

  return { items, total };
}

/** CUSTOMER-FACING. A Megy Mini's bill (0062): its set price, the shipping
 *  fee on top (albums ship free, the Mini doesn't), packs of 3 videos past
 *  its free ones, and the same memory term and HD add-ons as an album. The
 *  checkout's mirror of order_quote()'s Mini branch: same total to the peso. */
export function miniPriceBreakdown(
  schedule: PriceSchedule,
  offer: MiniOffer,
  qrMemories = 0,
  hostingYears: number | null = null,
  hdMemories = false,
  videoMinutes: number | null = null,
): PriceBreakdown & { shipping: number } {
  const free = Math.max(0, Math.floor(offer.free_qr));
  const qrCharge = qrMemoryCharge(qrMemories, free);
  const termCharge = hostingTermCharge(schedule, hostingYears);
  const hdCharge = hdMemoriesCharge(schedule, hdMemories, qrMemories);
  const longCharge = longVideoCharge(schedule, videoMinutes, qrMemories);
  const items: PriceLine[] = [
    {
      label: `Megy Mini — A5 · ${offer.pages} pages · staples · ${free} video ${free === 1 ? 'memory' : 'memories'} included`,
      amount: offer.price,
    },
    { label: 'Shipping', amount: offer.shipping_fee },
  ];
  if (qrCharge > 0) {
    items.push({ label: `Video memories · ${qrPacksLine(qrMemories, free)}`, amount: qrCharge });
  }
  if (termCharge > 0 && hostingYears != null) {
    const included = includedHostingYears(schedule);
    items.push({
      label: `Memories stay live · ${hostingYears} years${included ? ` (${included} included)` : ''}`,
      amount: termCharge,
    });
  }
  if (hdCharge > 0) {
    items.push({ label: 'HD memories · 1080p, one time', amount: hdCharge });
  }
  if (longCharge > 0) {
    items.push({ label: longVideoLine(videoMinutes as 3 | 5), amount: longCharge });
  }
  return { items, total: offer.price + offer.shipping_fee + qrCharge + termCharge + hdCharge + longCharge, shipping: offer.shipping_fee };
}

// ── Owner side (model supplied by owner_pricing_model()) ────────────────────

/** RAW COST. Owner-only — never render on a customer surface. */
export function costOf(
  model: PricingModel,
  size: AlbumSizePreset,
  binding: Binding,
  pages: number,
): number {
  const s = model.sizes[size];
  const interior = sheetsFor(s.pps, model.min_pages, pages) * model.sheet_cost;
  return binding === 'hard'
    ? interior + s.hb
    : interior + model.soft_cover_cost + model.soft_bind_cost;
}

/** RAW per-page cost. Owner-only. */
export function perPageCost(model: PricingModel, size: AlbumSizePreset): number {
  return model.sheet_cost / model.sizes[size].pps;
}

/** The operator's view of the customer price, computed from the raw model at an
 *  arbitrary multiple (the Pricing panel's what-if slider). At the store's own
 *  multiple this must equal priceOf() on the schedule — see the spec. */
export function ownerPriceOf(
  model: PricingModel,
  size: AlbumSizePreset,
  binding: Binding,
  pages: number,
  multiple: number,
): number {
  return Math.round(costOf(model, size, binding, pages) * multiple)
    + model.sizes[size].surcharge
    + hostingReserveOf(model)
    + shippingAllowanceOf(model);
}

/** Pure mirror of public_price_schedule()'s arithmetic. Lives here so the spec
 *  can prove the schedule and the raw model agree without standing up a
 *  database; the SQL is the runtime source of truth.
 *
 *  The shipping allowance rides INSIDE the cover rates (flat, never
 *  multiplied), so every client — old app versions included — charges it with
 *  no change. `today` is the Manila date the SQL compares the was price's end
 *  date to; omit it to keep any was price that is set. */
export function scheduleFrom(
  model: PricingModel,
  multiple: number,
  disabledSizes: AlbumSizePreset[] = [],
  today?: string,
): PriceSchedule {
  const ship = shippingAllowanceOf(model);
  const reserve = hostingReserveOf(model);
  const cm = Number(model.compare_multiple);
  const until = model.compare_until;
  const showCompare = Number.isFinite(cm) && cm > multiple && typeof until === 'string'
    && (today === undefined || today <= until);
  const sizes = {} as PriceSchedule['sizes'];
  const compareSizes = {} as CompareAt['sizes'];
  for (const key of Object.keys(model.sizes) as AlbumSizePreset[]) {
    const s = model.sizes[key];
    const soft = model.soft_cover_cost + model.soft_bind_cost;
    sizes[key] = {
      pps: s.pps,
      soft_rate: soft * multiple + s.surcharge + ship,
      hard_rate: s.hb * multiple + s.surcharge + ship,
    };
    if (showCompare) {
      compareSizes[key] = {
        soft_rate: soft * cm + s.surcharge + reserve,
        hard_rate: s.hb * cm + s.surcharge + reserve,
      };
    }
  }
  return {
    min_pages: model.min_pages,
    sheet_rate: model.sheet_cost * multiple,
    hosting_reserve: model.hosting_reserve,
    hosting_tiers: model.hosting_tiers,
    hd_memories_price: model.hd_memories_price,
    free_shipping_value: ship,
    ...(showCompare ? { compare_at: { until: until as string, sheet_rate: model.sheet_cost * cm, sizes: compareSizes } } : {}),
    disabled_sizes: disabledSizes,
    sizes,
  };
}
