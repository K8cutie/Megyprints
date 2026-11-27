/* ══════════════════════════════════════════════════════════════════════════
   ORDERS THAT DIDN'T FINISH SENDING, AND FINISHING THEM (MP-2026-9M5572U).

   An order row is made first, then its files go up from the phone: the
   cover, every memory video, the pages, the QR rows. When the phone stops
   half-way (the app closed, a video the server refused), the order is left
   without what it needs to be printed. Until 0068 nothing said so: the
   customer was told "To finish it, pay that order", and paying sent no
   files.

   Now the database says what of each open order is missing (0068
   my_unsent_orders, read from Storage and the QR rows, never from the
   phone), and the app:
     • shows it on Your orders and on the album's checkout as "Order MP-…
       didn't finish sending", with Finish sending instead of Pay;
     • finishes it on the SAME order (never a second one), from the album as
       the order froze it (album_snapshot: its pages, its cover, its photo
       list), with the photos on this phone matched by id. A file already in
       the bucket counts as sent (create-only uploads), so only what is
       missing goes up.
   The database refuses "I've sent the payment" until the order is whole
   (MP030), so nobody pays for an order that can't be printed.
   ══════════════════════════════════════════════════════════════════════════ */
import type { AlbumPage, AlbumSizePreset, UploadedPhoto } from '@web/pages/builder/types';
import { albumQrFills, memoryRows, ORDER_ID, type CheckoutAlbum, type OrderAlbumRow, type PlaceOrderPlan, type PlanStep } from './orderPayload';
import { coverPhotoUri } from './orderStart';

/** One of my orders that didn't finish sending (0068 my_unsent_orders). */
export interface UnsentOrder {
  order_id: string;
  order_number: string;
  album_id: string | null;
  status: string;
  created_at: string;
  /** 'cover', 'pages', 'video:<code>', 'memory:<code>'. */
  missing: string[];
}

type Rpc = { rpc(name: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }> };

/** My orders that didn't finish sending. [] when they can't be read (no
 *  connection, or a database before 0068): nothing is said then. */
export async function listUnsentOrders(client: Rpc): Promise<UnsentOrder[]> {
  try {
    const { data, error } = await client.rpc('my_unsent_orders');
    if (error || !Array.isArray(data)) return [];
    return data.filter((o): o is UnsentOrder => !!o && typeof (o as UnsentOrder).order_id === 'string' && Array.isArray((o as UnsentOrder).missing));
  } catch {
    return [];
  }
}

/* ── The words ── */

/** What never arrived, in the customer's words: "the pages and 3 memory videos". */
export function missingWords(missing: readonly string[]): string {
  const videos = missing.filter((m) => m.startsWith('video:')).length;
  const parts = [
    missing.includes('cover') ? 'the cover' : '',
    missing.includes('pages') ? 'the pages' : '',
    videos === 1 ? '1 memory video' : videos > 1 ? `${videos} memory videos` : '',
  ].filter(Boolean);
  // Only the QR rows missing (the files are all in): the QRs aren't set up.
  if (!parts.length) return missing.some((m) => m.startsWith('memory:')) ? 'the QR codes’ videos and links' : 'part of the order';
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const unsentHeadline = (orderNumber: string): string => `Order ${orderNumber} didn't finish sending`;
export function unsentBody(missing: readonly string[]): string {
  return `${capital(missingWords(missing))} never reached us, so we can't print it yet. Tap Finish sending and keep the app open until it's done.`;
}
/** The button (the one filled button where it shows). */
export const FINISH_SENDING = 'Finish sending';
/** Under it on the album's checkout: a new order is still possible. */
export const NEW_ORDER_INSTEAD = 'Place a new order instead';
/** Your orders' line on the order's card. */
export const UNSENT_CARD_LINE = "Didn't finish sending";
/** The album was deleted: nothing on the phone can finish it. */
export const UNSENT_NO_ALBUM = "This order didn't finish sending, and its album was deleted from this phone's account, so it can't be finished. Message us and we'll sort it out.";
/** A photo the order needs isn't on this phone. */
export const FINISH_PHOTOS_MISSING = "Some photos this order needs aren't on this phone. Open Your orders on the phone you made the album on and tap Finish sending there.";
/** The order couldn't be read back. */
/** Bug hunt L1-45 (2026-11-27): a send that stopped after its order row was
 *  saved, in the same checkout visit. Place order then finishes THAT order from
 *  what it froze (its cover, paper, years, address, code and total), never from
 *  the form, which may have been changed since; the form says so. */
export function retryFinishesSavedOrder(o: { live: boolean; placed: { id: string } | null; finishingTestOrder: boolean; eventAlbum: boolean }): boolean {
  return o.live && !!o.placed && !o.finishingTestOrder && !o.eventAlbum;
}
export const savedOrderNote = (orderNumber: string) =>
  `Your order ${orderNumber} is saved. Place order finishes sending it as you placed it. Changes on this page don't change it. To change it, tap "${NEW_ORDER_INSTEAD}".`;
export const SAVED_ORDER_LOAD_FAILED = "We couldn't get your saved order from your account. Check your internet, then tap Place order again.";
export const FINISH_LOAD_FAILED = "We couldn't get this order from your account. Check your internet, then tap Finish sending again.";
/** All in, already paid: the end of Finish sending. */
export const allSentTitle = 'Your order is all sent';
export const allSentBody = (orderNumber: string): string => `Every page and video of order ${orderNumber} reached us. We'll print it and text you at each big step.`;

/* ── Finishing one ── */

/** The order to finish, as the app reads it back (its own row, by id). */
export interface FinishOrderRow {
  id: string;
  order_number: string;
  status: string;
  payment_status: string | null;
  payment_submitted_at: string | null;
  album_id: string | null;
  album_snapshot: unknown;
  album_size: string | null;
  cover: string | null;
  material: string | null;
  page_count: number | null;
  quoted_amount: number | null;
  amount: number | null;
  created_at: string;
  tester_code: string | null;
}

export const FINISH_ORDER_COLUMNS = 'id, order_number, status, payment_status, payment_submitted_at, album_id, album_snapshot, album_size, cover, material, page_count, quoted_amount, amount, created_at, tester_code';

type Reader = { from(table: string): { select(cols: string): { eq(c: string, v: string): { eq(c: string, v: string): { maybeSingle(): PromiseLike<{ data: unknown; error: { message: string } | null }> } } } } };

/** My order by id, with the album it froze; null when it isn't mine. */
export async function loadFinishOrder(client: Reader, userId: string, orderId: string): Promise<FinishOrderRow | null> {
  const { data, error } = await client.from('orders').select(FINISH_ORDER_COLUMNS).eq('user_id', userId).eq('id', orderId).maybeSingle();
  if (error) throw new Error(FINISH_LOAD_FAILED);
  return (data as FinishOrderRow | null) ?? null;
}

/** Still waiting for its payment after it is whole: Finish sending ends on
 *  the payment step; else (paid already) on "all sent". */
export function finishEndsOnPayment(o: Pick<FinishOrderRow, 'status' | 'payment_status' | 'payment_submitted_at'>): boolean {
  return o.status === 'pending_payment' && o.payment_status !== 'paid' && !o.payment_submitted_at;
}

interface Snapshot {
  id?: string;
  title?: string | null;
  pages?: unknown;
  cover_front?: unknown;
  photos?: unknown;
  [k: string]: unknown;
}

/** The photos a page (or the cover) uses: slot numbers and a picture background. */
function photosUsed(pages: readonly (AlbumPage | null)[]): { indexes: Set<number>; ids: Set<string> } {
  const indexes = new Set<number>();
  const ids = new Set<string>();
  for (const p of pages) {
    if (!p) continue;
    for (const f of p.slotFills ?? []) if (typeof f === 'number') indexes.add(f);
    const bg = p.background as { type?: string; photoId?: string } | undefined;
    if (bg?.type === 'image' && typeof bg.photoId === 'string') ids.add(bg.photoId);
  }
  return { indexes, ids };
}

/** The album as the order froze it, drawn from the photos on this phone
 *  (matched by id, in the order's own photo list). Throws FINISH_PHOTOS_MISSING
 *  when a photo it prints isn't here. */
export function finishAlbum(order: Pick<FinishOrderRow, 'album_id' | 'album_snapshot' | 'album_size'>, phonePhotos: readonly Pick<UploadedPhoto, 'id' | 'previewUrl'>[]): CheckoutAlbum {
  const snap = (order.album_snapshot ?? {}) as Snapshot;
  const pages = Array.isArray(snap.pages) ? (snap.pages as AlbumPage[]) : [];
  const coverFront = (snap.cover_front && typeof snap.cover_front === 'object' ? snap.cover_front : null) as AlbumPage | null;
  const listed = Array.isArray(snap.photos) ? (snap.photos as { id?: unknown }[]) : [];
  const photoIds = listed.map((p) => (typeof p?.id === 'string' ? p.id : ''));
  const onPhone = new Map(phonePhotos.map((p) => [p.id, p.previewUrl]));
  const photoUris = photoIds.map((id) => (id ? onPhone.get(id) ?? '' : ''));
  const used = photosUsed([...pages, coverFront]);
  const gone = [...used.indexes].some((i) => !photoUris[i]) || [...used.ids].some((id) => !onPhone.get(id));
  if (!pages.length || gone) throw new Error(FINISH_PHOTOS_MISSING);
  const photos = photoIds.map((id, i) => ({ id, previewUrl: photoUris[i] }));
  return {
    albumId: order.album_id ?? String(snap.id ?? ''),
    title: typeof snap.title === 'string' ? snap.title : '',
    albumSize: (order.album_size ?? snap.album_size) as AlbumSizePreset,
    pages,
    photoUris,
    photoIds,
    coverFront,
    coverPhotoUri: coverPhotoUri(coverFront, photos),
    row: { ...(snap as OrderAlbumRow), id: order.album_id ?? String(snap.id ?? '') },
  };
}

/** What Finish sending sends: the order's files and its QR rows, the same
 *  steps Place order runs after the order row (placeOrderPlan), with no new
 *  order row (sendOrder reuses the order). */
export function finishPlan(order: Pick<FinishOrderRow, 'album_snapshot'>, userId: string, includedYears: number | null, now: Date = new Date()): PlaceOrderPlan {
  const snap = (order.album_snapshot ?? {}) as Snapshot;
  const pages = Array.isArray(snap.pages) ? (snap.pages as AlbumPage[]) : [];
  const fills = albumQrFills(pages);
  const clipCodes = [...new Set(fills.filter((f) => f?.kind === 'clip').map((f) => f!.code))];
  const rows = memoryRows(fills, userId, includedYears, now);
  const steps: PlanStep[] = [
    { kind: 'upload', what: 'The cover wrap (front, spine, back), made on the phone', bucket: 'print-pdfs', path: `${ORDER_ID}-cover.pdf`, contentType: 'application/pdf', mode: 'create-only', tries: 3 },
    ...clipCodes.map((code): PlanStep => ({ kind: 'upload', what: 'A memory video', bucket: 'memory-clips', path: `${code}.<mp4|webm>`, contentType: 'video/*', mode: 'create-only' })),
    { kind: 'upload', what: 'The album pages, made on the phone page by page', bucket: 'print-pdfs', path: `${ORDER_ID}.pdf`, contentType: 'application/pdf', mode: 'create-only' },
    ...(rows.length ? [{ kind: 'upsert', what: 'The QR memories the album prints', table: 'qr_memories', rows, onConflict: 'code', ignoreDuplicates: true } as PlanStep] : []),
    { kind: 'next', what: 'The payment step, or "all sent" when it is paid already' },
  ];
  const files = steps.flatMap((s) => (s.kind === 'upload' ? [{ bucket: s.bucket, path: s.path, contentType: s.contentType }] : []));
  return { steps, orderRow: {}, files };
}
