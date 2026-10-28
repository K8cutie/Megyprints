/* ══════════════════════════════════════════════════════════════════════════
   WHY THIS TEST: the checkout screen itself, walked the way a customer goes
   through it: the real screen (src/app/order.tsx) with its real parts, on
   the test album, the price from a price list like the live one, the
   address picked through the real lists (public/psgc/), the tester code,
   Place order, the bar, and the test panel at the end, or the payment step
   with a receipt and a reference.

   Only the outside is a stand-in: the database (it answers the price list
   and "any order waiting?", and writes nothing), who is signed in, the
   phone's file picker and keep-screen-on. Then the order row the SCREEN
   built is held against the row the WEBSITE's createOrderFromAlbum builds
   from the same typed details.
   ══════════════════════════════════════════════════════════════════════════ */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { AddressValue } from '@web/lib/contact';
import type { PriceSchedule } from '@web/lib/pricing';
import OrderScreen from '../src/app/order';
import { fixtureCheckoutAlbum } from '../src/lib/checkout/fixtureAlbum';
import { checkoutPrice, peso } from '../src/lib/checkout/price';
import { fake, rec, resetFake } from './helpers/fakeSupabase';
import { BASE, fetchFromDisk } from './helpers/psgcFiles';

const mockAuth: { session: { user: { id: string } } | null } = { session: { user: { id: 'user-1' } } };
const mockPush = jest.fn();
const mockPicked: { asset: { uri: string; name: string; size: number; mimeType: string } | null } = { asset: null };

jest.mock('../src/lib/auth', () => ({ useAuth: () => ({ session: mockAuth.session, loading: false }) }));
jest.mock('../src/lib/supabase', () => ({ supabase: jest.requireActual('./helpers/fakeSupabase').fakeClient, supabaseConfigured: true }));
jest.mock('expo-router', () => ({ router: { push: (...a: unknown[]) => mockPush(...a) } }));
jest.mock('expo-keep-awake', () => ({ useKeepAwake: jest.fn() }));
jest.mock('expo-document-picker', () => ({
  getDocumentAsync: async () => (mockPicked.asset ? { canceled: false, assets: [mockPicked.asset] } : { canceled: true, assets: null }),
}));
// The website's checkout code, for the comparison at the end.
jest.mock('@web/lib/supabase', () => jest.requireActual('./helpers/fakeSupabase').supabaseModule);
jest.mock('@web/lib/storageUpload', () => jest.requireActual('./helpers/fakeSupabase').storageUploadModule);
jest.mock('@web/pages/builder/generateAlbumPdf', () => ({ generateAlbumPdf: async () => ({}), generateCoverWrapPdf: async () => ({}) }));

/* eslint-disable-next-line @typescript-eslint/no-require-imports */
const webOrders = require('@web/lib/orders') as { createOrderFromAlbum: (o: unknown) => Promise<unknown> };

/** Like the live list (src/lib/orderQuote.spec.ts, 2026-10-26). */
const LIVE = {
  disabled_sizes: ['8.5x11', '11.5x8'], free_shipping_value: 200, hd_memories_price: 49, hosting_reserve: 50,
  hosting_tiers: [{ price: 0, years: 5 }, { price: 99, years: 10 }, { price: 149, years: 15 }, { price: 199, years: 20 }],
  min_pages: 40, sheet_rate: 66.25,
  sizes: {
    '6x4': { hard_rate: 825, pps: 18, soft_rate: 575 }, '6x6': { hard_rate: 900, pps: 12, soft_rate: 575 },
    '6x8': { hard_rate: 1075, pps: 8, soft_rate: 575 }, '8x6': { hard_rate: 1075, pps: 8, soft_rate: 575 },
    '8x8': { hard_rate: 1075, pps: 4, soft_rate: 575 }, '8.5x11': { hard_rate: 1750, pps: 4, soft_rate: 875 }, '11.5x8': { hard_rate: 1625, pps: 4, soft_rate: 875 },
  },
} as unknown as PriceSchedule;

const album = fixtureCheckoutAlbum();
const softPrice = checkoutPrice(LIVE, { albumSize: '8x8', cover: 'softcover', pageCount: album.pages.length, qrCount: 0, hostingYears: null, hdMemories: false, tester: null });
const hardPrice = checkoutPrice(LIVE, { albumSize: '8x8', cover: 'hardboundLeather', pageCount: album.pages.length, qrCount: 0, hostingYears: null, hdMemories: false, tester: null });

beforeEach(() => {
  resetFake();
  fake.rpc.public_price_schedule = { data: LIVE, error: null };
  mockAuth.session = { user: { id: 'user-1' } };
  mockPicked.asset = null;
  mockPush.mockClear();
  // The address lists, read from the repo instead of the website.
  global.fetch = jest.fn((url: string) => fetchFromDisk(String(url).replace('https://megyprints.vercel.app/psgc/', BASE))) as unknown as typeof fetch;
});
afterEach(() => { jest.useRealTimers(); });

async function openScreen() {
  await render(<OrderScreen />);
  await screen.findByText(`Place order · pay ${peso(softPrice.total)} by bank transfer`);
}

/** Picks one name from a list sheet (types part of it to find it first). */
async function pickFrom(field: string, typed: string, name: string) {
  await fireEvent.press(screen.getByTestId(field));
  const search = await screen.findByTestId('choice-search');
  await fireEvent.changeText(search, typed);
  await fireEvent.press(await screen.findByText(name));
}

async function fillDetails(name = 'Juan Dela Cruz', phone = '0917 123 4567') {
  await fireEvent.changeText(screen.getByTestId('order-name'), name);
  await fireEvent.changeText(screen.getByTestId('order-phone'), phone);
  await pickFrom('address-province', 'metro', 'Metro Manila');
  await pickFrom('address-city', 'quezon', 'Quezon City');
  await pickFrom('address-barangay', 'bagong pag', 'Bagong Pag-asa');
  await fireEvent.changeText(screen.getByTestId('address-street'), '123 Rizal St., Purok 2');
  await fireEvent.changeText(screen.getByTestId('address-zip'), '11a05');
}

/** Lets the bar play to the end (it waits a little on each step). */
async function playBar() {
  for (let i = 0; i < 200 && screen.queryByTestId('order-placing'); i++) {
    await act(async () => { jest.advanceTimersByTime(1000); });
  }
}

describe('the checkout screen, walked', () => {
  it('shows the album, the live price, and the boxes, in the website\'s words', async () => {
    await openScreen();
    expect(screen.getByText('Finalize Your Order')).toBeOnTheScreen();
    expect(screen.getByText(`${album.pages.length} pages inside, printed as they look in your preview.`)).toBeOnTheScreen();
    expect(screen.getByTestId('order-album-size')).toHaveTextContent('8×8" Square');
    expect(screen.getByTestId('order-total')).toHaveTextContent(peso(softPrice.payTotal));
    expect(screen.getByText('Free')).toBeOnTheScreen();
    expect(screen.getByText(/Free shipping \(₱200 value\)/)).toBeOnTheScreen();
    expect(screen.getByText(/5 years of memory hosting/)).toBeOnTheScreen();
    // Hardbound changes the price, from the same list.
    await fireEvent.press(screen.getByText('Hardbound'));
    expect(await screen.findByText(`Place order · pay ${peso(hardPrice.total)} by bank transfer`)).toBeOnTheScreen();
    expect(hardPrice.total).toBeGreaterThan(softPrice.total);
    // The price came from the database's public price list, read once.
    expect(rec.rpcs.filter((r) => r.name === 'public_price_schedule')).toHaveLength(1);
  });

  it('Place order on an empty form says what to fix under each box, and sends nothing', async () => {
    await openScreen();
    await fireEvent.press(screen.getByTestId('order-place'));
    expect(screen.getByText('Please enter your full name.')).toBeOnTheScreen();
    expect(screen.getByText('Enter a valid PH mobile number, e.g. 0917 123 4567.')).toBeOnTheScreen();
    expect(screen.getByText('Select a province.')).toBeOnTheScreen();
    expect(screen.getByText('Select a city / municipality.')).toBeOnTheScreen();
    expect(screen.getByText('Select a barangay.')).toBeOnTheScreen();
    expect(screen.getByText('Enter house/unit no. and street.')).toBeOnTheScreen();
    expect(screen.getByText('Enter a 4-digit ZIP code.')).toBeOnTheScreen();
    expect(screen.queryByTestId('test-panel')).toBeNull();
    expect(rec.inserts).toHaveLength(0);
  });

  it('a street over 120 characters is said with its count, never cut', async () => {
    await openScreen();
    await fillDetails();
    const long = `${'A'.repeat(111)} Street 12`;
    await fireEvent.changeText(screen.getByTestId('address-street'), long);
    expect(screen.getByTestId('address-street').props.value).toBe(long);
    expect(screen.getByText('121/120')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('order-place'));
    expect(screen.getByText('Too long: 121 of 120 characters. Shorten it so nothing gets cut.')).toBeOnTheScreen();
  });

  it('MEGYTEST: the album is free, Place order builds the website\'s order and stops', async () => {
    await openScreen();
    await fillDetails('  Juan   Dela  Cruz ', '0917 123 4567');
    expect(screen.getByTestId('address-zip').props.value).toBe('1105');

    await fireEvent.press(screen.getByText('Have a tester code?'));
    expect(screen.getByPlaceholderText('Type your code')).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByTestId('tester-code-input'), ' megy test ');
    await fireEvent.press(screen.getByTestId('tester-code-apply'));
    expect(await screen.findByText('✓ Tester code MEGYTEST: free')).toBeOnTheScreen();
    // Only the shape was checked in this build, and the form says so.
    expect(screen.getByTestId('tester-code-unchecked')).toHaveTextContent('Test version: this code was not checked with the shop.');
    expect(screen.getByText(`−${peso(softPrice.total)}`)).toBeOnTheScreen();
    expect(screen.getByTestId('order-total')).toHaveTextContent(`${peso(softPrice.total)}  ₱0`);
    // The code was not sent to the database (that check counts tries: a write).
    expect(rec.rpcs.some((r) => r.name === 'check_tester_code')).toBe(false);

    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
    await fireEvent.press(screen.getByText('Place order · free with tester code'));
    expect(screen.getByText('Placing your order')).toBeOnTheScreen();
    expect(screen.getByText('Keep this screen open. This can take a few minutes.')).toBeOnTheScreen();
    const seen = new Set<string>();
    for (let i = 0; i < 400 && screen.queryByTestId('order-placing'); i++) {
      screen.queryAllByText(/^Making page \d+ of \d+…$/).forEach((t) => seen.add(String(t.props.children)));
      await act(async () => { jest.advanceTimersByTime(70); });
    }
    expect(seen.size).toBeGreaterThan(album.pages.length / 2); // the pages went by one at a time
    jest.useRealTimers();

    expect(await screen.findByText('Stopped before sending')).toBeOnTheScreen();
    expect(screen.getByText('This was a test order. Nothing is charged, and nothing will be printed or sent.')).toBeOnTheScreen();
    expect(screen.getByText(/INSERT orders: 1 row/)).toBeOnTheScreen();
    expect(screen.getByText(/RPC claim_tester_order/)).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('test-panel-toggle'));
    const shown = JSON.parse(String(screen.getByText(/"orders": \{/).props.children)) as { orders: Record<string, unknown>; files: unknown[] };

    // Nothing was written anywhere.
    expect(rec.inserts).toHaveLength(0);
    expect(rec.uploads).toHaveLength(0);
    expect(rec.upserts).toHaveLength(0);

    // The website, given the same typed details, builds the same row.
    // The region was filled in behind the scenes, from the city.
    expect(shown.orders.ship_region).toBe('National Capital Region (NCR)');
    fake.albumRow = album.row as unknown as Record<string, unknown>;
    await webOrders.createOrderFromAlbum({
      userId: 'user-1', albumId: album.albumId, specs: { material: 'matte', cover: 'softcover', size: '8x8' },
      shipping: { name: '  Juan   Dela  Cruz ', phone: '0917 123 4567', address: await pickedAddress() },
      amount: 0, hostingYears: null, hdMemories: false, testerCode: 'MEGYTEST',
    });
    const websiteRow = { ...rec.inserts[0].row, status_history: null };
    expect({ ...shown.orders, status_history: null }).toEqual(websiteRow);
    expect(shown.orders).toMatchObject({ ship_name: 'Juan Dela Cruz', ship_phone: '+639171234567', tester_code: 'MEGYTEST', ship_zip: '1105' });
    expect(shown.files).toEqual([
      { bucket: 'print-pdfs', path: '<order id>-cover.pdf', contentType: 'application/pdf' },
      { bucket: 'print-pdfs', path: '<order id>.pdf', contentType: 'application/pdf' },
    ]);
  });

  it('a paid order: the payment step with the QR, the amount, a receipt and a reference', async () => {
    await openScreen();
    await fillDetails();
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
    await fireEvent.press(screen.getByTestId('order-place'));
    await playBar();
    jest.useRealTimers();
    expect(await screen.findByText('Stopped before sending')).toBeOnTheScreen();
    expect(screen.getByText(/THEN the payment step/)).toBeOnTheScreen();
    expect(screen.getByText(/would send for this album and address\./)).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('See the payment step'));

    const amount = peso(softPrice.total);
    expect(screen.getByText(`Send ${amount}`)).toBeOnTheScreen();
    expect(screen.getByText('GoTyme Bank · InstaPay · QR Ph')).toBeOnTheScreen();
    expect(screen.getByLabelText('GoTyme Bank InstaPay QR for ARCHIE GARCIA')).toBeOnTheScreen();
    expect(screen.getByText('Account ending in 2370')).toBeOnTheScreen();
    // No order was placed, so no order number: the website then leaves out
    // "Order … is placed" and "put … in the note" (it never says both).
    expect(screen.getByText(`3. Send exactly ${amount}.`)).toBeOnTheScreen();
    expect(screen.queryByText(/is placed\. Pay by bank transfer/)).toBeNull();
    expect(screen.queryByText(/in the note/)).toBeNull();
    expect(screen.getByText(/Please pay within 7 days/)).toBeOnTheScreen();

    // A receipt from the phone.
    mockPicked.asset = { uri: 'file:///cache/receipt.png', name: 'receipt.png', size: 214_000, mimeType: 'image/png' };
    await fireEvent.press(screen.getByText('Attach the transfer receipt (JPG, PNG or PDF)'));
    expect(await screen.findByText('receipt.png · 209 KB')).toBeOnTheScreen();
    // A bad reference is said, not cleaned quietly.
    await fireEvent.changeText(screen.getByTestId('pay-reference'), 'lol nope');
    await fireEvent.press(screen.getByText(`I've sent ${amount}`));
    expect(screen.getByText("A reference number has digits in it. Copy it from your bank's receipt, or leave this empty.")).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByTestId('pay-reference'), ' 2026091012345678 ');
    await fireEvent.press(screen.getByText(`I've sent ${amount}`));
    expect(screen.getByTestId('test-panel-toggle')).toHaveTextContent('Show the data (under 1 KB)');
    await fireEvent.press(screen.getByTestId('test-panel-toggle'));
    const sent = JSON.parse(String(screen.getByText(/"rpc": \{/).props.children));
    expect(sent).toEqual({
      upload: { bucket: 'payment-proofs', path: '<order id>.png', contentType: 'image/png', mode: 'create-only' },
      rpc: { name: 'submit_payment_proof', args: { p_order_id: '<order id>', p_reference: '2026091012345678', p_proof_path: '<order id>.png' } },
    });
    expect(rec.uploads).toHaveLength(0);
    expect(rec.rpcs.some((r) => r.name === 'submit_payment_proof')).toBe(false);

    // The order summary opens with the album line.
    await fireEvent.press(screen.getByText('Order summary'));
    expect(screen.getByText('8×8" Square · Matte · Softcover')).toBeOnTheScreen();
  });

  it('a receipt that is too big is said, and not kept', async () => {
    await openScreen();
    await fillDetails();
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
    await fireEvent.press(screen.getByTestId('order-place'));
    await playBar();
    jest.useRealTimers();
    await fireEvent.press(await screen.findByText('See the payment step'));
    mockPicked.asset = { uri: 'file:///cache/big.png', name: 'big.png', size: 9 * 1024 * 1024, mimeType: 'image/png' };
    await fireEvent.press(screen.getByText('Attach the transfer receipt (JPG, PNG or PDF)'));
    expect(await screen.findByText('That file is over 8 MB. A screenshot of the receipt is enough.')).toBeOnTheScreen();
    expect(screen.getByText('Attach the transfer receipt (JPG, PNG or PDF)')).toBeOnTheScreen();
  });

  it('not signed in: the website\'s words, and the way to sign in', async () => {
    mockAuth.session = null;
    await openScreen();
    await fillDetails();
    await fireEvent.press(screen.getByTestId('order-place'));
    expect(screen.getByText('You must be signed in to check out — it ties the order to your album and lets us contact you.')).toBeOnTheScreen();
    // The details are tidied as the order stores them.
    expect(screen.getByTestId('order-phone').props.value).toBe('+63 917 123 4567');
    await fireEvent.press(screen.getByText('Sign in'));
    // Sign in comes back to this order (then=back), not to My albums.
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/sign-in', params: { then: 'back' } });
    expect(screen.queryByTestId('order-placing')).toBeNull();

    // Back from signing in: the message and its button are gone, the details stay.
    mockAuth.session = { user: { id: 'user-1' } };
    await screen.rerender(<OrderScreen />);
    expect(screen.queryByText(/You must be signed in to check out/)).toBeNull();
    expect(screen.queryByTestId('order-sign-in')).toBeNull();
    expect(screen.getByTestId('order-name').props.value).toBe('Juan Dela Cruz');
  });

  it('this album already has an order waiting: said at the top, and a second one is asked', async () => {
    fake.orderRow = { id: 'o-1', order_number: 'MP-2026-ABC1234', status: 'pending_payment', created_at: '2026-10-25T17:30:00Z', payment_submitted_at: null };
    await openScreen();
    expect(await screen.findByText('This album already has an order waiting for payment: MP-2026-ABC1234, placed October 26.')).toBeOnTheScreen();
    // The read was this account's unpaid orders of this album.
    expect(rec.reads.find((r) => r.table === 'orders')?.filters).toEqual({ user_id: 'user-1', album_id: album.albumId, status: 'pending_payment' });
    await fillDetails();
    await fireEvent.press(screen.getByTestId('order-place'));
    expect(screen.getByText('This album already has order MP-2026-ABC1234 waiting for payment. Place a second order for it?')).toBeOnTheScreen();
    expect(screen.queryByTestId('order-placing')).toBeNull();
    await fireEvent.press(screen.getByText('Yes, place a second order'));
    expect(screen.getByTestId('order-placing')).toBeOnTheScreen();
  });

  it('prices that did not load: no price, and the button tries again', async () => {
    fake.rpc.public_price_schedule = { data: null, error: { message: 'Failed to fetch' } };
    await render(<OrderScreen />);
    expect(await screen.findByText("Prices didn't load — tap to try again")).toBeOnTheScreen();
    expect(screen.getByTestId('order-total')).toHaveTextContent('—');
    expect(screen.queryByText('Have a tester code?')).toBeNull();
    fake.rpc.public_price_schedule = { data: LIVE, error: null };
    await fireEvent.press(screen.getByTestId('order-place'));
    expect(await screen.findByText(`Place order · pay ${peso(softPrice.total)} by bank transfer`)).toBeOnTheScreen();
    expect(screen.queryByTestId('order-placing')).toBeNull(); // the tap only fetched the prices
  });
});

/** The address the walk picks (Metro Manila › Quezon City › Bagong Pag-asa), from the lists. */
async function pickedAddress(): Promise<AddressValue> {
  const { makePsgc, psgcLoader, pickProvince, pickCity, pickBarangay, regionNames, sortProvinces } = jest.requireActual('../src/lib/checkout/psgc') as typeof import('../src/lib/checkout/psgc');
  const { EMPTY_ADDRESS } = jest.requireActual('@web/lib/contact') as typeof import('@web/lib/contact');
  const p = makePsgc(psgcLoader(fetchFromDisk, BASE));
  const provinces = sortProvinces(await p.loadAllProvinces());
  const regions = regionNames(await p.loadRegions());
  let a = pickProvince(EMPTY_ADDRESS, provinces, regions, provinces.find((x) => x.name === 'Metro Manila')!.code);
  const cities = await p.loadCities(a.provinceCode);
  a = pickCity(a, cities, regions, cities.find((x) => x.name === 'Quezon City')!.code);
  const brgys = await p.loadBarangays(a.cityCode);
  a = pickBarangay(a, brgys, brgys.find((x) => x.name === 'Bagong Pag-asa')!.code);
  return { ...a, street: '123 Rizal St., Purok 2', zip: '1105' };
}
