/* Bug hunt B3 (2026-11-27, confirmed by Mother): the payment step right after
   Place order asked for the phone's own total, while the order row was saved
   at the database's total (orders.quoted_amount, 0055). They differ when the
   owner changes a price or a code's discount while checkout is open: e.g. the
   discount 100 → 150 made the screen say ₱1,405 and the row ₱1,355. Your
   orders → Pay already asked for quoted_amount, so the two screens disagreed.
   Now Place order reads the saved total back and asks for that, with a plain
   line when it moved. */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { render, screen } from '@testing-library/react-native';
import { payAfterPlacing, PRICE_MOVED } from '../src/lib/checkout/openOrder';
import { PaymentStep } from '../src/components/checkout/PaymentStep';
import { resetFake } from './helpers/fakeSupabase';

jest.mock('@web/lib/supabase', () => ({ supabase: require('./helpers/fakeSupabase').fakeClient, supabaseConfigured: true }));

beforeEach(resetFake);

describe('what the payment step asks for right after Place order', () => {
  it('the total the database saved on the order, not the phone\'s', () => {
    expect(payAfterPlacing({ quoted_amount: 1355, amount: null }, 1405)).toEqual({ amount: 1355, changed: true });
    expect(payAfterPlacing({ quoted_amount: 1455, amount: null }, 1405)).toEqual({ amount: 1455, changed: true });
    expect(payAfterPlacing({ quoted_amount: 1405, amount: null }, 1405)).toEqual({ amount: 1405, changed: false });
    // The shop's amount when there is no quote (askedToPay's own rule).
    expect(payAfterPlacing({ quoted_amount: null, amount: 1500 }, 1405)).toEqual({ amount: 1500, changed: true });
  });

  it('the phone\'s total only when the row has none (a free tester order, a booking that pays, an older answer)', () => {
    expect(payAfterPlacing({ quoted_amount: 0, amount: 0 }, 0)).toEqual({ amount: 0, changed: false });
    expect(payAfterPlacing({}, 1405)).toEqual({ amount: 1405, changed: false });
    expect(payAfterPlacing({ quoted_amount: null, amount: null }, 1405)).toEqual({ amount: 1405, changed: false });
  });
});

describe('Place order reads the saved total back (the send itself: test/sendOrder.test.ts)', () => {
  it('the checkout screen asks for that saved total, and drops the phone\'s summary when it moved', () => {
    const src = readFileSync(path.join(__dirname, '../src/app/order.tsx'), 'utf8').replace(/\r\n/g, '\n');
    expect(src).toContain('const p = payAfterPlacing(o, price.payTotal); setPlacedAmount(p.amount); setPriceMoved(p.changed);');
    expect(src).toContain('summary={payAfterFinish || priceMoved ? undefined : summary}');
    expect(src).toContain('note={priceMoved && !payAfterFinish ? PRICE_MOVED : undefined}');
  });
});

describe('the payment step says it plainly', () => {
  it('"Send" the saved total, with the line that the price changed', async () => {
    await render(<PaymentStep amount={1355} order={{ id: 'order-1', order_number: 'MP-2026-TEST01', created_at: '2026-11-27T16:00:00Z' }} onBack={() => {}} note={PRICE_MOVED} />);
    expect(screen.getByText('Send ₱1,355')).toBeOnTheScreen();
    expect(screen.getByTestId('pay-note')).toHaveTextContent(PRICE_MOVED);
  });

  it('no line when nothing moved', async () => {
    await render(<PaymentStep amount={1405} order={{ id: 'order-1', order_number: 'MP-2026-TEST01', created_at: '2026-11-27T16:00:00Z' }} onBack={() => {}} />);
    expect(screen.getByText('Send ₱1,405')).toBeOnTheScreen();
    expect(screen.queryByTestId('pay-note')).toBeNull();
  });
});
