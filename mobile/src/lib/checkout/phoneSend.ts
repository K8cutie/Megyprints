/* ══════════════════════════════════════════════════════════════════════════
   PLACE ORDER AND "I'VE SENT", ON THIS PHONE: the order sender
   (sendOrder.ts) with the phone's own pieces:
     • the two print files made by the app's renderer (print/printFiles.ts
       checkoutFiles), each page's photos opened from where they are on the
       phone (print/phonePhotos.ts) just before the page is drawn;
     • the app's Supabase client for the order row, the calls, and the
       create-only uploads (storage.ts);
     • the memory videos kept on this phone (lib/memories/clipStore.ts);
     • the picked receipt read from the phone.
   Loaded by the checkout screen only when an order is really sent (the
   page renderer needs the phone's Skia), so the screen and its tests don't
   load it otherwise.
   ══════════════════════════════════════════════════════════════════════════ */
import '@shopify/react-native-skia/lib/commonjs/skia/NativeSetup';
import { Skia } from '@shopify/react-native-skia/lib/commonjs/skia/Skia';
import type { CoverType, MaterialType } from '@web/pages/builder/types';
import { PageDrawer } from '../../render/drawPage';
import type { PageText } from '../../render/pageText';
import { checkoutFiles, NotDrawnError, photosUsed } from '../../print/printFiles';
import { inspectPhotos } from '../../../modules/photo-files';
import { firstUnopenable, PhotoGoneError } from './photoCheck';
import { fontStore } from '../../editor/text/fonts/appFonts';
import { ensureAlbumFonts } from '../../editor/text/fonts/fontStore';
import { siteFile } from '../../builder/siteFiles';
import { phoneOpenPhoto } from '../../print/phonePhotos';
import { supabase, supabaseUrl } from '../supabase';
import { clipStore } from '../memories/clipStore';
import { relinkMemory } from '../memories/memories';
import type { CheckoutAlbum, PlaceOrderPlan } from './orderPayload';
import type { PaymentSubmitPlan } from './payment';
import type { PickedReceipt } from './receipt';
import { sendOrder, sendPayment, type ClipSender, type PlacedOrder, type SendDb, type SendStep } from './sendOrder';
import type { SentFiles } from './sentFiles';
import { createOnlyUpload } from './storage';

const db = supabase as unknown as SendDb;
const upload = createOnlyUpload(supabase as unknown as Parameters<typeof createOnlyUpload>[0]);

/** The memory videos' part of Place order. */
const clips: ClipSender = {
  findMissing: (codes) => clipStore.findMissingClips(codes),
  prepare: (codes, onProgress) => clipStore.prepareStagedClips(codes, onProgress),
  upload: (codes, onProgress) => clipStore.uploadStagedClips(codes, onProgress),
  extOf: async (code) => (await clipStore.getStagedClip(code))?.ext ?? null,
  repoint: (code, destination) => relinkMemory(supabase as never, code, destination),
  supabaseUrl,
};

/** A font the album uses could not be had for its print file: plain words
 *  for the customer (the full NotDrawnError still goes to the shop's report
 *  when the fonts were all here, as a real bug). */
export const FONT_OFFLINE = 'A font in your album is not on this phone yet. Connect to the internet, then try again.';
export const FONT_FAILED = 'A font in your album could not be downloaded just now. Wait a minute, then try again.';

/** Place order: the files made on this phone, the order sent. `placed`: the
 *  order a failed try already made (reused, never a second one). */
export async function sendFromPhone(o: {
  plan: PlaceOrderPlan;
  album: CheckoutAlbum;
  cover: CoverType;
  material: MaterialType;
  text: PageText;
  placed: PlacedOrder | null;
  /** The files already sent (sendOrder `sent`, sentFiles.ts). */
  sent?: SentFiles;
  onStep: (s: SendStep) => void;
  onOrder: (order: PlacedOrder) => void;
}): Promise<{ order: PlacedOrder; paidByTester: boolean; paidByBooking?: boolean }> {
  // The album's fonts first: one still downloading (or never got on this
  // phone) would make the check below stop the order.
  const fonts = await ensureAlbumFonts(fontStore, [...o.album.pages, o.album.coverFront]);
  const drawer = new PageDrawer(Skia, o.text);
  // Checked here, before any order row: a page the app can't draw stops it now.
  let files: ReturnType<typeof checkoutFiles>;
  try {
    files = checkoutFiles(
      { albumSize: o.album.albumSize, pages: o.album.pages, photoCount: o.album.photoUris.length, photoIds: o.album.photoIds, coverFront: o.album.coverFront },
      { cover: o.cover, material: o.material },
      phoneOpenPhoto(Skia, o.album.photoUris),
      { Skia, drawer, text: o.text, files: siteFile },
    );
  } catch (e) {
    drawer.dispose();
    if (e instanceof NotDrawnError && !fonts.ok) throw new Error(fonts.reason === 'offline' ? FONT_OFFLINE : FONT_FAILED);
    throw e;
  }
  try {
    // Every photo the pages and cover use, by its header, before any order row (bug hunt B-D5).
    const albumForCheck = { albumSize: o.album.albumSize, pages: o.album.pages, photoCount: o.album.photoUris.length, photoIds: o.album.photoIds, coverFront: o.album.coverFront };
    const used = photosUsed(albumForCheck, { cover: o.cover, material: o.material }, o.text);
    const wanted = [...new Set(used.map((u) => o.album.photoUris[u.index]).filter((u): u is string => !!u))];
    const looks = await inspectPhotos(wanted).catch(() => null);
    const gone = looks ? firstUnopenable(used, o.album.photoUris, looks) : null;
    if (gone) throw new PhotoGoneError(gone, !!o.placed);
    return await sendOrder(o.plan, { db, upload, makeCover: files.makeCover, makePages: files.makePages, onStep: o.onStep, onOrder: o.onOrder, clips, sent: o.sent }, o.placed);
  } finally {
    files.dispose();
    drawer.dispose();
  }
}

/** "I've sent ₱X": the receipt (if any) read from the phone, then the payment recorded. */
export async function sendPaymentFromPhone(plan: PaymentSubmitPlan, receipt: PickedReceipt | null): Promise<{ receiptError: string | null }> {
  let bytes: Uint8Array | null = null;
  if (plan.upload && receipt) {
    try {
      const { File } = await import('expo-file-system');
      bytes = await new File(receipt.uri).bytes();
    } catch {
      bytes = null;
    }
  }
  const r = await sendPayment(plan, bytes, { db, upload });
  if (plan.upload && receipt && !bytes) {
    return { receiptError: 'Could not upload your receipt (it could not be read on this phone). You can still tap "I\'ve sent the payment" — we\'ll confirm from our bank app.' };
  }
  return r;
}
