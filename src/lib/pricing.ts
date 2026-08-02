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
  sizes: Record<AlbumSizePreset, { pps: number; hb: number; surcharge: number }>;
}

/** Customer-facing schedule — the shape of public_price_schedule(). Carries no
 *  cost and no multiple, only their product. */
export interface PriceSchedule {
  min_pages: number;
  sheet_rate: number;
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
  return Math.round(sheets * schedule.sheet_rate + coverRate);
}

/** Marked-up per-page rate used for the "extra pages" display line. */
export function perPageRate(schedule: PriceSchedule, size: AlbumSizePreset): number {
  return Math.round(schedule.sheet_rate / schedule.sizes[size].pps);
}

export interface PriceLine { label: string; amount: number }
export interface PriceBreakdown { items: PriceLine[]; total: number }

/** CUSTOMER-FACING. Marked-up amounts only. Line amounts are reconciled so items
 *  sum exactly to total (base = total − extra), so the displayed split never
 *  hints at the underlying model. */
export function priceBreakdown(
  schedule: PriceSchedule,
  size: AlbumSizePreset,
  binding: Binding,
  pages: number,
): PriceBreakdown {
  const bindingLabel = binding === 'hard' ? 'Hardbound' : 'Softcover';
  const sizeLabel = SIZE_LABELS[size];
  const minPages = schedule.min_pages;
  const total = priceOf(schedule, size, binding, pages);

  const extra = Math.max(0, pages - minPages);
  const items: PriceLine[] = [];

  if (extra > 0) {
    const perPage = perPageRate(schedule, size);
    const extraAmount = extra * perPage;
    items.push({
      label: `Album — ${sizeLabel} ${bindingLabel} · ${minPages} pages included`,
      amount: total - extraAmount,
    });
    items.push({ label: `Extra pages · ${extra} × ₱${perPage}`, amount: extraAmount });
  } else {
    items.push({
      label: `Album — ${sizeLabel} ${bindingLabel} · ${minPages} pages included`,
      amount: total,
    });
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
    + model.sizes[size].surcharge;
}

/** Pure mirror of public_price_schedule()'s arithmetic. Lives here so the spec
 *  can prove the schedule and the raw model agree without standing up a
 *  database; the SQL is the runtime source of truth. */
export function scheduleFrom(
  model: PricingModel,
  multiple: number,
  disabledSizes: AlbumSizePreset[] = [],
): PriceSchedule {
  const sizes = {} as PriceSchedule['sizes'];
  for (const key of Object.keys(model.sizes) as AlbumSizePreset[]) {
    const s = model.sizes[key];
    sizes[key] = {
      pps: s.pps,
      soft_rate: (model.soft_cover_cost + model.soft_bind_cost) * multiple + s.surcharge,
      hard_rate: s.hb * multiple + s.surcharge,
    };
  }
  return {
    min_pages: model.min_pages,
    sheet_rate: model.sheet_cost * multiple,
    disabled_sizes: disabledSizes,
    sizes,
  };
}
