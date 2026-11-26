/* ══════════════════════════════════════════════════════════════════════════
   WHY THIS TEST: a Megy Mini takes no affiliate discount (owner, 2026-11-19:
   "only mini"; the database's 0065). Its client pays the full price, the code
   still counts for the affiliate, and checkout says so instead of "₱100 off".
   Albums keep the discount.
   ══════════════════════════════════════════════════════════════════════════ */
import { render, screen } from '@testing-library/react-native';
import type { PriceSchedule } from '@web/lib/pricing';
import { affiliateTerms } from '@web/lib/orderCodes';
import { CheckoutCodeBox } from '../src/components/checkout/CheckoutCodeBox';
import { checkoutPrice } from '../src/lib/checkout/price';

/** The live list on 2026-11-19, with the Megy Mini on sale. */
const LIVE = {
  disabled_sizes: ['8.5x11', '11.5x8', '9x9'], free_shipping_value: 200, hd_memories_price: 49, hosting_reserve: 50,
  hosting_tiers: [{ price: 0, years: 5 }, { price: 99, years: 10 }, { price: 149, years: 15 }, { price: 199, years: 20 }],
  min_pages: 40, sheet_rate: 66.25,
  sizes: { '8x8': { hard_rate: 1075, pps: 4, soft_rate: 575 }, '6x6': { hard_rate: 900, pps: 12, soft_rate: 575 } },
  mini: { size: '8.3x11.7', cover: 'staple', pages: 16, price: 350, free_qr: 2, shipping_fee: 120, package_price: 299 },
} as unknown as PriceSchedule;
const ANNA = { code: 'ANNA', discount: 100 };
const none = { qrCount: 0, hostingYears: null, hdMemories: false, tester: null } as const;

describe('what the client pays with an affiliate code', () => {
  it('a Megy Mini: the full price (₱350 + ₱120 shipping), nothing off', () => {
    const p = checkoutPrice(LIVE, { albumSize: '8.3x11.7', cover: 'softcover', pageCount: 16, ...none, affiliate: ANNA });
    expect(p.mini).toBe(true);
    expect(p.total).toBe(470);
    expect(p.payTotal).toBe(470);
  });
  it('an album: ₱100 off, as before', () => {
    const p = checkoutPrice(LIVE, { albumSize: '8x8', cover: 'softcover', pageCount: 40, ...none, affiliate: ANNA });
    expect(p.total).toBe(1288);
    expect(p.payTotal).toBe(1188);
  });
});

describe('the code box says what the code does', () => {
  const box = (mini: boolean) => render(
    <CheckoutCodeBox tester={null} affiliate={ANNA} onTester={() => {}} onAffiliate={() => {}} check={async () => ({ ok: false, message: '' })}
      signedIn onSignIn={() => {}} mini={mini} />,
  );
  it('on a Megy Mini: no discount, said in words', async () => {
    await box(true);
    expect(screen.getByTestId('affiliate-code-on')).toBeTruthy();
    expect(screen.getByText('✓ Code ANNA: no discount on a Megy Mini')).toBeTruthy();
  });
  it('on an album: ₱100 off', async () => {
    await box(false);
    expect(screen.getByText('✓ Code ANNA: ₱100 off')).toBeTruthy();
  });
});

it("the affiliate's terms say it", () => {
  expect(affiliateTerms({ on: true, ratePct: 10, discount: 100, windowDays: 30, minPayout: 500 }))
    .toContain('A Megy Mini has no discount for your client, and you still earn 10% of its price.');
});
