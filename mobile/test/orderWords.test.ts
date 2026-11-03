/* ══════════════════════════════════════════════════════════════════════════
   WHY THIS TEST: Your orders must say what the website's Orders page says
   (src/pages/MyOrders.tsx), and where an order is must come from its REAL
   status through the shared orderTracker. Each sentence the app shows is
   found in the website's source; the date line is the website's own,
   run in Manila time on 2,000+ dates; and every status gives the tracker's
   own headline.
   ══════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { AWAITING_PAYMENT_STAGE, TEST_ORDER_HEADLINE, TRACK_STAGES, trackOf } from '@web/lib/orderTracker';
import { ALBUM_SIZES } from '@web/pages/builder/types';
import { peso } from '../src/lib/checkout/price';
import type { AppOrder } from '../src/lib/orders/myOrders';
import {
  CANCEL_ASK,
  CANCEL_FAILED,
  CANCEL_GONE,
  CANCELLED_NOTE,
  cancelYes,
  KEEP_IT,
  NO_ORDERS,
  ORDERS_LEAD,
  ORDERS_LOAD_FAILED,
  orderAlbumName,
  orderPrice,
  orderSizeName,
  orderView,
  payButton,
  payHeadline,
  placedLine,
  placedOnFull,
  testOrderNote,
  trackingLine,
} from '../src/lib/orders/orderWords';

const WEB = path.resolve(__dirname, '../..');
const SRC = readFileSync(path.join(WEB, 'src/pages/MyOrders.tsx'), 'utf8');
/** The source as a reader sees it: JSX spacing and entities folded. */
const READ = SRC.replace(/\{' '\}/g, ' ').replace(/&apos;/g, "'").replace(/\s+/g, ' ');

const order = (o: Partial<AppOrder>): AppOrder => ({
  id: 'o1', order_number: 'MP-2026-ABC1234', status: 'pending_payment', amount: null, quoted_amount: null,
  created_at: '2026-10-25T17:30:00Z', payment_submitted_at: null, album_size: '8x8', page_count: 40, tracking: null,
  album_title: "Maria's Debut", album_id: 'album-1', tester_code: null, ...o,
});

describe("Your orders: the website's words", () => {
  it('the title, the line under it, loading, empty and a failed read', () => {
    expect(READ).toContain('>Your orders</h1>');
    expect(READ).toContain(ORDERS_LEAD);
    expect(READ).toContain(`${ORDERS_LOAD_FAILED}: {err}`);
    expect(READ).toContain(`>${NO_ORDERS}</p>`);
    expect(READ).toContain('>Make an album</Link>');
  });

  it('a cancelled order, a test order, and the cancel buttons', () => {
    // "message us" is a link there, a button here: the sentence around it is the same.
    expect(READ).toContain(CANCELLED_NOTE.replace(/message us\.$/, ''));
    expect(READ).toContain('className="underline font-semibold">message us</Link>.');
    expect(READ).toContain("You used the tester code <span className=\"font-mono\">{order.tester_code}</span>, so nothing is charged. Thank you for testing Megy Prints!");
    expect(testOrderNote('MEGYTEST')).toBe('You used the tester code MEGYTEST, so nothing is charged. Thank you for testing Megy Prints!');
    expect(READ).toContain(`setCancelErr('${CANCEL_GONE}')`);
    expect(READ).toContain(`'${CANCEL_FAILED}'`);
    expect(READ).toContain(`> ${CANCEL_ASK} </button>`);
    expect(READ).toContain('Yes, cancel order {order.order_number}');
    expect(cancelYes('MP-2026-ABC1234')).toBe('Yes, cancel order MP-2026-ABC1234');
    expect(READ).toContain(`> ${KEEP_IT} </button>`);
  });

  it('the payment box and the courier number', () => {
    expect(READ).toContain('Send {peso(order.amount)} by bank transfer to finish');
    expect(payHeadline(1288)).toBe('Send ₱1,288 by bank transfer to finish');
    expect(payHeadline(null)).toBe('Pay by bank transfer to finish');
    expect(payButton(1288)).toBe('Pay ₱1,288 by bank transfer');
    expect(READ).toContain('Put <span className="font-mono">{order.order_number}</span> in the note if your app asks.');
    expect(READ).toContain('{order.tracking && track.stage >= 4 && (');
    expect(READ).toContain('Courier tracking number: <span');
    expect(trackingLine('JNT-123')).toBe('Courier tracking number: JNT-123');
  });

  it("the album's name and size, the website's way", () => {
    expect(SRC).toContain("const size = ALBUM_SIZES.find((s) => s.preset === order.album_size)?.name ?? order.album_size ?? '';");
    expect(SRC).toContain("const albumName = isDefaultAlbumName(order.album_title) ? '' : cleanAlbumName(order.album_title);");
    for (const s of [...ALBUM_SIZES.map((a) => a.preset), '9x9', null, undefined, '']) {
      expect(orderSizeName(s)).toBe(ALBUM_SIZES.find((a) => a.preset === s)?.name ?? s ?? '');
    }
    expect(orderSizeName('8x8')).toBe('8×8" Square');
    expect(orderSizeName('9x9')).toBe('9x9'); // a size we no longer make: named as stored, as the website does
    expect(orderAlbumName('My Album')).toBe('');
    expect(orderAlbumName('Untitled Album')).toBe('');
    expect(orderAlbumName(null)).toBe('');
    expect(orderAlbumName("  Maria's   Debut ")).toBe("Maria's Debut");
  });

  it('the date line reads as the website says it on a phone in the Philippines (its own toLocaleDateString, Manila time)', () => {
    expect(SRC).toContain("d.toLocaleDateString('en-PH', { day: 'numeric', month: 'long', year: 'numeric' })");
    expect(SRC).toContain("Placed {fmtDate(order.created_at)}{size ? ` · ${size}` : ''}{order.page_count ? ` · ${order.page_count} pages` : ''}");
    const before = process.env.TZ;
    process.env.TZ = 'Asia/Manila';
    try {
      const webDate = (iso: string) => {
        const d = new Date(iso);
        return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-PH', { day: 'numeric', month: 'long', year: 'numeric' });
      };
      const isos = ['2026-10-25T17:30:00Z', '2026-12-31T15:59:59Z', '2026-12-31T16:00:00Z', '2027-02-28T16:00:00Z', '2028-02-28T16:00:00Z', '2026-10-29T08:12:45.123456+00:00'];
      for (let t = Date.UTC(2026, 0, 1); t < Date.UTC(2028, 0, 1); t += 7 * 3_600_000 + 13 * 60_000) isos.push(new Date(t).toISOString());
      for (const iso of isos) expect(placedOnFull(iso)).toBe(webDate(iso));
      expect(isos.length).toBeGreaterThan(2000);
    } finally {
      if (before === undefined) delete process.env.TZ; else process.env.TZ = before;
    }
    expect(placedOnFull('2026-10-25T17:30:00Z')).toBe('October 26, 2026');
    expect(placedOnFull('nope')).toBe('');
    expect(placedLine(order({}))).toBe('Placed October 26, 2026 · 8×8" Square · 40 pages');
    expect(placedLine(order({ album_size: null, page_count: null }))).toBe('Placed October 26, 2026');
  });

  it("the price: the website's peso, the shop's amount first, else what the customer was asked to pay", () => {
    expect(SRC).toContain("const peso = (n: number | null) => (n == null ? '' : `₱${Number(n).toLocaleString('en-PH')}`);");
    for (const n of [0, 7, 999, 1000, 1288, 12_345, 1_234_567]) expect(peso(n)).toBe(`₱${Number(n).toLocaleString('en-PH')}`);
    expect(orderPrice({ status: 'paid', amount: 1710, quoted_amount: 1288 })).toBe(1710);
    expect(orderPrice({ status: 'pending_payment', amount: null, quoted_amount: 1288 })).toBe(1288);
    expect(orderPrice({ status: 'pending_payment', amount: null, quoted_amount: null })).toBeNull();
    expect(orderPrice({ status: 'cancelled', amount: null, quoted_amount: 1288 })).toBeNull();
    expect(orderPrice({ status: 'pending_payment', amount: 0, quoted_amount: 0 })).toBe(0); // a claimed tester order: ₱0, as the website shows
    expect(orderPrice({ status: 'paid', amount: '1710' as unknown as number })).toBe(1710);
  });
});

describe('where an order is: the REAL status, through the shared tracker', () => {
  const statuses = ['pending_payment', 'paid', 'in_production', 'printed', 'shipped', 'delivered', 'cancelled', 'something_new'];
  const cases = statuses.flatMap((status) => [
    order({ status }),
    order({ status, payment_submitted_at: '2026-10-26T01:00:00Z' }),
    order({ status, tester_code: 'MEGYTEST' }),
  ]);
  it.each(cases.map((o) => [`${o.status}${o.payment_submitted_at ? ' + payment sent' : ''}${o.tester_code ? ' + tester code' : ''}`, o] as const))('%s', (_n, o) => {
    const v = orderView(o);
    expect(v.track).toEqual(trackOf(o));
    expect(v.numberLine).toBe(`Order ${o.order_number}`);
    expect(v.payBy !== null).toBe(v.track.awaitingPayment);
  });

  it('the headlines a customer can see', () => {
    expect(orderView(order({})).track.headline).toBe(AWAITING_PAYMENT_STAGE);
    expect(orderView(order({})).payBy).toBe('Please pay by November 2, 2026. After that this order closes by itself, and your album stays saved.');
    expect(orderView(order({ payment_submitted_at: '2026-10-26T01:00:00Z' })).track.headline).toBe(TRACK_STAGES[0]);
    expect(orderView(order({ status: 'shipped' })).track.headline).toBe('On its way to you');
    expect(orderView(order({ status: 'delivered' })).track.finished).toBe(true);
    expect(orderView(order({ status: 'cancelled' })).track.headline).toBe('Cancelled');
    expect(orderView(order({ tester_code: 'MEGYTEST' })).track.headline).toBe(TEST_ORDER_HEADLINE);
    expect(orderView(order({ tester_code: 'MEGYTEST' })).payBy).toBeNull();
  });
});
