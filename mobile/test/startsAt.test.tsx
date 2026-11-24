/* ══════════════════════════════════════════════════════════════════════════
   WHY THIS TEST: the size step says "Starts at ₱X" for each album size
   (owner, 2026-11-19), and X must be a price a customer really pays: the
   total checkout shows for a 40-page soft-cover album of that size, from
   the same live price list. It follows the list (a new markup moves it),
   never shows a made-up number, and shows nothing until the list is read.
   ══════════════════════════════════════════════════════════════════════════ */
import { render, screen } from '@testing-library/react-native';
import { priceOf, type PriceSchedule } from '@web/lib/pricing';
import { checkoutPrice } from '../src/lib/checkout/price';
import { startsAt, startsAtLine } from '../src/lib/checkout/startsAt';

const mockRpc: { answer: { data: unknown; error: unknown } | 'throw'; launch: { data: unknown; error: unknown }; asked: string[] } = {
  answer: { data: null, error: null }, launch: { data: null, error: null }, asked: [],
};
jest.mock('expo-router', () => ({ router: { push: jest.fn() }, useFocusEffect: () => {} }));
jest.mock('../src/builder/BuilderProvider', () => {
  const builder = { albumTitle: 'Our trip', albumSize: '8x8', albumPages: [], coverFront: null, setAlbumTitle: () => {}, setAlbumSize: () => {} };
  const { memoryStore } = jest.requireActual('../src/builder/deviceStore') as typeof import('../src/builder/deviceStore');
  return { useBuilder: () => ({ builder, platform: { deviceStore: memoryStore() } }) };
});
jest.mock('../src/lib/supabase', () => ({
  supabaseConfigured: true,
  supabase: {
    rpc: async (name: string) => {
      mockRpc.asked.push(name);
      if (mockRpc.answer === 'throw') throw new Error('Network request failed');
      return name === 'public_launch_price' ? mockRpc.launch : mockRpc.answer;
    },
  },
}));

import AlbumSize from '../src/app/album-size';

/** Like the live list (as in checkoutWalk.test.tsx). */
const LIVE = {
  disabled_sizes: ['8.5x11', '11.5x8'], free_shipping_value: 200, hd_memories_price: 49, hosting_reserve: 50,
  hosting_tiers: [{ price: 0, years: 5 }, { price: 99, years: 10 }, { price: 149, years: 15 }, { price: 199, years: 20 }],
  min_pages: 40, sheet_rate: 66.25,
  sizes: {
    '6x4': { hard_rate: 825, pps: 18, soft_rate: 575 }, '6x6': { hard_rate: 900, pps: 12, soft_rate: 575 },
    '6x8': { hard_rate: 1075, pps: 8, soft_rate: 575 }, '8x6': { hard_rate: 1075, pps: 8, soft_rate: 575 },
    '8x8': { hard_rate: 1075, pps: 4, soft_rate: 575 }, '8.5x11': { hard_rate: 1750, pps: 4, soft_rate: 875 }, '11.5x8': { hard_rate: 1625, pps: 4, soft_rate: 875 },
  },
} as unknown as PriceSchedule;
const SIZES = ['6x6', '8x8', '6x4', '8x6', '6x8'] as const;

// A database before 0072 has no public_launch_price: no launch price.
beforeEach(() => {
  mockRpc.answer = { data: LIVE, error: null };
  mockRpc.launch = { data: null, error: { message: 'Could not find the function public.public_launch_price' } };
  mockRpc.asked = [];
});

describe('the number', () => {
  it.each(SIZES)("%s: checkout's own total for a 40-page soft-cover album, nothing added", (size) => {
    const checkout = checkoutPrice(LIVE, { albumSize: size, cover: 'softcover', pageCount: 40, qrCount: 0, hostingYears: null, hdMemories: false, tester: null });
    expect(startsAt(LIVE, size)).toBe(checkout.total);
    expect(startsAt(LIVE, size)).toBe(priceOf(LIVE, size, 'soft', 40));
  });

  it('8×8 on this list: ₱1,288 (10 sheets × ₱66.25 + ₱575 soft cover, + ₱50 video hosting reserve)', () => {
    expect(startsAt(LIVE, '8x8')).toBe(1288);
    expect(startsAtLine(1288)).toBe('Starts at ₱1,288 for 40 pages, soft cover');
  });

  it('follows the list: a new markup (sheet rate) moves it by itself', () => {
    const raised = { ...LIVE, sheet_rate: 82.15 } as PriceSchedule;
    expect(startsAt(raised, '8x8')).toBe(priceOf(raised, '8x8', 'soft', 40));
    expect(startsAt(raised, '8x8')).toBeGreaterThan(1288);
  });

  it('never a made-up number: no list yet, the Megy Mini (its own price), a size the list has no rate for', () => {
    expect(startsAt(null, '8x8')).toBeNull();
    expect(startsAt(LIVE, '5.8x8.3')).toBeNull();
    const without = { ...LIVE, sizes: { '8x8': (LIVE as unknown as { sizes: Record<string, unknown> }).sizes['8x8'] } } as unknown as PriceSchedule;
    expect(startsAt(without, '6x6')).toBeNull();
  });
});

describe('the size step', () => {
  it('each album size says what it starts at, from the live list', async () => {
    await render(<AlbumSize />);
    expect(await screen.findByTestId('size-price-8x8')).toHaveTextContent('Starts at ₱1,288 for 40 pages, soft cover');
    for (const size of SIZES) {
      expect(screen.getByTestId(`size-price-${size}`)).toHaveTextContent(startsAtLine(startsAt(LIVE, size)!));
    }
    // The sizes the owner switched off aren't shown, so neither is their price.
    expect(screen.queryByTestId('size-price-8.5x11')).toBeNull();
    expect([...mockRpc.asked].sort()).toEqual(['public_launch_price', 'public_price_schedule', 'public_video_offer']);
    // No launch price on this database: no launch line, nothing crossed out.
    expect(screen.queryByTestId('size-launch')).toBeNull();
    expect(screen.queryByTestId('size-regular-8x8')).toBeNull();
  });

  it('during the launch price: one line on top, and each size its regular price crossed out with its "% off"', async () => {
    mockRpc.launch = { data: { pct: 40, until: '2099-12-31' }, error: null };
    await render(<AlbumSize />);
    expect(await screen.findByTestId('size-launch')).toHaveTextContent('Launch price: 40% off the album until December 31, 2099');
    // The price paid doesn't change; the regular price is that price ÷ 0.6.
    expect(screen.getByTestId('size-price-8x8')).toHaveTextContent('Starts at ₱1,288 for 40 pages, soft cover');
    expect(screen.getByTestId('size-regular-8x8')).toHaveTextContent(/^Regular price ₱2,147\s+40% off$/);
    for (const size of SIZES) {
      const now = startsAt(LIVE, size)!;
      expect(screen.getByTestId(`size-regular-${size}`)).toHaveTextContent(new RegExp(`^Regular price ₱${Math.round(now / 0.6).toLocaleString('en-US')}\\s+40% off$`));
      // The owner, 2026-11-24: "show on the album pricing the % discount they're getting".
      expect(screen.getByTestId(`size-off-${size}`)).toHaveTextContent('40% off');
    }
  });

  it('a launch price that ended, or one that is not honest (over 90%), shows nothing', async () => {
    for (const launch of [{ pct: 40, until: '2020-01-31' }, { pct: 95, until: '2099-12-31' }, { pct: 40.5, until: '2099-12-31' }]) {
      mockRpc.launch = { data: launch, error: null };
      const view = await render(<AlbumSize />);
      expect(await screen.findByTestId('size-price-8x8')).toBeTruthy();
      expect(screen.queryByTestId('size-launch')).toBeNull();
      expect(screen.queryByTestId('size-regular-8x8')).toBeNull();
      await view.unmount();
    }
  });

  it('the list could not be read: no prices, never a guess; the sizes are still there to pick', async () => {
    mockRpc.answer = 'throw';
    await render(<AlbumSize />);
    expect(await screen.findByTestId('size-8x8')).toBeTruthy();
    expect(screen.queryByTestId('size-price-8x8')).toBeNull();
    mockRpc.answer = { data: null, error: { message: 'offline' } };
    await render(<AlbumSize />);
    expect(screen.queryByTestId('size-price-6x6')).toBeNull();
  });
});
