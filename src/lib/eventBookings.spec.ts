import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/* ══════════════════════════════════════════════════════════════════════════
   EVENT BOOKINGS (owner, 2026-10-10): 15+ guests is a booking; the deal is
   deposit then balance, and "the deposit price already covers the cost to
   make and some extra". The database (0043) is the real guard; these lock the
   app to it: the same numbers, the same receipt names, columns a host may
   read, and the owner's deposit floor.
   ══════════════════════════════════════════════════════════════════════════ */

const h = vi.hoisted(() => ({ calls: [] as [string, ...unknown[]][], result: { data: null as unknown, error: null as unknown } }));
vi.mock('./supabase', () => {
  const chain = {
    insert: (row: unknown) => { h.calls.push(['insert', row]); return chain; },
    select: (cols: unknown) => { h.calls.push(['select', cols]); return chain; },
    eq: (...a: unknown[]) => { h.calls.push(['eq', ...a]); return chain; },
    order: async (...a: unknown[]) => { h.calls.push(['order', ...a]); return h.result; },
    single: async () => h.result,
  };
  return {
    supabaseConfigured: true,
    supabase: {
      from: (t: string) => { h.calls.push(['from', t]); return chain; },
      rpc: async (name: string, args: unknown) => { h.calls.push(['rpc', name, args]); return h.result; },
    },
  };
});

import {
  EVENT_MIN_GUESTS, EVENT_MAX_GUESTS, OPEN_BOOKING_LIMIT, EVENT_TYPES, HOST_COLUMNS, BOOKING_STEPS, GUEST_STORAGE_COST,
  requestProblems, manilaToday, normalizeMobile, bookingView, balanceOf, costToMake, dealProblem, bookingProofPath,
  bookingErrorMessage, requestBooking, listMyBookings, submitBookingPayment, needsOwner, type EventBooking, type BookingRequest, type DealDraft,
} from './eventBookings';
import { costOf, type PricingModel } from './pricing';
import { ALBUM_SIZES } from '../pages/builder/types';

const SQL = readFileSync(resolve(__dirname, '../../supabase/migrations/0043_event_bookings.sql'), 'utf8');

beforeEach(() => { h.calls = []; h.result = { data: null, error: null }; });

describe('the app and 0043 say the same thing', () => {
  it('the minimum guests, the guest cap and the open-request limit', () => {
    expect(SQL).toMatch(new RegExp(`function public\\.event_min_guests\\(\\)[\\s\\S]*?select ${EVENT_MIN_GUESTS} \\$\\$`));
    expect(SQL).toMatch(new RegExp(`function public\\.open_booking_limit\\(\\)[\\s\\S]*?select ${OPEN_BOOKING_LIMIT} \\$\\$`));
    expect(SQL).toContain(`check (guest_count between ${EVENT_MIN_GUESTS} and ${EVENT_MAX_GUESTS})`);
  });

  it('the event types', () => {
    const m = /event_type in \(([^)]+)\)/.exec(SQL)!;
    expect(m[1].match(/'([a-z]+)'/g)!.map((s) => s.slice(1, -1))).toEqual(EVENT_TYPES.map((t) => t.id));
  });

  it('the album sizes a deal can name are the builder\'s sizes', () => {
    const m = /deal_album_size in \(([^)]+)\)/.exec(SQL)!;
    expect(m[1].match(/'([^']+)'/g)!.map((s) => s.slice(1, -1))).toEqual(ALBUM_SIZES.map((s) => s.preset));
  });

  it('every column the app reads as the host is granted to hosts, and the cost to make is not', () => {
    // 0043 grants the booking's columns, 0044 the event's.
    const SQL44 = readFileSync(resolve(__dirname, '../../supabase/migrations/0044_event_camera.sql'), 'utf8');
    const granted = [SQL, SQL44].flatMap((src) =>
      [...src.matchAll(/grant select \(([\s\S]+?)\)\s+on public\.event_bookings to authenticated/g)].flatMap((m) => m[1].split(',').map((c) => c.trim())));
    const read = HOST_COLUMNS.split(',').map((c) => c.trim());
    expect(read.filter((c) => !granted.includes(c))).toEqual([]);
    expect(granted).not.toContain('deal_cost');
    expect(read).not.toContain('deal_cost');
  });

  it('the deposit floor is the same rule in the table, the owner function and the app', () => {
    expect(SQL).toContain('deal_deposit > deal_cost');
    expect(SQL).toMatch(/if p_deposit is null or p_deposit <= p_cost then/);
  });

  it('a receipt name is one the storage policy and submit_booking_payment accept', () => {
    expect(bookingProofPath('abc', 'deposit', 'png')).toBe('booking-abc-deposit.png');
    expect(SQL).toContain("'booking-' || p_id::text || '-' || k || '.' || e");
    expect(SQL).toContain("unnest(array['deposit', 'balance']) as k");
    expect(SQL).toContain("unnest(array['jpg', 'png', 'webp', 'pdf']) as e");
  });
});

describe('the request form', () => {
  const ok: BookingRequest = { eventType: 'wedding', eventDate: '2026-12-12', venue: 'Manila Cathedral', guests: '150', name: 'Ana Reyes', mobile: '0917 123 4567', notes: '' };
  const today = '2026-10-10';

  it('a complete request has no problems', () => {
    expect(requestProblems(ok, today)).toEqual({});
  });

  it('every missing field says what to do', () => {
    const p = requestProblems({ eventType: '', eventDate: '', venue: '', guests: '', name: '', mobile: '', notes: '' }, today);
    expect(Object.keys(p).sort()).toEqual(['eventDate', 'eventType', 'guests', 'mobile', 'name', 'venue']);
  });

  it(`under ${EVENT_MIN_GUESTS} guests: it's an album, not a booking`, () => {
    expect(requestProblems({ ...ok, guests: '14' }, today).guests).toMatch(/15 or more guests.*make an album with Megyprints/);
    expect(requestProblems({ ...ok, guests: '15' }, today).guests).toBeUndefined();
  });

  it('a date that has passed (Manila calendar)', () => {
    expect(requestProblems({ ...ok, eventDate: '2026-10-09' }, today).eventDate).toMatch(/hasn’t passed/);
    expect(requestProblems({ ...ok, eventDate: today }, today).eventDate).toBeUndefined();
  });

  it('Manila is ahead of UTC: 5 PM UTC on the 10th is already the 11th', () => {
    expect(manilaToday(new Date('2026-10-10T17:00:00Z'))).toBe('2026-10-11');
    expect(manilaToday(new Date('2026-10-10T15:00:00Z'))).toBe('2026-10-10');
  });

  it('mobile numbers: spaces and dashes are fine, letters are not; abroad works too', () => {
    expect(normalizeMobile('0917-123 4567')).toBe('09171234567');
    expect(requestProblems({ ...ok, mobile: '+65 8123 4567' }, today).mobile).toBeUndefined();
    expect(requestProblems({ ...ok, mobile: 'call me' }, today).mobile).toBeTruthy();
  });

  it('sends only the request: no status, number, deal or payment fields', async () => {
    h.result = { data: { id: 'b1' }, error: null };
    await requestBooking('user-1', { ...ok, mobile: '0917 123 4567', venue: '  Manila Cathedral  ', notes: '  ' });
    const row = h.calls.find((c) => c[0] === 'insert')![1] as Record<string, unknown>;
    expect(row).toEqual({
      user_id: 'user-1', event_type: 'wedding', event_date: '2026-12-12', venue: 'Manila Cathedral', guest_count: 150,
      host_name: 'Ana Reyes', mobile: '09171234567', notes: null,
    });
    expect(h.calls.find((c) => c[0] === 'select')![1]).toBe(HOST_COLUMNS);
  });

  it('the database\'s own sentences reach the host as they are', async () => {
    h.result = { data: null, error: { code: 'EV001', message: 'You already have 3 booking requests open.' } };
    await expect(requestBooking('user-1', ok)).rejects.toThrow('You already have 3 booking requests open.');
    expect(bookingErrorMessage({ code: '23514', message: 'violates check constraint' })).toMatch(/Check each field/);
  });
});

describe('your bookings', () => {
  it('only the caller\'s own (the owner\'s account can read every booking)', async () => {
    h.result = { data: [], error: null };
    await listMyBookings('user-1');
    expect(h.calls).toContainEqual(['eq', 'user_id', 'user-1']);
  });

  it('"I\'ve sent" records the kind, the cleaned reference and the receipt path', async () => {
    await submitBookingPayment('b1', 'deposit', { reference: '2026 1010<script>', proofPath: 'booking-b1-deposit.png' });
    expect(h.calls.find((c) => c[0] === 'rpc')).toEqual(['rpc', 'submit_booking_payment',
      { p_id: 'b1', p_kind: 'deposit', p_reference: '2026 1010script', p_proof_path: 'booking-b1-deposit.png' }]);
  });
});

const booking = (over: Partial<EventBooking>): EventBooking => ({
  id: 'b1', booking_number: 'EV-2026-ABCDEFG', user_id: 'user-1', status: 'requested', event_type: 'wedding', event_date: '2026-12-12',
  venue: 'Manila Cathedral', guest_count: 150, host_name: 'Ana', mobile: '09171234567', notes: null,
  deal_total: null, deal_deposit: null, deal_cost: null, deal_album_size: null, deal_cover: null, deal_pages: null, deal_includes: null, quoted_at: null,
  deposit_reference: null, deposit_proof_path: null, deposit_submitted_at: null, deposit_paid_at: null,
  balance_reference: null, balance_proof_path: null, balance_submitted_at: null, balance_paid_at: null,
  cancelled_at: null, cancelled_by: null, close_reason: null, created_at: '2026-10-10T00:00:00Z', updated_at: '2026-10-10T00:00:00Z',
  ...over,
});
const deal = { deal_total: 30000, deal_deposit: 12000, deal_album_size: '8x8' as const, deal_cover: 'hard' as const, deal_pages: 40, quoted_at: '2026-10-11T00:00:00Z' };

describe('where a booking is, in words', () => {
  it.each([
    ['requested', {}, 0, 'none', null, /Request sent/],
    ['quoted', deal, 1, 'pay-deposit', null, /Pay the ₱12,000 deposit to book your date/],
    ['quoted', { ...deal, deposit_submitted_at: 'x' }, 1, 'none', 'deposit', /confirming your ₱12,000 deposit/],
    ['booked', { ...deal, deposit_paid_at: 'x' }, 2, 'pay-balance', null, /₱18,000 balance is due before your album prints/],
    ['booked', { ...deal, deposit_paid_at: 'x', balance_submitted_at: 'x' }, 2, 'none', 'balance', /confirming your ₱18,000 balance/],
    ['paid', { ...deal, deposit_paid_at: 'x', balance_paid_at: 'x' }, 3, 'none', null, /Paid in full/],
  ] as const)('%s %o → step %i, %s', (status, over, stage, action, confirming, headline) => {
    const v = bookingView(booking({ status, ...over }));
    expect(v).toMatchObject({ stage, action, confirming, closed: false });
    expect(v.headline).toMatch(headline);
    expect(BOOKING_STEPS[v.stage]).toBeTruthy();
  });

  it('declined and cancelled are closed, with nothing to pay', () => {
    expect(bookingView(booking({ status: 'declined' }))).toMatchObject({ closed: true, action: 'none' });
    expect(bookingView(booking({ status: 'cancelled', ...deal }))).toMatchObject({ closed: true, action: 'none' });
  });

  it('the balance is the total less the deposit', () => {
    expect(balanceOf({ deal_total: 30000, deal_deposit: 12000 })).toBe(18000);
    expect(balanceOf({ deal_total: null, deal_deposit: null })).toBeNull();
  });
});

describe('the owner\'s deal: the deposit covers the cost to make and some extra', () => {
  const model = {
    sheet_cost: 26.5, soft_cover_cost: 50, soft_bind_cost: 100, min_pages: 40, price_multiple: 2.5, hosting_reserve: 50,
    hosting_tiers: [], hd_memories_price: 0,
    sizes: Object.fromEntries(ALBUM_SIZES.map((s) => [s.preset, { pps: 4, hb: 350, surcharge: 0 }])),
  } as unknown as PricingModel;
  const draft = (over: Partial<DealDraft> = {}): DealDraft => ({ size: '8x8', cover: 'hard', pages: 40, otherCosts: 500, total: 30000, deposit: 5000, includes: '', ...over });

  it('cost to make = the album\'s cost (the Pricing tab\'s costOf) + guest photo storage + other costs', () => {
    const c = costToMake(model, 150, draft());
    expect(c.album).toBe(costOf(model, '8x8', 'hard', 40));
    expect(c.storage).toBe(Math.ceil(150 * GUEST_STORAGE_COST));
    expect(c.other).toBe(500);
    expect(c.total).toBe(c.album + c.storage + c.other);
  });

  it('a deposit equal to the cost is refused, in words', () => {
    const c = costToMake(model, 150, draft());
    expect(dealProblem(draft({ deposit: c.total }), c, 40)).toMatch(/more than the cost to make/);
  });

  it('a deposit a peso over the cost goes through', () => {
    const c = costToMake(model, 150, draft());
    expect(dealProblem(draft({ deposit: c.total + 1 }), c, 40)).toBeNull();
  });

  it('the total can\'t be under the deposit; the album keeps its minimum pages', () => {
    const c = costToMake(model, 150, draft());
    expect(dealProblem(draft({ deposit: 5000, total: 4000 }), c, 40)).toMatch(/total can’t be less/);
    expect(dealProblem(draft({ pages: 30 }), c, 40)).toMatch(/at least 40 pages/);
  });
});

describe('what waits on the owner (the Bookings tab count)', () => {
  it.each([
    ['requested', {}, true],
    ['quoted', {}, false],
    ['quoted', { deposit_submitted_at: 'x' }, true],
    ['booked', {}, false],
    ['booked', { balance_submitted_at: 'x' }, true],
    ['paid', {}, false],
    ['declined', {}, false],
    ['cancelled', {}, false],
  ] as const)('%s %o → %s', (status, over, waits) => {
    expect(needsOwner(booking({ status, ...over }))).toBe(waits);
  });
});
