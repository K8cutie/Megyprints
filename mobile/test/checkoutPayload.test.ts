/* ══════════════════════════════════════════════════════════════════════════
   WHY THIS TEST: the app's Place order must send exactly what the website's
   sends, or an order placed from the phone would differ from one placed on
   the website (wrong phone format, address cut, a missing column).

   It runs the WEBSITE's own code (src/lib/orders.ts createOrderFromAlbum,
   qrMemories.ts ensureMemoriesForFills, the PDF uploads, payment.ts) with a
   stand-in database that writes down what they send, and the APP's builders
   on the same album, address and tester code, and requires the same rows,
   key by key and in the same key order, and the same files.

   Nothing leaves the computer: the database, the PDF makers and the uploads
   are stand-ins (helpers/fakeSupabase.ts).
   ══════════════════════════════════════════════════════════════════════════ */
import { EMPTY_ADDRESS, type AddressValue } from '@web/lib/contact';
import type { AlbumPage, QrFill } from '@web/pages/builder/types';
import { fixtureCheckoutAlbum, FIXTURE_ALBUM_ID } from '../src/lib/checkout/fixtureAlbum';
import { buildOrderInsert, memoryRows, ORDER_ID, placeOrderPlan, SHIPPING_INVALID, type OrderAlbumRow } from '../src/lib/checkout/orderPayload';
import { paymentSubmitPlan } from '../src/lib/checkout/payment';
import { makePsgc, pickBarangay, pickCity, pickProvince, psgcLoader, regionNames, sortProvinces } from '../src/lib/checkout/psgc';
import { fake, rec, resetFake } from './helpers/fakeSupabase';
import { BASE, fetchFromDisk } from './helpers/psgcFiles';

jest.mock('@web/lib/supabase', () => jest.requireActual('./helpers/fakeSupabase').supabaseModule);
jest.mock('@web/lib/storageUpload', () => jest.requireActual('./helpers/fakeSupabase').storageUploadModule);
jest.mock('@web/pages/builder/generateAlbumPdf', () => ({
  generateAlbumPdf: async () => ({ size: 1 }),
  generateCoverWrapPdf: async () => ({ size: 1 }),
}));

/* The website's functions this test runs (typed here: the app's TypeScript
   does not read the website's browser-only files). */
type AnyFn = (...args: any[]) => Promise<any>; // eslint-disable-line @typescript-eslint/no-explicit-any
interface WebOrders { createOrderFromAlbum: AnyFn; uploadOrderCoverPdfWithRetry: AnyFn; uploadOrderPrintPdf: AnyFn }
interface WebQr { ensureMemoriesForFills: AnyFn }
interface WebPayment { uploadPaymentProof: AnyFn; submitPaymentProof: AnyFn; cleanReference: (raw: string) => string }
interface WebTester { claimTesterOrder: AnyFn }
/* eslint-disable @typescript-eslint/no-require-imports */
const web = {
  orders: require('@web/lib/orders') as WebOrders,
  qr: require('@web/lib/qrMemories') as WebQr,
  payment: require('@web/lib/payment') as WebPayment,
  tester: require('@web/lib/testerCode') as WebTester,
};
/* eslint-enable @typescript-eslint/no-require-imports */

const NOW = new Date('2026-10-29T03:04:05.678Z');
const psgc = makePsgc(psgcLoader(fetchFromDisk, BASE));

/** A real address, picked through the app's cascade on the real lists. */
async function addressIn(provinceName: string, cityName: string, barangayIndex: number, street: string, zip: string): Promise<AddressValue> {
  const provinces = sortProvinces(await psgc.loadAllProvinces());
  const regions = regionNames(await psgc.loadRegions());
  const p = provinces.find((x) => x.name === provinceName);
  if (!p) throw new Error(`no province ${provinceName}`);
  let a = pickProvince(EMPTY_ADDRESS, provinces, regions, p.code);
  const cities = await psgc.loadCities(p.code);
  const c = cities.find((x) => x.name === cityName);
  if (!c) throw new Error(`no city ${cityName} in ${provinceName}`);
  a = pickCity(a, cities, regions, c.code);
  const brgys = await psgc.loadBarangays(c.code);
  a = pickBarangay(a, brgys, brgys[barangayIndex].code);
  return { ...a, street, zip };
}

function qrFill(code: string, kind: 'link' | 'clip'): QrFill {
  return { code, destination: `https://example.test/${code}`, qrPngDataUrl: 'data:image/png;base64,AAAA', memoryUrl: `https://megyprints.vercel.app/m/${code}`, createdAt: 1, kind };
}

/** The test album with two QR memories on its pages (a link and a video). */
function albumWithMemories(): { row: OrderAlbumRow; pages: AlbumPage[] } {
  const album = fixtureCheckoutAlbum();
  const pages = album.pages.map((p, i) => (i === 3 ? { ...p, qrFills: [qrFill('MEMLINK1', 'link'), null] } : i === 9 ? { ...p, textSlotQr: [qrFill('MEMCLIP1', 'clip')] } : p));
  return { row: { ...album.row, pages }, pages };
}

interface Case {
  label: string;
  row: () => OrderAlbumRow;
  pages: () => AlbumPage[];
  specs: { material: string; cover: string; size: string };
  name: string;
  phone: string;
  address: () => Promise<AddressValue>;
  hostingYears: number | null;
  hdMemories: boolean;
  testerCode: string | null;
}

const fixture = fixtureCheckoutAlbum();
const CASES: Case[] = [
  {
    label: 'test album, Quezon City, softcover matte, no code',
    row: () => fixture.row, pages: () => fixture.pages,
    specs: { material: 'matte', cover: 'softcover', size: '8x8' },
    name: '  Juan   Dela  Cruz ', phone: '0917 123 4567',
    address: () => addressIn('Metro Manila', 'Quezon City', 5, '123 Rizal St., Purok 2', '1109'),
    hostingYears: null, hdMemories: false, testerCode: null,
  },
  {
    label: 'tester code MEGYTEST, hardbound glossy, +63 phone with brackets',
    row: () => fixture.row, pages: () => fixture.pages,
    specs: { material: 'glossy', cover: 'hardboundLeather', size: '8x8' },
    name: 'María Clara Ibarra', phone: '+63 (917) 123-4567',
    address: () => addressIn('Cebu', 'Cebu City', 10, 'Unit 4B,   Tower 2,  Ayala Center', '6000'),
    hostingYears: null, hdMemories: false, testerCode: 'MEGYTEST',
  },
  {
    label: 'Isabela City (Region IX, listed under Basilan), 63917… phone',
    row: () => fixture.row, pages: () => fixture.pages,
    specs: { material: 'matte', cover: 'softcover', size: '8x8' },
    name: 'Ana\tReyes', phone: '639171234567',
    address: () => addressIn('Basilan', 'Isabela City', 0, 'Purok 3, Sitio Malinis', '7300'),
    hostingYears: null, hdMemories: false, testerCode: null,
  },
  {
    label: 'album with a link and a video memory, 10 years, HD',
    row: () => albumWithMemories().row, pages: () => albumWithMemories().pages,
    specs: { material: 'matte', cover: 'softcover', size: '8x8' },
    name: 'Jose Rizal', phone: '9171234567',
    address: () => addressIn('Metro Manila', 'Makati City', 2, 'Blk 5 Lot 12 Sampaguita St. 🌼', '1200'),
    hostingYears: 10, hdMemories: true, testerCode: null,
  },
  {
    label: 'street of exactly 120 characters, ZIP with spaces around it',
    row: () => fixture.row, pages: () => fixture.pages,
    specs: { material: 'matte', cover: 'softcover', size: '8x8' },
    name: 'Pedro Penduko', phone: '0917-123-4567',
    address: async () => ({ ...(await addressIn('Laguna', 'Biñan City', 1, '', '')), street: `${'A'.repeat(110)} Street 12`, zip: ' 4024 ' }),
    hostingYears: null, hdMemories: false, testerCode: null,
  },
];

beforeEach(() => {
  resetFake();
  jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
});
afterEach(() => { jest.useRealTimers(); });

describe("the order row is the website's, key by key", () => {
  const compared: { label: string; keys: number; bytes: number }[] = [];

  it.each(CASES.map((c) => [c.label, c] as const))('%s', async (_label, c) => {
    const row = c.row();
    const address = await c.address();
    fake.albumRow = row as unknown as Record<string, unknown>;
    await web.orders.createOrderFromAlbum({
      userId: fake.userId, albumId: row.id, specs: c.specs,
      shipping: { name: c.name, phone: c.phone, address }, amount: 999,
      hostingYears: c.hostingYears, hdMemories: c.hdMemories, testerCode: c.testerCode,
    });
    expect(rec.inserts).toHaveLength(1);
    const websiteRow = rec.inserts[0].row;
    // The album it froze was read for THIS account and THIS album.
    expect(rec.reads[0]).toMatchObject({ table: 'albums', columns: '*', filters: { user_id: fake.userId, id: row.id } });

    const appRow = buildOrderInsert({
      userId: fake.userId, album: row, specs: c.specs, shipping: { name: c.name, phone: c.phone, address },
      hostingYears: c.hostingYears, hdMemories: c.hdMemories, testerCode: c.testerCode, now: NOW,
    });
    expect(appRow).toEqual(websiteRow);
    // Same keys in the same order: the JSON sent is the same, byte for byte.
    expect(JSON.stringify(appRow)).toBe(JSON.stringify(websiteRow));
    expect('amount' in appRow).toBe(false); // the price is never sent (set by the database)
    compared.push({ label: c.label, keys: Object.keys(appRow).length, bytes: JSON.stringify(appRow).length });

    // The plan's read step names the same album and account.
    const plan = placeOrderPlan({ userId: fake.userId, album: row, pages: c.pages(), specs: c.specs, shipping: { name: c.name, phone: c.phone, address }, hostingYears: c.hostingYears, hdMemories: c.hdMemories, testerCode: c.testerCode, includedYears: 5, now: NOW });
    expect(plan.orderRow).toEqual(websiteRow);
    expect(plan.steps[0]).toMatchObject({ kind: 'read', table: 'albums', filter: { user_id: fake.userId, id: row.id } });
  });

  afterAll(() => {
    // The numbers for the PR: printed when the whole file runs.
    if (compared.length) console.log(`order rows compared: ${compared.length} cases, ${compared.map((c) => `${c.keys} keys / ${c.bytes} bytes`).join('; ')}`);
  });

  it('an empty address is refused before anything is sent', () => {
    const base = { userId: 'u', album: fixture.row, specs: { material: 'matte', cover: 'softcover', size: '8x8' }, shipping: { name: 'Juan Dela Cruz', phone: '09171234567', address: { ...EMPTY_ADDRESS } }, now: NOW };
    expect(() => buildOrderInsert(base)).toThrow(SHIPPING_INVALID);
  });

  it('details that do not pass are refused with the website\'s own words, by both', async () => {
    fake.albumRow = fixture.row as unknown as Record<string, unknown>;
    const address = await addressIn('Metro Manila', 'Quezon City', 0, 'ab', '11'); // street too short, ZIP 2 digits
    const shipping = { name: 'J', phone: '1234', address };
    await expect(web.orders.createOrderFromAlbum({ userId: 'user-1', albumId: FIXTURE_ALBUM_ID, specs: { material: 'matte', cover: 'softcover', size: '8x8' }, shipping, amount: 1 })).rejects.toThrow(SHIPPING_INVALID);
    expect(() => buildOrderInsert({ userId: 'user-1', album: fixture.row, specs: { material: 'matte', cover: 'softcover', size: '8x8' }, shipping, now: NOW })).toThrow(SHIPPING_INVALID);
    expect(rec.inserts).toHaveLength(0);
  });

  it('a street over 120 characters is refused, never cut', async () => {
    const address = { ...(await addressIn('Metro Manila', 'Quezon City', 0, '', '1109')), street: `${'B'.repeat(115)} St 123` };
    expect(() => buildOrderInsert({ userId: 'u', album: fixture.row, specs: { material: 'matte', cover: 'softcover', size: '8x8' }, shipping: { name: 'Juan Dela Cruz', phone: '09171234567', address }, now: NOW })).toThrow(SHIPPING_INVALID);
  });
});

describe("the memory rows are the website's", () => {
  it('ensureMemoriesForFills upserts the same rows: included term on the video, links never expire', async () => {
    const { pages } = albumWithMemories();
    const fills = pages.flatMap((p) => [...(p.qrFills ?? []), ...(p.textSlotQr ?? [])]);
    await web.qr.ensureMemoriesForFills(fills, { hostingYears: 5 });
    expect(rec.upserts).toHaveLength(1);
    const app = memoryRows(fills, fake.userId, 5, NOW);
    expect(app).toEqual(rec.upserts[0].rows);
    expect(JSON.stringify(app)).toBe(JSON.stringify(rec.upserts[0].rows));
    expect(rec.upserts[0].opts).toEqual({ onConflict: 'code', ignoreDuplicates: true });
    expect(app).toEqual([
      { code: 'MEMLINK1', user_id: 'user-1', destination: 'https://example.test/MEMLINK1', kind: 'link', expires_at: null },
      { code: 'MEMCLIP1', user_id: 'user-1', destination: 'https://example.test/MEMCLIP1', kind: 'clip', expires_at: '2031-10-29T03:04:05.678Z' },
    ]);
  });

  it('the plan upserts them with the same options, and the test album (no QR) has none', () => {
    const { row, pages } = albumWithMemories();
    const plan = placeOrderPlan({ userId: 'user-1', album: row, pages, specs: { material: 'matte', cover: 'softcover', size: '8x8' }, shipping: { name: 'Jose Rizal', phone: '09171234567', address: validAddress() }, includedYears: 5, now: NOW });
    const upsert = plan.steps.find((s) => s.kind === 'upsert');
    expect(upsert).toMatchObject({ table: 'qr_memories', onConflict: 'code', ignoreDuplicates: true });
    const plain = placeOrderPlan({ userId: 'user-1', album: fixture.row, pages: fixture.pages, specs: { material: 'matte', cover: 'softcover', size: '8x8' }, shipping: { name: 'Jose Rizal', phone: '09171234567', address: validAddress() }, includedYears: 5, now: NOW });
    expect(plain.steps.some((s) => s.kind === 'upsert')).toBe(false);
  });
});

/** A complete address without reading the lists (codes as the lists have them). */
function validAddress(): AddressValue {
  return { regionCode: '13', regionName: 'NCR', provinceCode: 'NCR', provinceName: 'Metro Manila', cityCode: '1374000000', cityName: 'Quezon City', barangayCode: '1374000001', barangayName: 'Alicia', street: '12 Mabini St', zip: '1105' };
}

describe("the files are the website's, in its order", () => {
  it('cover wrap first, then the pages: the same buckets, names and types', async () => {
    const orderId = 'order-1';
    // The website's two uploads at Place order (the PDF makers are stand-ins).
    await web.orders.uploadOrderCoverPdfWithRetry(orderId, {} as never, undefined, []);
    await web.orders.uploadOrderPrintPdf(orderId, { pages: [], photos: [], albumSize: '8x8' } as never, 'softcover');
    const websiteFiles = rec.uploads.map((u) => ({ bucket: u.bucket, path: u.path, contentType: u.contentType }));
    // The whole options object each upload is given: the PDFs carry only their type.
    expect(rec.uploads.map((u) => u.opts)).toEqual([{ contentType: 'application/pdf' }, { contentType: 'application/pdf' }]);

    const plan = placeOrderPlan({ userId: 'user-1', album: fixture.row, pages: fixture.pages, specs: { material: 'matte', cover: 'softcover', size: '8x8' }, shipping: { name: 'Jose Rizal', phone: '09171234567', address: validAddress() }, includedYears: 5, now: NOW });
    const appFiles = plan.files.map((f) => ({ ...f, path: f.path.replace(ORDER_ID, orderId) }));
    expect(appFiles).toEqual(websiteFiles);
    // Each app upload's options (everything but where it goes and create-only) equal the website's.
    const appOpts = plan.steps.flatMap((s) => {
      if (s.kind !== 'upload') return [];
      const { kind: _k, what: _w, bucket: _b, path: _p, mode: _m, tries: _t, ...opts } = s;
      return [opts];
    });
    expect(appOpts).toEqual(rec.uploads.map((u) => u.opts));
    expect(appFiles).toEqual([
      { bucket: 'print-pdfs', path: 'order-1-cover.pdf', contentType: 'application/pdf' },
      { bucket: 'print-pdfs', path: 'order-1.pdf', contentType: 'application/pdf' },
    ]);
  });

  it('a video memory is sent between the cover and the pages, as on the website', () => {
    const { row, pages } = albumWithMemories();
    const plan = placeOrderPlan({ userId: 'user-1', album: row, pages, specs: { material: 'matte', cover: 'softcover', size: '8x8' }, shipping: { name: 'Jose Rizal', phone: '09171234567', address: validAddress() }, includedYears: 5, now: NOW });
    expect(plan.files.map((f) => `${f.bucket}/${f.path}`)).toEqual([
      `print-pdfs/${ORDER_ID}-cover.pdf`,
      'memory-clips/MEMCLIP1.<mp4|webm>',
      `print-pdfs/${ORDER_ID}.pdf`,
    ]);
  });

  it('a tester order ends with claim_tester_order, the call the website makes; a paid one goes to the payment step', async () => {
    await web.tester.claimTesterOrder('order-1');
    const shipping = { name: 'Jose Rizal', phone: '09171234567', address: validAddress() };
    const tester = placeOrderPlan({ userId: 'user-1', album: fixture.row, pages: fixture.pages, specs: { material: 'matte', cover: 'softcover', size: '8x8' }, shipping, testerCode: 'MEGYTEST', includedYears: 5, now: NOW });
    const last = tester.steps[tester.steps.length - 1];
    expect(last.kind).toBe('rpc');
    if (last.kind !== 'rpc') return;
    expect({ name: last.name, args: { p_order_id: String(last.args.p_order_id).replace(ORDER_ID, 'order-1') } }).toEqual(rec.rpcs[0]);
    expect(tester.orderRow.tester_code).toBe('MEGYTEST');
    const paid = placeOrderPlan({ userId: 'user-1', album: fixture.row, pages: fixture.pages, specs: { material: 'matte', cover: 'softcover', size: '8x8' }, shipping, includedYears: 5, now: NOW });
    expect(paid.steps[paid.steps.length - 1].kind).toBe('next');
    expect('tester_code' in paid.orderRow).toBe(false);
  });
});

describe('"I\'ve sent ₱X" sends what the website sends', () => {
  const receipts = [
    { label: 'a PNG screenshot and a reference', file: { type: 'image/png', name: 'Screenshot_2026.png', size: 214_000 }, ref: ' 2026091012345678 ' },
    { label: 'a JPEG with no type, found by its name', file: { type: '', name: 'receipt.JPEG', size: 90_000 }, ref: 'FT2410ABCD1234' },
    { label: 'a PDF and no reference', file: { type: 'application/pdf', name: 'gcash.pdf', size: 30_000 }, ref: '' },
    { label: 'no receipt, a reference only', file: null, ref: 'GC-2026-0001.23' },
  ];
  it.each(receipts.map((r) => [r.label, r] as const))('%s', async (_l, r) => {
    let proofPath: string | null = null;
    if (r.file) proofPath = await web.payment.uploadPaymentProof('order-1', r.file as unknown as File);
    await web.payment.submitPaymentProof('order-1', { reference: web.payment.cleanReference(r.ref), proofPath });
    const app = paymentSubmitPlan('order-1', r.ref, r.file);
    expect(app.rpc).toEqual({ name: rec.rpcs[0].name, args: rec.rpcs[0].args });
    if (r.file) {
      expect(app.upload).not.toBeNull();
      if (!app.upload) return;
      // Where it goes, then the WHOLE options object (type and cacheControl), equal.
      const { bucket, path, mode, ...opts } = app.upload;
      expect({ bucket, path }).toEqual({ bucket: rec.uploads[0].bucket, path: rec.uploads[0].path });
      expect(opts).toEqual(rec.uploads[0].opts);
      expect(opts).toEqual({ contentType: rec.uploads[0].contentType, cacheControl: '0' });
      expect(mode).toBe('create-only');
    } else {
      expect(app.upload).toBeNull();
      expect(rec.uploads).toHaveLength(0);
    }
  });
});
