import { describe, it, expect } from 'vitest';
import { PACK_OFFER_BODY, PACK_OFFER_NO, PACK_OFFER_YES, packOfferTitle, qrMemoryCharge, videoStartsNewPack } from './pricing';

/* ══════════════════════════════════════════════════════════════════════════
   WHY THIS TEST: the owner designed a pop-up on 2026-10-26 ("they click on
   the golden button and a pop-up appears") for when the free videos run out.
   When videos became 2 free + packs of 3 for ₱100 (0066, 2026-11-19) the
   pop-up was not carried over, and on 2026-11-24 a Mini took a 3rd video
   with no word. The rule: the pop-up comes exactly when the NEXT video costs
   money (it starts a new pack), never when it fits in a pack already paid.
   ══════════════════════════════════════════════════════════════════════════ */

describe('when the next video starts a paid pack', () => {
  it('albums and Minis (2 free): after 2, after 5, after 8 … and never in between', () => {
    const starts = Array.from({ length: 12 }, (_, used) => videoStartsNewPack(used, 2));
    expect(starts).toEqual([false, false, true, false, false, true, false, false, true, false, false, true]);
  });

  it('is exactly when adding one more video raises the price', () => {
    for (const free of [0, 2, 7]) for (let used = 0; used < 30; used++) {
      const costsMore = qrMemoryCharge(used + 1, free) > qrMemoryCharge(used, free);
      expect(videoStartsNewPack(used, free)).toBe(costsMore);
    }
  });
});

describe('the words', () => {
  it('say what was used, what it costs, and when it is paid', () => {
    expect(packOfferTitle(2, 2)).toBe("You've used your 2 free videos");
    expect(packOfferTitle(5, 2)).toBe('Your 3 extra videos are used');
    expect(packOfferTitle(8, 2)).toBe('Your 6 extra videos are used');
    expect(PACK_OFFER_BODY).toBe('Add 3 more video memories for ₱100. You pay it with your album at checkout.');
    expect(PACK_OFFER_YES).toBe('Add 3 more · ₱100');
    expect(PACK_OFFER_NO).toBe('Not now');
  });
});
