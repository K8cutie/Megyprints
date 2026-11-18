/* ══════════════════════════════════════════════════════════════════════════
   WHY THIS TEST: ordering an album again says what the website says, and
   follows its rules.
     • "Order this album again" is the website's link on an order (MyOrders.tsx),
       on the same orders: its album still saved, not waiting for payment.
     • A second copy starts from the album's last order's paper and cover
       (Order.tsx, RC-1): only into a finish still untouched, only a paper and
       cover still sold, with the website's sentence.
   ══════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { trackOf } from '@web/lib/orderTracker';
import { finishToCopy, sameFinishNote } from '../src/lib/checkout/sameFinish';
import { canOrderAgain, ORDER_AGAIN } from '../src/lib/orders/orderWords';
import type { AppOrder } from '../src/lib/orders/myOrders';

const WEB = path.resolve(__dirname, '../..');
const fold = (s: string) => s.replace(/\{' '\}/g, ' ').replace(/&apos;/g, "'").replace(/\s+/g, ' ');
const MY_ORDERS = fold(readFileSync(path.join(WEB, 'src/pages/MyOrders.tsx'), 'utf8'));
const ORDER = fold(readFileSync(path.join(WEB, 'src/pages/Order.tsx'), 'utf8'));

const DEFAULTS = { material: 'matte', cover: 'softcover' };
const last = (o: Partial<{ order_number: string; material: string; cover: string }>) => ({ order_number: 'MP-2026-DONE005', material: 'glossy', cover: 'hardboundLeather', ...o });

describe('"Order this album again": the website\'s link', () => {
  it('the same words', () => {
    expect(MY_ORDERS).toContain(`> ${ORDER_AGAIN} </Link>`);
    expect(MY_ORDERS).toContain('to={`/builder?album=${order.album_id}&order=again`}');
  });
  it('on the same orders: its album still saved, not waiting for payment', () => {
    expect(MY_ORDERS).toContain('{order.album_id && !track.awaitingPayment && (');
    const order = (o: Partial<AppOrder>): AppOrder => ({
      id: 'o1', order_number: 'MP-2026-ABC1234', status: 'delivered', amount: 1500, created_at: '2026-10-25T17:30:00Z',
      payment_submitted_at: null, album_size: '8x8', page_count: 40, tracking: null, album_title: null, album_id: 'album-1', tester_code: null, ...o,
    });
    for (const status of ['pending_payment', 'paid', 'in_production', 'printed', 'shipped', 'delivered', 'cancelled']) {
      for (const album_id of ['album-1', null]) {
        const o = order({ status, album_id });
        expect(canOrderAgain(o, trackOf(o).awaitingPayment)).toBe(!!album_id && !trackOf(o).awaitingPayment);
      }
    }
    expect(canOrderAgain(order({ status: 'pending_payment' }), true)).toBe(false);
    expect(canOrderAgain(order({ status: 'delivered' }), false)).toBe(true);
  });
});

describe('a second copy starts from the first', () => {
  it("the website's sentence", () => {
    expect(ORDER).toContain('Same paper and cover as your last order of this album (<span className="font-mono">{prefilled.finishFrom}</span>). Change them below if you like.');
    expect(sameFinishNote('MP-2026-DONE005')).toBe('Same paper and cover as your last order of this album (MP-2026-DONE005). Change them below if you like.');
  });
  it('copies the last paper and cover into an untouched finish', () => {
    expect(finishToCopy(last({}), DEFAULTS, DEFAULTS)).toEqual({ material: 'glossy', cover: 'hardboundLeather', from: 'MP-2026-DONE005' });
  });
  it('never over a finish the customer already picked (the website\'s prefillPlan)', () => {
    expect(finishToCopy(last({}), { material: 'glossy', cover: 'softcover' }, DEFAULTS)).toBeNull();
    expect(finishToCopy(last({}), { material: 'matte', cover: 'hardboundLeather' }, DEFAULTS)).toBeNull();
  });
  it('nothing to copy: no earlier order, or a paper or cover no longer sold', () => {
    expect(finishToCopy(null, DEFAULTS, DEFAULTS)).toBeNull();
    expect(finishToCopy(last({ cover: 'velvet' }), DEFAULTS, DEFAULTS)).toBeNull();
    expect(finishToCopy(last({ material: 'canvas' }), DEFAULTS, DEFAULTS)).toBeNull();
  });
});
