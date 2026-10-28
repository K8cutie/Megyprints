/* ══════════════════════════════════════════════════════════════════════════
   WHAT PLACE ORDER SENDS: the order row, the memory rows and the files, in
   the order the website sends them (src/pages/Order.tsx placeOrder, and
   src/lib/orders.ts createOrderFromAlbum), built WITHOUT sending anything.

   This build stops there: checkout shows it in the test panel and writes
   nothing (no order, no upload). When the write path is switched on, these
   are exactly what goes to the database and the storage buckets.

   The order row is a MIRROR of createOrderFromAlbum's insert (that file also
   makes the PDFs with jsPDF and holds the website's Supabase client, so it
   can't be shared). Every value comes from the SHARED contact rules
   (src/lib/contact.ts: name, E.164 phone, street, the composed one-line
   address). test/checkoutPayload.test.ts runs the WEBSITE's
   createOrderFromAlbum with a stand-in database that records the insert,
   and requires the same row, key by key, for the same album, address and
   tester code.

   NOT IN THE ROW: the price. The website never sends it either: the database
   works it out from the frozen album (0019, 0055) and the RLS insert policy
   refuses a client price or status. The price on screen is for the customer.
   ══════════════════════════════════════════════════════════════════════════ */
import {
  composeAddress,
  isValidFullName,
  isValidStructuredAddress,
  normalizeFullName,
  normalizePHPhone,
  normalizeStreet,
  type AddressValue,
} from '@web/lib/contact';
import type { AlbumPage, AlbumSizePreset, QrFill } from '@web/pages/builder/types';

/** An albums row as select('*') returns it (the columns an order freezes,
 *  and whatever else the row has). */
export interface OrderAlbumRow {
  id: string;
  title: string | null;
  album_type: string | null;
  album_size: string | null;
  selected_template: string | null;
  photos_per_page: number | null;
  pages: unknown;
  photos: unknown;
  cover_photo: string | null;
  cover_front?: unknown;
  [column: string]: unknown;
}

/** The album checkout is ordering, as the app holds it. */
export interface CheckoutAlbum {
  albumId: string;
  title: string;
  albumSize: AlbumSizePreset;
  pages: AlbumPage[];
  /** Where each photo is (index = slotFills value). */
  photoUris: string[];
  coverFront: AlbumPage | null;
  /** The cover's photo, for the summary's small cover. */
  coverPhotoUri: string | null;
  /** The account's row for this album: what the order freezes. */
  row: OrderAlbumRow;
  /** The test album (fixtureAlbum.ts), until Phase 3. */
  fixture?: boolean;
}

export interface OrderSpecs { material: string; cover: string; size: string }
export interface ShippingDetails { name: string; phone: string; address: AddressValue }

/** createOrderFromAlbum's own message for details that don't pass. */
export const SHIPPING_INVALID = 'Please provide a valid name, PH mobile number, and complete delivery address.';

/** The frozen copy of the album the order keeps (album_snapshot). */
export function albumSnapshot(row: OrderAlbumRow) {
  return {
    id: row.id, title: row.title, album_type: row.album_type, album_size: row.album_size,
    selected_template: row.selected_template, photos_per_page: row.photos_per_page,
    pages: row.pages, photos: row.photos, cover_photo: row.cover_photo,
    cover_front: row.cover_front ?? null,
  };
}

export interface OrderInsertInput {
  userId: string;
  album: OrderAlbumRow;
  specs: OrderSpecs;
  shipping: ShippingDetails;
  hostingYears?: number | null;
  hdMemories?: boolean;
  testerCode?: string | null;
  /** The clock for status_history (tests). */
  now?: Date;
}

/** The orders insert, key for key as the website sends it. Throws the
 *  website's message when the details don't pass. */
export function buildOrderInsert(opts: OrderInsertInput): Record<string, unknown> {
  const album = albumSnapshot(opts.album);
  const pageCount = Array.isArray(album.pages) ? album.pages.length : 0;
  const shipName = normalizeFullName(opts.shipping.name);
  const shipPhone = normalizePHPhone(opts.shipping.phone);
  const addr = opts.shipping.address;
  if (!isValidFullName(shipName) || !shipPhone || !isValidStructuredAddress(addr)) throw new Error(SHIPPING_INVALID);
  const shipAddress = composeAddress(addr);
  return {
    user_id: opts.userId,
    album_id: album.id,
    album_snapshot: album,
    album_size: album.album_size ?? opts.specs.size,
    material: opts.specs.material,
    cover: opts.specs.cover,
    page_count: pageCount,
    ship_name: shipName,
    ship_phone: shipPhone,
    ship_address: shipAddress,
    ship_region: addr.regionName,
    ship_province: addr.provinceName,
    ship_city: addr.cityName,
    ship_barangay: addr.barangayName,
    ship_street: normalizeStreet(addr.street),
    ship_zip: addr.zip.trim(),
    hosting_years: opts.hostingYears ?? null,
    hd_memories: !!opts.hdMemories,
    ...(opts.testerCode ? { tester_code: opts.testerCode } : {}),
    status_history: [{ status: 'pending_payment', at: (opts.now ?? new Date()).toISOString() }],
  };
}

/** Every QR on the album, both homes (a QR slot, a QR in a caption box). */
export function albumQrFills(pages: readonly AlbumPage[]): (QrFill | null)[] {
  return pages.flatMap((p) => [...(p.qrFills ?? []), ...(p.textSlotQr ?? [])]);
}

/** ISO expiry for a term bought now (src/lib/qrMemories.ts expiryForTerm). */
export function expiryForTerm(years: number, from: Date = new Date()): string {
  const d = new Date(from.getTime());
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d.toISOString();
}

/** The qr_memories rows Place order makes sure exist (ensureMemoriesForFills):
 *  stamped with the INCLUDED term only (RLS caps it; the paid term is applied
 *  at "Mark paid"). Links never expire. Upserted, existing codes kept. */
export function memoryRows(fills: readonly (QrFill | null)[], userId: string, includedYears: number | null, now: Date = new Date()) {
  const expiresAt = includedYears ? expiryForTerm(includedYears, now) : null;
  return fills
    .filter((f): f is QrFill => !!f)
    .map((f) => ({ code: f.code, user_id: userId, destination: f.destination, kind: f.kind ?? 'link', expires_at: f.kind === 'clip' ? expiresAt : null }));
}

/* ── The whole of Place order, step by step ── */

/** The order's id comes back from the insert; until then it is this. */
export const ORDER_ID = '<order id>';

export type PlanStep =
  | { kind: 'read'; what: string; table: string; filter: Record<string, string> }
  | { kind: 'insert'; what: string; table: 'orders'; row: Record<string, unknown> }
  | { kind: 'upload'; what: string; bucket: string; path: string; contentType: string; mode: 'create-only'; tries?: number }
  | { kind: 'upsert'; what: string; table: 'qr_memories'; rows: ReturnType<typeof memoryRows>; onConflict: 'code'; ignoreDuplicates: true }
  | { kind: 'rpc'; what: string; name: string; args: Record<string, unknown> }
  | { kind: 'next'; what: string };

export interface PlaceOrderPlan {
  steps: PlanStep[];
  /** Just the order row (the insert step's row). */
  orderRow: Record<string, unknown>;
  /** Just the files, in the order they are sent. */
  files: { bucket: string; path: string; contentType: string }[];
}

export interface PlanInput extends OrderInsertInput {
  /** The album's pages as they print (QR fills come from these). */
  pages: readonly AlbumPage[];
  /** The included hosting term (stamped on clip memory rows). */
  includedYears: number | null;
}

/** Place order, as the website runs it, as data. Nothing is sent. */
export function placeOrderPlan(input: PlanInput): PlaceOrderPlan {
  const now = input.now ?? new Date();
  const orderRow = buildOrderInsert({ ...input, now });
  const fills = albumQrFills(input.pages);
  const clipCodes = fills.filter((f) => f?.kind === 'clip').map((f) => (f as QrFill).code);
  const rows = memoryRows(fills, input.userId, input.includedYears, now);
  const steps: PlanStep[] = [
    { kind: 'read', what: 'The album row the order freezes (it must be in the account)', table: 'albums', filter: { user_id: input.userId, id: input.album.id } },
    { kind: 'insert', what: 'The order, unpaid. Its number and price come from the database.', table: 'orders', row: orderRow },
    { kind: 'upload', what: 'The cover wrap (front, spine, back), made on the phone', bucket: 'print-pdfs', path: `${ORDER_ID}-cover.pdf`, contentType: 'application/pdf', mode: 'create-only', tries: 3 },
    ...clipCodes.map((code): PlanStep => ({ kind: 'upload', what: 'A memory video', bucket: 'memory-clips', path: `${code}.<mp4|webm>`, contentType: 'video/*', mode: 'create-only' })),
    { kind: 'upload', what: 'The album pages, made on the phone page by page', bucket: 'print-pdfs', path: `${ORDER_ID}.pdf`, contentType: 'application/pdf', mode: 'create-only' },
    ...(rows.length ? [{ kind: 'upsert', what: 'The QR memories the album prints', table: 'qr_memories', rows, onConflict: 'code', ignoreDuplicates: true } as PlanStep] : []),
    input.testerCode
      ? { kind: 'rpc', what: 'A tester order: the database marks it paid. Nothing is printed or sent.', name: 'claim_tester_order', args: { p_order_id: ORDER_ID } }
      : { kind: 'next', what: 'The payment step: the QR, the amount, and the receipt' },
  ];
  const files = steps.flatMap((s) => (s.kind === 'upload' ? [{ bucket: s.bucket, path: s.path, contentType: s.contentType }] : []));
  return { steps, orderRow, files };
}
