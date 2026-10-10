/* ══════════════════════════════════════════════════════════════════════════
   The event's printed album (0045): from the host's picks to checkout.

   1. The event page downloads the picked photos' print masters and hands
      them to the builder in memory (setPendingEventImport + navigate): a new
      album, named and sized from the deal, with those photos in it.
   2. The album is linked to its booking on this device (like its photos,
      which live on this device too). Checkout reads the link: the album is
      covered by the booking (₱0, cover_order_with_booking) once the balance
      is in and it matches the deal.
   3. The picked videos are offered in "Add a video memory".
   ══════════════════════════════════════════════════════════════════════════ */

import { supabase } from './supabase';
import { bookingErrorMessage, peso, type EventBooking } from './eventBookings';
import type { AlbumSizePreset } from '../pages/builder/types';
import type { Binding } from './pricing';

export interface EventVideoChoice { id: string; url: string; ext: string; by: string | null; durationS: number | null }

export interface EventAlbumImport {
  bookingId: string;
  bookingNumber: string;
  title: string;
  occasion: string;
  size: AlbumSizePreset;
  cover: Binding;
  pages: number;
  files: File[];
  videos: EventVideoChoice[];
}

export interface EventAlbumLink {
  bookingId: string;
  bookingNumber: string;
  size: AlbumSizePreset;
  cover: Binding;
  pages: number;
  videos: EventVideoChoice[];
  /** Linked by the host at checkout (another device, say), so they can undo it. */
  atCheckout?: boolean;
}

// ── The handoff to the builder (in memory: the SPA doesn't reload) ────────
let pending: EventAlbumImport | null = null;
export function setPendingEventImport(imp: EventAlbumImport) { pending = imp; }
export function takePendingEventImport(): EventAlbumImport | null {
  const p = pending;
  pending = null;
  return p;
}

// ── Which album came from which booking (this device) ─────────────────────
const LINKS_KEY = 'megy-event-albums';

function readLinks(): Record<string, EventAlbumLink> {
  try {
    const v = JSON.parse(localStorage.getItem(LINKS_KEY) || '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

export function linkAlbumToBooking(albumId: string, link: EventAlbumLink) {
  try {
    const all = readLinks();
    all[albumId] = link;
    localStorage.setItem(LINKS_KEY, JSON.stringify(all));
  } catch { /* storage full or private: checkout then prices it as a normal album */ }
}

export function eventLinkForAlbum(albumId: string | null | undefined): EventAlbumLink | null {
  if (!albumId) return null;
  const l = readLinks()[albumId];
  return l && typeof l.bookingId === 'string' ? l : null;
}

export const eventVideosForAlbum = (albumId: string | null | undefined): EventVideoChoice[] =>
  eventLinkForAlbum(albumId)?.videos ?? [];

export function unlinkAlbum(albumId: string) {
  try {
    const all = readLinks();
    delete all[albumId];
    localStorage.setItem(LINKS_KEY, JSON.stringify(all));
  } catch { /* nothing to undo */ }
}

/** The link lives on the device that made the album. On another one, checkout
 *  offers the host's bookings still waiting for their album. */
export function bookingsWaitingForAlbum<B extends Pick<EventBooking, 'status' | 'album_order_id' | 'deal_album_size'>>(all: B[]): B[] {
  return all.filter((b) => (b.status === 'booked' || b.status === 'paid') && !b.album_order_id && !!b.deal_album_size);
}

export function linkFromBooking(b: Pick<EventBooking, 'id' | 'booking_number' | 'deal_album_size' | 'deal_cover' | 'deal_pages'>): EventAlbumLink | null {
  if (!b.deal_album_size || !b.deal_cover || !b.deal_pages) return null;
  return { bookingId: b.id, bookingNumber: b.booking_number, size: b.deal_album_size, cover: b.deal_cover, pages: b.deal_pages, videos: [], atCheckout: true };
}

// ── Checkout ──────────────────────────────────────────────────────────────

export type EventDealState =
  | { state: 'none' }
  | { state: 'covered'; bookingNumber: string; cover: Binding }
  | { state: 'blocked'; bookingNumber: string; cover: Binding; message: string };

const coverWord = (c: Binding) => (c === 'soft' ? 'softcover' : 'hardbound');

/** What checkout should do with an album linked to a booking. The database
 *  decides for real (cover_order_with_booking); this says it up front. */
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

/** Pay the placed order with the booking (0045). */
export async function coverOrderWithBooking(orderId: string, bookingId: string): Promise<void> {
  const { error } = await supabase.rpc('cover_order_with_booking', { p_order_id: orderId, p_booking_id: bookingId });
  if (error) throw new Error(bookingErrorMessage(error));
}
