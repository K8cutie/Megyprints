/* ══════════════════════════════════════════════════════════════════════════
   SENDING THE ORDER (Phase 5, step 3: src/lib/checkout/sendOrder.ts).

   checkoutPayload.test.ts proves the app's Place-order PLAN (placeOrderPlan:
   the order row, the files, the memory rows, the calls) is the website's,
   piece by piece. This proves the app SENDS that plan, the website's way:
     • the whole sequence of writes equals the website's own functions run
       in Order.tsx placeOrder's order (createOrderFromAlbum, the cover with
       its retries, the pages, ensureMemoriesForFills, claimTesterOrder), on
       the same stand-in database;
     • a retry reuses the order (no second order row), and a file already in
       the bucket counts as sent (create-only, storageUpload uploadOnce);
     • the cover is tried 3 times, waiting 1.5 s then 4 s, then the website's
       words (sending or making); the pages, the tester claim, the unpaid
       limit and a tester code that stopped: the website's words;
     • memory videos (the website's steps 0, 2b and 3c): a video that's gone
       stops it before any order row exists; the kept videos are uploaded
       after the cover and checked again after the pages; their rows are
       required and point at the file actually sent;
     • "I've sent ₱X": the receipt, then submit_payment_proof; a receipt that
       didn't go up still records the payment, as on the website.
   Nothing leaves the computer: the database and the uploads are stand-ins.
   ══════════════════════════════════════════════════════════════════════════ */
import type { AddressValue } from '@web/lib/contact';
import type { AlbumPage, QrFill } from '@web/pages/builder/types';
import { UnpaidLimitError } from '@web/lib/orderExpiry';
import { fixtureCheckoutAlbum } from '../src/lib/checkout/fixtureAlbum';
import { placeOrderPlan, type OrderAlbumRow, type PlanInput } from '../src/lib/checkout/orderPayload';
import { paymentSubmitPlan } from '../src/lib/checkout/payment';
import { TesterCodeGoneError } from '../src/lib/checkout/testerCode';
import {
  COVER_MAKE_FAILED, COVER_SEND_FAILED, MEMORY_ROWS_FAILED, MemoryVideosNotInAppError, ORDER_OFFLINE, PAGES_SEND_FAILED, sendOrder, sendPayment, TESTER_CLAIM_FAILED,
  type ClipSender, type PlacedOrder, type SendDeps, type SendStep,
} from '../src/lib/checkout/sendOrder';
import { createOnlyUpload, isAlreadyExists } from '../src/lib/checkout/storage';
import { MissingClipError } from '../src/lib/memories/clips';
import { fake, fakeClient, rec, resetFake } from './helpers/fakeSupabase';

jest.mock('@web/lib/supabase', () => jest.requireActual('./helpers/fakeSupabase').supabaseModule);
jest.mock('@web/lib/storageUpload', () => jest.requireActual('./helpers/fakeSupabase').storageUploadModule);
jest.mock('@web/pages/builder/generateAlbumPdf', () => ({
  generateAlbumPdf: async () => ({ size: 1 }),
  generateCoverWrapPdf: async () => ({ size: 1 }),
}));

type AnyFn = (...args: any[]) => Promise<any>; // eslint-disable-line @typescript-eslint/no-explicit-any
/* eslint-disable @typescript-eslint/no-require-imports */
const web = {
  orders: require('@web/lib/orders') as { createOrderFromAlbum: AnyFn; uploadOrderCoverPdfWithRetry: AnyFn; uploadOrderPrintPdf: AnyFn },
  qr: require('@web/lib/qrMemories') as { ensureMemoriesForFills: AnyFn },
  tester: require('@web/lib/testerCode') as { claimTesterOrder: AnyFn },
  payment: require('@web/lib/payment') as { uploadPaymentProof: AnyFn; submitPaymentProof: AnyFn; cleanReference: (s: string) => string },
};
/* eslint-enable @typescript-eslint/no-require-imports */

const NOW = new Date('2026-11-02T03:04:05.678Z');
const fixture = fixtureCheckoutAlbum();
const COVER = new Uint8Array([1, 2, 3]);
const PAGES = new Uint8Array([4, 5, 6, 7]);

function address(): AddressValue {
  return { regionCode: '13', regionName: 'NCR', provinceCode: 'NCR', provinceName: 'Metro Manila', cityCode: '1374000000', cityName: 'Quezon City', barangayCode: '1374000001', barangayName: 'Alicia', street: '12 Mabini St', zip: '1105' };
}
function qrFill(code: string, kind: 'link' | 'clip'): QrFill {
  return { code, destination: `https://example.test/${code}`, qrPngDataUrl: 'data:image/png;base64,AAAA', memoryUrl: `https://megyprints.vercel.app/m/${code}`, createdAt: 1, kind };
}
/** The test album with a link memory on page 4 (and, with `clip`, a video on page 10). */
function album(clip = false): { row: OrderAlbumRow; pages: AlbumPage[] } {
  const pages = fixture.pages.map((p, i) => (i === 3 ? { ...p, qrFills: [qrFill('MEMLINK1', 'link'), null] }
    : clip && i === 9 ? { ...p, textSlotQr: [qrFill('MEMCLIP1', 'clip')] } : p));
  return { row: { ...fixture.row, pages }, pages };
}
function input(over: Partial<PlanInput> = {}, clip = false): PlanInput {
  const a = album(clip);
  return {
    userId: 'user-1', album: a.row, pages: a.pages, specs: { material: 'matte', cover: 'softcover', size: '8x8' },
    shipping: { name: 'Jose Rizal', phone: '09171234567', address: address() }, hostingYears: null, hdMemories: false,
    testerCode: null, includedYears: 5, now: NOW, ...over,
  };
}

/** The app's stand-ins: the database, the uploads (writing down what is sent,
 *  as the website's stand-in does), the file makers, and the waits. */
function deps(over: Partial<SendDeps> = {}): SendDeps & { waits: number[]; steps: SendStep[]; made: string[] } {
  const waits: number[] = [];
  const steps: SendStep[] = [];
  const made: string[] = [];
  return {
    db: fakeClient as unknown as SendDeps['db'],
    upload: async (bucket, path, body, opts) => {
      rec.uploads.push({ bucket, path, contentType: opts.contentType, opts: { ...opts } });
      expect(body).toBeInstanceOf(Uint8Array);
      return null;
    },
    makeCover: async () => { made.push('cover'); return COVER; },
    makePages: async (onPage) => { made.push('pages'); onPage(1, 2, false); onPage(2, 2, false); return PAGES; },
    wait: async (ms) => { waits.push(ms); },
    onStep: (s) => { steps.push(s); },
    waits, steps, made,
    ...over,
  };
}

beforeEach(resetFake);

describe('Place order sends what the website sends, in its order', () => {
  for (const tester of [false, true]) {
    it(`${tester ? 'a tester order' : 'a paid order'}: the same writes as the website's own functions`, async () => {
      const i = input({ testerCode: tester ? 'MEGYTEST' : null });
      // The website, in Order.tsx placeOrder's order.
      fake.albumRow = i.album as unknown as Record<string, unknown>;
      const created = await web.orders.createOrderFromAlbum({
        userId: 'user-1', albumId: i.album.id, specs: i.specs, shipping: i.shipping, amount: 0,
        hostingYears: null, hdMemories: false, testerCode: i.testerCode,
      });
      await web.orders.uploadOrderCoverPdfWithRetry(created.id, {} as never, undefined, []);
      await web.orders.uploadOrderPrintPdf(created.id, { pages: [], photos: [], albumSize: '8x8' } as never, 'softcover');
      const fills = i.pages.flatMap((p) => [...(p.qrFills ?? []), ...(p.textSlotQr ?? [])]);
      await web.qr.ensureMemoriesForFills(fills, { hostingYears: 5 });
      if (tester) await web.tester.claimTesterOrder(created.id);
      const website = { inserts: rec.inserts.splice(0), uploads: rec.uploads.splice(0), upserts: rec.upserts.splice(0), rpcs: rec.rpcs.splice(0) };

      const d = deps();
      const r = await sendOrder(placeOrderPlan(i), d);
      expect(r.order.id).toBe('order-1');
      expect(r.paidByTester).toBe(tester);
      const stamp = (rows: { row: Record<string, unknown> }[]) => rows.map((x) => ({ ...x.row, status_history: null }));
      expect(stamp(rec.inserts)).toEqual(stamp(website.inserts));
      expect(rec.uploads).toEqual(website.uploads);
      expect(rec.upserts.map((u) => ({ ...u, rows: (u.rows as { created_at?: string }[]).map((x) => ({ ...x, created_at: null })) })))
        .toEqual(website.upserts.map((u) => ({ ...u, rows: (u.rows as { created_at?: string }[]).map((x) => ({ ...x, created_at: null })) })));
      expect(rec.rpcs).toEqual(website.rpcs);
      // The cover is made before the pages, as at checkout (the most memory free).
      expect(d.made).toEqual(['cover', 'pages']);
      // "Making your print file" shows before the first page is done, then each page.
      expect(d.steps.map((s) => s.step)).toEqual(['order', 'cover', 'pages', 'pages', 'pages', 'sending', 'memories', ...(tester ? ['finishing'] : [])]);
      expect(d.steps.filter((s) => s.step === 'pages')).toEqual([
        { step: 'pages', done: 0, total: 0, smaller: false }, { step: 'pages', done: 1, total: 2, smaller: false }, { step: 'pages', done: 2, total: 2, smaller: false },
      ]);
    });
  }
});

describe('a retry, and files already sent', () => {
  it('the order is handed over as soon as it exists, before any file (so a retry can reuse it)', async () => {
    const seen: string[] = [];
    const d = deps({ onOrder: (o) => { seen.push(`order ${o.id}`); }, makeCover: async () => { seen.push('cover'); return COVER; } });
    await sendOrder(placeOrderPlan(input()), d);
    expect(seen).toEqual(['order order-1', 'cover']);
  });

  it('a file already there is "done" by the website\'s own rule (storageUpload isAlreadyExists)', async () => {
    /* eslint-disable-next-line @typescript-eslint/no-require-imports */
    const webStorage = jest.requireActual('@web/lib/storageUpload') as { isAlreadyExists: (e: unknown) => boolean };
    const cases = [null, { status: 409 }, { statusCode: '409' }, { statusCode: 409 }, { message: 'The resource already exists' }, { message: 'Duplicate' },
      { message: 'new row violates row-level security policy', status: 403 }, { message: 'network' }, {}];
    for (const e of cases) expect(isAlreadyExists(e as never)).toBe(webStorage.isAlreadyExists(e));
    // The app's upload on a Supabase client: create-only, an ArrayBuffer, and a 409 counts as sent.
    const asked: unknown[] = [];
    const client = { storage: { from: (bucket: string) => ({ upload: async (path: string, body: ArrayBuffer, opts: unknown) => {
      asked.push({ bucket, path, bytes: body.byteLength, opts });
      return { error: path.endsWith('cover.pdf') ? { status: 409, message: 'Duplicate' } : path.endsWith('x.pdf') ? { message: 'denied' } : null };
    } }) } };
    const up = createOnlyUpload(client);
    expect(await up('print-pdfs', 'o-cover.pdf', COVER, { contentType: 'application/pdf' })).toBeNull();
    expect(await up('print-pdfs', 'o.pdf', PAGES, { contentType: 'application/pdf' })).toBeNull();
    expect(await up('print-pdfs', 'x.pdf', PAGES, { contentType: 'application/pdf' })).toEqual({ message: 'denied' });
    expect(asked[0]).toEqual({ bucket: 'print-pdfs', path: 'o-cover.pdf', bytes: 3, opts: { contentType: 'application/pdf', upsert: false } });
  });

  it('Place order again reuses the order: no second order row', async () => {
    const plan = placeOrderPlan(input());
    const placed: PlacedOrder = { id: 'order-1', order_number: 'MP-2026-TEST01', status: 'pending_payment' };
    const r = await sendOrder(plan, deps(), placed);
    expect(r.order).toBe(placed);
    expect(rec.inserts).toHaveLength(0);
    expect(rec.uploads.map((u) => u.path)).toEqual(['order-1-cover.pdf', 'order-1.pdf']);
  });

  it('Place order again after the pages failed: the cover sent on the first try is not sent (nor made) again', async () => {
    // Beta round 2 (Mother): the cover sent again answered 409 at once, and
    // the pages file after it, on the same connection, got 502 every time.
    const sent = new Set<string>();
    let pagesFail = true;
    const log = (path: string) => { rec.uploads.push({ bucket: 'print-pdfs', path, opts: {} }); };
    const first = deps({ sent, upload: async (_b, path) => { log(path); return path === 'order-1.pdf' && pagesFail ? { message: 'reset' } : null; } });
    await expect(sendOrder(placeOrderPlan(input()), first)).rejects.toThrow(PAGES_SEND_FAILED);
    expect([...sent]).toEqual(['order-1-cover.pdf']);
    rec.uploads = [];
    pagesFail = false;
    const again = deps({ sent, upload: async (_b, path) => { log(path); return null; } });
    await sendOrder(placeOrderPlan(input()), again, { id: 'order-1', order_number: 'MP-2026-TEST01', status: 'pending_payment' });
    expect(rec.uploads.map((u) => u.path)).toEqual(['order-1.pdf']);
    expect(again.made).toEqual(['pages']);
    expect([...sent].sort()).toEqual(['order-1-cover.pdf', 'order-1.pdf']);
  });

  it('a file already in the bucket (an earlier try) counts as sent', async () => {
    const d = deps({ upload: async () => null });
    await expect(sendOrder(placeOrderPlan(input()), d, { id: 'order-1', order_number: 'X', status: 'pending_payment' })).resolves.toBeTruthy();
  });
});

describe('when something fails: the website\'s words', () => {
  it('the cover is tried 3 times, waiting 1.5 s then 4 s; then "couldn\'t send", the order kept', async () => {
    let tries = 0;
    const d = deps({ upload: async (_b, path) => { if (path.endsWith('-cover.pdf')) { tries++; return { message: 'network' }; } return null; } });
    await expect(sendOrder(placeOrderPlan(input()), d)).rejects.toThrow(COVER_SEND_FAILED);
    expect(tries).toBe(3);
    expect(d.waits).toEqual([1500, 4000]);
    expect(rec.inserts).toHaveLength(1);
    expect(COVER_SEND_FAILED).toBe("We couldn't send your album's cover. Your order is saved: check your internet, then tap Place order again.");
  });

  it('the cover can\'t be made on this phone: "couldn\'t make", after 3 tries', async () => {
    let tries = 0;
    const d = deps({ makeCover: async () => { tries++; throw new Error('out of memory'); } });
    await expect(sendOrder(placeOrderPlan(input()), d)).rejects.toThrow(COVER_MAKE_FAILED);
    expect(tries).toBe(3);
    expect(COVER_MAKE_FAILED).toBe("We couldn't make your album's cover on this phone. Your order is saved: close your other apps, then tap Place order again. If it keeps happening, message us.");
  });

  it('the pages file that didn\'t go up: tried 3 times, the same file (made once), then plain words, nothing after it', async () => {
    let tries = 0;
    const d = deps({ upload: async (_b, path) => { if (path === 'order-1.pdf') { tries++; return { message: 'An invalid response was received from the upstream server' }; } return null; } });
    await expect(sendOrder(placeOrderPlan(input({ testerCode: 'MEGYTEST' })), d)).rejects.toThrow(PAGES_SEND_FAILED);
    expect(tries).toBe(3);
    expect(d.made).toEqual(['cover', 'pages']);
    expect(d.waits).toEqual([1500, 4000]);
    expect(rec.upserts).toHaveLength(0);
    expect(rec.rpcs).toHaveLength(0);
    expect(PAGES_SEND_FAILED).toBe("We couldn't send your album's pages. Your order is saved: check your internet, then tap Place order again.");
  });

  it('the pages file that went up on its second try: the order goes on', async () => {
    let tries = 0;
    const d = deps({ upload: async (_b, path) => (path === 'order-1.pdf' && ++tries === 1 ? { message: 'reset' } : null) });
    await expect(sendOrder(placeOrderPlan(input({ testerCode: 'MEGYTEST' })), d)).resolves.toMatchObject({ paidByTester: true });
    expect(tries).toBe(2);
    expect(d.made).toEqual(['cover', 'pages']);
  });

  it('no connection when the order is placed: plain words, not the phone\'s error', async () => {
    fake.insertError = { message: 'Error: fetch failed: java.net.ConnectException: Failed to connect to /10.0.2.2:59321' };
    await expect(sendOrder(placeOrderPlan(input()), deps())).rejects.toThrow(ORDER_OFFLINE);
    fake.insertError = { message: 'TypeError: Network request failed' };
    await expect(sendOrder(placeOrderPlan(input()), deps())).rejects.toThrow(ORDER_OFFLINE);
    expect(ORDER_OFFLINE).toBe("We couldn't reach Megy Prints. Check your internet, then tap Place order again.");
  });

  it('three unpaid orders already, and a tester code that stopped: the website\'s errors, nothing sent', async () => {
    fake.insertError = { message: 'too many', code: 'MP001' };
    await expect(sendOrder(placeOrderPlan(input()), deps())).rejects.toBeInstanceOf(UnpaidLimitError);
    fake.insertError = { message: 'gone', code: 'MP007' };
    await expect(sendOrder(placeOrderPlan(input({ testerCode: 'MEGYTEST' })), deps())).rejects.toBeInstanceOf(TesterCodeGoneError);
    fake.insertError = { message: 'boom' };
    await expect(sendOrder(placeOrderPlan(input()), deps())).rejects.toThrow('Could not place your order: boom');
    expect(rec.uploads).toHaveLength(0);
  });

  it('the free tester order that couldn\'t be finished: the website\'s words', async () => {
    fake.rpc.claim_tester_order = { data: null, error: { message: 'nope' } };
    await expect(sendOrder(placeOrderPlan(input({ testerCode: 'MEGYTEST' })), deps())).rejects.toThrow(TESTER_CLAIM_FAILED);
    expect(TESTER_CLAIM_FAILED).toBe("We couldn't finish your free tester order. Your order is saved: tap Place order again.");
  });

  it('memory videos with no way to send them (an older caller): stopped before any order row', async () => {
    await expect(sendOrder(placeOrderPlan(input({}, true)), deps())).rejects.toBeInstanceOf(MemoryVideosNotInAppError);
    expect(rec.inserts).toHaveLength(0);
    expect(rec.uploads).toHaveLength(0);
  });
});

/** The memory videos' stand-in: what was asked, in order. */
function clipSender(over: Partial<ClipSender> & { missing?: string[]; ext?: string | null; replaced?: string[] } = {}) {
  const calls: unknown[] = [];
  const sender: ClipSender = {
    findMissing: async (codes) => { calls.push(['findMissing', codes]); return over.missing ?? []; },
    upload: async (codes, onProgress) => {
      calls.push(['upload', codes]);
      onProgress?.(0, codes.length, 'compress');
      onProgress?.(1, codes.length, 'upload');
      return { uploaded: codes, replaced: over.replaced ?? [] };
    },
    extOf: async (code) => { calls.push(['extOf', code]); return (over.ext === undefined ? 'mp4' : over.ext) as never; },
    repoint: async (code, destination) => { calls.push(['repoint', code, destination]); return true; },
    supabaseUrl: 'https://example.supabase.co',
    ...over,
  };
  return { sender, calls };
}

describe('an event album: its booking pays (Order.tsx 5a)', () => {
  it('the files sent, then the website\'s cover_order_with_booking; no payment step', async () => {
    /* eslint-disable-next-line @typescript-eslint/no-require-imports */
    const webEvent = require('@web/lib/eventAlbum') as { coverOrderWithBooking: AnyFn };
    await webEvent.coverOrderWithBooking('order-1', 'booking-9');
    const website = rec.rpcs.splice(0);
    const d = deps();
    const r = await sendOrder(placeOrderPlan(input({ eventBookingId: 'booking-9' })), d);
    expect(r.paidByBooking).toBe(true);
    expect(r.paidByTester).toBe(false);
    expect(rec.rpcs).toEqual(website);
    expect(rec.uploads.map((u) => u.path)).toEqual(['order-1-cover.pdf', 'order-1.pdf']);
    expect(d.steps.map((s) => s.step).slice(-2)).toEqual(['memories', 'booking']);
  });

  it('a booking that can\'t pay: the database\'s own sentence', async () => {
    fake.rpc.cover_order_with_booking = { data: null, error: { message: 'Booking EV-2026-0001 already paid for an album order.', code: 'EV007' } };
    await expect(sendOrder(placeOrderPlan(input({ eventBookingId: 'booking-9' })), deps())).rejects.toThrow('Booking EV-2026-0001 already paid for an album order.');
  });
});

describe('memory videos: the website\'s steps 0, 2b and 3c', () => {
  it('a video that is gone stops it before any order row, naming the video', async () => {
    const c = clipSender({ missing: ['MEMCLIP1'] });
    const err = await sendOrder(placeOrderPlan(input({}, true)), deps({ clips: c.sender })).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MissingClipError);
    expect((err as MissingClipError).codes).toEqual(['MEMCLIP1']);
    expect(rec.inserts).toHaveLength(0);
    expect(rec.uploads).toHaveLength(0);
  });

  it('checked, ordered, cover, videos, pages, checked again, then the rows pointing at the file sent', async () => {
    const c = clipSender();
    const d = deps({ clips: c.sender });
    await sendOrder(placeOrderPlan(input({}, true)), d);
    expect(c.calls).toEqual([
      ['findMissing', ['MEMCLIP1']],
      ['upload', ['MEMCLIP1']],
      ['upload', ['MEMCLIP1']],
      ['extOf', 'MEMCLIP1'],
      // The album said https://example.test/MEMCLIP1; the video went up as .mp4.
      ['repoint', 'MEMCLIP1', 'https://example.supabase.co/storage/v1/object/public/memory-clips/MEMCLIP1.mp4'],
    ]);
    expect(d.steps.map((s) => s.step)).toEqual([
      'videosCheck', 'order', 'cover', 'videos', 'videos', 'videos', 'pages', 'pages', 'pages', 'sending', 'videosCheck', 'memories',
    ]);
    expect(d.steps.filter((s) => s.step === 'videos')).toEqual([
      { step: 'videos', done: 0, total: 1, phase: 'upload' }, { step: 'videos', done: 0, total: 1, phase: 'compress' }, { step: 'videos', done: 1, total: 1, phase: 'upload' },
    ]);
    expect(rec.uploads.map((u) => u.path)).toEqual(['order-1-cover.pdf', 'order-1.pdf']);
    const rows = rec.upserts[0].rows as { code: string; destination: string; kind: string }[];
    expect(rows.find((r) => r.code === 'MEMCLIP1')).toEqual(expect.objectContaining({ kind: 'clip', destination: 'https://example.supabase.co/storage/v1/object/public/memory-clips/MEMCLIP1.mp4' }));
    expect(rows.find((r) => r.code === 'MEMLINK1')?.destination).toBe('https://example.test/MEMLINK1');
  });

  it('a video sent as the file the album names: no re-point, unless it replaced an older one', async () => {
    const plain = clipSender({ ext: null });
    await sendOrder(placeOrderPlan(input({}, true)), deps({ clips: plain.sender }));
    expect(plain.calls.filter((x) => (x as string[])[0] === 'repoint')).toEqual([]);
    resetFake();
    const replaced = clipSender({ replaced: ['MEMCLIP1'] });
    await sendOrder(placeOrderPlan(input({}, true)), deps({ clips: replaced.sender }));
    expect(replaced.calls.filter((x) => (x as string[])[0] === 'repoint')).toHaveLength(1);
  });

  it('Place order again after a step failed: the same order, the videos not checked before it again', async () => {
    const c = clipSender();
    const placed: PlacedOrder = { id: 'order-1', order_number: 'MP-2026-ABC1234', status: 'pending_payment' };
    await sendOrder(placeOrderPlan(input({}, true)), deps({ clips: c.sender }), placed);
    expect(c.calls[0]).toEqual(['upload', ['MEMCLIP1']]);
    expect(rec.inserts).toHaveLength(0);
  });

  it('the rows for videos are required: the website\'s words when they can\'t be made', async () => {
    const c = clipSender();
    const failing = {
      ...fakeClient,
      from: (table: string) => (table === 'qr_memories'
        ? { upsert: async () => ({ error: { message: 'denied' } }) }
        : (fakeClient as unknown as { from: (t: string) => unknown }).from(table)),
    };
    await expect(sendOrder(placeOrderPlan(input({}, true)), deps({ clips: c.sender, db: failing as never }))).rejects.toThrow(MEMORY_ROWS_FAILED);
    expect(MEMORY_ROWS_FAILED).toBe('Could not save your memory videos to your account. Please try again.');
    expect(c.calls.filter((x) => (x as string[])[0] === 'repoint')).toEqual([]);
  });
});

describe('"I\'ve sent ₱X" sends what the website sends', () => {
  const png = { type: 'image/png', name: 'Screenshot.png', size: 200_000 };
  it('the receipt, then the payment recorded: the website\'s writes', async () => {
    const path = await web.payment.uploadPaymentProof('order-1', png as unknown as File);
    await web.payment.submitPaymentProof('order-1', { reference: web.payment.cleanReference(' 2026091012345678 '), proofPath: path });
    const website = { uploads: rec.uploads.splice(0), rpcs: rec.rpcs.splice(0) };
    const d = deps();
    const r = await sendPayment(paymentSubmitPlan('order-1', ' 2026091012345678 ', png), new Uint8Array([9]), d);
    expect(r.receiptError).toBeNull();
    expect(rec.uploads).toEqual(website.uploads);
    expect(rec.rpcs).toEqual(website.rpcs);
  });

  it('a receipt that didn\'t go up: said, and the payment is still recorded without it (the website\'s way)', async () => {
    const d = deps({ upload: async () => ({ message: 'offline' }) });
    const r = await sendPayment(paymentSubmitPlan('order-1', 'FT2410ABCD1234', png), new Uint8Array([9]), d);
    expect(r.receiptError).toBe('Could not upload your receipt (offline). You can still tap "I\'ve sent the payment" — we\'ll confirm from our bank app.');
    expect(rec.rpcs).toEqual([{ name: 'submit_payment_proof', args: { p_order_id: 'order-1', p_reference: 'FT2410ABCD1234', p_proof_path: null } }]);
  });

  it('the payment that couldn\'t be recorded: the website\'s words', async () => {
    fake.rpc.submit_payment_proof = { data: null, error: { message: 'denied' } };
    await expect(sendPayment(paymentSubmitPlan('order-1', '', null), null, deps())).rejects.toThrow('Could not record your payment (denied).');
  });
});
