/* ══════════════════════════════════════════════════════════════════════════
   AN ORDER THAT DIDN'T FINISH SENDING (MP-2026-9M5572U, 2026-11-22).

   A Megy Mini with 4 video memories: the order row, the cover and the first
   video went up, then every try stopped at the second video. The live
   project takes at most 50 MB a file, and refused it with a 400; the app let
   videos up to 100 MB (200 MB in 2.1.5) through, so its pages were never
   made, nothing told the shop, and the customer was told to pay.

   This holds the fix, piece by piece:
     • a video over the server's cap is shrunk once more at a bitrate that
       fits; one that still doesn't fit stops Place order BEFORE the order
       row, with its page named (clips.ts, sendOrder.ts step 0b);
     • a video upload gets 3 tries with a time limit each; a "too large"
       answer is never tried again and says so in plain words;
     • Finish sending finishes THE SAME order from what it froze (its pages,
       its cover, its photo list matched to this phone's photos by id),
       sending only what isn't in the bucket yet (unsentOrders.ts);
     • "I've sent" refused for such an order (0068, MP030) says the
       database's plain words;
     • the keeper says how it went even when the person left the screen,
       and a stopped send is told to the shop (reportToShop.ts).
   ══════════════════════════════════════════════════════════════════════════ */
import type { AlbumPage, QrFill } from '@web/pages/builder/types';
import { HDR_MODE, isHdrFailure, shrinkWithHdrWays } from '../modules/video-shrink';
import { isOrderBeingSent, markOrderSending, startKeeper, startSending, type KeeperNative } from '../src/lib/checkout/backgroundSend';
import { reportToShop, shopReport } from '../src/lib/checkout/reportToShop';
import { OrderNotSentError, sendOrder, sendPayment, type ClipSender, type PlacedOrder, type SendDb, type SendDeps } from '../src/lib/checkout/sendOrder';
import {
  FINISH_PHOTOS_MISSING, finishAlbum, finishEndsOnPayment, finishPlan, listUnsentOrders, missingWords, unsentBody, unsentHeadline, type FinishOrderRow,
} from '../src/lib/checkout/unsentOrders';
import {
  CLIP_UPLOAD_WAITS_MS, ClipTooBigError, fitBitrate, isTooLargeError, makeClipStore, SERVER_UPLOAD_CAP_BYTES, tooBigClipMessage,
  type ClipDeps, type StagedClip,
} from '../src/lib/memories/clips';

jest.mock('expo-constants', () => ({ expoConfig: { version: '2.1.5' } }));

const MB = 1024 * 1024;

/* ── The phone's video store, with stand-ins ── */
function memFiles() {
  const present = new Set<string>();
  const sizes = new Map<string, number>();
  return {
    present, sizes,
    async keep(from: string, name: string) { const uri = `file:///kept/${name}`; present.add(uri); sizes.set(uri, sizes.get(from) ?? 1000); return uri; },
    async remove(uri: string) { present.delete(uri); },
    exists: (uri: string) => present.has(uri),
    size: (uri: string) => sizes.get(uri) ?? 0,
    bytes: async (uri: string) => new Uint8Array(Math.min(sizes.get(uri) ?? 0, 16)),
    shrunkPath: (code: string, stagedAt: number) => `file:///kept/${code}-${stagedAt}-small.mp4`,
  };
}
type StorageAnswer = { error: { message: string; statusCode?: string } | null };
function store(files: ReturnType<typeof memFiles>, over: Partial<ClipDeps> & { answers?: StorageAnswer[] } = {}) {
  const box = { index: {} as Record<string, StagedClip> };
  const uploads: string[] = [];
  const waits: number[] = [];
  const answers = over.answers ?? [];
  const d: ClipDeps = {
    readIndex: async () => JSON.parse(JSON.stringify(box.index)),
    writeIndex: async (i) => { box.index = JSON.parse(JSON.stringify(i)); },
    files,
    shrink: null,
    storage: {
      from: () => ({
        upload: async (p: string) => { uploads.push(p); return answers.shift() ?? { error: null }; },
        list: async () => ({ data: [], error: null }),
      }),
    },
    rpc: async () => ({ data: [], error: null }),
    wait: async (ms) => { waits.push(ms); },
    ...over,
  };
  return { s: makeClipStore(d), box, uploads, waits };
}
const kept = (code: string, size: number, over: Partial<StagedClip> = {}): StagedClip =>
  ({ code, ext: 'mp4', uri: `file:///kept/${code}-1.mp4`, size, durationSec: 120, name: `${code}.mp4`, stagedAt: 1, quality: 'standard', transcoded: true, ...over });

describe('a memory video and the server\'s 50 MB cap', () => {
  it('the cap is the live project\'s own (50 MB), whatever the bucket says', () => {
    expect(SERVER_UPLOAD_CAP_BYTES).toBe(50 * MB);
  });

  it('the bitrate that fits: a 2-minute video at about 3 Mbps; too long for any usable bitrate, or no length: none', () => {
    const b = fitBitrate(120)!;
    expect(b).toBeGreaterThan(3_000_000);
    expect(b).toBeLessThan(3_200_000);
    // 120 s at that bitrate plus 128 kbps sound stays under 46 MB.
    expect(((b + 128_000) * 120) / 8).toBeLessThanOrEqual(46 * MB);
    expect(fitBitrate(300)).toBeGreaterThan(1_000_000);
    expect(fitBitrate(900)).toBeNull();
    expect(fitBitrate(null)).toBeNull();
    expect(fitBitrate(0)).toBeNull();
  });

  it('Storage\'s "too large", in each way it says it', () => {
    expect(isTooLargeError({ message: 'The object exceeded the maximum allowed size', statusCode: '413' })).toBe(true);
    expect(isTooLargeError({ message: 'Payload too large' })).toBe(true);
    expect(isTooLargeError({ message: 'x', status: 413 })).toBe(true);
    expect(isTooLargeError({ message: 'new row violates row-level security policy', statusCode: '403' })).toBe(false);
    expect(isTooLargeError(null)).toBe(false);
  });

  it('a video over the cap after its shrink is shrunk once more at the bitrate that fits (720p), and that file is the one kept', async () => {
    const files = memFiles();
    const asked: (number | undefined)[] = [];
    const { s, box } = store(files, {
      shrink: async (_in, out, _q, _p, bitrate) => { asked.push(bitrate); files.present.add(out); files.sizes.set(out, 41 * MB); return { uri: out, size: 41 * MB }; },
    });
    const clip = kept('vid22222', 62 * MB);
    files.present.add(clip.uri); files.sizes.set(clip.uri, clip.size);
    box.index = { vid22222: clip };
    expect(await s.prepareStagedClips(['vid22222'])).toEqual([]);
    // The album's quality (Standard, 2.2 Mbps) when that already fits; the fit bitrate only below it.
    expect(asked).toEqual([2_200_000]);
    expect(box.index.vid22222).toMatchObject({ size: 41 * MB, ext: 'mp4', fitTried: 2 });
    expect(box.index.vid22222.uri).not.toBe(clip.uri);
    expect(files.present.has(clip.uri)).toBe(false); // the big one is gone from the phone
  });

  it('a video that can\'t be made to fit comes back as too big (tried once only); nothing is uploaded', async () => {
    const files = memFiles();
    let tries = 0;
    const { s, box, uploads } = store(files, { shrink: async () => { tries += 1; throw new Error('this phone can\'t read that video'); } });
    const clip = kept('vid22222', 62 * MB);
    files.present.add(clip.uri); files.sizes.set(clip.uri, clip.size);
    box.index = { vid22222: clip };
    expect(await s.prepareStagedClips(['vid22222'])).toEqual([{ code: 'vid22222', size: 62 * MB }]);
    expect(await s.prepareStagedClips(['vid22222'])).toEqual([{ code: 'vid22222', size: 62 * MB }]);
    expect(tries).toBe(1);
    // An update with a better shrinker (FIT_VERSION) tries it once more.
    box.index = { vid22222: { ...box.index.vid22222, fitTried: true } };
    await s.prepareStagedClips(['vid22222']);
    expect(tries).toBe(2);
    await expect(s.uploadClip(box.index.vid22222)).rejects.toBeInstanceOf(ClipTooBigError);
    expect(uploads).toEqual([]);
  });

  it('a video under the cap is left alone', async () => {
    const files = memFiles();
    const shrink = jest.fn();
    const { s, box } = store(files, { shrink });
    const clip = kept('vid22222', 30 * MB);
    files.present.add(clip.uri); files.sizes.set(clip.uri, clip.size);
    box.index = { vid22222: clip };
    expect(await s.prepareStagedClips(['vid22222'])).toEqual([]);
    expect(shrink).not.toHaveBeenCalled();
  });

  it('an upload that fails is tried 3 times (waiting 1.5 s, then 4 s); a "too large" answer is never tried again', async () => {
    const files = memFiles();
    const clip = kept('vid22222', 6 * MB);
    files.present.add(clip.uri); files.sizes.set(clip.uri, clip.size);
    const flaky = store(files, { answers: [{ error: { message: 'Bad Gateway', statusCode: '502' } }, { error: { message: 'Bad Gateway' } }, { error: null }] });
    await expect(flaky.s.uploadClip(clip)).resolves.toBeUndefined();
    expect(flaky.uploads).toHaveLength(3);
    expect(flaky.waits).toEqual(CLIP_UPLOAD_WAITS_MS);
    const refused = store(files, { answers: [{ error: { message: 'The object exceeded the maximum allowed size', statusCode: '413' } }] });
    const err = await refused.s.uploadClip(clip).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ClipTooBigError);
    expect((err as ClipTooBigError).clips).toEqual([{ code: 'vid22222', size: 6 * MB }]);
    expect(refused.uploads).toHaveLength(1);
  });

  it('the words name the page, the size and the most we take', () => {
    const page = (fills: (Partial<QrFill> | null)[]) => ({ qrFills: fills as QrFill[] });
    const pages = [page([null]), page([]), page([]), page([]), page([]), page([]), page([]), page([{ code: 'vid22222' }])];
    expect(tooBigClipMessage(pages, [{ code: 'vid22222', size: 62 * MB }]))
      .toBe('The memory video on page 8 is 62 MB, too big to send (we can take up to 50 MB). Open your album and choose a shorter video for the QR on page 8, then order.');
  });
});

/* ── Sending: stopped before the order row; finishing the same order ── */
function fakeDb() {
  const calls: string[] = [];
  const db: SendDb = {
    from: (t: string) => ({
      insert: () => ({ select: () => ({ single: async () => { calls.push(`insert ${t}`); return { data: { id: 'order-1', order_number: 'MP-1', status: 'pending_payment' }, error: null }; } }) }),
      upsert: async (rows: unknown[]) => { calls.push(`upsert ${t} ${rows.length}`); return { error: null }; },
    }),
    rpc: async (name: string) => { calls.push(`rpc ${name}`); return { data: null, error: null }; },
  };
  return { db, calls };
}
const clip = (code: string): QrFill => ({ code, destination: `https://x.test/storage/v1/object/public/memory-clips/${code}.mp4`, qrPngDataUrl: 'data:,', memoryUrl: `https://megyprints.vercel.app/m/${code}`, createdAt: 1, kind: 'clip' });
const link = (code: string): QrFill => ({ code, destination: 'https://youtu.be/abc', qrPngDataUrl: 'data:,', memoryUrl: `https://megyprints.vercel.app/m/${code}`, createdAt: 1, kind: 'link' });
const SNAPSHOT = {
  id: 'album-1', title: 'Our Mini', album_size: '5.8x8.3',
  photos: [{ id: 'p-a' }, { id: 'p-b' }, { id: 'p-c' }],
  pages: [
    { id: 'pg1', slotFills: [0, 1], qrFills: [clip('vid22222'), null] },
    { id: 'pg2', slotFills: [2], textSlotQr: [link('lnk33333')] },
  ] as unknown as AlbumPage[],
  cover_front: { id: 'cover', slotFills: [], background: { type: 'image', photoId: 'p-a' } },
};
const ORDER: FinishOrderRow = {
  id: 'order-9', order_number: 'MP-2026-9M5572U', status: 'pending_payment', payment_status: 'unpaid', payment_submitted_at: null,
  album_id: 'album-1', album_snapshot: SNAPSHOT, album_size: '5.8x8.3', cover: 'staple', material: 'glossy', page_count: 2,
  quoted_amount: 570, amount: null, created_at: '2026-11-22T08:36:49Z', tester_code: null,
};
function sender(o: { big?: { code: string; size: number }[] } = {}) {
  const calls: string[] = [];
  const s: ClipSender = {
    findMissing: async () => { calls.push('findMissing'); return []; },
    prepare: async () => { calls.push('prepare'); return o.big ?? []; },
    upload: async (codes) => { calls.push(`upload ${codes.join(',')}`); return { uploaded: codes, replaced: [] }; },
    extOf: async () => 'mp4',
    repoint: async () => true,
    supabaseUrl: 'https://x.test',
  };
  return { s, calls };
}
function sendDeps(db: SendDb, clips: ClipSender, sent: string[], over: Partial<SendDeps> = {}): SendDeps {
  return {
    db, clips,
    upload: async (_b, p) => { sent.push(p); return null; },
    makeCover: async () => new Uint8Array([1]),
    makePages: async () => new Uint8Array([2]),
    wait: async () => {},
    ...over,
  };
}

describe('Place order with a video too big to send', () => {
  it('stops BEFORE the order row: nothing made, nothing sent, the video named', async () => {
    const { db, calls } = fakeDb();
    const c = sender({ big: [{ code: 'vid22222', size: 62 * MB }] });
    const sent: string[] = [];
    const plan = { ...finishPlan(ORDER, 'user-1', 5), orderRow: { album_id: 'album-1' } };
    const err = await sendOrder(plan, sendDeps(db, c.s, sent)).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ClipTooBigError);
    expect(calls).toEqual([]);
    expect(sent).toEqual([]);
    expect(c.calls).toEqual(['findMissing', 'prepare']);
  });
});

describe('Finish sending: the same order, from what it froze', () => {
  it('the album as the order froze it, drawn from this phone\'s photos matched by id (the phone\'s list in another order)', () => {
    const phone = [{ id: 'p-c', previewUrl: 'file:///c.jpg' }, { id: 'p-a', previewUrl: 'file:///a.jpg' }, { id: 'p-b', previewUrl: 'file:///b.jpg' }];
    const a = finishAlbum(ORDER, phone);
    expect(a.pages).toBe(SNAPSHOT.pages);
    expect(a.photoIds).toEqual(['p-a', 'p-b', 'p-c']);
    expect(a.photoUris).toEqual(['file:///a.jpg', 'file:///b.jpg', 'file:///c.jpg']);
    expect(a.albumSize).toBe('5.8x8.3');
    expect(a.coverPhotoUri).toBe('file:///a.jpg');
  });

  it('a photo it prints isn\'t on this phone (a page\'s, or the cover\'s): said, nothing made', () => {
    expect(() => finishAlbum(ORDER, [{ id: 'p-a', previewUrl: 'a' }, { id: 'p-c', previewUrl: 'c' }])).toThrow(FINISH_PHOTOS_MISSING);
    expect(() => finishAlbum(ORDER, [{ id: 'p-b', previewUrl: 'b' }, { id: 'p-c', previewUrl: 'c' }])).toThrow(FINISH_PHOTOS_MISSING);
  });

  it('its steps: the cover, the video, the pages, the QR rows; no order row', () => {
    const p = finishPlan(ORDER, 'user-1', 5, new Date('2026-11-22T12:00:00Z'));
    expect(p.orderRow).toEqual({});
    expect(p.steps.map((s) => (s.kind === 'upload' ? `${s.bucket}/${s.path}` : s.kind))).toEqual([
      'print-pdfs/<order id>-cover.pdf', 'memory-clips/vid22222.<mp4|webm>', 'print-pdfs/<order id>.pdf', 'upsert', 'next',
    ]);
    const rows = p.steps.find((s) => s.kind === 'upsert');
    expect(rows && rows.kind === 'upsert' && rows.rows.map((r) => `${r.code}:${r.kind}`)).toEqual(['vid22222:clip', 'lnk33333:link']);
  });

  it('sent on the SAME order: no new row; the cover already there counts as sent; then the video, the pages and the rows', async () => {
    const { db, calls } = fakeDb();
    const c = sender();
    const sent: string[] = [];
    const placed: PlacedOrder = { id: 'order-9', order_number: 'MP-2026-9M5572U', status: 'pending_payment' };
    const r = await sendOrder(finishPlan(ORDER, 'user-1', 5), sendDeps(db, c.s, sent), placed);
    expect(r.order).toBe(placed);
    expect(calls).toEqual(['upsert qr_memories 2']);
    expect(sent).toEqual(['order-9-cover.pdf', 'order-9.pdf']);
    expect(c.calls).toEqual(['prepare', 'upload vid22222', 'upload vid22222']);
  });

  it('ends on the payment step while it still waits for one; paid already: "all sent"', () => {
    expect(finishEndsOnPayment(ORDER)).toBe(true);
    expect(finishEndsOnPayment({ ...ORDER, status: 'paid', payment_status: 'paid' })).toBe(false);
    expect(finishEndsOnPayment({ ...ORDER, status: 'in_production', payment_status: 'paid' })).toBe(false);
    expect(finishEndsOnPayment({ ...ORDER, payment_submitted_at: '2026-11-22T09:00:00Z' })).toBe(false);
  });

  it('the words: what never arrived, in the customer\'s words', () => {
    const missing = ['pages', 'video:83gph59m', 'video:ezftzzur', 'video:6nna5cr5', 'memory:83gph59m', 'memory:k4jfdswb'];
    expect(unsentHeadline('MP-2026-9M5572U')).toBe("Order MP-2026-9M5572U didn't finish sending");
    expect(unsentBody(missing)).toBe("The pages and 3 memory videos never reached us, so we can't print it yet. Tap Finish sending and keep the app open until it's done.");
    expect(missingWords(['cover', 'pages', 'video:a'])).toBe('the cover, the pages and 1 memory video');
    expect(missingWords(['memory:k4jfdswb'])).toBe('the QR codes’ videos and links');
  });

  it('the list is read from the database; a database before 0068 (or no connection) lists nothing', async () => {
    const row = { order_id: 'order-9', order_number: 'MP-2026-9M5572U', album_id: 'album-1', status: 'paid', created_at: 'x', missing: ['pages'] };
    expect(await listUnsentOrders({ rpc: async () => ({ data: [row], error: null }) })).toEqual([row]);
    expect(await listUnsentOrders({ rpc: async () => ({ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.my_unsent_orders' } }) })).toEqual([]);
    expect(await listUnsentOrders({ rpc: async () => { throw new Error('Network request failed'); } })).toEqual([]);
  });
});

describe('"I\'ve sent the payment" for an order that didn\'t finish sending (0068, MP030)', () => {
  it('the database\'s own words, not "Could not record your payment (…)"', async () => {
    const words = "This order didn't finish sending from your phone, so we can't print it yet. Open Your orders in the Megy Prints app on the phone you made the album on, tap Finish sending, then tap I've sent the payment again. If you already sent the money, it's safe: we'll match it to this order.";
    const db = { rpc: async () => ({ data: null, error: { code: 'MP030', message: words } }) } as unknown as SendDb;
    const err = await sendPayment({ upload: null, rpc: { name: 'submit_payment_proof', args: { p_order_id: 'order-9', p_reference: null } } } as never, null, { db, upload: async () => null }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(OrderNotSentError);
    expect((err as Error).message).toBe(words);
  });
});

/* ── The keeper, and the report to the shop ── */
function fakeNative() {
  const calls: { fn: string; args: unknown[] }[] = [];
  const native: KeeperNative = {
    notificationsAllowed: () => true,
    start: async (...args) => { calls.push({ fn: 'start', args }); return { service: true, task: true }; },
    update: (...args) => { calls.push({ fn: 'update', args }); },
    finish: async (...args) => { calls.push({ fn: 'finish', args }); },
  };
  return { native, calls };
}

describe('the keeper when the person left the "Placing your order" screen', () => {
  it('with the app open on another screen, the notification still says how it went (nothing else would)', async () => {
    const n = fakeNative();
    const k = await startKeeper('Placing…', { native: n.native, askToNotify: async () => true, appState: () => 'active' });
    await k.background;
    await k.failed('The memory video on page 8 is 62 MB, too big to send.', true);
    expect(n.calls.at(-1)).toEqual({ fn: 'finish', args: ['Placing your order stopped', 'The memory video on page 8 is 62 MB, too big to send.'] });
  });

  it('on the screen, in front: no notification (the screen says it), as before', async () => {
    const n = fakeNative();
    const k = await startKeeper('Placing…', { native: n.native, askToNotify: async () => true, appState: () => 'active' });
    await k.background;
    await k.sent({ order_number: 'MP-1' }, false);
    expect(n.calls.at(-1)).toEqual({ fn: 'finish', args: [null, null] });
  });

  it('an order being sent is known by its id until the send settles (Your orders doesn\'t call it unsent meanwhile)', () => {
    const done = startSending();
    markOrderSending('order-9');
    expect(isOrderBeingSent('order-9')).toBe(true);
    expect(isOrderBeingSent('order-1')).toBe(false);
    done();
    expect(isOrderBeingSent('order-9')).toBe(false);
  });
});

describe('a stopped send is told to the shop (the console\'s Errors tab)', () => {
  it('the step, the order, the app version and the message, as JSON to the website\'s error inbox; nothing personal', async () => {
    const posts: { url: string; body: unknown }[] = [];
    const e = new ClipTooBigError([{ code: 'vid22222', size: 62 * MB }]);
    await reportToShop(shopReport(e, { kind: 'app-order', step: 'videos', orderId: 'order-9', finishing: true }), async (url, init) => { posts.push({ url, body: JSON.parse(init.body) }); });
    expect(posts).toHaveLength(1);
    expect(posts[0].url).toBe('https://megyprints.vercel.app/api/client-error');
    expect(posts[0].body).toMatchObject({
      message: e.message,
      url: 'app://megyprints/order',
      context: { kind: 'app-order', step: 'videos', orderId: 'order-9', finishing: true, error: 'ClipTooBigError', app: '2.1.5' },
    });
  });

  it('a report that can\'t go is dropped: it never throws', async () => {
    await expect(reportToShop(shopReport(new Error('x'), { kind: 'app-order', step: null, orderId: null }), async () => { throw new Error('offline'); })).resolves.toBeUndefined();
  });
});

/* ── The phone's shrinker and HDR video (the native half: built on the PC) ── */
describe('an HDR video is shrunk too (reproduced 2026-11-22: a 10-bit HDR clip was kept at 71 MB)', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require('node:fs') as typeof import('node:fs');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require('node:path') as typeof import('node:path');
  const kt = fs.readFileSync(path.join(__dirname, '../modules/video-shrink/android/src/main/java/expo/modules/megyvideoshrink/VideoShrinkModule.kt'), 'utf8');

  it('the shrink tone-maps HDR to a normal video (Android 10+), through a Composition', () => {
    expect(kt).toContain('Composition.HDR_MODE_TONE_MAP_HDR_TO_SDR_USING_OPEN_GL');
    expect(kt).toContain('.setHdrMode(hdrMode)');
    expect(kt).toContain('Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q');
    expect(kt).toContain('transformer.start(composition, out.absolutePath)');
    expect(kt).not.toContain('transformer.start(item, out.absolutePath)');
  });

  it('a shrink that fails says why in the phone\'s log', () => {
    expect(kt).toContain('Log.w("MegyVideoShrink", "shrink failed: ${exportException.errorCodeName}');
  });
});

describe("an HDR video the phone can't tone-map with OpenGL (the emulator: no GL_EXT_YUV_target)", () => {
  const frameErr = Object.assign(new Error('ERROR_CODE_VIDEO_FRAME_PROCESSING_FAILED: Video frame processing error'), { code: 'ERR_SHRINK' });
  it("tries the phone's own tone-mapping (Android 12+), then reads it as a normal video", async () => {
    const tried: (number | undefined)[] = [];
    const r = await shrinkWithHdrWays(async (o) => { tried.push(o.hdrMode); if (o.hdrMode !== HDR_MODE.readAsNormal) throw frameErr; return 'ok'; }, 34);
    expect(r).toBe('ok');
    expect(tried).toEqual([undefined, HDR_MODE.toneMapMediaCodec, HDR_MODE.readAsNormal]);
  });
  it('Android 10–11: straight to reading it as normal; older: the original is kept (and checked against the cap)', async () => {
    const tried: (number | undefined)[] = [];
    await shrinkWithHdrWays(async (o) => { tried.push(o.hdrMode); if (o.hdrMode === undefined) throw frameErr; return 'ok'; }, 29);
    expect(tried).toEqual([undefined, HDR_MODE.readAsNormal]);
    await expect(shrinkWithHdrWays(async () => { throw frameErr; }, 28)).rejects.toBe(frameErr);
  });
  it('any other failure, or Stop, is not tried again', async () => {
    let n = 0;
    await expect(shrinkWithHdrWays(async () => { n++; throw Object.assign(new Error('ERROR_CODE_IO_FILE_NOT_FOUND: gone'), { code: 'ERR_SHRINK' }); }, 34)).rejects.toThrow('gone');
    await expect(shrinkWithHdrWays(async () => { n++; throw Object.assign(new Error('Stopped'), { code: 'ERR_CANCELLED' }); }, 34)).rejects.toThrow('Stopped');
    expect(n).toBe(2);
    expect(isHdrFailure(frameErr)).toBe(true);
  });
});
