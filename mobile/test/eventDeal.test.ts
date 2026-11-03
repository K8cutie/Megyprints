/* ══════════════════════════════════════════════════════════════════════════
   AN EVENT'S ALBUM AT CHECKOUT (src/lib/events/eventDeal.ts), beside the
   website's own src/lib/eventAlbum.ts and eventBookings.ts:
     • which bookings are offered, the link a pick makes, and what checkout
       does with it (covered, or why not, in the website's words): the same
       answers on many inputs;
     • the booking reads (the host's own, the columns a host may read) and
       the database's own error sentences: the website's;
     • the checkout's words are Order.tsx's.
   ══════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import * as app from '../src/lib/events/eventDeal';

type Call = { table: string; chain: unknown[][] };
const mockDb = { calls: [] as Call[], rows: [] as Record<string, unknown>[], error: null as { message: string; code?: string } | null };
function mockFrom(table: string) {
  const call: Call = { table, chain: [] };
  const answer = () => {
    mockDb.calls.push(call);
    if (mockDb.error) return { data: null, error: mockDb.error };
    let rows = mockDb.rows;
    for (const [op, k, v] of call.chain) if (op === 'eq') rows = rows.filter((r) => r[k as string] === v);
    return { data: rows, error: null };
  };
  const b = {
    select: (...a: unknown[]) => { call.chain.push(['select', ...a]); return b; },
    eq: (...a: unknown[]) => { call.chain.push(['eq', ...a]); return b; },
    order: (...a: unknown[]) => { call.chain.push(['order', ...a]); return b; },
    maybeSingle: async () => { const r = answer(); return { data: Array.isArray(r.data) ? (r.data[0] ?? null) : null, error: r.error }; },
    then: (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve(answer()).then(ok, bad),
  };
  return b;
}
const mockClient = { from: (t: string) => mockFrom(t), rpc: async () => ({ error: null }) };
jest.mock('@web/lib/supabase', () => ({ supabase: { from: (t: string) => mockFrom(t) }, supabaseConfigured: true }));

type AnyFn = (...args: any[]) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
/* eslint-disable @typescript-eslint/no-require-imports */
const webAlbum = require('@web/lib/eventAlbum') as Record<string, AnyFn>;
const webBookings = require('@web/lib/eventBookings') as Record<string, AnyFn> & { HOST_COLUMNS: string };
/* eslint-enable @typescript-eslint/no-require-imports */
const ORDER_SRC = fs.readFileSync(path.join(__dirname, '..', '..', 'src/pages/Order.tsx'), 'utf8').replace(/\r\n/g, '\n');

const booking = (over: Record<string, unknown> = {}) => ({
  id: 'b1', booking_number: 'EV-2026-0001', status: 'paid', deal_total: 25000, deal_deposit: 10000,
  deal_album_size: '8x8', deal_cover: 'hard', deal_pages: 60, album_order_id: null, ...over,
}) as app.EventBooking;

beforeEach(() => { mockDb.calls = []; mockDb.rows = []; mockDb.error = null; });

describe('the rules are the website\'s', () => {
  const bookings = [
    booking(), booking({ id: 'b2', status: 'booked' }), booking({ id: 'b3', status: 'quoted' }), booking({ id: 'b4', album_order_id: 'o1' }),
    booking({ id: 'b5', deal_album_size: null }), booking({ id: 'b6', status: 'cancelled' }), booking({ id: 'b7', deal_cover: 'soft', deal_pages: null }),
  ];

  it('which bookings are offered, and the link a pick makes', () => {
    expect(app.bookingsWaitingForAlbum(bookings)).toEqual(webAlbum.bookingsWaitingForAlbum(bookings));
    expect(app.bookingsWaitingForAlbum(bookings).map((b) => b.id)).toEqual(['b1', 'b2', 'b7']);
    for (const b of bookings) expect(app.linkFromBooking(b)).toEqual(webAlbum.linkFromBooking(b));
  });

  it('what checkout does with the link: covered, or why not, in the website\'s words', () => {
    const link = app.linkFromBooking(booking())!;
    const cases: [app.EventAlbumLink | null, app.EventBooking | null, { size: '8x8' | '6x6'; pages: number }][] = [
      [null, booking(), { size: '8x8', pages: 40 }],
      [link, null, { size: '8x8', pages: 40 }],
      [link, booking({ status: 'booked' }), { size: '8x8', pages: 40 }],
      [link, booking({ status: 'booked', deal_total: 25000.5, deal_deposit: 1000 }), { size: '8x8', pages: 40 }],
      [link, booking({ status: 'completed' }), { size: '8x8', pages: 40 }],
      [link, booking({ album_order_id: 'o9' }), { size: '8x8', pages: 40 }],
      [link, booking(), { size: '6x6', pages: 40 }],
      [link, booking(), { size: '8x8', pages: 62 }],
      [link, booking(), { size: '8x8', pages: 60 }],
      [{ ...link, cover: 'soft' }, booking(), { size: '6x6', pages: 80 }],
    ];
    for (const [l, b, a] of cases) expect(app.eventDealState(l, b, a)).toEqual(webAlbum.eventDealState(l, b, a));
    expect(app.eventDealState(link, booking({ status: 'booked' }), { size: '8x8', pages: 40 })).toEqual({
      state: 'blocked', bookingNumber: 'EV-2026-0001', cover: 'hard',
      message: 'Pay the ₱15,000 balance for booking EV-2026-0001 first (Events → your booking). Your album prints once it’s in.',
    });
  });

  it('the database\'s sentences, and the peso amounts', () => {
    for (const e of [null, { code: 'EV004', message: 'That booking is not yours.' }, { code: '23514', message: 'x' }, { message: 'boom' }, {}]) {
      expect(app.bookingErrorMessage(e as never)).toBe(webBookings.bookingErrorMessage(e));
    }
    for (const n of [null, undefined, 0, 15000, 1234567.891, 99.5, 0.05]) expect(app.peso(n)).toBe(webBookings.peso(n));
  });
});

describe('the booking reads are the website\'s', () => {
  it('the host\'s own bookings, newest first; one of them; the columns a host may read', async () => {
    expect(app.HOST_COLUMNS).toBe(webBookings.HOST_COLUMNS);
    mockDb.rows = [{ ...booking(), user_id: 'u1' }, { ...booking({ id: 'b2' }), user_id: 'u2' }];
    const web = await webBookings.listMyBookings('u1');
    const webCalls = mockDb.calls.splice(0);
    expect(await app.listMyBookings(mockClient as never, 'u1')).toEqual(web);
    expect(mockDb.calls).toEqual(webCalls);
    mockDb.calls = [];
    const one = await webBookings.getMyBooking('u1', 'b1');
    const oneCalls = mockDb.calls.splice(0);
    expect(await app.getMyBooking(mockClient as never, 'u1', 'b1')).toEqual(one);
    expect(mockDb.calls).toEqual(oneCalls);
    mockDb.error = { code: 'EV001', message: 'Bookings are closed.' };
    await expect(app.listMyBookings(mockClient as never, 'u1')).rejects.toThrow('Bookings are closed.');
  });
});

describe('the checkout\'s words are Order.tsx\'s', () => {
  it('word for word', () => {
    for (const w of [app.OFFER_TITLE, app.OFFER_BODY, app.CHECKING_BOOKING, app.COVERED, app.NOT_MINE, app.CHECKING_TRY_AGAIN, app.COVERED_LINE, app.COVERED_LATER, app.EVENT_MEMORIES, app.PLACE_EVENT, app.PAYING]) {
      expect(ORDER_SRC).toContain(w);
    }
    expect(ORDER_SRC).toContain('Use booking <span className="font-mono">{b.booking_number}</span> for this album');
    expect(ORDER_SRC).toContain('Your event album · booking <span className="font-mono">{eventLink.bookingNumber}</span>');
    expect(ORDER_SRC).toContain('Album — part of booking <span className="font-mono">{eventLink.bookingNumber}</span>');
    expect(ORDER_SRC).toContain('Your event booking <span className="font-mono">{eventLink.bookingNumber}</span> paid for this album. We print it and ship it to your door.');
    expect(ORDER_SRC).toContain("if (eventLink) setCover(eventLink.cover === 'soft' ? 'softcover' : 'hardboundLeather');");
    expect([app.dealCover('soft'), app.dealCover('hard')]).toEqual(['softcover', 'hardboundLeather']);
  });
});
