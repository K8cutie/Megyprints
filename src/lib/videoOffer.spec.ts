import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  includedVideosValue, LEGACY_VIDEO_OFFER, parseVideoOffer, priceBreakdown, qrMemoryCharge, videoBillLine, videoFee,
  videoOfferOf, videoOfferSentence, videoOfferShort, videoPopupFor, type PriceSchedule, type VideoOffer,
} from './pricing';

/* ══════════════════════════════════════════════════════════════════════════
   WHY THIS TEST: the owner, 2026-11-24: "the price of each video is 50
   regular but its 3 for 100", "Christmas sale is urgency so end at December
   31". An extra video is ₱50; in the sale any 3 are ₱100 (33% off). The
   "33% off" and "for a limited time" are true only because the ₱50 single is
   really sold and the sale really ends. The database charges the same
   (0073 video_memory_fee; scripts/video-fee-parity.ts proves 246 cases equal
   on a real Postgres), and the pop-up comes before the video that costs.
   ══════════════════════════════════════════════════════════════════════════ */

const XMAS: VideoOffer = { single: 50, pack: { size: 3, price: 100, name: 'Christmas sale', until: '2026-12-31' } };
const NO_SALE: VideoOffer = { single: 50, pack: null };

describe('what extra videos cost', () => {
  it('in the Christmas sale: the cheapest way, 1 → ₱50, 2 or 3 → ₱100, 4 → ₱150 …', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7].map((e) => videoFee(e, XMAS).fee)).toEqual([0, 50, 100, 100, 150, 200, 200, 250]);
    // 2 videos at ₱50 cost as much as the pack: it becomes the pack (same price, room for one more).
    expect(videoFee(2, XMAS)).toEqual({ fee: 100, packs: 1, singles: 0 });
    expect(videoFee(4, XMAS)).toEqual({ fee: 150, packs: 1, singles: 1 });
  });

  it('no sale: ₱50 each', () => {
    expect([0, 1, 3, 4].map((e) => videoFee(e, NO_SALE).fee)).toEqual([0, 50, 150, 200]);
  });

  it('a price list from before 0073: the 0066 packs of 3 for ₱100, nothing changes', () => {
    expect([0, 1, 3, 4, 6, 7].map((e) => videoFee(e, LEGACY_VIDEO_OFFER).fee)).toEqual([0, 100, 100, 200, 200, 300]);
    expect(qrMemoryCharge(5, 2)).toBe(100);
  });

  it('never more than one by one, and the sale never costs more than no sale', () => {
    for (let e = 0; e <= 60; e++) {
      expect(videoFee(e, XMAS).fee).toBeLessThanOrEqual(videoFee(e, NO_SALE).fee);
    }
  });
});

describe('the offer as the database sends it', () => {
  it('takes ₱50 and a named, dated pack', () => {
    expect(parseVideoOffer({ single: 50, pack: { size: 3, price: 100, name: 'Christmas sale', until: '2026-12-31' } })).toEqual(XMAS);
    expect(parseVideoOffer({ single: 50, pack: null })).toEqual(NO_SALE);
  });

  it('never a dishonest pack: not cheaper than its videos one by one, or with no name or end', () => {
    expect(parseVideoOffer({ single: 50, pack: { size: 3, price: 150, name: 'Sale', until: '2026-12-31' } })?.pack).toBeNull();
    expect(parseVideoOffer({ single: 50, pack: { size: 3, price: 100, name: '', until: '2026-12-31' } })?.pack).toBeNull();
    expect(parseVideoOffer({ single: 50, pack: { size: 3, price: 100, name: 'Sale', until: null } })?.pack).toBeNull();
    expect(parseVideoOffer({ single: 0 })).toBeNull();
    expect(parseVideoOffer(null)).toBeNull();
  });

  it('the sale is gone the day after its last day (Manila); a list with no offer keeps the 0066 packs', () => {
    const list = { video_offer: XMAS };
    expect(videoOfferOf(list, '2026-12-31')).toEqual(XMAS);
    expect(videoOfferOf(list, '2027-01-01')).toEqual(NO_SALE);
    expect(videoOfferOf({}, '2026-12-01')).toEqual(LEGACY_VIDEO_OFFER);
    expect(videoOfferOf(null, '2026-12-01')).toEqual(LEGACY_VIDEO_OFFER);
  });
});

describe('the pop-up (drawn and approved 2026-11-24)', () => {
  it('right after the 2 free videos, in the Christmas sale: the drawing, word for word', () => {
    expect(videoPopupFor(2, 2, XMAS)).toEqual({
      tag: 'Christmas sale',
      title: 'Get 3 more video memories',
      was: 150, now: 100, pct: 33,
      line: "You've used your 2 free videos. Each extra video is ₱50, but until December 31 you get 3 for ₱100. You pay with your album at checkout.",
      main: 'Get 3 for ₱100', second: 'Get 1 for ₱50', no: 'Not now',
    });
  });

  it('in the sale: again each time 3 more are used; never in between, never for the free ones', () => {
    const shown = Array.from({ length: 12 }, (_, u) => videoPopupFor(u, 2, XMAS) !== null);
    expect(shown).toEqual([false, false, true, false, false, true, false, false, true, false, false, true]);
    expect(videoPopupFor(5, 2, XMAS)?.line.startsWith("You've used 5 videos.")).toBe(true);
  });

  it('no sale: once, right after the free videos, at ₱50', () => {
    expect(videoPopupFor(2, 2, NO_SALE)).toEqual({
      tag: null, title: "You've used your 2 free videos", was: null, now: null, pct: null,
      line: 'Each extra video is ₱50. You pay with your album at checkout.',
      main: 'Get 1 for ₱50', second: null, no: 'Not now',
    });
    expect(videoPopupFor(3, 2, NO_SALE)).toBeNull();
  });

  it('a price list from before 0073: the 0066 pop-up', () => {
    expect(videoPopupFor(2, 2, LEGACY_VIDEO_OFFER)?.main).toBe('Add 3 more · ₱100');
  });
});

describe('the words around it', () => {
  it('the bill, the video box, checkout, the free videos\' value', () => {
    expect(videoBillLine(6, 2, XMAS)).toBe('2 included, 4 extra (Christmas sale: 1 × 3 for ₱100 + 1 × ₱50)');
    expect(videoBillLine(3, 2, NO_SALE)).toBe('2 included, 1 extra (1 × ₱50)');
    expect(videoBillLine(5, 2, LEGACY_VIDEO_OFFER)).toBe('2 included, 3 extra (1 pack of 3 × ₱100)');
    expect(videoOfferShort(XMAS)).toBe('more ₱50 each, or 3 for ₱100 until December 31');
    expect(videoOfferShort(NO_SALE)).toBe('more ₱50 each');
    expect(videoOfferSentence(XMAS)).toBe('Add more for ₱50 each, or 3 for ₱100 in the Christmas sale until December 31.');
    expect(includedVideosValue(2, XMAS)).toBe(100);
    expect(includedVideosValue(2, LEGACY_VIDEO_OFFER)).toBeNull();
  });

  it("an album's bill uses the price list's offer", () => {
    const list = {
      min_pages: 40, sheet_rate: 60.95, hosting_reserve: 50, disabled_sizes: [],
      sizes: { '8x8': { pps: 4, soft_rate: 545, hard_rate: 1005 } }, video_offer: { ...XMAS, pack: { ...XMAS.pack!, until: '2099-12-31' } },
    } as unknown as PriceSchedule;
    const b = priceBreakdown(list, '8x8', 'soft', 40, 6);
    expect(b.total).toBe(1205 + 150);
    expect(b.items.some((i) => i.label === 'Living-memory QR · 2 included, 4 extra (Christmas sale: 1 × 3 for ₱100 + 1 × ₱50)' && i.amount === 150)).toBe(true);
  });
});

describe("the database's fee is this one (0073)", () => {
  // Line endings as checked out (Windows may give \r\n).
  const sql = readFileSync(resolve(__dirname, '../../supabase/migrations/0073_video_singles_and_sale.sql'), 'utf8').replace(/\r\n/g, '\n');
  it('order_quote charges video_memory_fee for albums (2 free) and the Mini (its own free)', () => {
    expect(sql).toContain('vf     := public.video_memory_fee(greatest(0, qr - 2), vo);');
    expect(sql).toContain('vf     := public.video_memory_fee(greatest(0, qr - free_qr), vo);');
    expect(sql).toContain("if singles > 0 and singles * single >= pprice then");
    expect(sql).toContain("update public.pricing_model\n   set video_sale_name = 'Christmas sale', video_sale_until = date '2026-12-31'");
  });
});
