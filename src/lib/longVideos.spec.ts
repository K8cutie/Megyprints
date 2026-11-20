import { describe, it, expect } from 'vitest';
import { albumVideoMinutes, longVideoCharge, longVideoPricesOf, maxVideoSecondsOf, videoMinutesFor } from './pricing';

/* ═══════════════════════════════════════════════════════════════════════════
   LONGER VIDEOS (owner, 2026-11-20): memory videos are up to 2 minutes; an
   album can have longer ones once, priced by its LONGEST video: up to 3
   minutes ₱199, up to 5 minutes ₱399 (the price list's numbers). Only when
   the album carries video memories; a list without the prices keeps 2.
   ═══════════════════════════════════════════════════════════════════════════ */
const LIST = { long_video_prices: { '3': 199, '5': 399 } };

describe('the tier one video needs', () => {
  it.each([
    [null, 2], [30, 2], [120, 2], [120.5, 2], [121, 3], [180, 3], [180.5, 3], [181, 5], [300, 5], [300.5, 5], [301, null], [900, null],
  ] as const)('%s seconds → %s', (s, tier) => {
    expect(videoMinutesFor(s)).toBe(tier);
  });
});

describe("the album's tier is its longest video's", () => {
  it('all short: 2', () => expect(albumVideoMinutes([30, 95, null])).toBe(2));
  it('one 2 min 40 s: 3', () => expect(albumVideoMinutes([30, 160, 95])).toBe(3));
  it('one 4 minutes: 5', () => expect(albumVideoMinutes([160, 240])).toBe(5));
  it('no videos: 2', () => expect(albumVideoMinutes([])).toBe(2));
});

describe('the charge', () => {
  it('3 and 5 minutes cost the list prices', () => {
    expect(longVideoCharge(LIST, 3, 4)).toBe(199);
    expect(longVideoCharge(LIST, 5, 4)).toBe(399);
  });
  it('2 minutes, no tier or no videos: nothing', () => {
    expect(longVideoCharge(LIST, 2, 4)).toBe(0);
    expect(longVideoCharge(LIST, null, 4)).toBe(0);
    expect(longVideoCharge(LIST, 5, 0)).toBe(0);
  });
  it('a list without the prices sells nothing, and videos stay up to 2 minutes', () => {
    expect(longVideoPricesOf({})).toBeNull();
    expect(longVideoCharge({}, 5, 4)).toBe(0);
    expect(maxVideoSecondsOf({})).toBe(120);
    expect(maxVideoSecondsOf(LIST)).toBe(300);
  });
  it('the owner can set new prices; broken ones sell nothing', () => {
    expect(longVideoCharge({ long_video_prices: { '3': 99, '5': 249 } }, 5, 2)).toBe(249);
    expect(longVideoPricesOf({ long_video_prices: { '3': 'x', '5': 399 } })).toBeNull();
  });
});
