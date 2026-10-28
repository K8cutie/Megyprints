/* ══════════════════════════════════════════════════════════════════════════
   WHY THIS TEST: the price the phone shows must be the price the website
   shows for the same album, and the price the database saves with the order
   (0055 order_quote), or a customer is asked for one number and charged
   another.

   The rates themselves are the SHARED pricing code (src/lib/pricing.ts), so
   they can't differ. What the app writes itself is the glue around them:
   which term counts, the tester code's ₱0, the crossed-out "was" total, the
   button's words. The website keeps that glue inline in its Order page, so
   this test cuts that block out of src/pages/Order.tsx, runs it on Node with
   the same inputs, and requires the app's checkoutPrice to give the same
   numbers, for every size, both covers, page counts and memory options.
   ══════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import * as pricing from '@web/lib/pricing';
import type { PriceSchedule } from '@web/lib/pricing';
import type { AlbumSizePreset, CoverType } from '@web/pages/builder/types';
import { bindingOf, checkoutPrice, peso, placeOrderLabel } from '../src/lib/checkout/price';
import { amountToPay, type TesterCode } from '../src/lib/checkout/testerCode';

const WEB_SRC = path.resolve(__dirname, '../../src');
const ORDER_SRC = readFileSync(path.join(WEB_SRC, 'pages/Order.tsx'), 'utf8');

/** The live price list on 2026-10-26, as src/lib/orderQuote.spec.ts pins it
 *  (public_price_schedule(); the "was" prices added below). */
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

/** The same list while a price drop shows a crossed-out "was" price. */
const WITH_WAS = {
  ...LIVE,
  compare_at: {
    until: '2026-11-30', sheet_rate: 80,
    sizes: { '8x8': { soft_rate: 700, hard_rate: 1200 }, '6x6': { soft_rate: 650, hard_rate: 1000 }, '6x4': { soft_rate: 600, hard_rate: 900 } },
  },
} as unknown as PriceSchedule;

const TODAY = '2026-10-29';

/* ── The website's own checkout arithmetic, cut out of Order.tsx ── */

interface WebPrice {
  binding: string; tiers: unknown; includedYears: number | null; effectiveYears: number | null; hdPrice: number;
  breakdown: pricing.PriceBreakdown; totalPrice: number; payTotal: number; freeShippingValue: number; wasTotal: number | null;
}
interface WebInput {
  schedule: PriceSchedule | null; albumSize: AlbumSizePreset; cover: CoverType; pageCount: number; qrCount: number;
  hostingYears: number | null; hdMemories: boolean; tester: TesterCode | null; today: string;
}

function cut(from: string, to: string): string {
  const a = ORDER_SRC.indexOf(from);
  const b = ORDER_SRC.indexOf(to, a);
  if (a < 0 || b < 0) throw new Error(`Order.tsx no longer has "${from}" … "${to}": update this test with the page`);
  return ORDER_SRC.slice(a, b);
}

const BINDING_LINE = cut("const binding: Binding = cover === 'softcover'", '\n');
const PRICE_BLOCK = cut('const schedule = getPriceSchedule();', '  const priceReady =');

/** Runs the website's lines with these inputs (no event album: the app has
 *  none yet). compareAtPriceOf gets the fixed day, as the app's does. */
function websitePrice(i: WebInput): WebPrice {
  const body = `${BINDING_LINE}\n${PRICE_BLOCK}\nreturn { binding, tiers, includedYears, effectiveYears, hdPrice, breakdown, totalPrice, payTotal, freeShippingValue, wasTotal };`;
  const js = ts.transpileModule(`function run() {\n${body}\n}`, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
  const scope = {
    ...pricing,
    compareAtPriceOf: (s: PriceSchedule, size: AlbumSizePreset, b: pricing.Binding, pages: number) => pricing.compareAtPriceOf(s, size, b, pages, i.today),
    getPriceSchedule: () => i.schedule,
    amountToPay: (total: number, t: TesterCode | null) => (t ? 0 : total),
    albumSize: i.albumSize, cover: i.cover, pageCount: i.pageCount, qrCount: i.qrCount,
    hostingYears: i.hostingYears, hdMemories: i.hdMemories, tester: i.tester, eventLink: null,
  };
  const names = Object.keys(scope);
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  return new Function(...names, `${js}\nreturn run();`)(...names.map((n) => (scope as Record<string, unknown>)[n])) as WebPrice;
}

describe("the website's checkout arithmetic is still where this test reads it", () => {
  it('Order.tsx prices with the shared code and these lines', () => {
    expect(PRICE_BLOCK).toContain('priceBreakdown(schedule, albumSize, binding, pageCount, qrCount, effectiveYears, hdMemories)');
    expect(PRICE_BLOCK).toContain('const payTotal = amountToPay(totalPrice, tester);');
    expect(PRICE_BLOCK).toContain('wasPrint + (totalPrice - priceOf(schedule, albumSize, binding, pageCount))');
    expect(BINDING_LINE).toContain("? 'soft' : 'hard'");
  });
});

describe("the phone's price is the website's, number for number", () => {
  const sizes = Object.keys(LIVE.sizes) as AlbumSizePreset[];
  const covers: CoverType[] = ['softcover', 'hardboundLeather'];
  const pageCounts = [40, 41, 44, 45, 60, 77, 100, 130];
  const memories: [number, number | null, boolean][] = [[0, null, false], [0, 15, true], [3, null, false], [7, 10, true], [9, 20, true], [12, 7, false]];
  const tester = [null, { code: 'MEGYTEST' }];
  let compared = 0;
  let withWas = 0;

  it.each([['the live list', LIVE], ['a list with a "was" price', WITH_WAS]] as const)('%s', (_l, schedule) => {
    for (const albumSize of sizes) for (const cover of covers) for (const pageCount of pageCounts) {
      for (const [qrCount, hostingYears, hdMemories] of memories) for (const t of tester) {
        const input = { schedule, albumSize, cover, pageCount, qrCount, hostingYears, hdMemories, tester: t, today: TODAY };
        const w = websitePrice(input);
        const a = checkoutPrice(schedule, { albumSize, cover, pageCount, qrCount, hostingYears, hdMemories, tester: t, today: TODAY });
        expect(bindingOf(cover)).toBe(w.binding);
        expect(a.breakdown).toEqual(w.breakdown);
        expect(a.total).toBe(w.totalPrice);
        expect(a.payTotal).toBe(w.payTotal);
        expect(a.wasTotal).toBe(w.wasTotal);
        expect(a.effectiveYears).toBe(w.effectiveYears);
        expect(a.includedYears).toBe(w.includedYears);
        expect(a.tiers).toEqual(w.tiers);
        expect(a.hdPrice).toBe(w.hdPrice);
        expect(a.freeShippingValue).toBe(w.freeShippingValue);
        compared++;
        if (a.wasTotal !== null) withWas++;
      }
    }
  });

  it('no price list: no price (never a guessed one), as on the website', () => {
    const w = websitePrice({ schedule: null, albumSize: '8x8', cover: 'softcover', pageCount: 48, qrCount: 0, hostingYears: null, hdMemories: false, tester: null, today: TODAY });
    const a = checkoutPrice(null, { albumSize: '8x8', cover: 'softcover', pageCount: 48, qrCount: 0, hostingYears: null, hdMemories: false, tester: null });
    expect(a.ready).toBe(false);
    expect(a.total).toBe(w.totalPrice);
    expect(a.breakdown).toEqual(w.breakdown);
    expect(a.wasTotal).toBeNull();
  });

  it('the "was" price was on screen in some of them (the path ran)', () => { expect(withWas).toBeGreaterThan(0); });

  afterAll(() => { if (compared) console.log(`checkout prices compared with the website's: ${compared} (${withWas} with a "was" price)`); });
});

describe("the database's saved total (0055 order_quote) is the phone's total", () => {
  /** order_quote(size, cover, pages, qr, years, hd, LIVE) as the database
   *  answered (src/lib/orderQuote.spec.ts). */
  const DB: [AlbumSizePreset, CoverType, number, number, number | null, boolean, number][] = [
    ['6x4', 'softcover', 100, 0, null, false, 1023],
    ['6x6', 'softcover', 46, 9, 10, true, 1078],
    ['6x6', 'hardboundLeather', 130, 6, 5, false, 1679],
    ['8x8', 'softcover', 41, 8, 20, true, 1622],
    ['6x8', 'hardboundLeather', 77, 0, 15, true, 1788],
    ['8x6', 'softcover', 40, 1, 7, true, 1005],
  ];
  it('the website pins these answers', () => {
    const spec = readFileSync(path.join(WEB_SRC, 'lib/orderQuote.spec.ts'), 'utf8');
    for (const [size, cover, pages, qr, years, hd, total] of DB) {
      expect(spec).toContain(`['${size}', '${cover}', ${pages}, ${qr}, ${years}, ${hd}, {`);
      expect(spec).toContain(`total: ${total},`);
    }
  });
  it.each(DB)('%s %s, %i pages, %i QR, %s years, HD %s: ₱%i', (albumSize, cover, pageCount, qrCount, years, hd, total) => {
    const a = checkoutPrice(LIVE, { albumSize, cover, pageCount, qrCount, hostingYears: years, hdMemories: hd, tester: null, today: TODAY });
    expect(a.total).toBe(total);
    expect(a.payTotal).toBe(total);
    // With the tester code the real total still shows; the customer pays ₱0.
    const free = checkoutPrice(LIVE, { albumSize, cover, pageCount, qrCount, hostingYears: years, hdMemories: hd, tester: { code: 'MEGYTEST' }, today: TODAY });
    expect(free.total).toBe(total);
    expect(free.payTotal).toBe(0);
    expect(free.payTotal).toBe(amountToPay(total, { code: 'MEGYTEST' }));
  });
});

describe("the words with the price are the website's", () => {
  it("₱ amounts read as the website's toLocaleString('en-PH')", () => {
    for (const n of [0, 5, 49, 200, 999, 1000, 1005, 1710, 2886, 12_345, 123_456, 1_234_567, 1171.25, -140]) {
      expect(peso(n)).toBe(`${n < 0 ? '-' : ''}₱${Math.abs(n).toLocaleString('en-PH')}`);
    }
  });

  it("the Place order button says what the website's does", () => {
    expect(ORDER_SRC).toContain('Place order · free with tester code');
    expect(ORDER_SRC).toContain('Place order · pay {`₱${totalPrice.toLocaleString(\'en-PH\')}`} by bank transfer');
    expect(ORDER_SRC).toContain('Loading price…');
    expect(ORDER_SRC).toContain("Prices didn't load — tap to try again");
    expect(placeOrderLabel({ ready: true, loading: false, retrying: false, tester: true, total: 1710 })).toBe('Place order · free with tester code');
    expect(placeOrderLabel({ ready: true, loading: false, retrying: false, tester: false, total: 1710 })).toBe('Place order · pay ₱1,710 by bank transfer');
    expect(placeOrderLabel({ ready: false, loading: true, retrying: false, tester: false, total: 0 })).toBe('Loading price…');
    expect(placeOrderLabel({ ready: false, loading: false, retrying: true, tester: false, total: 0 })).toBe('Loading price…');
    expect(placeOrderLabel({ ready: false, loading: false, retrying: false, tester: false, total: 0 })).toBe("Prices didn't load — tap to try again");
  });

  it('the summary lines (savings, tester line, included) are the website\'s', () => {
    expect(ORDER_SRC).toContain('New lower price: you save ₱');
    expect(ORDER_SRC).toContain('Included with your album');
    expect(ORDER_SRC).toContain('years of memory hosting');
    expect(ORDER_SRC).toContain('living-memory QRs (₱');
  });
});
