// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/* ══════════════════════════════════════════════════════════════════════════
   MEGYPRINTS EVENTS, 15+ GUESTS = A BOOKING (owner, 2026-10-10). A host sends
   a request (nothing to pay), sees the deal when the owner sets it, pays the
   deposit by the same GoTyme QR as album orders, then the balance. These walk
   the host's two screens with the real booking code against a fake database.
   ══════════════════════════════════════════════════════════════════════════ */

const h = vi.hoisted(() => ({
  user: { id: 'user-1', email: 'host@example.test', user_metadata: {} } as unknown,
  openLogin: () => {},
  bookings: [] as unknown[],
  inserted: null as Record<string, unknown> | null,
  insertResult: { data: { id: 'new-1' } as unknown, error: null as unknown },
  calls: [] as [string, ...unknown[]][],
}));
vi.mock('../lib/authContext', () => ({ useAuth: () => ({ user: h.user, logout: vi.fn(), loading: false }) }));
vi.mock('../components/AuthModalProvider', () => ({ useAuthModal: () => ({ openLogin: () => h.openLogin(), openSignup: vi.fn() }) }));
vi.mock('../lib/supabase', () => {
  const list = {
    select: (cols: unknown) => { h.calls.push(['select', cols]); return list; },
    eq: (...a: unknown[]) => { h.calls.push(['eq', ...a]); return list; },
    order: async () => ({ data: h.bookings, error: null }),
  };
  return {
    supabaseConfigured: true,
    supabase: {
      from: (t: string) => {
        h.calls.push(['from', t]);
        return {
          ...list,
          insert: (row: Record<string, unknown>) => {
            h.inserted = row;
            return { select: () => ({ single: async () => h.insertResult }) };
          },
        };
      },
      rpc: async (name: string, args: unknown) => { h.calls.push(['rpc', name, args]); return { data: true, error: null }; },
      storage: {
        from: (bucket: string) => ({
          upload: async (path: string, _file: unknown, opts: unknown) => { h.calls.push(['upload', bucket, path, opts]); return { error: null }; },
        }),
      },
    },
  };
});

import Events from './Events';
import EventBook from './EventBook';
import type { EventBooking } from '../lib/eventBookings';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
  h.user = { id: 'user-1', email: 'host@example.test', user_metadata: {} };
  h.openLogin = vi.fn();
  h.bookings = []; h.inserted = null; h.calls = [];
  h.insertResult = { data: { id: 'new-1' }, error: null };
});
afterEach(() => { act(() => root.unmount()); host.remove(); });

function Where() { const l = useLocation(); return createElement('p', { 'data-testid': 'where' }, `${l.pathname}${l.search}`); }
const render = async (at: string) => {
  await act(async () => {
    root.render(createElement(MemoryRouter, { initialEntries: [at] },
      createElement(Routes, null,
        createElement(Route, { path: '/events', element: createElement('div', null, createElement(Events), createElement(Where)) }),
        createElement(Route, { path: '/events/book', element: createElement(EventBook) }),
      )));
  });
  await settle();
};
const settle = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
const $ = (id: string) => host.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
const $$ = (id: string) => [...host.querySelectorAll(`[data-testid="${id}"]`)] as HTMLElement[];
const click = async (el: Element | null) => { expect(el).not.toBeNull(); await act(async () => { (el as HTMLElement).click(); }); await settle(); };
const type = async (el: Element | null, v: string) => {
  expect(el).not.toBeNull();
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, v);
    el!.dispatchEvent(new Event('input', { bubbles: true }));
  });
};
const buttonByText = (re: RegExp) => [...host.querySelectorAll('button, a')].find((b) => re.test(b.textContent ?? '')) as HTMLElement | undefined;

const booking = (over: Partial<EventBooking>): EventBooking => ({
  id: 'b1', booking_number: 'EV-2026-ABCDEFG', user_id: 'user-1', status: 'requested', event_type: 'wedding', event_date: '2026-12-12',
  venue: 'Manila Cathedral', guest_count: 150, host_name: 'Ana', mobile: '09171234567', notes: null,
  deal_total: null, deal_deposit: null, deal_cost: null, deal_album_size: null, deal_cover: null, deal_pages: null, deal_includes: null, quoted_at: null,
  deposit_reference: null, deposit_proof_path: null, deposit_submitted_at: null, deposit_paid_at: null,
  balance_reference: null, balance_proof_path: null, balance_submitted_at: null, balance_paid_at: null,
  cancelled_at: null, cancelled_by: null, close_reason: null, created_at: '2026-10-10T00:00:00Z', updated_at: '2026-10-10T00:00:00Z',
  ...over,
});
const deal = { deal_total: 30000, deal_deposit: 12000, deal_album_size: '8x8' as const, deal_cover: 'hard' as const, deal_pages: 40,
  deal_includes: 'Table QR cards for 20 tables', quoted_at: '2026-10-11T00:00:00Z' };

describe('/events: what it is, and how to book', () => {
  it('says who it is for and leads to the booking form', async () => {
    await render('/events');
    expect($('events-who')!.textContent).toMatch(/15 or more guests/);
    expect($('events-book')!.getAttribute('href')).toBe('/events/book');
    expect($('events-how')!.textContent).toMatch(/Send a request.*Get your deal.*Pay the deposit.*Pay the balance/s);
  });

  it('signed out: a way to sign in to see a booking, and no database read', async () => {
    h.user = null;
    await render('/events');
    await click(buttonByText(/Sign in to see it/)!);
    expect(h.openLogin).toHaveBeenCalled();
    expect(h.calls.filter((c) => c[0] === 'from')).toEqual([]);
  });

  it('lists only the host\'s own bookings', async () => {
    await render('/events');
    expect(h.calls).toContainEqual(['eq', 'user_id', 'user-1']);
    expect($('events-none')).not.toBeNull();
  });
});

describe('a booking, step by step', () => {
  it('requested: says what happens next, and the host can cancel in two taps', async () => {
    h.bookings = [booking({})];
    await render('/events');
    expect($('booking-headline')!.textContent).toMatch(/Request sent\. We’ll text or call you/);
    expect($('booking-deal')).toBeNull();
    await click($('booking-cancel'));
    await click($('booking-cancel-yes'));
    expect(h.calls).toContainEqual(['rpc', 'cancel_my_booking', { p_id: 'b1' }]);
  });

  it('quoted: the deal in full (no cost to make anywhere), and one button to pay the deposit', async () => {
    h.bookings = [booking({ status: 'quoted', ...deal })];
    await render('/events');
    expect($('booking-total')!.textContent).toBe('₱30,000');
    expect($('booking-deposit')!.textContent).toBe('₱12,000');
    expect($('booking-balance')!.textContent).toBe('₱18,000');
    expect($('booking-deal')!.textContent).toMatch(/8×8" Square · Hardbound · 40 pages/);
    expect($('booking-includes')!.textContent).toBe('Table QR cards for 20 tables');
    expect(host.textContent).not.toMatch(/cost/i);
    expect($('booking-pay-deposit')!.textContent).toBe('Pay the ₱12,000 deposit');
    expect($('bank-transfer-pay')).toBeNull();
  });

  it('paying the deposit: the QR for the exact amount, the booking number as the note, then the receipt is uploaded and recorded', async () => {
    h.bookings = [booking({ status: 'quoted', ...deal })];
    await render('/events');
    await click($('booking-pay-deposit'));
    expect($('pay-amount')!.textContent).toBe('₱12,000');
    expect($('bank-transfer-pay')!.textContent).toMatch(/put EV-2026-ABCDEFG in the note/);
    const file = new File([new Uint8Array([1, 2, 3])], 'receipt.png', { type: 'image/png' });
    const input = $('pay-receipt-input') as HTMLInputElement;
    await act(async () => {
      Object.defineProperty(input, 'files', { value: [file], configurable: true });
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await type($('pay-reference'), '2026101012345678');
    await click($('pay-sent'));
    // Create-only (storageUpload.ts): hosts can't read the bucket, so never upsert.
    expect(h.calls).toContainEqual(['upload', 'payment-proofs', 'booking-b1-deposit.png', { contentType: 'image/png', cacheControl: '0', upsert: false }]);
    expect(h.calls).toContainEqual(['rpc', 'submit_booking_payment',
      { p_id: 'b1', p_kind: 'deposit', p_reference: '2026101012345678', p_proof_path: 'booking-b1-deposit.png' }]);
  });

  it('a junk reference is caught before anything is sent', async () => {
    h.bookings = [booking({ status: 'quoted', ...deal })];
    await render('/events');
    await click($('booking-pay-deposit'));
    await type($('pay-reference'), 'lol nope');
    await click($('pay-sent'));
    expect($('pay-reference-error')).not.toBeNull();
    expect(h.calls.some((c) => c[0] === 'rpc')).toBe(false);
  });

  it('deposit sent: "we\'re confirming", nothing to pay, and no cancel (money may be on its way)', async () => {
    h.bookings = [booking({ status: 'quoted', ...deal, deposit_submitted_at: '2026-10-12T00:00:00Z' })];
    await render('/events');
    expect($('booking-headline')!.textContent).toMatch(/confirming your ₱12,000 deposit/);
    expect($('booking-pay-deposit')).toBeNull();
    expect($('booking-cancel')).toBeNull();
  });

  it('booked: the date is held, and the balance is paid the same way', async () => {
    h.bookings = [booking({ status: 'booked', ...deal, deposit_paid_at: '2026-10-12T00:00:00Z' })];
    await render('/events');
    expect($('booking-headline')!.textContent).toMatch(/Your date is booked\. The ₱18,000 balance is due before your album prints/);
    expect($('booking-deposit')!.textContent).toBe('₱12,000 · paid');
    await click($('booking-pay-balance'));
    expect($('pay-amount')!.textContent).toBe('₱18,000');
    await click($('pay-sent'));
    expect(h.calls).toContainEqual(['rpc', 'submit_booking_payment', { p_id: 'b1', p_kind: 'balance', p_reference: null, p_proof_path: null }]);
  });

  it('declined: closed, with the reason and a way to ask', async () => {
    h.bookings = [booking({ status: 'declined', close_reason: 'We’re fully booked that day.' })];
    await render('/events');
    expect($('booking-headline')!.textContent).toBe('We can’t take this booking.');
    expect(host.textContent).toMatch(/fully booked that day/);
    expect($('booking-steps')).toBeNull();
  });

  it('opened for one booking (?booking=), that card is the focused one', async () => {
    h.bookings = [booking({ id: 'b0', booking_number: 'EV-2026-AAAAAAA' }), booking({})];
    await render('/events?booking=b1');
    expect($$('booking-card').map((c) => c.getAttribute('data-focused'))).toEqual([null, 'true']);
  });
});

describe('/events/book: the request', () => {
  const fill = async () => {
    await click(buttonByText(/^Wedding$/)!);
    await type($('book-date'), '2099-12-12');
    await type($('book-venue'), 'Manila Cathedral');
    await type($('book-guests'), '150');
    await type($('book-name'), 'Ana Reyes');
    await type($('book-mobile'), '0917 123 4567');
  };

  it('sending an empty form says what each field needs, and sends nothing', async () => {
    await render('/events/book');
    await click($('book-send'));
    for (const f of ['eventType', 'eventDate', 'venue', 'guests', 'name', 'mobile']) expect($(`book-err-${f}`)).not.toBeNull();
    expect(h.inserted).toBeNull();
  });

  it('under 15 guests: it says so, and offers an album instead', async () => {
    await render('/events/book');
    await fill();
    await type($('book-guests'), '12');
    await click($('book-send'));
    expect($('book-err-guests')!.textContent).toMatch(/15 or more guests/);
    expect($('book-make-album')!.getAttribute('href')).toBe('/builder');
    expect(h.inserted).toBeNull();
  });

  it('signed out: sending asks them to sign in, keeps the answers, and sends nothing', async () => {
    h.user = null;
    await render('/events/book');
    await fill();
    await click($('book-send'));
    expect(h.openLogin).toHaveBeenCalled();
    expect($('book-sign-in')).not.toBeNull();
    expect(($('book-venue') as HTMLInputElement).value).toBe('Manila Cathedral');
    expect(h.inserted).toBeNull();
  });

  it('signed in: sends the request and opens it in Events', async () => {
    await render('/events/book');
    await fill();
    await type($('book-notes'), 'Church at 2 PM');
    await click($('book-send'));
    expect(h.inserted).toEqual({
      user_id: 'user-1', event_type: 'wedding', event_date: '2099-12-12', venue: 'Manila Cathedral', guest_count: 150,
      host_name: 'Ana Reyes', mobile: '09171234567', notes: 'Church at 2 PM',
    });
    expect($('where')!.textContent).toBe('/events?booking=new-1');
  });

  it('the database\'s refusal is shown as it is', async () => {
    h.insertResult = { data: null, error: { code: 'EV001', message: 'You already have 3 booking requests open. Cancel one in Events, or wait for us to get back to you on them.' } };
    await render('/events/book');
    await fill();
    await click($('book-send'));
    expect($('book-error')!.textContent).toMatch(/already have 3 booking requests open/);
  });
});

describe('the way in', () => {
  const src = (p: string) => readFileSync(resolve(__dirname, p), 'utf8');
  it('both routes are in the app, open to everyone (the form asks for sign-in when sending)', () => {
    expect(src('../App.tsx')).toContain('<Route path="/events" element={<Events />} />');
    expect(src('../App.tsx')).toContain('<Route path="/events/book" element={<EventBook />} />');
  });
  it('Events is in the menu and the footer', () => {
    expect(src('../components/Navbar.tsx')).toContain("{ label: 'Events', path: '/events' }");
    expect(src('../components/Footer.tsx')).toContain("{ label: 'Events', path: '/events' }");
  });
});
