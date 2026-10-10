/* The host's side of the guest camera (0044): their event's settings, the
   pool of everything guests shared, the guest list, and the venue screen.
   Every call is a database function that checks the booking is the caller's
   own; another account gets nothing back. */

import { supabase } from './supabase';
import { cameraErrorMessage, type MediaKind } from './eventCamera';

export interface MyEvent {
  booking_id: string;
  title: string | null;
  kids_on: boolean;
  tables: number | null;
  copies_on: boolean;
  guest_code: string | null;
  screen_key: string | null;
  screen_paused: boolean;
  open: boolean;
  opens_on: string;
  closes_on: string;
  kept_until: string;
  guests: number;
  photos: number;
  videos: number;
  picked: number;
}

export interface PoolItem {
  id: string;
  booking_id: string;
  kind: MediaKind;
  ext: string;
  guest_id: string | null;
  guest_name: string | null;
  table_no: number | null;
  hidden: boolean;
  picked: boolean;
  ready_at: string;
  width: number | null;
  height: number | null;
  duration_s: number | null;
}

export interface EventGuest {
  id: string;
  name: string;
  table_no: number | null;
  kids_ok: boolean;
  joined_at: string;
  removed_at: string | null;
  photos: number;
  videos: number;
}

const fail = (e: { code?: string; message?: string }) => new Error(cameraErrorMessage(e));

export async function myEvent(bookingId: string): Promise<MyEvent | null> {
  const { data, error } = await supabase.rpc('my_event', { p_booking_id: bookingId });
  if (error) throw fail(error);
  return (data as MyEvent | null) ?? null;
}

export async function saveMyEvent(bookingId: string, s: { title: string; kidsOn: boolean; tables: number | null; copiesOn: boolean }): Promise<void> {
  const { error } = await supabase.rpc('set_my_event', {
    p_booking_id: bookingId, p_title: s.title, p_kids_on: s.kidsOn, p_tables: s.tables, p_copies_on: s.copiesOn,
  });
  if (error) throw fail(error);
}

export async function myEventPool(bookingId: string): Promise<PoolItem[]> {
  const { data, error } = await supabase.rpc('my_event_media', { p_booking_id: bookingId });
  if (error) throw fail(error);
  return (data ?? []) as PoolItem[];
}

export async function setPoolItem(mediaId: string, change: { hidden?: boolean; picked?: boolean }): Promise<boolean> {
  const { data, error } = await supabase.rpc('set_event_media', {
    p_media_id: mediaId, p_hidden: change.hidden ?? null, p_picked: change.picked ?? null,
  });
  if (error) throw fail(error);
  return data === true;
}

export async function myEventGuests(bookingId: string): Promise<EventGuest[]> {
  const { data, error } = await supabase.rpc('my_event_guests', { p_booking_id: bookingId });
  if (error) throw fail(error);
  return (data ?? []) as EventGuest[];
}

export async function removeGuest(guestId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('remove_event_guest', { p_guest_id: guestId });
  if (error) throw fail(error);
  return data === true;
}

export async function setScreenPaused(bookingId: string, paused: boolean): Promise<void> {
  const { error } = await supabase.rpc('set_event_screen', { p_booking_id: bookingId, p_paused: paused });
  if (error) throw fail(error);
}

/** A photo's print master from the private bucket (the host's own event only). */
export async function downloadOriginal(bookingId: string, mediaId: string): Promise<Blob> {
  const { data, error } = await supabase.storage.from('event-originals').download(`${bookingId}/${mediaId}.jpg`);
  if (error || !data) throw new Error('A photo couldn’t be downloaded. Check your connection and try again.');
  return data;
}
