/* ══════════════════════════════════════════════════════════════════════════
   Pricing — the SINGLE SOURCE cost + price model.

   The RAW COST side (SHEET, SOFT_ consts, SIZES, sheetsFor, costOf, perPageCost) is
   admin/internal ONLY. It lives here so the operator Pricing panel and the
   customer checkout agree on one model. Never render these raw figures on a
   customer-facing surface.

   The CUSTOMER side is `priceBreakdown` — it returns ONLY marked-up peso
   amounts (cost × the store multiple). Its structure contains no cost, no
   margin, and no multiplier, so nothing the customer sees can be reversed into
   the profit.
   ══════════════════════════════════════════════════════════════════════════ */

import type { AlbumSizePreset } from '../pages/builder/types';

export type Binding = 'soft' | 'hard';

export const SHEET = 26.5;        // raw cost — admin only (₱2.50 paper + ₱24 print)
export const SOFT_COVER = 50;     // raw cost — admin only
export const SOFT_BIND = 100;     // raw cost — admin only
export const MIN_PAGES = 40;

export interface SizeDef { label: string; pps: number; hb: number }
export const SIZES: Record<AlbumSizePreset, SizeDef> = {
  '6x4':    { label: '6×4',    pps: 16, hb: 250 },
  '6x6':    { label: '6×6',    pps: 12, hb: 280 },
  '8x8':    { label: '8×8',    pps: 4,  hb: 350 },
  '9x9':    { label: '9×9',    pps: 4,  hb: 380 },
  '11.5x8': { label: '11.5×8', pps: 4,  hb: 450 },
  '8.5x11': { label: '8.5×11', pps: 4,  hb: 500 },
};

// RAW COST — admin/internal only. Never call from customer-facing code paths
// that render the value.
export function sheetsFor(size: AlbumSizePreset, pages: number): number {
  return Math.ceil(Math.max(MIN_PAGES, pages) / SIZES[size].pps);
}
export function costOf(size: AlbumSizePreset, binding: Binding, pages: number): number {
  const interior = sheetsFor(size, pages) * SHEET;
  return binding === 'hard' ? interior + SIZES[size].hb : interior + SOFT_COVER + SOFT_BIND;
}
export function perPageCost(size: AlbumSizePreset): number {
  return SHEET / SIZES[size].pps;
}

export interface PriceLine { label: string; amount: number }
export interface PriceBreakdown { items: PriceLine[]; total: number }

// CUSTOMER-FACING. Returns marked-up amounts ONLY — no cost, no margin, no
// multiplier in the structure. Line amounts are reconciled so items sum exactly
// to total (base line = total − extra line), so nothing hints at the model.
export function priceBreakdown(
  size: AlbumSizePreset,
  binding: Binding,
  pages: number,
  multiple: number,
): PriceBreakdown {
  const bindingLabel = binding === 'hard' ? 'Hardbound' : 'Softcover';
  const total = Math.round(costOf(size, binding, pages) * multiple);

  const extra = Math.max(0, pages - MIN_PAGES);
  const items: PriceLine[] = [];

  if (extra > 0) {
    const perPage = Math.round(perPageCost(size) * multiple);
    const extraAmount = extra * perPage;
    // Reconcile the base line so the displayed lines are exactly additive.
    items.push({
      label: `Album — ${SIZES[size].label} ${bindingLabel} · ${MIN_PAGES} pages included`,
      amount: total - extraAmount,
    });
    items.push({ label: `Extra pages · ${extra} × ₱${perPage}`, amount: extraAmount });
  } else {
    items.push({
      label: `Album — ${SIZES[size].label} ${bindingLabel} · ${MIN_PAGES} pages included`,
      amount: total,
    });
  }

  return { items, total };
}
