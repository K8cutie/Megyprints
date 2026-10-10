/* ══════════════════════════════════════════════════════════════════════════
   Megyprints Events — bookings for 15 or more guests.

   A big event (wedding, debut, big party) is a BOOKED service, priced per deal
   (owner, 2026-10-10). The host sends a request; the owner sets the deal in
   /admin (total, deposit, the album that comes with it); the host pays the
   deposit by the same GoTyme QR + receipt as album orders and the date is
   booked; the balance is due before the album prints. The deposit is always
   MORE than the cost to make, so a balance that never comes still doesn't lose
   money ("the deposit price already covers the cost to make and some extra").

   The database (0043_event_bookings.sql) is the real guard: statuses, who can
   do what, the deposit floor. This file is the app's side of it, and its
   numbers must match the migration (eventBookings.spec.ts reads the file).
   ══════════════════════════════════════════════════════════════════════════ */

import { supabase, supabaseConfigured } from './supabase';
import { PROOF_BUCKET, proofExtFor, proofMimeFor, cleanReference } from './payment';
import { uploadOnce } from './storageUpload';
import { costOf, type Binding, type PricingModel } from './pricing';
import type { AlbumSizePreset } from '../pages/builder/types';

/** event_min_guests() in 0043. Under this, it's a normal album. */
export const EVENT_MIN_GUESTS = 15;
/** The table's upper bound (event_bookings_guests_chk). */
export const EVENT_MAX_GUESTS = 5000;
/** open_booking_limit() in 0043: requests and unpaid deals per account. */
export const OPEN_BOOKING_LIMIT = 3;

export type EventType = 'wedding' | 'debut' | 'baptism' | 'birthday' | 'reunion' | 'company' | 'other';
export const EVENT_TYPES: { id: EventType; label: string }[] = [
  { id: 'wedding', label: 'Wedding' },
  { id: 'debut', label: 'Debut' },
  { id: 'baptism', label: 'Baptism' },
  { id: 'birthday', label: 'Birthday' },
  { id: 'reunion', label: 'Reunion' },
  { id: 'company', label: 'Company event' },
  { id: 'other', label: 'Something else' },
];
export const eventTypeLabel = (t: string) => EVENT_TYPES.find((e) => e.id === t)?.label ?? t;

export type BookingStatus = 'requested' | 'quoted' | 'booked' | 'paid' | 'completed' | 'declined' | 'cancelled';
export type PaymentKind = 'deposit' | 'balance';

export interface EventBooking {
  id: string;
  booking_number: string;
  user_id: string | null;
  status: BookingStatus;
  event_type: EventType;
  event_date: string;
  venue: string | null;
  guest_count: number;
  host_name: string | null;
  mobile: string | null;
  notes: string | null;
  deal_total: number | null;
  deal_deposit: number | null;
  deal_cost: number | null;
  deal_album_size: AlbumSizePreset | null;
  deal_cover: Binding | null;
  deal_pages: number | null;
  deal_includes: string | null;
  quoted_at: string | null;
  deposit_reference: string | null;
  deposit_proof_path: string | null;
  deposit_submitted_at: string | null;
  deposit_paid_at: string | null;
  balance_reference: string | null;
  balance_proof_path: string | null;
  balance_submitted_at: string | null;
  balance_paid_at: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  close_reason: string | null;
  created_at: string;
  updated_at: string;
  /** The event (0044): set once the deposit is confirmed. */
  event_title?: string | null;
  kids_on?: boolean;
  tables?: number | null;
  copies_on?: boolean;
  guest_code?: string | null;
  screen_key?: string | null;
  screen_paused?: boolean;
  /** The album order the booking paid for (0045). */
  album_order_id?: string | null;
  /** A closed booking's money, settled with the host by the owner (0043). */
  money_settled_at?: string | null;
}

/** What the host sees (no cost to make: that's the owner's number). */
export const HOST_COLUMNS = [
  'id', 'booking_number', 'user_id', 'status', 'event_type', 'event_date', 'venue', 'guest_count', 'host_name', 'mobile', 'notes',
  'deal_total', 'deal_deposit', 'deal_album_size', 'deal_cover', 'deal_pages', 'deal_includes', 'quoted_at',
  'deposit_reference', 'deposit_proof_path', 'deposit_submitted_at', 'deposit_paid_at',
  'balance_reference', 'balance_proof_path', 'balance_submitted_at', 'balance_paid_at',
  'cancelled_at', 'cancelled_by', 'close_reason', 'money_settled_at', 'created_at', 'updated_at',
  'event_title', 'kids_on', 'tables', 'copies_on', 'guest_code', 'screen_key', 'screen_paused', 'album_order_id',
].join(', ');

export const peso = (n: number | null | undefined) =>
  n == null ? '' : `₱${Number(n).toLocaleString('en-PH', { maximumFractionDigits: 2 })}`;

export const balanceOf = (b: Pick<EventBooking, 'deal_total' | 'deal_deposit'>) =>
  b.deal_total != null && b.deal_deposit != null ? Math.round((Number(b.deal_total) - Number(b.deal_deposit)) * 100) / 100 : null;

// ── The request form ──────────────────────────────────────────────────────

export interface BookingRequest {
  eventType: EventType | '';
  eventDate: string;
  venue: string;
  guests: string;
  name: string;
  mobile: string;
  notes: string;
}

export const EMPTY_REQUEST: BookingRequest = { eventType: '', eventDate: '', venue: '', guests: '', name: '', mobile: '', notes: '' };

/** Today's date in Manila (YYYY-MM-DD): the database checks the event date
 *  against the same calendar. */
export function manilaToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** What the database keeps of a mobile number: digits and a leading +. */
export const normalizeMobile = (raw: string) => raw.replace(/[^0-9+]/g, '');

/** Every field's problem, as the sentence to show under it. Empty = ready. */
export function requestProblems(r: BookingRequest, today: string = manilaToday()): Partial<Record<keyof BookingRequest, string>> {
  const p: Partial<Record<keyof BookingRequest, string>> = {};
  if (!r.eventType) p.eventType = 'Pick what kind of event it is.';
  if (!r.eventDate) p.eventDate = 'Pick the date of your event.';
  else if (r.eventDate < today) p.eventDate = 'Pick a date that hasn’t passed yet.';
  const venue = r.venue.trim();
  if (venue.length < 2) p.venue = 'Tell us where it is: the venue, or at least the town.';
  else if (venue.length > 300) p.venue = 'Keep the venue under 300 characters.';
  const g = r.guests.trim();
  const n = /^\d+$/.test(g) ? Number(g) : NaN;
  if (!Number.isFinite(n) || n <= 0) p.guests = 'About how many guests are coming?';
  else if (n < EVENT_MIN_GUESTS) p.guests = `Bookings are for ${EVENT_MIN_GUESTS} or more guests. For a smaller group, make an album with Megyprints instead.`;
  else if (n > EVENT_MAX_GUESTS) p.guests = `For more than ${EVENT_MAX_GUESTS.toLocaleString('en-PH')} guests, message us and we’ll plan it with you.`;
  const name = r.name.trim();
  if (name.length < 2) p.name = 'Your name, so we know who to ask for.';
  else if (name.length > 120) p.name = 'Keep your name under 120 characters.';
  if (!/^\+?[0-9]{7,15}$/.test(normalizeMobile(r.mobile))) p.mobile = 'A mobile number we can text or call, like 0917 123 4567.';
  if (r.notes.length > 2000) p.notes = 'Keep the notes under 2,000 characters.';
  return p;
}

// ── Talking to the database ───────────────────────────────────────────────

type DbError = { code?: string; message?: string } | null;

/** The database's own sentences (EV00x) go to the host as they are. */
export function bookingErrorMessage(error: DbError): string {
  if (!error) return '';
  if (error.code && /^EV\d{3}$/.test(error.code) && error.message) return error.message;
  if (error.code === '23514') return 'Something in the form isn’t right. Check each field and try again.';
  return error.message || 'Something went wrong. Please try again.';
}

export async function requestBooking(userId: string, r: BookingRequest): Promise<EventBooking> {
  if (!supabaseConfigured) throw new Error('Bookings need the cloud, which isn’t set up here.');
  const { data, error } = await supabase
    .from('event_bookings')
    .insert({
      user_id: userId,
      event_type: r.eventType,
      event_date: r.eventDate,
      venue: r.venue.trim(),
      guest_count: Number(r.guests.trim()),
      host_name: r.name.trim(),
      mobile: normalizeMobile(r.mobile),
      notes: r.notes.trim() || null,
    })
    .select(HOST_COLUMNS)
    .single();
  if (error) throw new Error(bookingErrorMessage(error));
  return data as unknown as EventBooking;
}

/** The host's own bookings, newest first. Filtered by user_id on purpose: the
 *  owner's account can read every booking (0043), and "your bookings" must
 *  still mean theirs. */
export async function listMyBookings(userId: string): Promise<EventBooking[]> {
  if (!supabaseConfigured) return [];
  const { data, error } = await supabase
    .from('event_bookings')
    .select(HOST_COLUMNS)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(bookingErrorMessage(error));
  return (data ?? []) as unknown as EventBooking[];
}

/** One of the host's own bookings, or null. */
export async function getMyBooking(userId: string, id: string): Promise<EventBooking | null> {
  if (!supabaseConfigured) return null;
  const { data, error } = await supabase
    .from('event_bookings')
    .select(HOST_COLUMNS)
    .eq('user_id', userId)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(bookingErrorMessage(error));
  return (data as unknown as EventBooking | null) ?? null;
}

export async function cancelMyBooking(id: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('cancel_my_booking', { p_id: id });
  if (error) throw new Error(bookingErrorMessage(error));
  return data === true;
}

/** "booking-<id>-<deposit|balance>.<ext>": the only names 0043's storage
 *  policy and submit_booking_payment accept. */
export const bookingProofPath = (id: string, kind: PaymentKind, ext: string) => `booking-${id}-${kind}.${ext}`;

/** Upload the receipt for the payment that's due. Resolves to its path. */
export async function uploadBookingProof(id: string, kind: PaymentKind, file: File): Promise<string> {
  const ext = proofExtFor(file);
  if (!ext) throw new Error('Please attach a screenshot (JPG, PNG, WebP) or a PDF receipt.');
  const path = bookingProofPath(id, kind, ext);
  const err = await uploadOnce(PROOF_BUCKET, path, file, { contentType: proofMimeFor(ext), cacheControl: '0' });
  if (err) throw new Error(`Your receipt didn’t upload (${err.message}).`);
  return path;
}

export async function submitBookingPayment(id: string, kind: PaymentKind, opts: { reference?: string; proofPath?: string | null }): Promise<void> {
  const { error } = await supabase.rpc('submit_booking_payment', {
    p_id: id,
    p_kind: kind,
    p_reference: opts.reference ? cleanReference(opts.reference) : null,
    p_proof_path: opts.proofPath ?? null,
  });
  if (error) throw new Error(bookingErrorMessage(error));
}

// ── Where a booking is, in words ──────────────────────────────────────────

export const BOOKING_STEPS = ['Request sent', 'Your deal', 'Date booked', 'Paid in full', 'Album delivered'] as const;

export interface BookingView {
  /** Index into BOOKING_STEPS of the last step reached. */
  stage: number;
  closed: boolean;
  headline: string;
  /** What the host can do now. */
  action: 'none' | 'pay-deposit' | 'pay-balance';
  /** A payment the host says is sent and the owner hasn't confirmed yet. */
  confirming: PaymentKind | null;
  balance: number | null;
}

export function bookingView(b: EventBooking): BookingView {
  const balance = balanceOf(b);
  const base = { closed: false, action: 'none' as const, confirming: null, balance };
  switch (b.status) {
    case 'requested':
      return { ...base, stage: 0, headline: 'Request sent. We’ll text or call you to talk about your event, then your deal shows here.' };
    case 'quoted':
      return b.deposit_submitted_at
        ? { ...base, stage: 1, confirming: 'deposit', headline: `We’re confirming your ${peso(b.deal_deposit)} deposit.` }
        : { ...base, stage: 1, action: 'pay-deposit', headline: `Your deal is ready. Pay the ${peso(b.deal_deposit)} deposit to book your date.` };
    case 'booked':
      return b.balance_submitted_at
        ? { ...base, stage: 2, confirming: 'balance', headline: `Your date is booked. We’re confirming your ${peso(balance)} balance.` }
        : { ...base, stage: 2, action: 'pay-balance', headline: `Your date is booked. The ${peso(balance)} balance is due before your album prints.` };
    case 'paid':
      return { ...base, stage: 3, headline: 'Paid in full. Your date is booked.' };
    case 'completed':
      return { ...base, stage: 4, headline: 'Your album is delivered.' };
    case 'declined':
      return { ...base, stage: 0, closed: true, headline: 'We can’t take this booking.' };
    case 'cancelled':
    default:
      return { ...base, stage: 0, closed: true, headline: 'This booking is cancelled.' };
  }
}

/** Waiting on the owner: a new request to price, or a payment the host says
 *  is sent. The Bookings tab counts these (no email or SMS: they cost money). */
type MoneyFields = Pick<EventBooking, 'status' | 'deposit_submitted_at' | 'deposit_paid_at' | 'balance_submitted_at' | 'balance_paid_at' | 'money_settled_at'>;

/** A closed booking that had money (sent or confirmed) the owner hasn't
 *  settled with the host yet: refunded, or kept under the deal. Mirrors 0043's
 *  booking_money_to_settle(); until it's settled the host's account stays. */
export const moneyToSettle = (b: MoneyFields) =>
  (b.status === 'cancelled' || b.status === 'declined') && !b.money_settled_at
  && !!(b.deposit_submitted_at || b.deposit_paid_at || b.balance_submitted_at || b.balance_paid_at);

export const needsOwner = (b: MoneyFields) =>
  b.status === 'requested'
  || (b.status === 'quoted' && !!b.deposit_submitted_at)
  || (b.status === 'booked' && !!b.balance_submitted_at)
  || moneyToSettle(b);

// ── The owner's deal ──────────────────────────────────────────────────────

/** Photo storage for one guest's share (20 photos as print + view copies,
 *  about 2.3 MB each, and 2 short videos, about 1.6 MB each: about 50 MB),
 *  kept about two months at about ₱1.20 per GB-month: about ₱0.12. Doubled
 *  so the estimate never runs short. */
export const GUEST_STORAGE_COST = 0.25;

export interface DealDraft {
  size: AlbumSizePreset;
  cover: Binding;
  pages: number;
  /** Anything else this event costs to make: table cards, travel, a venue screen. */
  otherCosts: number;
  total: number;
  deposit: number;
  includes: string;
}

export interface CostToMake { album: number; storage: number; other: number; total: number }

/** What making this event costs, before any profit. Owner-only (raw costs). */
export function costToMake(model: PricingModel, guests: number, d: Pick<DealDraft, 'size' | 'cover' | 'pages' | 'otherCosts'>): CostToMake {
  const album = costOf(model, d.size, d.cover, d.pages);
  const storage = Math.ceil(Math.max(0, guests) * GUEST_STORAGE_COST);
  const other = Math.max(0, d.otherCosts || 0);
  return { album, storage, other, total: Math.round((album + storage + other) * 100) / 100 };
}

/** The deal's problem as the owner's sentence, or null when it can be sent.
 *  The deposit floor is the same rule set_booking_deal() enforces. */
export function dealProblem(d: DealDraft, cost: CostToMake, minPages: number): string | null {
  if (!Number.isInteger(d.pages) || d.pages < minPages) return `The album needs at least ${minPages} pages.`;
  if (d.pages > 400) return 'Keep the album at 400 pages or fewer.';
  if (!Number.isFinite(d.total) || d.total <= 0) return 'Enter the total for this event.';
  if (!Number.isFinite(d.deposit) || d.deposit <= 0) return 'Enter the deposit.';
  if (d.deposit <= cost.total) {
    return `The deposit has to be more than the cost to make (${peso(cost.total)}), so an unpaid balance never loses money.`;
  }
  if (d.total < d.deposit) return 'The total can’t be less than the deposit.';
  if (d.includes.length > 2000) return 'Keep “what’s included” under 2,000 characters.';
  return null;
}
