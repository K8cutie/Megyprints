import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/* ══════════════════════════════════════════════════════════════════════════
   THE EVENT'S PRINTED ALBUM (0045). The host's picks become an album in the
   builder; the album is linked to its booking; checkout says up front what
   the database decides for real (cover_order_with_booking): the booking pays
   (₱0) once the balance is in and the album matches the deal, and never
   twice. The size stays the deal's on every surface that can change it.
   ══════════════════════════════════════════════════════════════════════════ */

vi.mock('./supabase', () => ({ supabaseConfigured: true, supabase: { rpc: vi.fn() } }));
vi.mock('../pages/builder/albumSizeOptions', async () => {
  const { ALBUM_SIZES } = await import('../pages/builder/types');
  return { isSizeOfferable: () => true, offerableAlbumSizes: () => ALBUM_SIZES };
});

import {
  eventDealState, linkAlbumToBooking, eventLinkForAlbum, eventVideosForAlbum, unlinkAlbum,
  setPendingEventImport, takePendingEventImport, bookingsWaitingForAlbum, linkFromBooking, type EventAlbumLink,
} from './eventAlbum';
import { ActionEngine } from '../assistant/actionEngine';
import { WizardEngine } from '../assistant/wizard';
import type { BuilderActions } from '../pages/builder/useBuilderState';
import type { EventBooking } from './eventBookings';

const src = (p: string) => readFileSync(resolve(__dirname, p), 'utf8');

const g = globalThis as unknown as { localStorage?: unknown };
let store: Record<string, string>;
beforeEach(() => {
  store = {};
  g.localStorage = {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => { store[k] = String(v); },
    removeItem: (k: string) => { delete store[k]; },
  };
});
afterEach(() => { delete g.localStorage; });

const LINK: EventAlbumLink = { bookingId: 'b1', bookingNumber: 'EV-2026-A2474MV', size: '8x8', cover: 'hard', pages: 80, videos: [] };
const booking = (over: Record<string, unknown> = {}) => ({
  id: 'b1', status: 'paid', booking_number: 'EV-2026-A2474MV', deal_total: 45000, deal_deposit: 20000, album_order_id: null, ...over,
}) as Parameters<typeof eventDealState>[1];

describe('checkout: does the booking pay for this album?', () => {
  it('an album not from an event is a normal album', () => {
    expect(eventDealState(null, null, { size: '8x8', pages: 40 })).toEqual({ state: 'none' });
  });
  it('paid in full, the deal’s size, within its pages: covered', () => {
    expect(eventDealState(LINK, booking(), { size: '8x8', pages: 40 }).state).toBe('covered');
    expect(eventDealState(LINK, booking(), { size: '8x8', pages: 80 }).state).toBe('covered');
  });
  it('the balance not in yet: blocked, with how much and where to pay it', () => {
    const d = eventDealState(LINK, booking({ status: 'booked' }), { size: '8x8', pages: 40 });
    expect(d).toMatchObject({ state: 'blocked', message: 'Pay the ₱25,000 balance for booking EV-2026-A2474MV first (Events → your booking). Your album prints once it’s in.' });
  });
  it('never twice: a booking that already paid for an album is blocked', () => {
    expect(eventDealState(LINK, booking({ album_order_id: 'o1' }), { size: '8x8', pages: 40 })).toMatchObject({ state: 'blocked', message: expect.stringContaining('already paid for an album order') });
  });
  it('another size, or more pages than the deal: blocked, saying both', () => {
    const d = eventDealState(LINK, booking(), { size: '8x8', pages: 82 });
    expect(d).toMatchObject({ state: 'blocked', message: 'Your deal’s album is 8×8, hardbound, up to 80 pages. This one is 8×8 with 82 pages. Change it in your album to match, or ask us to update your deal.' });
    expect(eventDealState(LINK, booking(), { size: '11x8.5' as never, pages: 40 }).state).toBe('blocked');
  });
  it('a booking this account can’t see, or that was cancelled: blocked, in words', () => {
    expect(eventDealState(LINK, null, { size: '8x8', pages: 40 })).toMatchObject({ state: 'blocked', message: expect.stringContaining('Sign in with the account that booked the event') });
    expect(eventDealState(LINK, booking({ status: 'cancelled' }), { size: '8x8', pages: 40 }).state).toBe('blocked');
  });
  it('agrees with the database: the same balance sentence, the same rules (0045)', () => {
    const sql = src('../../supabase/migrations/0045_event_album.sql');
    expect(sql).toContain('balance first');
    expect(sql).toMatch(/EV032/);
    expect(sql).toMatch(/EV034/);
  });
});

describe('the link between an album and its booking (this device)', () => {
  it('is per album, with the videos guests shared', () => {
    const v = { id: 'm9', url: 'https://x/m9.mp4', ext: 'mp4', by: 'Bea', durationS: 4 };
    linkAlbumToBooking('alb-1', { ...LINK, videos: [v] });
    expect(eventLinkForAlbum('alb-1')?.bookingNumber).toBe('EV-2026-A2474MV');
    expect(eventVideosForAlbum('alb-1')).toEqual([v]);
    expect(eventLinkForAlbum('alb-2')).toBeNull();
    expect(eventVideosForAlbum('alb-2')).toEqual([]);
    expect(eventLinkForAlbum(undefined)).toBeNull();
    unlinkAlbum('alb-1');
    expect(eventLinkForAlbum('alb-1')).toBeNull();
  });
  it('broken storage reads as no link (checkout then prices a normal album)', () => {
    store['megy-event-albums'] = 'nope{';
    expect(eventLinkForAlbum('alb-1')).toBeNull();
  });
  it('the photos go to the builder once: a second look finds nothing', () => {
    setPendingEventImport({ ...LINK, title: 'Ana & Ben', occasion: 'wedding', files: [] });
    expect(takePendingEventImport()?.title).toBe('Ana & Ben');
    expect(takePendingEventImport()).toBeNull();
  });
  it('on another device, checkout offers only bookings still waiting for their album', () => {
    const all = [
      { id: 'a', status: 'paid', album_order_id: null, deal_album_size: '8x8' },
      { id: 'b', status: 'booked', album_order_id: null, deal_album_size: '8x8' },
      { id: 'c', status: 'paid', album_order_id: 'o1', deal_album_size: '8x8' },
      { id: 'd', status: 'quoted', album_order_id: null, deal_album_size: '8x8' },
      { id: 'e', status: 'completed', album_order_id: null, deal_album_size: '8x8' },
      { id: 'f', status: 'paid', album_order_id: null, deal_album_size: null },
    ] as unknown as (Pick<EventBooking, 'status' | 'album_order_id' | 'deal_album_size'> & { id: string })[];
    expect(bookingsWaitingForAlbum(all).map((b) => b.id)).toEqual(['a', 'b']);
    expect(linkFromBooking({ id: 'a', booking_number: 'EV-1', deal_album_size: '8x8', deal_cover: 'soft', deal_pages: 60 }))
      .toEqual({ bookingId: 'a', bookingNumber: 'EV-1', size: '8x8', cover: 'soft', pages: 60, videos: [], atCheckout: true });
    expect(linkFromBooking({ id: 'a', booking_number: 'EV-1', deal_album_size: '8x8', deal_cover: null, deal_pages: 60 })).toBeNull();
  });
});

describe('an event album keeps its deal’s size', () => {
  const builder = (over: Record<string, unknown> = {}) => ({
    albumTitle: 'Ana & Ben', phase: 'setup', albumPages: [], uploadedPhotos: [], albumSize: '8x8',
    currentPageIndex: 0, currentPage: null, getAlbumId: () => 'alb-1', setAlbumSize: vi.fn(), ...over,
  } as unknown as BuilderActions);

  it('typing or tapping another size is refused, in words; the deal’s size is fine', async () => {
    linkAlbumToBooking('alb-1', LINK);
    const b = builder();
    const engine = new ActionEngine(b);
    const no = await engine.execute({ type: 'change_size', payload: { size: '12x12' }, rawMessage: 'change size to 12x12' } as never);
    expect(no).toMatchObject({ success: false, message: 'This is your event album for booking EV-2026-A2474MV: its size is 8×8, from your deal.' });
    expect(b.setAlbumSize).not.toHaveBeenCalled();
    const yes = await engine.execute({ type: 'change_size', payload: { size: '8x8' }, rawMessage: 'change size to 8x8' } as never);
    expect(yes.success).toBe(true);
    expect(b.setAlbumSize).toHaveBeenCalledWith('8x8');
  });
  it('an album that isn’t from an event changes size as always', async () => {
    const b = builder({ getAlbumId: () => 'alb-other' });
    const r = await new ActionEngine(b).execute({ type: 'change_size', payload: { size: '12x12' }, rawMessage: 'x' } as never);
    expect(r.success).toBe(true);
  });
  it('Megy’s size step shows the deal’s size only, and says why', () => {
    linkAlbumToBooking('alb-1', LINK);
    const w = new WizardEngine(builder(), false);
    w.state.step = 'pick_size';
    const m = w.getMessage();
    expect(m.actions).toHaveLength(1);
    expect(m.actions[0]).toMatch(/^8×8/);
    expect(m.body).toContain('event album for booking EV-2026-A2474MV');
    const plain = new WizardEngine(builder({ getAlbumId: () => 'alb-other' }), false);
    plain.state.step = 'pick_size';
    expect(plain.getMessage().actions.length).toBeGreaterThan(1);
  });
  it('the setup page’s size grid gets the same lock (source guard)', () => {
    expect(src('../pages/builder/BuilderSetup.tsx')).toMatch(/offerableAlbumSizes\(\)\.filter\(\(s\) => !onlySize \|\| s\.preset === onlySize\)/);
    expect(src('../pages/Builder.tsx')).toContain('onlySize={eventLinkForAlbum(actions.getAlbumId())?.size ?? null}');
  });
});

describe('the wiring (source guards)', () => {
  const order = src('../pages/Order.tsx');
  const builderPage = src('../pages/Builder.tsx');
  it('the builder takes the photos once, sizes the album first, then links it to the booking', () => {
    const body = builderPage.slice(builderPage.indexOf('const imp = takePendingEventImport();'));
    const at = (s: string) => body.indexOf(s);
    expect(at("type: 'change_size'")).toBeGreaterThan(-1);
    expect(at("type: 'change_size'")).toBeLessThan(at("type: 'add_photos'"));
    expect(at("type: 'add_photos'")).toBeLessThan(at('linkAlbumToBooking('));
  });
  it('checkout places nothing for an event album the booking can’t pay for yet', () => {
    expect(order).toMatch(/if \(eventLink && eventDeal\?\.state !== 'covered'\) \{\s+setErrorMsg\(/);
  });
  it('a covered album is paid by the booking right after it’s placed, and never reaches the bank QR', () => {
    const paid = order.indexOf('await coverOrderWithBooking(order.id, eventLink.bookingId);');
    const qr = order.indexOf("recordOrder('payment');");
    expect(paid).toBeGreaterThan(-1);
    expect(paid).toBeLessThan(qr);
    expect(order.slice(paid, qr)).toMatch(/setStep\('tracking'\);\s+return;/);
  });
  it('the video memory box on an event album shows no memory prices and no paid HD tier', () => {
    const qr = src('../pages/builder/AddQrModal.tsx');
    expect(qr).toContain('const fromEvent = !!eventLinkForAlbum(builderCtx.getAlbumId());');
    expect(qr).toMatch(/const offerTier = [^\n]*&& !fromEvent;/);
    expect(qr).toMatch(/\{fromEvent\s+\? <span data-testid="qr-event-included">Part of your event deal/);
    expect(qr).toContain("useEffect(() => { if (fromEvent) setQuality('standard'); }, [fromEvent]);");
  });
  it('an event album never shows the album price, even while it waits for the balance', () => {
    expect(order).toContain(`data-testid="order-total">{eventLink ? '₱0'`);
    expect(order).toContain('data-testid="order-event-line"');
  });
});
