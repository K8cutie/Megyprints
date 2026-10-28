/* ══════════════════════════════════════════════════════════════════════════
   WHY THIS TEST: the rest of what the checkout screens say and do, held to
   the website's:
     • the bar while the order is placed moves through the website's steps,
       in its order, with its words, and never goes back (placeProgress);
     • "This album already has an order" and the second-order question read
       as the website's, with the date as a phone in the Philippines says it;
     • a picked receipt is named as the website names it;
     • the test album is made from Megy's sample photos at their real sizes,
       is the same every run, and has enough photos to order.
   ══════════════════════════════════════════════════════════════════════════ */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { forward, PLACE_AT, pagesAt } from '@web/lib/placeProgress';
import { albumPhotoCount, photosShortBy } from '@web/pages/builder/albumMinimum';
import { fixtureCheckoutAlbum, fixturePhotos } from '../src/lib/checkout/fixtureAlbum';
import { openOrderWords, placedOn, secondOrderQuestion, type OpenOrder } from '../src/lib/checkout/openOrder';
import { barPercent, KEEP_OPEN_NOTE, placeFrames } from '../src/lib/checkout/placeRun';
import { receiptLabel, toReceipt } from '../src/lib/checkout/receipt';

jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));

const WEB = path.resolve(__dirname, '../..');
const ORDER_SRC = readFileSync(path.join(WEB, 'src/pages/Order.tsx'), 'utf8');
const PROGRESS_SRC = readFileSync(path.join(WEB, 'src/components/PlaceOrderProgress.tsx'), 'utf8');
const PLACE_ORDER = ORDER_SRC.slice(ORDER_SRC.indexOf('const placeOrder = async () => {'), ORDER_SRC.indexOf('const handlePaymentSent = async'));

describe("placing the order: the website's bar", () => {
  const shapes = [
    { pages: 48, clips: 0, memories: 0, tester: false },
    { pages: 48, clips: 0, memories: 0, tester: true },
    { pages: 130, clips: 3, memories: 5, tester: false },
    { pages: 40, clips: 1, memories: 1, tester: true },
  ];

  it.each(shapes.map((s) => [JSON.stringify(s), s] as const))('%s', (_l, s) => {
    const frames = placeFrames(s);
    // Never back down the bar.
    for (let i = 1; i < frames.length; i++) expect(frames[i].progress.at).toBeGreaterThanOrEqual(frames[i - 1].progress.at);
    // One step per page made, then "Putting your pages together…" at the end of the pages.
    const pageFrames = frames.filter((f) => /^Making page \d+ of \d+…$/.test(f.message));
    expect(pageFrames).toHaveLength(s.pages);
    expect(pageFrames[0].message).toBe(`Making page 1 of ${s.pages}…`);
    expect(frames.find((f) => f.message === 'Putting your pages together…')?.progress.at).toBe(pagesAt(s.pages, s.pages));
    // Sending can't be measured: only that step has the moving band.
    const sending = frames.filter((f) => f.progress.sending);
    expect(sending.map((f) => f.message)).toEqual(['Sending your print file…']);
    expect(sending[0].progress.at).toBe(PLACE_AT.sending);
    // A tester order ends with the database marking it paid; a paid one goes to payment.
    const last = frames[frames.length - 1];
    if (s.tester) expect(last).toMatchObject({ message: 'Finishing your test order…', progress: { at: PLACE_AT.finishing } });
    else expect(last.progress.at).toBeLessThan(PLACE_AT.finishing);
    expect(frames.some((f) => f.message === 'Saving your memories…')).toBe(s.memories > 0);
    expect(frames.filter((f) => /^Uploading memory video \d+ of \d+…$/.test(f.message))).toHaveLength(s.clips);
  });

  it('the steps come in the order the website runs them', () => {
    const webOrder = [...PLACE_ORDER.matchAll(/advance\(PLACE_AT\.(\w+)/g)].map((m) => m[1]);
    expect(webOrder).toEqual(['start', 'preparing', 'cover', 'videos', 'pages', 'sending', 'checking', 'saving', 'finishing', 'finishing']);
    const at = placeFrames({ pages: 10, clips: 1, memories: 1, tester: true }).map((f) => f.progress.at);
    const named = (Object.keys(PLACE_AT) as (keyof typeof PLACE_AT)[]).filter((k) => k !== 'pagesDone');
    const seen = named.filter((k) => at.includes(PLACE_AT[k])).sort((a, b) => at.indexOf(PLACE_AT[a]) - at.indexOf(PLACE_AT[b]));
    expect(seen).toEqual(['start', 'preparing', 'cover', 'videos', 'pages', 'sending', 'checking', 'saving', 'finishing']);
  });

  it("every fixed line on screen is one the website's checkout says", () => {
    const frames = placeFrames({ pages: 3, clips: 2, memories: 2, tester: true });
    const fixed = [...new Set(frames.map((f) => f.message))].filter((m) => !/\d/.test(m));
    for (const m of fixed) expect(ORDER_SRC.includes(`'${m}'`) || m === 'Putting your pages together…').toBe(true);
    expect(ORDER_SRC).toContain('`Preparing memory video ${d + 1} of ${t}…`');
    expect(ORDER_SRC).toContain('`Uploading memory video ${d + 1} of ${t}…`');
    expect(PROGRESS_SRC).toContain(KEEP_OPEN_NOTE);
  });

  it('the bar width is the website\'s (rounded percent, 0 to 100)', () => {
    expect(PROGRESS_SRC).toContain('Math.round(Math.min(1, Math.max(0, progress.at)) * 100)');
    expect(barPercent(forward(null, 0.256))).toBe(26);
    expect(barPercent({ at: 1.4, sending: false })).toBe(100);
    expect(barPercent({ at: -1, sending: false })).toBe(0);
  });
});

describe('"This album already has an order": the website\'s words', () => {
  const waiting: OpenOrder = { id: 'o1', order_number: 'MP-2026-ABC1234', status: 'pending_payment', created_at: '2026-10-25T17:30:00Z', payment_submitted_at: null };
  const sent: OpenOrder = { ...waiting, payment_submitted_at: '2026-10-26T02:00:00Z' };

  it('the date reads as the website says it on a phone in the Philippines', () => {
    for (const iso of ['2026-10-25T17:30:00Z', '2026-10-26T03:00:00Z', '2026-12-31T16:00:00Z', '2026-01-01T00:00:00Z', '2026-02-28T20:00:00Z']) {
      expect(placedOn(iso)).toBe(new Date(iso).toLocaleDateString('en-PH', { day: 'numeric', month: 'long', timeZone: 'Asia/Manila' }));
    }
    expect(placedOn('not a date')).toBe('');
  });

  it('the box at the top and the question under Place order', () => {
    expect(ORDER_SRC).toContain('This album already has an order {openOrder.payment_submitted_at ? "— you sent the payment and we\'re confirming it" : \'waiting for payment\'}');
    expect(ORDER_SRC).toContain('"To finish it, pay that order. You don\'t need a new one."');
    expect(ORDER_SRC).toContain("Changed the album since? Place a new order below and we'll print the new one.");
    expect(ORDER_SRC).toContain("{openOrder.payment_submitted_at ? 'with its payment sent' : 'waiting for payment'}. Place a second order for it?");
    expect(ORDER_SRC).toContain('Yes, place a second order');
    expect(openOrderWords(waiting)).toEqual({
      headline: 'This album already has an order waiting for payment: MP-2026-ABC1234, placed October 26.',
      body: "To finish it, pay that order. You don't need a new one. Changed the album since? Place a new order below and we'll print the new one.",
      button: 'Open order MP-2026-ABC1234',
    });
    expect(openOrderWords(sent).headline).toBe("This album already has an order — you sent the payment and we're confirming it: MP-2026-ABC1234, placed October 26.");
    expect(openOrderWords(sent).body.startsWith("You don't need a new one.")).toBe(true);
    expect(secondOrderQuestion(waiting)).toBe('This album already has order MP-2026-ABC1234 waiting for payment. Place a second order for it?');
    expect(secondOrderQuestion(sent)).toBe('This album already has order MP-2026-ABC1234 with its payment sent. Place a second order for it?');
  });
});

describe('the receipt', () => {
  it("is named as the website names it: 'name · N KB'", () => {
    expect(ORDER_SRC).toContain('`${proofFile.name} · ${Math.max(1, Math.round(proofFile.size / 1024))} KB`');
    expect(receiptLabel(toReceipt({ uri: 'file:///r.png', name: 'Screenshot_20261029.png', size: 214_000, mimeType: 'image/png' }))).toBe('Screenshot_20261029.png · 209 KB');
    expect(receiptLabel(toReceipt({ uri: 'file:///r.png', name: 'tiny.png', size: 12, mimeType: 'image/png' }))).toBe('tiny.png · 1 KB');
    // The picker sometimes gives no type or size: checkProof then reads the name, and an unknown size is 0 (refused as empty).
    expect(toReceipt({ uri: 'content://x', name: 'gcash.pdf', size: undefined, mimeType: undefined })).toEqual({ uri: 'content://x', name: 'gcash.pdf', type: '', size: 0 });
  });
});

/** Width and height from a JPEG's frame header. */
function jpegSize(file: string): [number, number] {
  const b = readFileSync(file);
  let i = 2;
  while (i < b.length) {
    if (b[i] !== 0xff) { i++; continue; }
    const marker = b[i + 1];
    const len = b.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
    }
    i += 2 + len;
  }
  throw new Error(`no frame header in ${file}`);
}

describe('the test album', () => {
  const dir = path.join(WEB, 'public/sample-photos');

  it("is made of Megy's sample photos, at their real sizes", () => {
    const files = readdirSync(dir).filter((f) => f.endsWith('.jpg')).sort();
    const photos = fixturePhotos();
    expect(photos).toHaveLength(48);
    for (const p of photos) {
      expect(files).toContain(p.name);
      expect([p.width, p.height]).toEqual(jpegSize(path.join(dir, p.name)));
      expect(p.previewUrl).toBe(`https://megyprints.vercel.app/sample-photos/${p.name}`);
    }
  });

  it('is the same every run, and has enough photos to order', () => {
    const a = fixtureCheckoutAlbum();
    const b = fixtureCheckoutAlbum();
    expect(JSON.stringify(a.pages)).toBe(JSON.stringify(b.pages));
    expect(a.pages.length).toBeGreaterThanOrEqual(40);
    expect(photosShortBy(albumPhotoCount(a.pages))).toBe(0);
    expect(a.row.pages).toBe(a.pages);
    expect(a.coverPhotoUri).toMatch(/^https:\/\/megyprints\.vercel\.app\/sample-photos\/megy-sample-\d\d\.jpg$/);
    console.log(`test album: ${a.pages.length} pages, ${albumPhotoCount(a.pages)} photos placed`);
  });
});
