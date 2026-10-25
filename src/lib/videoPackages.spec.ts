// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  qrPackagesOf, cheapestPackageMix, videoMemoryFee, packageSaving, packageOptions, cheaperPackageOffer, packageLabel,
  includedVideosValue, packagesFromPrice, packagesProblem, priceBreakdown, qrMemoryCharge, type PriceSchedule, type Binding,
} from './pricing';
import { readVideoPackages, writeVideoPackages } from './videoPackageChoice';
import type { AlbumSizePreset } from '../pages/builder/types';

/* ═══════════════════════════════════════════════════════════════════════════
   VIDEO MEMORY PACKAGES (owner, 2026-10-26). Past the 7 free videos: +2 ₱100,
   +5 ₱200, +12 ₱300, picked in the builder ("You ran out of free videos …
   choose the best package", +12 pre-selected, "₱600, now ₱300 · Save 50%").
   0056's video_package_fee() is the same arithmetic in SQL; the PR proved the
   two equal on 8,040 fees and 5,376 totals in a real Postgres, and the
   database's answers for a few of them are pinned below.
   ═══════════════════════════════════════════════════════════════════════════ */

const OWNER = [{ videos: 2, price: 100 }, { videos: 5, price: 200 }, { videos: 12, price: 300 }];
const S = { qr_packages: OWNER };

describe('the packages on sale', () => {
  it('smallest first, number fields only, 1–100 videos, the first entry for a size kept, prices never below 0', () => {
    const messy = [{ videos: 12, price: 300 }, { videos: 2, price: 100 }, { videos: 5, price: 200 }, { videos: 2, price: 999 }, { videos: '3', price: 50 },
      { videos: 0, price: 10 }, { videos: 101, price: 1 }, { videos: 4.5, price: 149.5 }, { videos: 7, price: -5 }, null, [1, 2], { videos: 9 }];
    expect(qrPackagesOf({ qr_packages: messy })).toEqual([
      { videos: 2, price: 100 }, { videos: 5, price: 200 }, { videos: 7, price: 0 }, { videos: 12, price: 300 },
    ]);
    expect(qrPackagesOf({})).toEqual([]);
    expect(qrPackagesOf({ qr_packages: 'x' })).toEqual([]);
  });

  it('the Pricing tab says what it would refuse, as set_qr_packages does', () => {
    expect(packagesProblem(OWNER)).toBeNull();
    expect(packagesProblem([])).toMatch(/1 to 6/);
    expect(packagesProblem([{ videos: 2, price: 100 }, { videos: 2, price: 150 }])).toMatch(/same number of videos/);
    expect(packagesProblem([{ videos: 2.5, price: 100 }])).toMatch(/whole number from 1 to 100/);
    expect(packagesProblem([{ videos: 2, price: 99.5 }])).toMatch(/whole number of pesos/);
  });
});

describe('the cheapest packages holding a number of videos', () => {
  it.each([
    [1, 100, [2]], [2, 100, [2]], [3, 200, [5]], [5, 200, [5]], [6, 300, [12]], [7, 300, [12]], [12, 300, [12]],
    [13, 400, [12, 2]], [14, 400, [12, 2]], [15, 500, [12, 5]], [18, 600, [12, 12]], [25, 700, [12, 12, 2]],
  ])('%i videos: ₱%i', (n, price, mix) => {
    expect(cheapestPackageMix(OWNER, n)).toMatchObject({ price, mix });
  });

  it('a tie on price goes to more videos (3 videos: +5 for ₱200, not +2 +2 for ₱200)', () => {
    expect(cheapestPackageMix(OWNER, 3)).toEqual({ price: 200, slots: 5, mix: [5] });
  });

  it('past 2000 videos, the best-value package repeated', () => {
    expect(cheapestPackageMix(OWNER, 2400)).toEqual({ price: 200 * 300, slots: 2400, mix: Array(200).fill(12) });
  });
});

describe('what the videos past the free 7 cost', () => {
  it('none past the free ones: ₱0, whatever was chosen', () => {
    expect(videoMemoryFee(S, 7, [12]).fee).toBe(0);
  });
  it("the customer's packages when they hold every extra video, even when a cheaper one would", () => {
    expect(videoMemoryFee(S, 8, [12])).toEqual({ mode: 'packages', fee: 300, mix: [12], slots: 12, chosen: true });
  });
  it('the cheapest packages when none were chosen, too few, a size not on sale, or more than 20', () => {
    expect(videoMemoryFee(S, 9).fee).toBe(100);
    expect(videoMemoryFee(S, 20, [12])).toMatchObject({ fee: 400, mix: [12, 2], chosen: false });
    expect(videoMemoryFee(S, 10, [3])).toMatchObject({ fee: 200, mix: [5], chosen: false });
    expect(videoMemoryFee(S, 10, Array(21).fill(2))).toMatchObject({ fee: 200, chosen: false });
  });
  it('a price list with no packages (a database before 0056): ₱20 per extra QR, exactly as before', () => {
    for (const qr of [0, 7, 8, 12, 40]) {
      expect(videoMemoryFee({}, qr, [12])).toMatchObject({ mode: 'legacy', fee: qrMemoryCharge(qr) });
    }
  });
});

describe('"Save": against the highest per-video price on sale (the +2\'s ₱50)', () => {
  it('+12: ₱600, now ₱300, Save 50% · +5: ₱250, now ₱200, Save 20% · +2: no save tag', () => {
    expect(packageSaving(OWNER, 12, 300)).toEqual({ was: 600, pct: 50 });
    expect(packageSaving(OWNER, 5, 200)).toEqual({ was: 250, pct: 20 });
    expect(packageSaving(OWNER, 2, 100)).toBeNull();
  });
  it('the free videos are worth what they would cost at that price', () => {
    expect(includedVideosValue(S)).toBe(350);
    expect(includedVideosValue({})).toBe(140);
    expect(packagesFromPrice(S)).toBe(100);
  });
});

describe("the pop-up's choices", () => {
  const view = (o: ReturnType<typeof packageOptions>) => o.map((x) => ({ slots: x.slots, price: x.price, more: x.more, best: x.best, save: x.save?.pct ?? 0 }));

  it('free ones used: the three packages, most videos first, +12 the best value (pre-selected)', () => {
    expect(view(packageOptions(OWNER, []))).toEqual([
      { slots: 12, price: 300, more: 300, best: true, save: 50 },
      { slots: 5, price: 200, more: 200, best: false, save: 20 },
      { slots: 2, price: 100, more: 100, best: false, save: 0 },
    ]);
  });

  it('+12 full: stack on it (14, 17, 24 more), priced in total and as "more than now"', () => {
    expect(view(packageOptions(OWNER, [12]))).toEqual([
      { slots: 24, price: 600, more: 300, best: true, save: 50 },
      { slots: 17, price: 500, more: 200, best: false, save: 41 },
      { slots: 14, price: 400, more: 100, best: false, save: 43 },
    ]);
  });

  it('+5 full: move up to 12 (₱100 more) or go to 17; +2 full: move up to 5 or 12, or 14', () => {
    expect(view(packageOptions(OWNER, [5])).map((o) => [o.slots, o.more])).toEqual([[17, 300], [12, 100]]);
    expect(view(packageOptions(OWNER, [2])).map((o) => [o.slots, o.more])).toEqual([[14, 300], [12, 200], [5, 100]]);
  });
});

describe('checkout', () => {
  it('picked +12 but added 3: switch to +5 and save ₱100 (9 empty spots)', () => {
    expect(cheaperPackageOffer(S, 10, [12])).toEqual({ price: 200, slots: 5, mix: [5], save: 100, empty: 9 });
  });
  it('nothing to offer when the package is the cheapest for its videos, or none was chosen', () => {
    expect(cheaperPackageOffer(S, 19, [12])).toBeNull();
    expect(cheaperPackageOffer(S, 10, [])).toBeNull();
    expect(cheaperPackageOffer({}, 10, [12])).toBeNull();
  });
  it('the price line names the package; the items add up to the total', () => {
    const live = {
      min_pages: 40, sheet_rate: 66.25, hosting_reserve: 50, hd_memories_price: 49, disabled_sizes: [],
      hosting_tiers: [{ years: 5, price: 0 }, { years: 10, price: 99 }],
      sizes: { '6x6': { pps: 12, soft_rate: 575, hard_rate: 900 } },
      qr_packages: OWNER,
    } as unknown as PriceSchedule;
    const b = priceBreakdown(live, '6x6', 'soft', 46, 9, 10, true, [12]);
    expect(b.items.map((i) => [i.label, i.amount])).toContainEqual(['Video memories · 7 free + 12-video package', 300]);
    expect(b.items.reduce((a, i) => a + i.amount, 0)).toBe(b.total);
    expect(packageLabel([12, 2])).toBe('12 + 2 video packages');
  });
});

/** The live price list with the owner's packages, and order_quote()'s answers
 *  (0056, real Postgres): changing either side alone fails here. */
const LIVE = {
  disabled_sizes: ['8.5x11', '11.5x8'], free_shipping_value: 200, hd_memories_price: 49, hosting_reserve: 50,
  hosting_tiers: [{ price: 0, years: 5 }, { price: 99, years: 10 }, { price: 149, years: 15 }, { price: 199, years: 20 }],
  min_pages: 40, sheet_rate: 66.25, qr_packages: OWNER,
  sizes: {
    '6x4': { hard_rate: 825, pps: 18, soft_rate: 575 }, '6x6': { hard_rate: 900, pps: 12, soft_rate: 575 },
    '6x8': { hard_rate: 1075, pps: 8, soft_rate: 575 }, '8x6': { hard_rate: 1075, pps: 8, soft_rate: 575 },
    '8x8': { hard_rate: 1075, pps: 4, soft_rate: 575 },
  },
} as unknown as PriceSchedule;
const DB: [AlbumSizePreset, string, number, number, number, boolean, number[], number, number[]][] = [
  // size, cover, pages, QR, years, HD, chosen, order_quote total, packages charged
  ['6x6', 'softcover', 46, 9, 10, true, [12], 1338, [12]],
  ['6x6', 'softcover', 46, 9, 10, true, [], 1138, [2]],
  ['8x8', 'softcover', 41, 20, 5, false, [], 1754, [12, 2]],
  ['6x4', 'softcover', 100, 19, 20, true, [12], 1571, [12]],
  ['8x6', 'hardboundLeather', 40, 26, 5, false, [12, 5, 2], 2056, [12, 5, 2]],
  ['6x8', 'softcover', 40, 10, 15, false, [1], 1305, [5]],
];

describe("the database's saved total is the Pay screen's (0056)", () => {
  it.each(DB)('%s %s, %i pages, %i QR, %i years, HD %s, chose %j', (size, cover, pages, qr, years, hd, chosen, total, mix) => {
    const binding: Binding = cover === 'softcover' ? 'soft' : 'hard';
    expect(priceBreakdown(LIVE, size, binding, pages, qr, years, hd, chosen).total).toBe(total);
    expect(videoMemoryFee(LIVE, qr, chosen).mix).toEqual(mix);
  });
});

describe('0056 follows the app', () => {
  const sql = readFileSync(resolve(__dirname, '../../supabase/migrations/0056_video_packages.sql'), 'utf8');
  it('7 free, ₱20 each when no packages are on sale: the same numbers as pricing.ts', () => {
    expect(sql).toContain('extra   integer := greatest(0, coalesce(p_qr, 0) - 7);');
    expect(sql).toContain("'fee', extra * 20,");
  });
  it('the same tie rules and the same 2000-video limit as cheapestPackageMix', () => {
    expect(sql).toContain('if bp is null or cp < bp or (cp = bp and (cs > bs or (cs = bs and cc < bc))) then');
    expect(sql).toContain('if n > 2000 then');
  });
  it('the owner\'s packages are the default; the order keeps its packages as placed', () => {
    expect(sql).toContain('[{"videos": 2, "price": 100}, {"videos": 5, "price": 200}, {"videos": 12, "price": 300}]');
    expect(sql).toMatch(/new\.video_packages := old\.video_packages;/);
  });
});

describe('the choice stays on the phone, per album', () => {
  beforeEach(() => localStorage.clear());
  it('saved and read back largest first; [] forgets it; no album id, nothing', () => {
    writeVideoPackages('album-1', [2, 12]);
    expect(readVideoPackages('album-1')).toEqual([12, 2]);
    expect(readVideoPackages('album-2')).toEqual([]);
    writeVideoPackages('album-1', []);
    expect(readVideoPackages('album-1')).toEqual([]);
    writeVideoPackages(undefined, [12]);
    expect(readVideoPackages(undefined)).toEqual([]);
  });
  it('a broken store reads as no package (the pop-up asks again)', () => {
    localStorage.setItem('megy-video-packages-v1', '{oops');
    expect(readVideoPackages('album-1')).toEqual([]);
  });
});

describe('the order names video_packages only when the price list has packages', () => {
  const order = readFileSync(resolve(__dirname, '../pages/Order.tsx'), 'utf8');
  const orders = readFileSync(resolve(__dirname, 'orders.ts'), 'utf8');
  it('so an order never names a column the database doesn\'t have yet', () => {
    expect(order).toContain('videoPackages: packagesOn ? albumPackages : undefined,');
    expect(orders).toContain('...(opts.videoPackages !== undefined ? { video_packages: opts.videoPackages.length ? opts.videoPackages : null } : {}),');
  });
});
