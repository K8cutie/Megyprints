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

export type Binding = 'soft' | 'hard';

/** Minimum billable pages. Public by nature — the customer is told "40 pages
 *  included" — so unlike the cost constants this one is fine in the bundle. The
 *  schedule carries the authoritative value; this is the render-time default. */
export const MIN_PAGES = 40;

/** Display names. Purely presentational — the customer reads these off the size
 *  picker — so these stay client-side; only the cost figures moved to the DB. */
export const SIZE_LABELS: Record<AlbumSizePreset, string> = {
  '6x4': '6×4', '8x6': '8×6', '6x8': '6×8', '6x6': '6×6',
  '8x8': '8×8', '9x9': '9×9', '11.5x8': '11.5×8', '8.5x11': '8.5×11',
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
  /** Video memory packages past the free ones (0056). Absent before 0056. */
  qr_packages?: VideoPackage[];
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
  /** What the free shipping is worth (the allowance already inside the rates),
   *  for the "Free shipping (₱X value)" line. Absent before 0041 → no value shown. */
  free_shipping_value?: number;
  /** The crossed-out "was" prices, while they run (0041). */
  compare_at?: CompareAt | null;
  /** Video memory packages past the free ones (0056). Absent before 0056:
   *  then every extra QR is EXTRA_QR_RATE, as before. */
  qr_packages?: VideoPackage[];
  disabled_sizes: AlbumSizePreset[];
  sizes: Record<AlbumSizePreset, { pps: number; soft_rate: number; hard_rate: number }>;
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

// ── Living-memory QR add-on (owner-set 2026-09-09) ──────────────────────────
// Every album includes FREE_QR_MEMORIES QR memories; each one past that adds
// EXTRA_QR_RATE to the order. Counted per QR code (hosted clip or pasted link
// alike). Public by nature — the customer is told "7 included" — so these sit
// in the bundle like MIN_PAGES; move them to the schedule if they ever need to
// be owner-tunable without a deploy.
export const FREE_QR_MEMORIES = 7;
export const EXTRA_QR_RATE = 20;

/** Pesos owed for `count` QR memories on one album. */
export function qrMemoryCharge(count: number): number {
  return Math.max(0, Math.floor(count) - FREE_QR_MEMORIES) * EXTRA_QR_RATE;
}

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

// ── Video memory packages (owner, 2026-10-26; migration 0056) ───────────────
// Past the FREE_QR_MEMORIES, more videos come in packages the owner sets in
// the Pricing tab (+2 ₱100, +5 ₱200, +12 ₱300). The customer picks one in the
// builder when the free ones run out (AddQrModal); the choice stays on the
// phone with the album (videoPackageChoice) and goes with the order. 0056's
// video_package_fee() is this arithmetic in SQL, step for step, so the saved
// "Asked to pay" total can't differ from the Pay screen's. A schedule without
// packages (a database before 0056) keeps EXTRA_QR_RATE per extra QR.

export interface VideoPackage { videos: number; price: number }
export interface PackageMix { price: number; slots: number; mix: number[] }

/** Past this many videos the cheapest mix is the best-value package repeated
 *  (keeps the search small; no real album comes near it). */
export const PACKAGE_SEARCH_LIMIT = 2000;
/** More chosen packages than this isn't a real choice: priced as none. */
export const MAX_CHOSEN_PACKAGES = 20;

/** JavaScript's Math.round as the SQL writes it: floor(x + 0.5). */
const roundHalfUp = (x: number) => Math.floor(x + 0.5);

/** The packages on sale, smallest first: number fields only, 1–100 videos,
 *  the first entry for a size kept, prices rounded and never below 0. */
export function qrPackagesOf(src: { qr_packages?: unknown }): VideoPackage[] {
  const raw = src.qr_packages;
  if (!Array.isArray(raw)) return [];
  const seen = new Set<number>();
  const out: VideoPackage[] = [];
  for (const t of raw) {
    if (!t || typeof t !== 'object' || Array.isArray(t)) continue;
    const { videos, price } = t as { videos?: unknown; price?: unknown };
    if (typeof videos !== 'number' || typeof price !== 'number' || !Number.isFinite(videos) || !Number.isFinite(price)) continue;
    const v = roundHalfUp(videos);
    if (v < 1 || v > 100 || seen.has(v)) continue;
    seen.add(v);
    out.push({ videos: v, price: Math.max(0, roundHalfUp(price)) });
  }
  return out.sort((a, b) => a.videos - b.videos);
}

/** The cheapest mix of packages that holds at least `need` videos. Ties go
 *  to more videos, then fewer packages, then the larger package first. */
export function cheapestPackageMix(packages: readonly VideoPackage[], need: number): PackageMix {
  const n = Math.max(0, Math.floor(need));
  if (!packages.length || n === 0) return { price: 0, slots: 0, mix: [] };
  const desc = [...packages].sort((a, b) => b.videos - a.videos);
  if (n > PACKAGE_SEARCH_LIMIT) {
    let best = desc[0];
    for (const p of desc) if (p.price * best.videos < best.price * p.videos) best = p;
    const k = Math.ceil(n / best.videos);
    return { price: k * best.price, slots: k * best.videos, mix: new Array<number>(k).fill(best.videos) };
  }
  const price = new Array<number>(n + 1).fill(0);
  const slots = new Array<number>(n + 1).fill(0);
  const count = new Array<number>(n + 1).fill(0);
  const choice = new Array<number>(n + 1).fill(0);
  for (let k = 1; k <= n; k++) {
    let bp = Infinity, bs = 0, bc = 0, bv = 0;
    for (const p of desc) {
      const r = Math.max(0, k - p.videos);
      const cp = p.price + price[r], cs = p.videos + slots[r], cc = 1 + count[r];
      if (cp < bp || (cp === bp && (cs > bs || (cs === bs && cc < bc)))) { bp = cp; bs = cs; bc = cc; bv = p.videos; }
    }
    price[k] = bp; slots[k] = bs; count[k] = bc; choice[k] = bv;
  }
  const mix: number[] = [];
  for (let k = n; k > 0; k = Math.max(0, k - choice[k])) mix.push(choice[k]);
  return { price: price[n], slots: slots[n], mix: mix.sort((a, b) => b - a) };
}

/** The packages the customer chose, as a mix — or null when they aren't a
 *  real choice: none, too many, or a size that isn't on sale. */
export function chosenPackages(packages: readonly VideoPackage[], chosen: readonly number[]): PackageMix | null {
  if (!chosen.length || chosen.length > MAX_CHOSEN_PACKAGES) return null;
  let price = 0, slots = 0;
  for (const v of chosen) {
    const p = packages.find((x) => x.videos === v);
    if (!p) return null;
    price += p.price;
    slots += p.videos;
  }
  return { price, slots, mix: [...chosen].sort((a, b) => b - a) };
}

export interface VideoMemoryFee {
  /** 'legacy': no packages on sale, EXTRA_QR_RATE per extra QR. */
  mode: 'packages' | 'legacy';
  fee: number;
  /** The packages charged for, largest first. */
  mix: number[];
  slots: number;
  /** True when it's the customer's own choice, false when the cheapest mix. */
  chosen: boolean;
}

/** What the videos past the free ones cost. None past the free ones: ₱0. The
 *  customer's packages when they hold every extra video; otherwise (none
 *  chosen, too few, or not on sale) the cheapest mix that does. */
export function videoMemoryFee(src: { qr_packages?: unknown }, qrMemories: number, chosen: readonly number[] = []): VideoMemoryFee {
  const extra = Math.max(0, Math.floor(qrMemories) - FREE_QR_MEMORIES);
  const packages = qrPackagesOf(src);
  if (!packages.length) return { mode: 'legacy', fee: extra * EXTRA_QR_RATE, mix: [], slots: 0, chosen: false };
  if (extra === 0) return { mode: 'packages', fee: 0, mix: [], slots: 0, chosen: false };
  const own = chosenPackages(packages, chosen);
  if (own && own.slots >= extra) return { mode: 'packages', fee: own.price, mix: own.mix, slots: own.slots, chosen: true };
  const c = cheapestPackageMix(packages, extra);
  return { mode: 'packages', fee: c.price, mix: c.mix, slots: c.slots, chosen: false };
}

/** The highest per-video price on sale (the +2's ₱50): what "Save" compares
 *  with. Honest because a package at that rate IS on sale; a made-up regular
 *  price would be a deceptive price claim (Consumer Act, see 0041). */
export function packageReferenceRate(packages: readonly VideoPackage[]): number {
  return packages.reduce((m, p) => Math.max(m, p.price / p.videos), 0);
}

/** "₱600, now ₱300 · Save 50%": the same videos at the reference rate, when
 *  that's more than the price; null otherwise. */
export function packageSaving(packages: readonly VideoPackage[], slots: number, price: number): { was: number; pct: number } | null {
  const was = Math.round(slots * packageReferenceRate(packages));
  if (!(was > price)) return null;
  return { was, pct: Math.round((1 - price / was) * 100) };
}

export interface PackageOption extends PackageMix {
  /** Pesos more than the current choice (the whole price when there's none). */
  more: number;
  save: { was: number; pct: number } | null;
  /** The best value: lowest price per video, ties to more videos. */
  best: boolean;
}

/** The pop-up's choices when the videos run out: for each package, the
 *  cheapest mix holding the current ones plus that package (moving up, or
 *  stacking past the biggest). Duplicates and worse deals left out; most
 *  videos first. */
export function packageOptions(packages: readonly VideoPackage[], current: readonly number[] = []): PackageOption[] {
  if (!packages.length) return [];
  const own = chosenPackages(packages, current);
  const base = own?.slots ?? 0;
  const basePrice = own?.price ?? 0;
  const byMix = new Map<string, PackageMix>();
  for (const p of packages) {
    const m = cheapestPackageMix(packages, base + p.videos);
    const key = m.mix.join('+');
    if (!byMix.has(key)) byMix.set(key, m);
  }
  const all = [...byMix.values()].filter((m) => m.slots > base);
  const kept = all.filter((a) => !all.some((b) => b !== a && b.slots >= a.slots && b.price <= a.price && (b.slots > a.slots || b.price < a.price)));
  kept.sort((a, b) => b.slots - a.slots || a.price - b.price);
  let best = kept[0];
  for (const o of kept) if (o.price * best.slots < best.price * o.slots) best = o;
  return kept.map((o) => ({ ...o, more: o.price - basePrice, save: packageSaving(packages, o.slots, o.price), best: o === best }));
}

/** At checkout: the customer's packages have empty spots and a cheaper mix
 *  holds every video they added. Null when there's nothing to save. */
export function cheaperPackageOffer(src: { qr_packages?: unknown }, qrMemories: number, chosen: readonly number[]): (PackageMix & { save: number; empty: number }) | null {
  const packages = qrPackagesOf(src);
  const extra = Math.max(0, Math.floor(qrMemories) - FREE_QR_MEMORIES);
  if (!packages.length || extra === 0) return null;
  const own = chosenPackages(packages, chosen);
  if (!own || own.slots < extra) return null;
  const c = cheapestPackageMix(packages, extra);
  if (c.price >= own.price) return null;
  return { ...c, save: own.price - c.price, empty: own.slots - extra };
}

/** "12-video package", or "12 + 2 video packages". */
export function packageLabel(mix: readonly number[]): string {
  if (!mix.length) return '';
  return mix.length === 1 ? `${mix[0]}-video package` : `${mix.join(' + ')} video packages`;
}

/** What the free videos are worth: at the reference rate when packages are
 *  on sale, else at EXTRA_QR_RATE. */
export function includedVideosValue(src: { qr_packages?: unknown }): number {
  const packages = qrPackagesOf(src);
  return packages.length ? Math.round(FREE_QR_MEMORIES * packageReferenceRate(packages)) : FREE_QR_MEMORIES * EXTRA_QR_RATE;
}

/** What's wrong with packages as the owner typed them, in words; null when
 *  they can be saved (0056's set_qr_packages refuses the same). */
export function packagesProblem(pkgs: readonly VideoPackage[]): string | null {
  if (pkgs.length < 1 || pkgs.length > 6) return 'Keep 1 to 6 packages.';
  for (const [i, p] of pkgs.entries()) {
    if (!Number.isInteger(p.videos) || p.videos < 1 || p.videos > 100) return `Package ${i + 1}: videos must be a whole number from 1 to 100.`;
    if (!Number.isInteger(p.price) || p.price < 0 || p.price > 100000) return `Package ${i + 1}: the price must be a whole number of pesos.`;
  }
  if (new Set(pkgs.map((p) => p.videos)).size !== pkgs.length) return 'Two packages have the same number of videos.';
  return null;
}

/** The cheapest package's price ("then packages from ₱100"); 0 when none. */
export function packagesFromPrice(src: { qr_packages?: unknown }): number {
  const packages = qrPackagesOf(src);
  return packages.length ? Math.min(...packages.map((p) => p.price)) : 0;
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
  /** The video packages chosen for this album (0056). Omitted = none. */
  videoPackages: readonly number[] = [],
): PriceBreakdown {
  const bindingLabel = binding === 'hard' ? 'Hardbound' : 'Softcover';
  const sizeLabel = SIZE_LABELS[size];
  const minPages = schedule.min_pages;
  const printTotal = priceOf(schedule, size, binding, pages);
  const videoFee = videoMemoryFee(schedule, qrMemories, videoPackages);
  const qrCharge = videoFee.fee;
  const termCharge = hostingTermCharge(schedule, hostingYears);
  const hdCharge = hdMemoriesCharge(schedule, hdMemories, qrMemories);
  const total = printTotal + qrCharge + termCharge + hdCharge;

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

  if (qrCharge > 0 && videoFee.mode === 'packages') {
    items.push({ label: `Video memories · ${FREE_QR_MEMORIES} free + ${packageLabel(videoFee.mix)}`, amount: qrCharge });
  } else if (qrCharge > 0) {
    const extraQr = qrMemories - FREE_QR_MEMORIES;
    items.push({
      label: `Living-memory QR · ${FREE_QR_MEMORIES} included, ${extraQr} extra × ₱${EXTRA_QR_RATE}`,
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

  return { items, total };
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
    ...(model.qr_packages ? { qr_packages: model.qr_packages } : {}),
    disabled_sizes: disabledSizes,
    sizes,
  };
}
