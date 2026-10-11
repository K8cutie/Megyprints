/* ══════════════════════════════════════════════════════════════════════════
   A guest's own album from the event's pool (0047).

   A school field trip: the organizer shares the QR, the parents pool their
   photos and videos, and each parent makes their own album from that pool
   (owner, 2026-10-11). Any guest who joined with the QR can, unless the host
   switched guest albums off. It's an ordinary album at the normal price; the
   booking only pays for the host's.

   1. "Make your own album" links the guest pass on this phone to the signed-in
      account (an order needs one), once. Then the account finds the event
      from any device (myGuestAlbums).
   2. The guest picks from what the feed shows. Their picks are their own.
   3. "Make my album" downloads the print masters of the picked photos (the
      storage rule lets a guest read only those) and hands them to the builder
      — no booking link, so checkout prices it as any album. Picked videos are
      offered as video memories.
   ══════════════════════════════════════════════════════════════════════════ */

import { supabase } from './supabase';
import type { MediaKind } from './eventCamera';
import type { AlbumSizePreset } from '../pages/builder/types';

export interface GuestAlbumEvent {
  guest_id: string;
  booking_id: string;
  guest_code: string;
  title: string;
  event_type: string;
  event_date: string;
  kept_until: string;
  album_size: AlbumSizePreset | null;
  picked: number;
}

export interface GuestAlbumItem {
  id: string;
  booking_id: string;
  kind: MediaKind;
  ext: string;
  guest_name: string | null;
  ready_at: string;
  width: number | null;
  height: number | null;
  duration_s: number | null;
  /** Shared by this guest. */
  mine: boolean;
  picked: boolean;
}

type DbError = { code?: string; message?: string } | null;

/** The database's own words for the EV05x refusals; plain words otherwise. */
export function guestAlbumErrorMessage(error: DbError): string {
  if (!error) return '';
  if (error.code && /^EV05\d$/.test(error.code) && error.message) return error.message;
  if (error.code === '42501') return 'Sign in to make your own album.';
  return 'Something went wrong. Please try again.';
}

/** Link the guest pass on this phone to the signed-in account. */
export async function linkEventGuest(code: string, token: string): Promise<string> {
  const { data, error } = await supabase.rpc('link_event_guest', { p_code: code, p_token: token });
  if (error) throw new Error(guestAlbumErrorMessage(error));
  return (data as { guest_id: string }).guest_id;
}

/** Every event this account can make an album from. */
export async function myGuestAlbums(): Promise<GuestAlbumEvent[]> {
  const { data, error } = await supabase.rpc('my_guest_albums');
  if (error) throw new Error(guestAlbumErrorMessage(error));
  return Array.isArray(data) ? (data as GuestAlbumEvent[]) : [];
}

export async function guestAlbumPool(guestId: string): Promise<GuestAlbumItem[]> {
  const { data, error } = await supabase.rpc('guest_album_media', { p_guest_id: guestId });
  if (error) throw new Error(guestAlbumErrorMessage(error));
  return Array.isArray(data) ? (data as GuestAlbumItem[]) : [];
}

export async function setGuestPick(guestId: string, mediaId: string, picked: boolean): Promise<boolean> {
  const { data, error } = await supabase.rpc('set_guest_pick', { p_guest_id: guestId, p_media_id: mediaId, p_picked: picked });
  if (error) throw new Error(guestAlbumErrorMessage(error));
  return !!data;
}

/** The print master of a photo this guest picked (the only ones they can read). */
export async function downloadPickedOriginal(bookingId: string, mediaId: string): Promise<Blob> {
  const { data, error } = await supabase.storage.from('event-originals').download(`${bookingId}/${mediaId}.jpg`);
  if (error || !data) throw new Error('We couldn’t get one of your photos. Check your connection and try again.');
  return data;
}

/** The host: guests can (or can't) make their own album. */
export async function setGuestAlbums(bookingId: string, on: boolean): Promise<void> {
  const { error } = await supabase.rpc('set_guest_albums', { p_booking_id: bookingId, p_on: on });
  if (error) throw new Error(error.message || 'Could not save. Try again.');
}

/** Which event this account can make an album from, for an event code. */
export function eventForCode(all: GuestAlbumEvent[], code: string): GuestAlbumEvent | null {
  return all.find((e) => e.guest_code === code) ?? null;
}
