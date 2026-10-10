// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/* ══════════════════════════════════════════════════════════════════════════
   THE OWNER'S BOOKINGS TAB (0043). "The deposit price already covers the cost
   to make and some extra" (owner, 2026-10-10): the deal editor works the cost
   to make out from the same pricing model as the Pricing tab, and a deposit
   that doesn't cover it is stopped here, in words, before the database would
   refuse it too. Then: confirm the deposit, confirm the balance, close.
   ══════════════════════════════════════════════════════════════════════════ */

const h = vi.hoisted(() => ({
  rows: [] as unknown[],
  model: null as unknown,
  calls: [] as [string, unknown][],
}));
vi.mock('../../lib/storeSettings', () => ({ loadOwnerPricingModel: async () => h.model }));
vi.mock('../../lib/supabase', () => ({
  supabaseConfigured: true,
  supabase: {
    rpc: async (name: string, args: unknown) => {
      h.calls.push([name, args]);
      if (name === 'owner_event_bookings') return { data: h.rows, error: null };
      return { data: null, error: null };
    },
    storage: { from: () => ({ createSignedUrl: async () => ({ data: { signedUrl: 'https://example.test/r' }, error: null }) }) },
  },
}));

import BookingsPanel from './BookingsPanel';
import { costToMake, type EventBooking } from '../../lib/eventBookings';
import type { PricingModel } from '../../lib/pricing';
import { ALBUM_SIZES } from '../builder/types';

const MODEL = {
  sheet_cost: 26.5, soft_cover_cost: 50, soft_bind_cost: 100, min_pages: 40, price_multiple: 2.5, hosting_reserve: 50,
  hosting_tiers: [], hd_memories_price: 0,
  sizes: Object.fromEntries(ALBUM_SIZES.map((s) => [s.preset, { pps: 4, hb: 350, surcharge: 0 }])),
} as unknown as PricingModel;

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement;
let root: Root;
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); h.rows = []; h.model = MODEL; h.calls = []; });
afterEach(() => { act(() => root.unmount()); host.remove(); });

const settle = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
const render = async () => { await act(async () => { root.render(createElement(BookingsPanel)); }); await settle(); };
const $ = (id: string) => host.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
const click = async (el: Element | null) => { expect(el).not.toBeNull(); await act(async () => { (el as HTMLElement).click(); }); await settle(); };
const type = async (el: Element | null, v: string) => {
  expect(el).not.toBeNull();
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, v);
    el!.dispatchEvent(new Event('input', { bubbles: true }));
  });
};
const rpcs = (name: string) => h.calls.filter((c) => c[0] === name).map((c) => c[1]);

const booking = (over: Partial<EventBooking>): EventBooking => ({
  id: 'b1', booking_number: 'EV-2026-ABCDEFG', user_id: 'user-1', status: 'requested', event_type: 'debut', event_date: '2026-12-12',
  venue: 'Fernbrook Gardens', guest_count: 150, host_name: 'Ana Reyes', mobile: '09171234567', notes: 'Reception at 6 PM',
  deal_total: null, deal_deposit: null, deal_cost: null, deal_album_size: null, deal_cover: null, deal_pages: null, deal_includes: null, quoted_at: null,
  deposit_reference: null, deposit_proof_path: null, deposit_submitted_at: null, deposit_paid_at: null,
  balance_reference: null, balance_proof_path: null, balance_submitted_at: null, balance_paid_at: null,
  cancelled_at: null, cancelled_by: null, close_reason: null, created_at: '2026-10-10T00:00:00Z', updated_at: '2026-10-10T00:00:00Z',
  ...over,
});
const COST = costToMake(MODEL, 150, { size: '8x8', cover: 'hard', pages: 40, otherCosts: 0 });

describe('a new request', () => {
  it('shows who, when, where and how many, with the mobile to call, and reads through the owner function', async () => {
    h.rows = [booking({})];
    await render();
    expect(rpcs('owner_event_bookings')).toHaveLength(1);
    expect(host.textContent).toMatch(/Debut · 2026-12-12 · 150 guests/);
    expect(host.textContent).toMatch(/Fernbrook Gardens/);
    expect(host.textContent).toMatch(/Reception at 6 PM/);
    expect(host.querySelector('a[href="tel:09171234567"]')).not.toBeNull();
  });

  it('the deal editor works out the cost to make: the album (Pricing tab model) + photo storage + other costs', async () => {
    h.rows = [booking({})];
    await render();
    expect($('deal-cost')!.textContent).toContain(`Cost to make: ₱${COST.total.toLocaleString('en-PH')}`);
    await type($('deal-other'), '1500');
    expect($('deal-cost')!.textContent).toContain(`Cost to make: ₱${(COST.total + 1500).toLocaleString('en-PH')}`);
  });

  it('a deposit that only matches the cost is stopped, in words, and nothing is sent', async () => {
    h.rows = [booking({})];
    await render();
    await type($('deal-total'), '30000');
    await type($('deal-deposit'), String(COST.total));
    expect($('deal-extra')!.textContent).toBe('Deposit only equals the cost. It has to be more.');
    await click($('deal-send'));
    expect($('deal-problem')!.textContent).toMatch(/more than the cost to make/);
    expect(rpcs('set_booking_deal')).toEqual([]);
    // Fixing the deposit clears the problem right away, before sending again.
    await type($('deal-deposit'), '12000');
    expect($('deal-problem')).toBeNull();
  });

  it('times are Manila\'s: a request made at 7 AM on the 10th says Oct 10', async () => {
    h.rows = [booking({ created_at: '2026-10-09T23:01:00Z' })];
    await render();
    expect(host.textContent).toMatch(/requested Oct 10, 2026/);
  });

  it('a deposit over the cost is sent with the cost it was checked against', async () => {
    h.rows = [booking({})];
    await render();
    await type($('deal-total'), '30,000');
    await type($('deal-deposit'), '₱12,000');
    expect($('deal-extra')!.textContent).toBe(`Deposit covers the cost + ₱${(12000 - COST.total).toLocaleString('en-PH')} extra`);
    await type($('deal-includes'), 'Table QR cards for 20 tables');
    await click($('deal-send'));
    expect(rpcs('set_booking_deal')).toEqual([{
      p_id: 'b1', p_total: 30000, p_deposit: 12000, p_cost: COST.total, p_album_size: '8x8', p_cover: 'hard', p_pages: 40,
      p_includes: 'Table QR cards for 20 tables',
    }]);
    expect(rpcs('owner_event_bookings')).toHaveLength(2);
  });

  it('no cost model → says so instead of an editor that would guess', async () => {
    h.model = null;
    h.rows = [booking({})];
    await render();
    expect($('deal-editor')).toBeNull();
    expect(host.textContent).toMatch(/cost model didn’t load/);
  });

  it('decline asks once more, with a reason the host will see', async () => {
    h.rows = [booking({})];
    await render();
    await click($('booking-decline'));
    await type($('booking-close-reason'), 'Fully booked that day');
    await click($('booking-close-yes'));
    expect(rpcs('close_booking')).toEqual([{ p_id: 'b1', p_status: 'declined', p_reason: 'Fully booked that day' }]);
  });
});

describe('the payments', () => {
  const quoted = { status: 'quoted' as const, deal_total: 30000, deal_deposit: 12000, deal_cost: 9000, deal_album_size: '8x8' as const, deal_cover: 'hard' as const, deal_pages: 40, quoted_at: 'x' };

  it('host says the deposit is sent: the reference, the receipt, and "Mark deposit paid"; the deal is frozen', async () => {
    h.rows = [booking({ ...quoted, deposit_submitted_at: '2026-10-12T09:30:00Z', deposit_reference: '2026101012345678', deposit_proof_path: 'booking-b1-deposit.png' })];
    await render();
    expect(host.textContent).toMatch(/Host says the deposit is sent · ref 2026101012345678/);
    expect(host.textContent).toMatch(/cost to make ₱9,000/);
    expect($('deal-editor')).toBeNull();
    await click($('booking-mark-deposit'));
    expect(rpcs('mark_booking_paid')).toEqual([{ p_id: 'b1', p_kind: 'deposit' }]);
  });

  it('booked: waiting for the balance, then "Mark balance paid"', async () => {
    h.rows = [booking({ ...quoted, status: 'booked', deposit_paid_at: 'x' })];
    await render();
    expect(host.textContent).toMatch(/Waiting for the ₱18,000 balance/);
    await click($('booking-mark-balance'));
    expect(rpcs('mark_booking_paid')).toEqual([{ p_id: 'b1', p_kind: 'balance' }]);
  });
});

describe('the console', () => {
  it('Bookings is an owner-only tab', () => {
    const src = readFileSync(resolve(__dirname, '../Admin.tsx'), 'utf8');
    expect(src).toContain("{ id: 'bookings', label: 'Bookings', icon: CalendarHeart, ownerOnly: true }");
    expect(src).toContain("{tab === 'bookings' && isOwner && <BookingsPanel />}");
  });
});

describe('money to settle on a closed booking (0043)', () => {
  it('a booking cancelled after its deposit was confirmed shows the amount and a button to mark it settled', async () => {
    h.rows = [booking({ status: 'cancelled', deal_total: 45000, deal_deposit: 20000, deposit_paid_at: '2026-10-01T00:00:00Z', cancelled_at: '2026-10-05T00:00:00Z' })];
    await render();
    expect($('booking-money-to-settle')?.textContent).toContain('you confirmed ₱20,000 for this booking');
    expect($('booking-money-to-settle')?.textContent).toContain('Until then the host’s account can’t be deleted.');
    await click($('booking-settle'));
    expect(rpcs('settle_booking_money')).toEqual([{ p_id: 'b1' }]);
  });
  it('nothing to settle: no money ever sent, or already settled', async () => {
    h.rows = [booking({ status: 'cancelled', cancelled_at: 'x' }), booking({ id: 'b2', status: 'cancelled', deposit_paid_at: 'x', money_settled_at: 'y' })];
    await render();
    expect($('booking-money-to-settle')).toBeNull();
  });
  it('the owner function behind it is owner-only and the sentence matches the database', () => {
    const sql = readFileSync(resolve(__dirname, '../../../supabase/migrations/0043_event_bookings.sql'), 'utf8');
    const fn = sql.slice(sql.indexOf('create or replace function public.settle_booking_money(p_id uuid)'));
    expect(fn.slice(0, 400)).toContain("if public.operator_role() is distinct from 'owner' then");
    expect(sql).toContain('revoke all on function public.settle_booking_money(uuid) from public, anon;');
  });
});
