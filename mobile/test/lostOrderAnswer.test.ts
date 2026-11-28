/* Bug hunt L1-47 (2026-11-27, Seeker B, emulator): the network cut the moment
   the order row was saved, so the app said "We couldn't reach Megy Prints"
   though the order existed. Place order again made a SECOND order (4GA2B34 and
   PFAYE3D); the first stayed unpaid and unsent and counted toward the 3-unpaid
   limit. Now the phone picks the order's id once per checkout visit: a second
   insert with the same id is refused by the database as a duplicate, and the
   app finishes the saved order instead. */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { newOrderId } from '../src/lib/checkout/orderId';
import { savedOrderNote } from '../src/lib/checkout/unsentOrders';
import { resetFake } from './helpers/fakeSupabase';

jest.mock('expo-crypto', () => ({ getRandomBytes: (n: number) => Uint8Array.from({ length: n }, (_, i) => (i * 37 + 11) & 0xff) }));
jest.mock('@web/lib/supabase', () => ({ supabase: require('./helpers/fakeSupabase').fakeClient, supabaseConfigured: true }));

beforeEach(resetFake);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("the order's id, chosen on the phone", () => {
  it('is a version 4 UUID (the column is uuid; its default stays for every other caller)', () => {
    expect(newOrderId()).toMatch(UUID);
  });
});

describe('checkout, for a real order (the send itself: test/sendOrder.test.ts)', () => {
  it('checkout keeps one id per visit until an order is known saved, and finishes the saved one on that refusal', () => {
    const src = readFileSync(path.join(__dirname, '../src/app/order.tsx'), 'utf8').replace(/\r\n/g, '\n');
    expect(src).toContain('orderId: live && !finishing ? (orderIdRef.current ??= newOrderId()) : undefined,');
    expect(src).toContain("if (e instanceof OrderAlreadySavedError) {\n            placedRef.current = { id: e.orderId, order_number: '', status: 'pending_payment' };\n            setMessage(e.message); setStep('form');\n            void startFinishing(e.orderId);");
    // The note before the order's number is known.
    expect(savedOrderNote('')).toMatch(/^Your order is saved\. Place order finishes sending it as you placed it\./);
  });
});
