/* ══════════════════════════════════════════════════════════════════════════
   SENDING THE ORDER (Phase 5, step 3): Place order and "I've sent ₱X" for
   real, the website's way (src/pages/Order.tsx placeOrder and
   handlePaymentSent, src/lib/orders.ts, qrMemories.ts, testerCode.ts,
   payment.ts, storageUpload.ts).

   It runs the plan checkout already builds and shows (orderPayload.ts
   placeOrderPlan, payment.ts paymentSubmitPlan, both held to the website's
   rows and files by checkoutPayload.test.ts), step by step, in its order:
     1. the order row, ONCE: Place order again reuses it (`placed`), so a
        retry never makes a second order;
     2. the cover file, made on the phone and sent first (the phone has the
        most memory free then), tried 3 times, waiting 1.5 s then 4 s
        (orders.ts COVER_RETRY_WAITS_MS);
     3. the pages file, made page by page (progress), then sent;
     4. the album's QR memories (best effort for links, as on the website;
        required for videos);
     5. a tester order: claim_tester_order (the database marks it paid);
        else the payment step.
   Every upload is create-only: a file already in the bucket (an earlier
   try for this same order) counts as sent (storageUpload uploadOnce).
   Memory videos (the website's steps 0, 2b and 3c): before the order row,
   every video must be on this phone or already in the cloud (a video
   that's gone names its pages and leaves no unpaid order behind); after
   the cover, every kept video is shrunk if needed and uploaded; after the
   pages, checked once more; then their memory rows are REQUIRED, pointing
   at the file actually sent (a .mov shrunk on the phone is sent as .mp4).

   The caller gives the database, the upload and the two file makers, so
   the tests run all of it on stand-ins (test/sendOrder.test.ts, beside the
   website's own functions). Whether the app sends at all is the checkout
   screen's choice (order.tsx: off unless switched on).
   ══════════════════════════════════════════════════════════════════════════ */
import { isUnpaidLimitError, UnpaidLimitError } from '@web/lib/orderExpiry';
import { ORDER_ID, type PlaceOrderPlan, type PlanStep } from './orderPayload';
import type { PaymentSubmitPlan } from './payment';
import { isTesterCodeGoneError, TesterCodeGoneError } from './testerCode';
import { MissingClipError, publicClipUrl, type ClipExt } from '../memories/clips';
import { bookingErrorMessage } from '../events/eventDeal';

type DbError = { message: string; code?: string | null } | null;

/** What sending needs from the database (the app's Supabase client). */
export interface SendDb {
  from(table: string): {
    insert(row: Record<string, unknown>): { select(columns: string): { single(): Promise<{ data: unknown; error: DbError }> } };
    upsert(rows: unknown[], opts: { onConflict: string; ignoreDuplicates: boolean }): PromiseLike<{ error: DbError }>;
  };
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: DbError }>;
}

/** A create-only upload: null when the file is in the bucket (now, or from
 *  an earlier try), else the storage error. */
export type CreateOnlyUpload = (bucket: string, path: string, body: Uint8Array, opts: { contentType: string; cacheControl?: string }) => Promise<{ message: string } | null>;

export type SendStep =
  | { step: 'order' }
  | { step: 'cover' }
  | { step: 'pages'; done: number; total: number; smaller: boolean }
  | { step: 'sending' }
  | { step: 'memories' }
  | { step: 'finishing' }
  /** An event album: its booking pays for the order. */
  | { step: 'booking' }
  /** Memory videos: checked before the order (before) or after the pages. */
  | { step: 'videosCheck'; before: boolean }
  /** Memory videos: shrinking (compress) and uploading, done of total. */
  | { step: 'videos'; done: number; total: number; phase: 'compress' | 'upload' };

/** The memory videos' part of sending (lib/memories/clipStore.ts). */
export interface ClipSender {
  /** The videos neither on this phone nor in the cloud. */
  findMissing(codes: string[]): Promise<string[]>;
  /** Shrink what is left, then upload every kept video (one already there
   *  counts). Throws MissingClipError for a video that is gone. */
  upload(codes: string[], onProgress?: (done: number, total: number, phase: 'compress' | 'upload') => void): Promise<{ uploaded: string[]; replaced: string[] }>;
  /** The kind of file each kept video was sent as; null when not on this phone. */
  extOf(code: string): Promise<ClipExt | null>;
  /** Re-point a memory at its video (qrMemories.ts updateMemoryDestination). */
  repoint(code: string, destination: string): Promise<boolean>;
  supabaseUrl: string;
}

/** Order.tsx's words when the video memories' rows could not be made. */
export const MEMORY_ROWS_FAILED = 'Could not save your memory videos to your account. Please try again.';

export interface SendDeps {
  db: SendDb;
  upload: CreateOnlyUpload;
  /** "<order>-cover.pdf", made on the phone. */
  makeCover: () => Promise<Uint8Array>;
  /** "<order>.pdf", made page by page. */
  makePages: (onPage: (done: number, total: number, smaller: boolean) => void) => Promise<Uint8Array>;
  onStep?: (s: SendStep) => void;
  /** The order row, as soon as it exists: the checkout keeps it, so Place
   *  order again (after a step failed) reuses it (`placed`). */
  onOrder?: (o: PlacedOrder) => void;
  /** Waits between cover tries (default: real time). */
  wait?: (ms: number) => Promise<void>;
  /** Memory videos (none: an album with one can't be sent from here). */
  clips?: ClipSender;
}

/** The order row as the insert answered it. */
export interface PlacedOrder { id: string; order_number: string; status: string }

/** orders.ts COVER_RETRY_WAITS_MS: 3 tries in all. */
export const COVER_RETRY_WAITS_MS = [1500, 4000];

/** Order.tsx placeOrder's words when the cover didn't go: sending it (the
 *  connection), or making it on this phone (memory). */
export const COVER_SEND_FAILED = "We couldn't send your album's cover. Your order is saved: check your internet, then tap Place order again.";
export const COVER_MAKE_FAILED = "We couldn't make your album's cover on this phone. Your order is saved: close your other apps, then tap Place order again. If it keeps happening, message us.";
/** testerCode.ts claimTesterOrder's words. */
export const TESTER_CLAIM_FAILED = "We couldn't finish your free tester order. Your order is saved: tap Place order again.";

/** An album with a memory video, sent without the video part (an older
 *  caller): the video can't be sent. */
export class MemoryVideosNotInAppError extends Error {
  constructor() {
    super('This album has a memory video. The app can\'t send memory videos yet: please order this album on the website, on the device where you added the video.');
    this.name = 'MemoryVideosNotInAppError';
  }
}

const realWait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Place order, for real: the plan's steps in its order. Resolves with the
 *  order and whether it is a tester order (marked paid: no payment step). */
export async function sendOrder(plan: PlaceOrderPlan, deps: SendDeps, placed: PlacedOrder | null = null): Promise<{ order: PlacedOrder; paidByTester: boolean; paidByBooking?: boolean }> {
  const { db, upload, onStep = () => {}, wait = realWait, clips } = deps;
  const clipCodes = [...new Set(plan.steps.flatMap((s) => (s.kind === 'upload' && s.bucket === 'memory-clips' ? [s.path.split('.')[0]] : [])))];
  if (clipCodes.length && !clips) throw new MemoryVideosNotInAppError();
  const sendVideos = async () => {
    onStep({ step: 'videos', done: 0, total: clipCodes.length, phase: 'upload' });
    return clips!.upload(clipCodes, (done, total, phase) => onStep({ step: 'videos', done, total, phase }));
  };

  // 0. Every memory video on this phone or already in the cloud, BEFORE the
  //    order row exists: a video that's gone must not leave an unpaid order.
  if (clipCodes.length && !placed) {
    onStep({ step: 'videosCheck', before: true });
    const gone = await clips!.findMissing(clipCodes);
    if (gone.length) throw new MissingClipError(gone);
  }

  // 1. The order row, once.
  let order = placed;
  if (!order) {
    onStep({ step: 'order' });
    const { data, error } = await db.from('orders').insert(plan.orderRow).select('id, order_number, status').single();
    if (isUnpaidLimitError(error)) throw new UnpaidLimitError();
    if (isTesterCodeGoneError(error)) throw new TesterCodeGoneError(String(plan.orderRow.tester_code ?? ''));
    if (error) throw new Error(`Could not place your order: ${error.message}`);
    order = data as PlacedOrder;
    deps.onOrder?.(order);
  }
  const id = order.id;
  const named = (s: string) => s.split(ORDER_ID).join(id);

  let paidByTester = false;
  let paidByBooking = false;
  let videosSent = false;
  let replaced: string[] = [];
  for (const step of plan.steps) {
    if (step.kind === 'upload' && step.path === `${ORDER_ID}-cover.pdf`) await sendCover(step, named(step.path), deps, onStep, wait);
    else if (step.kind === 'upload' && step.bucket === 'memory-clips') {
      // 2b. Every memory video, once (the plan lists one step per video).
      if (!videosSent) { replaced = (await sendVideos()).replaced; videosSent = true; }
    } else if (step.kind === 'upload' && step.path === `${ORDER_ID}.pdf`) {
      onStep({ step: 'pages', done: 0, total: 0, smaller: false });
      const bytes = await deps.makePages((done, total, smaller) => onStep({ step: 'pages', done, total, smaller }));
      onStep({ step: 'sending' });
      const error = await upload(step.bucket, named(step.path), bytes, { contentType: step.contentType });
      if (error) throw new Error(`Print file upload failed: ${error.message}`);
    } else if (step.kind === 'upsert') {
      const hasClips = step.rows.some((r) => r.kind === 'clip');
      if (hasClips && clips) {
        // 3c. The videos once more, right before their rows (the nightly
        //     clean-up may have removed one this order shares).
        onStep({ step: 'videosCheck', before: false });
        const again = await clips.upload(clipCodes);
        replaced = [...new Set([...replaced, ...again.replaced])];
      }
      onStep({ step: 'memories' });
      // Each video's row points at the file actually sent.
      const repoint: { code: string; destination: string }[] = [];
      const rows = await Promise.all(step.rows.map(async (r) => {
        if (r.kind !== 'clip' || !clips) return r;
        const ext = await clips.extOf(r.code);
        if (!ext) return r;
        const destination = publicClipUrl(r.code, ext, clips.supabaseUrl);
        if (destination !== r.destination || replaced.includes(r.code)) repoint.push({ code: r.code, destination });
        return { ...r, destination };
      }));
      if (!hasClips) {
        // Best effort, as on the website for links.
        await Promise.resolve(db.from(step.table).upsert(rows, { onConflict: step.onConflict, ignoreDuplicates: step.ignoreDuplicates })).catch(() => {});
      } else {
        // Required for videos: the row is what the printed QR plays.
        const { error } = await Promise.resolve(db.from(step.table).upsert(rows, { onConflict: step.onConflict, ignoreDuplicates: step.ignoreDuplicates }))
          .catch((e: unknown) => ({ error: { message: e instanceof Error ? e.message : String(e) } }));
        if (error) throw new Error(MEMORY_ROWS_FAILED);
        // A replaced video, or one sent as another kind of file: re-point its row.
        for (const r of repoint) await clips!.repoint(r.code, r.destination);
      }
    } else if (step.kind === 'rpc' && step.name === 'claim_tester_order') {
      onStep({ step: 'finishing' });
      const { error } = await db.rpc(step.name, { p_order_id: id });
      if (error) throw new Error(TESTER_CLAIM_FAILED);
      paidByTester = true;
    } else if (step.kind === 'rpc' && step.name === 'cover_order_with_booking') {
      // 5a. An event album: its booking pays (eventAlbum.ts coverOrderWithBooking).
      onStep({ step: 'booking' });
      const { error } = await db.rpc(step.name, { p_order_id: id, p_booking_id: step.args.p_booking_id });
      if (error) throw new Error(bookingErrorMessage({ message: error.message, code: error.code ?? undefined }));
      paidByBooking = true;
    }
  }
  return { order, paidByTester, paidByBooking };
}

/** The cover: made, then sent, 3 tries; the website's words after the last. */
async function sendCover(step: Extract<PlanStep, { kind: 'upload' }>, path: string, deps: SendDeps, onStep: (s: SendStep) => void, wait: (ms: number) => Promise<void>): Promise<void> {
  onStep({ step: 'cover' });
  let bytes: Uint8Array | null = null;
  for (let attempt = 1; ; attempt++) {
    let sending = false;
    try {
      // Made again only if it wasn't made (a failed send keeps the file).
      bytes = bytes ?? await deps.makeCover();
      sending = true;
      const error = await deps.upload(step.bucket, path, bytes, { contentType: step.contentType });
      if (error) throw new Error(`Cover file upload failed: ${error.message}`);
      return;
    } catch {
      if (attempt > COVER_RETRY_WAITS_MS.length) throw new Error(sending ? COVER_SEND_FAILED : COVER_MAKE_FAILED);
      await wait(COVER_RETRY_WAITS_MS[attempt - 1]);
    }
  }
}

/** "I've sent ₱X", for real (handlePaymentSent): the receipt to its bucket
 *  (create-only), then submit_payment_proof. A receipt that didn't go up is
 *  said (`receiptError`) and the payment is recorded without it, as on the
 *  website. `receipt`: the picked file's bytes, or null with no receipt. */
export async function sendPayment(plan: PaymentSubmitPlan, receipt: Uint8Array | null, deps: Pick<SendDeps, 'db' | 'upload'>): Promise<{ receiptError: string | null }> {
  let proofPath: string | null = null;
  let receiptError: string | null = null;
  if (plan.upload && receipt) {
    const { bucket, path, contentType, cacheControl } = plan.upload;
    const error = await deps.upload(bucket, path, receipt, { contentType, cacheControl });
    if (error) receiptError = `Could not upload your receipt (${error.message}). You can still tap "I've sent the payment" — we'll confirm from our bank app.`;
    else proofPath = path;
  }
  const { error } = await deps.db.rpc(plan.rpc.name, { ...plan.rpc.args, p_proof_path: proofPath });
  if (error) throw new Error(`Could not record your payment (${error.message}).`);
  return { receiptError };
}
