/* ══════════════════════════════════════════════════════════════════════════
   AN EVENT'S PRINTED ALBUM AT CHECKOUT (the website's src/lib/eventAlbum.ts
   and eventBookings.ts, the parts checkout uses).

   An event booking (0045) pays for its printed album. On the website the
   album is tied to its booking on the device that made it; on any other
   device, checkout offers the host's bookings still waiting for their album
   ("Use booking EV-… for this album"), the app's only way in. Then:
   checkout says whether the booking can pay (eventDealState: the balance in,
   the deal's size and pages), the deal fixes the cover, the album costs ₱0,
   and once the files are sent the booking pays the order
   (cover_order_with_booking). "Not my event album" takes it back.

   The website keeps these next to its browser storage, so the app keeps
   this copy; test/eventDeal.test.ts runs the website's own functions
   beside these.
   ══════════════════════════════════════════════════════════════════════════ */
import type { AlbumSizePreset } from '@web/pages/builder/types';
import type { Binding } from '@web/lib/pricing';

/** eventBookings.ts EventBooking: the columns checkout reads. */
export interface EventBooking {
  id: string;
  booking_number: string;
  status: string;
  deal_total: number | null;
  deal_deposit: number | null;
  deal_album_size: AlbumSizePreset | null;
  deal_cover: Binding | null;
  deal_pages: number | null;
  album_order_id: string | null;
  [k: string]: unknown;
}

/** eventBookings.ts HOST_COLUMNS: what a host may read of their bookings. */
export const HOST_COLUMNS = [
  'id', 'booking_number', 'user_id', 'status', 'event_type', 'event_date', 'venue', 'guest_count', 'host_name', 'mobile', 'notes',
  'deal_total', 'deal_deposit', 'deal_album_size', 'deal_cover', 'deal_pages', 'deal_includes', 'quoted_at',
  'deposit_reference', 'deposit_proof_path', 'deposit_submitted_at', 'deposit_paid_at',
  'balance_reference', 'balance_proof_path', 'balance_submitted_at', 'balance_paid_at',
  'cancelled_at', 'cancelled_by', 'close_reason', 'money_settled_at', 'created_at', 'updated_at',
  'event_title', 'kids_on', 'tables', 'copies_on', 'guest_code', 'screen_key', 'screen_paused', 'album_order_id',
].join(', ');

type DbError = { message?: string; code?: string } | null;

/** eventBookings.ts bookingErrorMessage: the database's own sentences (EV00x) as they are. */
export function bookingErrorMessage(error: DbError): string {
  if (!error) return '';
  if (error.code && /^EV\d{3}$/.test(error.code) && error.message) return error.message;
  if (error.code === '23514') return 'Something in the form isn’t right. Check each field and try again.';
  return error.message || 'Something went wrong. Please try again.';
}

/** eventBookings.ts peso (toLocaleString en-PH, at most 2 decimals), written
 *  out so the phone shows the same whatever locale data it has. */
export function peso(n: number | null | undefined): string {
  if (n == null) return '';
  const v = Math.round(Number(n) * 100) / 100;
  const [whole, frac] = Math.abs(v).toString().split('.');
  return `${v < 0 ? '-' : ''}₱${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${frac ? `.${frac}` : ''}`;
}

interface Db {
  from(table: string): any; // eslint-disable-line @typescript-eslint/no-explicit-any
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ error: DbError }>;
}

/** listMyBookings: the host's own bookings, newest first. */
export async function listMyBookings(db: Db, userId: string): Promise<EventBooking[]> {
  const { data, error } = await db.from('event_bookings').select(HOST_COLUMNS).eq('user_id', userId).order('created_at', { ascending: false });
  if (error) throw new Error(bookingErrorMessage(error));
  return (data ?? []) as EventBooking[];
}

/** getMyBooking: one of the host's own bookings, or null. */
export async function getMyBooking(db: Db, userId: string, id: string): Promise<EventBooking | null> {
  const { data, error } = await db.from('event_bookings').select(HOST_COLUMNS).eq('user_id', userId).eq('id', id).maybeSingle();
  if (error) throw new Error(bookingErrorMessage(error));
  return (data as EventBooking | null) ?? null;
}

/** The album's link to its booking (eventAlbum.ts EventAlbumLink). */
export interface EventAlbumLink {
  bookingId: string;
  bookingNumber: string;
  size: AlbumSizePreset;
  cover: Binding;
  pages: number;
  videos: unknown[];
  /** Linked by the host at checkout, so they can undo it. */
  atCheckout?: boolean;
}

/** bookingsWaitingForAlbum: booked or paid, no album order yet, a deal with an album. */
export function bookingsWaitingForAlbum<B extends Pick<EventBooking, 'status' | 'album_order_id' | 'deal_album_size'>>(all: B[]): B[] {
  return all.filter((b) => (b.status === 'booked' || b.status === 'paid') && !b.album_order_id && !!b.deal_album_size);
}

/** linkFromBooking: the link checkout makes when the host picks a booking. */
export function linkFromBooking(b: Pick<EventBooking, 'id' | 'booking_number' | 'deal_album_size' | 'deal_cover' | 'deal_pages'>): EventAlbumLink | null {
  if (!b.deal_album_size || !b.deal_cover || !b.deal_pages) return null;
  return { bookingId: b.id, bookingNumber: b.booking_number, size: b.deal_album_size, cover: b.deal_cover, pages: b.deal_pages, videos: [], atCheckout: true };
}

export type EventDealState =
  | { state: 'none' }
  | { state: 'covered'; bookingNumber: string; cover: Binding }
  | { state: 'blocked'; bookingNumber: string; cover: Binding; message: string };

const coverWord = (c: Binding) => (c === 'soft' ? 'softcover' : 'hardbound');

/** eventDealState: what checkout does with an album linked to a booking. */
export function eventDealState(
  link: EventAlbumLink | null,
  booking: Pick<EventBooking, 'id' | 'status' | 'booking_number' | 'deal_total' | 'deal_deposit' | 'album_order_id'> | null,
  album: { size: AlbumSizePreset; pages: number },
): EventDealState {
  if (!link) return { state: 'none' };
  const base = { bookingNumber: link.bookingNumber, cover: link.cover };
  if (!booking) return { state: 'blocked', ...base, message: `We couldn’t find booking ${link.bookingNumber} on this account. Sign in with the account that booked the event.` };
  if (booking.status === 'booked') {
    const bal = booking.deal_total != null && booking.deal_deposit != null ? Number(booking.deal_total) - Number(booking.deal_deposit) : null;
    return { state: 'blocked', ...base, message: `Pay the ${peso(bal)} balance for booking ${link.bookingNumber} first (Events → your booking). Your album prints once it’s in.` };
  }
  if (booking.status !== 'paid') return { state: 'blocked', ...base, message: `Booking ${link.bookingNumber} can’t pay for an album now. Message us and we’ll sort it out.` };
  if (booking.album_order_id) return { state: 'blocked', ...base, message: `Booking ${link.bookingNumber} already paid for an album order. Check Your orders.` };
  if (album.size !== link.size || album.pages > link.pages) {
    return {
      state: 'blocked', ...base,
      message: `Your deal’s album is ${link.size.replace('x', '×')}, ${coverWord(link.cover)}, up to ${link.pages} pages. This one is ${album.size.replace('x', '×')} with ${album.pages} pages. Change it in your album to match, or ask us to update your deal.`,
    };
  }
  return { state: 'covered', ...base };
}

/** The checkout's cover for a deal (Order.tsx: soft → softcover, else hardbound leather). */
export const dealCover = (cover: Binding) => (cover === 'soft' ? 'softcover' : 'hardboundLeather') as 'softcover' | 'hardboundLeather';

/* ── The checkout's words (Order.tsx) ── */
export const OFFER_TITLE = 'Is this your event album?';
export const OFFER_BODY = 'Your event booking pays for its printed album. Made this album on another phone or computer? Use your booking for it here.';
export const useBooking = (n: string) => `Use booking ${n} for this album`;
export const dealTitle = (n: string) => `Your event album · booking ${n}`;
export const CHECKING_BOOKING = 'Checking your event booking…';
export const COVERED = 'Your booking pays for this album. There’s nothing more to pay.';
export const NOT_MINE = 'Not my event album: order it as a normal album';
export const CHECKING_TRY_AGAIN = 'Checking your event booking… try again in a moment.';
export const albumLine = (n: string) => `Album — part of booking ${n}`;
export const COVERED_LINE = 'Covered by your event booking';
export const COVERED_LATER = 'Your booking pays for it. See the note at the top.';
export const EVENT_MEMORIES = 'Video memories are part of your event deal';
export const PLACE_EVENT = 'Place my event album order';
export const PAYING = 'Paying with your event booking…';
export const paidByBooking = (n: string) => `Your event booking ${n} paid for this album. We print it and ship it to your door.`;
