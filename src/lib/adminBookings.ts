/* The owner's side of event bookings (0043). Every call is an owner-gated
   database function, so a non-owner reaching these gets the database's
   refusal, not the data. Each returns an error sentence, or null when done
   (the OrdersPanel pattern). */

import { supabase, supabaseConfigured } from './supabase';
import { bookingErrorMessage, type CostToMake, type DealDraft, type EventBooking, type PaymentKind } from './eventBookings';

export const BOOKINGS_PAGE_SIZE = 200;

/** Every booking, every column (the cost to make included), newest first. */
export async function fetchOwnerBookings(limit = BOOKINGS_PAGE_SIZE, offset = 0): Promise<EventBooking[]> {
  if (!supabaseConfigured) return [];
  const { data, error } = await supabase.rpc('owner_event_bookings', { p_limit: limit, p_offset: offset });
  if (error) throw new Error(bookingErrorMessage(error));
  return (data ?? []) as EventBooking[];
}

export async function setBookingDeal(id: string, d: DealDraft, cost: CostToMake): Promise<string | null> {
  const { error } = await supabase.rpc('set_booking_deal', {
    p_id: id,
    p_total: d.total,
    p_deposit: d.deposit,
    p_cost: cost.total,
    p_album_size: d.size,
    p_cover: d.cover,
    p_pages: d.pages,
    p_includes: d.includes.trim() || null,
  });
  return error ? bookingErrorMessage(error) : null;
}

export async function markBookingPaid(id: string, kind: PaymentKind): Promise<string | null> {
  const { error } = await supabase.rpc('mark_booking_paid', { p_id: id, p_kind: kind });
  return error ? bookingErrorMessage(error) : null;
}

export async function closeBooking(id: string, status: 'declined' | 'cancelled', reason: string): Promise<string | null> {
  const { error } = await supabase.rpc('close_booking', { p_id: id, p_status: status, p_reason: reason.trim() || null });
  return error ? bookingErrorMessage(error) : null;
}

/** A receipt in the private payment-proofs bucket, for two minutes. */
export async function receiptUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from('payment-proofs').createSignedUrl(path, 120);
  return error || !data?.signedUrl ? null : data.signedUrl;
}
