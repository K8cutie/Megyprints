import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { priceBreakdown, FREE_QR_MEMORIES, EXTRA_QR_RATE, type PriceSchedule, type Binding } from './pricing';
import { quoteParts, type OrderQuote } from './adminOrders';
import type { AlbumSizePreset } from '../pages/builder/types';

/* ═══════════════════════════════════════════════════════════════════════════
   THE SAVED TOTAL = THE PAY SCREEN'S TOTAL (owner, 2026-10-26: "have the
   database work out the total each customer was asked to pay … save it with
   the order"). 0055's order_quote() is priceBreakdown() in SQL. The PR proved
   them equal on 69,888 orders in a real Postgres; here the database's answers
   for a few of them are pinned, so changing either side alone fails a test.
   ═══════════════════════════════════════════════════════════════════════════ */

const sql = readFileSync(resolve(__dirname, '../../supabase/migrations/0055_order_quoted_total.sql'), 'utf8');

/** The live price list on 2026-10-26 (public_price_schedule(), was-price left out). */
const LIVE = {
  disabled_sizes: ['8.5x11', '11.5x8'], free_shipping_value: 200, hd_memories_price: 49, hosting_reserve: 50,
  hosting_tiers: [{ price: 0, years: 5 }, { price: 99, years: 10 }, { price: 149, years: 15 }, { price: 199, years: 20 }],
  min_pages: 40, sheet_rate: 66.25,
  sizes: {
    '11.5x8': { hard_rate: 1625, pps: 4, soft_rate: 875 }, '6x4': { hard_rate: 825, pps: 18, soft_rate: 575 },
    '6x6': { hard_rate: 900, pps: 12, soft_rate: 575 }, '6x8': { hard_rate: 1075, pps: 8, soft_rate: 575 },
    '8.5x11': { hard_rate: 1750, pps: 4, soft_rate: 875 }, '8x6': { hard_rate: 1075, pps: 8, soft_rate: 575 },
    '8x8': { hard_rate: 1075, pps: 4, soft_rate: 575 },
  },
} as unknown as PriceSchedule;

/** order_quote(size, cover, pages, qr, years, hd, LIVE), as the database answered. */
const DB: [AlbumSizePreset, string, number, number, number | null, boolean, OrderQuote][] = [
  // 66.25 × 9 sheets + 575 = 1171.25 … and 60 pages over: a .25 that Math.round and float8 floor(x + 0.5) agree on
  ['6x4', 'softcover', 100, 0, null, false, { qr: 0, album: 824, total: 1023, years: null, hd_fee: 0, qr_fee: 0, extra_qr: 0, term_fee: 0, extra_pages: 60, extra_pages_fee: 199 }],
  ['6x6', 'softcover', 46, 9, 10, true, { qr: 9, album: 890, total: 1078, years: 10, hd_fee: 49, qr_fee: 40, extra_qr: 2, term_fee: 99, extra_pages: 6, extra_pages_fee: 0 }],
  ['6x6', 'hardboundLeather', 130, 6, 5, false, { qr: 6, album: 1215, total: 1679, years: 5, hd_fee: 0, qr_fee: 0, extra_qr: 0, term_fee: 0, extra_pages: 90, extra_pages_fee: 464 }],
  ['8x8', 'softcover', 41, 8, 20, true, { qr: 8, album: 1288, total: 1622, years: 20, hd_fee: 49, qr_fee: 20, extra_qr: 1, term_fee: 199, extra_pages: 1, extra_pages_fee: 66 }],
  // no QR memories: no term, no HD, whatever the order says
  ['6x8', 'hardboundLeather', 77, 0, 15, true, { qr: 0, album: 1456, total: 1788, years: null, hd_fee: 0, qr_fee: 0, extra_qr: 0, term_fee: 0, extra_pages: 37, extra_pages_fee: 332 }],
  // a term that isn't on the price list costs nothing (hostingTermCharge)
  ['8x6', 'softcover', 40, 1, 7, true, { qr: 1, album: 956, total: 1005, years: 7, hd_fee: 49, qr_fee: 0, extra_qr: 0, term_fee: 0, extra_pages: 0, extra_pages_fee: 0 }],
];

describe("the database's total is the Pay screen's total", () => {
  it.each(DB)('%s %s, %i pages, %i QR, %s years, HD %s', (size, cover, pages, qr, years, hd, q) => {
    const binding: Binding = cover === 'softcover' ? 'soft' : 'hard';
    // The checkout's effectiveYears: a term only when the album carries QR memories.
    const b = priceBreakdown(LIVE, size, binding, pages, qr, qr > 0 ? years : null, hd);
    expect(b.total).toBe(q.total);
    expect(q.album + q.extra_pages_fee + q.qr_fee + q.term_fee + q.hd_fee).toBe(q.total);
    const line = (re: RegExp) => b.items.find((i) => re.test(i.label))?.amount ?? 0;
    expect(line(/^Album/)).toBe(q.album);
    expect(line(/^Extra pages/)).toBe(q.extra_pages_fee);
    expect(line(/^Living-memory QR/)).toBe(q.qr_fee);
    expect(line(/^Memories stay live/)).toBe(q.term_fee);
    expect(line(/^HD memories/)).toBe(q.hd_fee);
  });
});

describe('0055 follows the checkout', () => {
  it('7 QR memories included, ₱20 each past that: the same numbers as pricing.ts', () => {
    expect(sql).toContain(`qr_fee := greatest(0, qr - ${FREE_QR_MEMORIES}) * ${EXTRA_QR_RATE};`);
  });

  it("rounds like JavaScript's Math.round (floor(x + 0.5) in float8), never Postgres round()", () => {
    const fn = sql.slice(sql.indexOf('create or replace function public.order_quote('), sql.indexOf('create or replace function public.orders_quote()'))
      .replace(/--[^\n]*/g, ''); // the code, not its comments
    expect(fn).not.toMatch(/\bround\(/);
    expect((fn.match(/floor\([^;]*\+ 0\.5\)/g) ?? []).length).toBeGreaterThanOrEqual(5);
  });

  it('counts the QR memories where the checkout does: qrFills and textSlotQr', () => {
    expect(sql).toMatch(/p -> 'qrFills'/);
    expect(sql).toMatch(/p -> 'textSlotQr'/);
  });

  it('runs after the triggers that settle the size and page count (BEFORE triggers fire in name order)', () => {
    expect(sql).toMatch(/create trigger orders_quote_trg\s+before insert or update on public\.orders/);
    expect('orders_quote_trg' > 'orders_pin_album_size_trg').toBe(true);
    expect('orders_quote_trg' > 'orders_press_fit_trg').toBe(true);
  });

  it('a client never sets it and nobody changes it after', () => {
    expect(sql).toMatch(/if tg_op = 'UPDATE' then\s+new\.quoted_amount := old\.quoted_amount;\s+new\.quote\s+:= old\.quote;/);
  });

  it('only the owner reads it', () => {
    expect(sql).toContain("case when r = 'owner' then o.quoted_amount else null end");
    expect(sql).toContain("case when r = 'owner' then o.quote else null end");
  });
});

describe('quoteParts', () => {
  it('names what the total is made of, the free parts left out', () => {
    expect(quoteParts(DB[1][6])).toBe('album ₱890 + 2 extra QR ₱40 + 10 years ₱99 + HD ₱49');
    expect(quoteParts(DB[0][6])).toBe('album ₱824 + 60 extra pages ₱199');
    expect(quoteParts(DB[3][6])).toBe('album ₱1,288 + 1 extra page ₱66 + 1 extra QR ₱20 + 20 years ₱199 + HD ₱49');
    expect(quoteParts(DB[2][6])).toBe('album ₱1,215 + 90 extra pages ₱464');
  });
});
