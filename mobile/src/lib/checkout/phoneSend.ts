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
import { checkoutFiles } from '../../print/printFiles';
import { phoneOpenPhoto } from '../../print/phonePhotos';
import { supabase, supabaseUrl } from '../supabase';
import { clipStore } from '../memories/clipStore';
import { relinkMemory } from '../memories/memories';
import type { CheckoutAlbum, PlaceOrderPlan } from './orderPayload';
import type { PaymentSubmitPlan } from './payment';
import type { PickedReceipt } from './receipt';
import { sendOrder, sendPayment, type ClipSender, type PlacedOrder, type SendDb, type SendStep } from './sendOrder';
import { createOnlyUpload } from './storage';

const db = supabase as unknown as SendDb;
const upload = createOnlyUpload(supabase as unknown as Parameters<typeof createOnlyUpload>[0]);

/** The memory videos' part of Place order. */
const clips: ClipSender = {
  findMissing: (codes) => clipStore.findMissingClips(codes),
  upload: (codes, onProgress) => clipStore.uploadStagedClips(codes, onProgress),
  extOf: async (code) => (await clipStore.getStagedClip(code))?.ext ?? null,
  repoint: (code, destination) => relinkMemory(supabase as never, code, destination),
  supabaseUrl,
};

/** Place order: the files made on this phone, the order sent. `placed`: the
 *  order a failed try already made (reused, never a second one). */
export async function sendFromPhone(o: {
  plan: PlaceOrderPlan;
  album: CheckoutAlbum;
  cover: CoverType;
  material: MaterialType;
  text: PageText;
  placed: PlacedOrder | null;
  onStep: (s: SendStep) => void;
  onOrder: (order: PlacedOrder) => void;
}): Promise<{ order: PlacedOrder; paidByTester: boolean; paidByBooking?: boolean }> {
  const drawer = new PageDrawer(Skia, o.text);
  // Checked here, before any order row: a page the app can't draw stops it now.
  const files = checkoutFiles(
    { albumSize: o.album.albumSize, pages: o.album.pages, photoCount: o.album.photoUris.length, photoIds: o.album.photoIds, coverFront: o.album.coverFront },
    { cover: o.cover, material: o.material },
    phoneOpenPhoto(Skia, o.album.photoUris),
    { Skia, drawer, text: o.text },
  );
  try {
    return await sendOrder(o.plan, { db, upload, makeCover: files.makeCover, makePages: files.makePages, onStep: o.onStep, onOrder: o.onOrder, clips }, o.placed);
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
