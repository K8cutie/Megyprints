import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/* ══════════════════════════════════════════════════════════════════════════
   THE COVER REACHES US (MP-2026-KGCFSQN, 2026-10-22): the order was paid with
   no cover file. Checkout made the cover AFTER the album pages and carried on
   when it failed; the failure went to the phone's console only. Locked here:
     · checkout makes the cover FIRST (before the videos and the album pages),
       tries it 3 times, reports every failed try, and stops on failure;
     · Your orders' "Send the cover" makes it from the cover the ORDER froze,
       with the order's own size, cover and page count, only from this device's
       photos, and says so when the cover photo is somewhere else.
   ══════════════════════════════════════════════════════════════════════════ */

const h = vi.hoisted(() => ({
  row: null as unknown,
  rpcRows: [] as unknown[],
  uploads: [] as { path: string }[],
  uploadErrors: [] as ({ message: string } | null)[],
  made: [] as unknown[],
  reports: [] as { e: unknown; ctx: Record<string, unknown> }[],
}));

vi.mock('./supabase', () => {
  const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: h.row, error: null }) };
  return { supabase: { from: () => q, rpc: async () => ({ data: h.rpcRows, error: null }) } };
});
vi.mock('./storageUpload', () => ({
  uploadOnce: async (_b: string, path: string) => { h.uploads.push({ path }); return h.uploadErrors.shift() ?? null; },
}));
vi.mock('../pages/builder/generateAlbumPdf', () => ({
  generateAlbumPdf: async () => new Blob(['pages']),
  generateCoverWrapPdf: async (input: unknown) => { h.made.push(input); return new Blob(['%PDF cover']); },
}));
vi.mock('./report', () => ({ reportError: (e: unknown, ctx: Record<string, unknown>) => h.reports.push({ e, ctx }) }));

import { uploadOrderCoverPdfWithRetry } from './orders';
import { myOrdersMissingCover, sendOrderCover, COVER_PHOTO_NOT_HERE } from './orderCover';
import { PhotosNotHereError } from './photoPresence';

// The shape of MP-2026-KGCFSQN's cover: an album photo as the whole background,
// the hero frame empty, one title floated up.
const frozenCover = {
  id: 'cover-front-1', layout: 'freeform', size: '6x6', templateId: 'cover-hero',
  background: { type: 'image', image: 'blob:https://megyprints.vercel.app/dead', photoId: 'ph7', opacity: 100 },
  photos: [], textElements: [{ id: 't', text: 'Our Trip', boxIndex: 0, x: 0, y: 0, rotation: 0, opacity: 1, fontSize: 42, color: '#fff' }],
  slotFills: [null],
};
const snapPhotos = Array.from({ length: 10 }, (_, i) => ({ id: `ph${i}`, name: `2026101${i}_101010.jpg` }));
const orderRow = (over: Record<string, unknown> = {}) => ({
  id: 'order-1', album_size: '6x6', cover: 'softcover', page_count: 130, cover_front: frozenCover, photos: snapPhotos, ...over,
});
const stored = (id: string) => ({ id, name: `${id}.jpg`, type: 'image/jpeg', size: 10, width: 4000, height: 3000, storedAt: '2026-10-21T08:00:00Z', blob: new Blob(['x']), url: `blob:live/${id}` });

beforeEach(() => {
  h.row = orderRow(); h.rpcRows = []; h.uploads = []; h.uploadErrors = []; h.made = []; h.reports = [];
});
afterEach(() => { vi.useRealTimers(); });

describe('uploadOrderCoverPdfWithRetry', () => {
  const input = { albumSize: '6x6', pageCount: 40, cover: 'softcover', coverDesign: {}, photos: [] } as never;
  it('a failed try is tried again, and every failure is heard', async () => {
    h.uploadErrors = [{ message: 'network' }, { message: 'network' }, null];
    const heard: number[] = [];
    await uploadOrderCoverPdfWithRetry('o1', input, (_e, n) => heard.push(n), [0, 0]);
    expect(h.uploads.map((u) => u.path)).toEqual(['o1-cover.pdf', 'o1-cover.pdf', 'o1-cover.pdf']);
    expect(heard).toEqual([1, 2]);
  });
  it('after 3 failed tries it throws the last error', async () => {
    h.uploadErrors = [{ message: 'a' }, { message: 'b' }, { message: 'c' }];
    await expect(uploadOrderCoverPdfWithRetry('o1', input, undefined, [0, 0])).rejects.toThrow('Cover file upload failed: c');
    expect(h.uploads).toHaveLength(3);
  });
});

describe('checkout makes the cover first, and stops without one', () => {
  const orderPage = readFileSync(join(__dirname, '../pages/Order.tsx'), 'utf8');
  const place = orderPage.slice(orderPage.indexOf('const placeOrder = async'), orderPage.indexOf('const handlePaymentSent'));
  const cover = place.indexOf('await uploadOrderCoverPdfWithRetry(');
  it('before the memory videos and the album pages', () => {
    expect(cover).toBeGreaterThan(0);
    expect(cover).toBeLessThan(place.indexOf("setPrepMsg('Uploading your memory videos…')"));
    expect(cover).toBeLessThan(place.indexOf('await uploadOrderPrintPdf('));
    expect(cover).toBeGreaterThan(place.indexOf('createOrderFromAlbum('));
  });
  it('a failure stops checkout (no more "order still placed"), and each try is reported', () => {
    const block = place.slice(cover, place.indexOf("setPrepMsg('Uploading your memory videos…')"));
    expect(block).toMatch(/catch \(e\) \{[\s\S]*throw new Error\(sending/);
    expect(block).toContain("step: 'cover_pdf', attempt");
    expect(place).not.toMatch(/order still placed/);
    expect(place).not.toContain('uploadOrderCoverPdf(order.id');
  });
  it("a rebuilt job's cover photos are checked before anything is made", () => {
    const check = place.indexOf('missingPhotos([], printJob.photos, printJob.coverFront)');
    expect(check).toBeGreaterThan(0);
    expect(check).toBeLessThan(cover);
  });
});

describe('myOrdersMissingCover', () => {
  it('the order ids the database lists', async () => {
    h.rpcRows = [{ order_id: 'a' }, { order_id: 'b' }];
    expect([...(await myOrdersMissingCover())]).toEqual(['a', 'b']);
  });
});

describe('sendOrderCover', () => {
  it("makes the cover the ORDER froze, at the order's size and page count, from this device's photo", async () => {
    const asked: string[] = [];
    await sendOrderCover('user-1', 'order-1', async (id) => { asked.push(id); return stored(id); });
    expect(asked).toEqual(['ph7']); // only the cover's photo, not all 10
    expect(h.uploads.map((u) => u.path)).toEqual(['order-1-cover.pdf']);
    const made = h.made[0] as { albumSize: string; pageCount: number; cover: string; coverFront: { background: { photoId: string } }; photos: { id: string; previewUrl: string }[] };
    expect(made).toMatchObject({ albumSize: '6x6', pageCount: 130, cover: 'softcover' });
    expect(made.coverFront.background.photoId).toBe('ph7');
    // Full length and in order (frames point at photos by position).
    expect(made.photos.map((p) => p.id)).toEqual(snapPhotos.map((p) => p.id));
    expect(made.photos.filter((p) => p.previewUrl).map((p) => p.id)).toEqual(['ph7']);
  });

  it('a frame photo on the cover is read by its position', async () => {
    h.row = orderRow({ cover_front: { ...frozenCover, background: { type: 'solid', solid: '#123' }, slotFills: [3] } });
    const asked: string[] = [];
    await sendOrderCover('user-1', 'order-1', async (id) => { asked.push(id); return stored(id); });
    expect(asked).toEqual(['ph3']);
  });

  it("the cover photo isn't on this device → says where to go, and makes nothing", async () => {
    const err = await sendOrderCover('user-1', 'order-1', async () => null).catch((e) => e);
    expect(err).toBeInstanceOf(PhotosNotHereError);
    expect(err.message).toBe(COVER_PHOTO_NOT_HERE);
    expect(h.made).toEqual([]);
    expect(h.uploads).toEqual([]);
  });

  it("a cover's own uploaded photo must be on this device too", async () => {
    h.row = orderRow({ cover_front: { ...frozenCover, background: { type: 'image', image: 'blob:dead', localPhotoId: 'cover-a1-x' } } });
    const err = await sendOrderCover('user-1', 'order-1', async () => null).catch((e) => e);
    expect(err).toBeInstanceOf(PhotosNotHereError);
    h.made = [];
    await sendOrderCover('user-1', 'order-1', async (id) => stored(id));
    expect((h.made[0] as { coverFront: { background: { image: string } } }).coverFront.background.image).toBe('blob:live/cover-a1-x');
  });

  it('an order with no frozen cover, or not mine → a plain message, nothing made', async () => {
    h.row = orderRow({ cover_front: null });
    await expect(sendOrderCover('user-1', 'order-1', async (id) => stored(id))).rejects.toThrow("couldn't find this order's cover");
    h.row = null;
    await expect(sendOrderCover('user-1', 'order-1', async (id) => stored(id))).rejects.toThrow("couldn't find this order's cover");
    expect(h.made).toEqual([]);
  });

  it('a failed upload is tried 3 times and each failure reported', async () => {
    vi.useFakeTimers();
    h.uploadErrors = [{ message: 'net' }, { message: 'net' }, { message: 'net' }];
    const p = sendOrderCover('user-1', 'order-1', async (id) => stored(id)).catch((e) => e);
    await vi.runAllTimersAsync();
    const err = await p;
    expect(err).toBeInstanceOf(Error);
    expect(h.uploads).toHaveLength(3);
    expect(h.reports.map((r) => r.ctx)).toEqual([1, 2, 3].map((attempt) => ({ path: 'your_orders', step: 'send_cover', attempt, orderId: 'order-1', pages: 130 })));
  });
});
