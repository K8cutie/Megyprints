/* ══════════════════════════════════════════════════════════════════════════
   CHECKOUT ON THE CUSTOMER'S OWN ALBUM (Phase 5, steps 2 and 3).

   The Preview's "Order this album" opens checkout with the album's id
   (lib/checkout/orderStart.ts). Checkout then orders THAT album: its pages
   from the app's album, and the copy in the account, read back by its id
   (the website's selectOrderAlbum: never another album). Place order SENDS
   it (lib/checkout/phoneSend.ts: the print files made on the phone, the
   order sender; a stand-in here, the sender itself is sendOrder.test.ts):
   the bar follows the real steps in the website's words; a tester order
   ends "Test order placed", a paid one opens its payment step, and "I've
   sent" records the payment. A step that fails says why and keeps the
   order: Place order again reuses it. Opened from the home screen's test
   button, with no album id, checkout keeps its test album and sends
   nothing (checkoutWalk.test.tsx).

   Only the outside is a stand-in, as in checkoutWalk.test.tsx: the
   database (helpers/fakeSupabase.ts), who is signed in, the navigator.
   ══════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { ScrollView } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { PriceSchedule } from '@web/lib/pricing';
import OrderScreen from '../src/app/order';
import { fixtureCheckoutAlbum, fixturePhotos } from '../src/lib/checkout/fixtureAlbum';
import { ALBUM_NOT_SAVED } from '../src/lib/checkout/orderStart';
import { forgetCheckoutOnPhone } from '../src/lib/checkout/formKeep';
import { fake, rec, resetFake } from './helpers/fakeSupabase';
import { BASE, fetchFromDisk } from './helpers/psgcFiles';

const mockAuth: { session: { user: { id: string } } | null } = { session: { user: { id: 'user-1' } } };
const mockNav = { push: jest.fn(), back: jest.fn() };
const mockParams: { albumId?: string } = { albumId: 'album-7' };
const mockAlbum = { builder: null as unknown };
type SendCall = { plan: { orderRow: Record<string, unknown> }; placed: unknown; cover: string; material: string; onStep: (s: unknown) => void; onOrder: (o: unknown) => void };
const placesAndSends = async (c: SendCall): Promise<unknown> => {
  c.onStep({ step: 'order' });
  c.onOrder({ id: 'order-1', order_number: 'MP-2026-TEST01', status: 'pending_payment' });
  c.onStep({ step: 'cover' });
  c.onStep({ step: 'pages', done: 1, total: 2, smaller: false });
  return { order: { id: 'order-1', order_number: 'MP-2026-TEST01', status: 'pending_payment' }, paidByTester: !!c.plan.orderRow.tester_code };
};
const mockSend = {
  calls: [] as SendCall[],
  run: async (c: SendCall): Promise<unknown> => {
    c.onStep({ step: 'order' });
    c.onOrder({ id: 'order-1', order_number: 'MP-2026-TEST01', status: 'pending_payment' });
    c.onStep({ step: 'cover' });
    c.onStep({ step: 'pages', done: 1, total: 2, smaller: false });
    return { order: { id: 'order-1', order_number: 'MP-2026-TEST01', status: 'pending_payment' }, paidByTester: !!c.plan.orderRow.tester_code };
  },
  payments: [] as { plan: { rpc: { args: Record<string, unknown> } }; receipt: unknown }[],
};

jest.mock('../src/lib/auth', () => ({ useAuth: () => ({ session: mockAuth.session, loading: false }) }));
jest.mock('../src/lib/supabase', () => ({ supabase: jest.requireActual('./helpers/fakeSupabase').fakeClient, supabaseConfigured: true }));
jest.mock('expo-router', () => ({
  router: { push: (...a: unknown[]) => mockNav.push(...a), back: () => mockNav.back() },
  useLocalSearchParams: () => mockParams,
}));
jest.mock('../src/builder/BuilderProvider', () => ({ useOptionalBuilder: () => (mockAlbum.builder ? { builder: mockAlbum.builder, text: {} } : null) }));
// The phone's part of sending (Skia, the files, the live database): a stand-in.
jest.mock('../src/lib/checkout/phoneSend', () => ({
  sendFromPhone: (c: SendCall) => { mockSend.calls.push(c); return mockSend.run(c); },
  sendPaymentFromPhone: async (plan: never, receipt: unknown) => { mockSend.payments.push({ plan, receipt }); return { receiptError: null }; },
}));
jest.mock('expo-keep-awake', () => ({ useKeepAwake: jest.fn() }));
// The phone's event links (AsyncStorage on the phone): in memory.
const mockLinks: Record<string, unknown> = {};
jest.mock('../src/lib/events/albumEventLink', () => ({
  readEventLink: async (id: string) => mockLinks[id] ?? null,
  saveEventLink: async (id: string, l: unknown) => { mockLinks[id] = l; },
  dropEventLink: async (id: string) => { delete mockLinks[id]; },
}));
// The quality the album's memory videos were made for (read from the phone's store).
const mockTier = { value: 'standard' as 'standard' | 'hd', asked: [] as string[][] };
jest.mock('../src/lib/memories/albumTier', () => ({ albumClipTier: async (codes: string[]) => { mockTier.asked.push(codes); return mockTier.value; } }));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: async () => ({ canceled: true, assets: null }) }));
// The page renderer (Skia on the phone): the picture it would draw, by what was asked.
const mockPictures: { page: { id?: string; background?: unknown }; coverMode?: boolean; width: number }[] = [];
jest.mock('../src/builder/usePagePicture', () => ({
  usePagePicture: (_text: unknown, req: { page: { id?: string }; coverMode?: boolean; width: number } | null) => {
    if (req) mockPictures.push(req);
    return { uri: req ? `file:///cache/megy-pages/${req.coverMode ? 'cover' : 'page'}-${req.width}.jpg` : null, notDrawn: [], missing: 0, error: null };
  },
  PRIORITY: { editing: 3, shown: 2, thumbnail: 1, ahead: 0 },
}));

/** Like the live list (as in checkoutWalk.test.tsx). */
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

/** The customer's album, as the app holds it (here: the test album's pages under another id and name). */
const pages = fixtureCheckoutAlbum().pages;
const photos = fixturePhotos();
const ownAlbum = {
  getAlbumId: () => 'album-7', albumTitle: "Maria's Wedding", albumSize: '8x8' as const,
  albumPages: pages, uploadedPhotos: photos, coverFront: fixtureCheckoutAlbum().coverFront,
};
/** The account's copy of it. */
const ROW = {
  id: 'album-7', user_id: 'user-1', title: "Maria's Wedding", album_type: 'standard', album_size: '8x8', selected_template: 'classic',
  photos_per_page: null, pages, photos: photos.map(({ id, name, size, width, height }) => ({ id, name, size, width, height })),
  cover_photo: null, cover_front: ownAlbum.coverFront, occasion: 'Wedding',
};

beforeEach(() => {
  resetFake();
  forgetCheckoutOnPhone();
  fake.rpc.public_price_schedule = { data: LIVE, error: null };
  fake.albumRow = ROW;
  mockAuth.session = { user: { id: 'user-1' } };
  mockParams.albumId = 'album-7';
  mockAlbum.builder = ownAlbum;
  mockNav.push.mockClear();
  mockNav.back.mockClear();
  mockSend.calls = [];
  mockSend.payments = [];
  mockSend.run = placesAndSends;
  mockTier.value = 'standard';
  mockTier.asked = [];
  for (const k of Object.keys(mockLinks)) delete mockLinks[k];
  global.fetch = jest.fn((url: string) => fetchFromDisk(String(url).replace('https://megyprints.vercel.app/psgc/', BASE))) as unknown as typeof fetch;
});
afterEach(() => { jest.useRealTimers(); });

async function pickFrom(field: string, typed: string, name: string) {
  await fireEvent.press(screen.getByTestId(field));
  await fireEvent.changeText(await screen.findByTestId('choice-search'), typed);
  await fireEvent.press(await screen.findByText(name));
}

async function fillDetails() {
  await fireEvent.changeText(screen.getByTestId('order-name'), 'Juan Dela Cruz');
  await fireEvent.changeText(screen.getByTestId('order-phone'), '0917 123 4567');
  await pickFrom('address-province', 'metro', 'Metro Manila');
  await pickFrom('address-city', 'quezon', 'Quezon City');
  await pickFrom('address-barangay', 'bagong pag', 'Bagong Pag-asa');
  await fireEvent.changeText(screen.getByTestId('address-street'), '123 Rizal St., Purok 2');
  await fireEvent.changeText(screen.getByTestId('address-zip'), '1105');
}

describe('"Your cover": the front of the book, as it prints (beta testers 2026-11-04)', () => {
  it('draws the album\'s own cover, the photo picked in the cover step on it, as the Preview does', async () => {
    // The cover step puts the photo on the cover as its background (setCoverToPhoto).
    const cover = { ...ownAlbum.coverFront, slotFills: [], background: { type: 'image', photoId: photos[5].id } };
    mockAlbum.builder = { ...ownAlbum, coverFront: cover };
    mockPictures.length = 0;
    await render(<OrderScreen />);
    await screen.findByTestId('order-own-album');
    const asked = mockPictures.find((r) => r.coverMode);
    expect(asked?.page).toBe(cover);
    expect([screen.getByTestId('order-cover').props.source].flat()[0]).toEqual({ uri: `file:///cache/megy-pages/cover-${asked!.width}.jpg` });
    expect(screen.queryByTestId('order-cover-empty')).toBeNull();
  });
});

describe('Back from checkout keeps what was typed (beta testers 2026-11-04: one Back wiped the form)', () => {
  /** The form as the screen shows it. */
  const shown = () => ({
    name: screen.getByTestId('order-name').props.value,
    phone: screen.getByTestId('order-phone').props.value,
    street: screen.getByTestId('address-street').props.value,
    zip: screen.getByTestId('address-zip').props.value,
  });
  const TYPED = { name: 'Juan Dela Cruz', phone: '+63 917 123 4567', street: '123 Rizal St., Purok 2', zip: '1105' };

  it('Back to the album and Order this album again: the same name, phone and address, the paper and cover kept', async () => {
    const first = await render(<OrderScreen />);
    await screen.findByTestId('order-own-album');
    await fillDetails();
    await fireEvent(screen.getByTestId('order-phone'), 'blur');
    await fireEvent.press(screen.getByText('Glossy'));
    expect(shown()).toEqual(TYPED);
    await first.unmount();
    await render(<OrderScreen />);
    await screen.findByTestId('order-own-album');
    expect(shown()).toEqual(TYPED);
    expect(await screen.findByText('Metro Manila')).toBeOnTheScreen();
    expect(screen.getByText('Quezon City')).toBeOnTheScreen();
    expect(screen.getByText('Bagong Pag-asa')).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: /Glossy/ })).toHaveProp('accessibilityState', { checked: true });
  });

  it('only for that album, and never for another account (the website\'s readCheckoutForm)', async () => {
    const first = await render(<OrderScreen />);
    await screen.findByTestId('order-own-album');
    await fillDetails();
    await first.unmount();
    mockAuth.session = { user: { id: 'user-2' } };
    const other = await render(<OrderScreen />);
    await screen.findByTestId('order-own-album');
    expect(screen.getByTestId('order-name').props.value).toBe('');
    await other.unmount();
    mockAuth.session = { user: { id: 'user-1' } };
    mockParams.albumId = 'album-8';
    fake.albumRow = { ...ROW, id: 'album-8' };
    mockAlbum.builder = { ...ownAlbum, getAlbumId: () => 'album-8' };
    await render(<OrderScreen />);
    await screen.findByTestId('order-own-album');
    expect(screen.getByTestId('order-name').props.value).toBe('');
  });

  it('typed signed out, it comes back to whoever signs in; signing out forgets it', async () => {
    mockAuth.session = null;
    const first = await render(<OrderScreen />);
    await screen.findByTestId('order-own-album');
    await fireEvent.changeText(screen.getByTestId('order-name'), 'Juan Dela Cruz');
    await first.unmount();
    mockAuth.session = { user: { id: 'user-1' } };
    const again = await render(<OrderScreen />);
    await screen.findByTestId('order-own-album');
    expect(screen.getByTestId('order-name').props.value).toBe('Juan Dela Cruz');
    await again.unmount();
    forgetCheckoutOnPhone();
    await render(<OrderScreen />);
    await screen.findByTestId('order-own-album');
    expect(screen.getByTestId('order-name').props.value).toBe('');
  });

  it('signed out with Your order open (sign-in ran out, or Sign out on another device): the details go, and the next account never sees them (Mother, round 2)', async () => {
    const screenNow = await render(<OrderScreen />);
    await screen.findByTestId('order-own-album');
    await fillDetails();
    await fireEvent.press(screen.getByText('Glossy'));
    // What auth.tsx does on SIGNED_OUT, with the screen still open.
    forgetCheckoutOnPhone();
    mockAuth.session = null;
    await screenNow.rerender(<OrderScreen />);
    expect(shown()).toEqual({ name: '', phone: '', street: '', zip: '' });
    expect(screen.getByRole('radio', { name: /Matte/ })).toHaveProp('accessibilityState', { checked: true });
    await screenNow.unmount();
    mockAuth.session = { user: { id: 'user-2' } };
    await render(<OrderScreen />);
    await screen.findByTestId('order-own-album');
    expect(shown()).toEqual({ name: '', phone: '', street: '', zip: '' });
  });

  it('a guest who signs in with Your order open keeps what they typed', async () => {
    mockAuth.session = null;
    const screenNow = await render(<OrderScreen />);
    await screen.findByTestId('order-own-album');
    await fireEvent.changeText(screen.getByTestId('order-name'), 'Juan Dela Cruz');
    mockAuth.session = { user: { id: 'user-1' } };
    await screenNow.rerender(<OrderScreen />);
    expect(screen.getByTestId('order-name').props.value).toBe('Juan Dela Cruz');
  });

  it('signing out (or being signed out) forgets it, as the website\'s forgetCheckoutOnDevice', () => {
    const AUTH = fs.readFileSync(path.join(__dirname, '../src/lib/auth.tsx'), 'utf8');
    expect(AUTH).toContain("if (event === 'SIGNED_OUT') forgetCheckoutOnPhone();");
  });
});

describe('checkout on the album "Order this album" opened it with', () => {
  it('that album, not the test album; its copy read from the account by its id', async () => {
    await render(<OrderScreen />);
    expect(await screen.findByTestId('order-own-album')).toBeOnTheScreen();
    expect(screen.queryByTestId('order-test-album')).toBeNull();
    expect(rec.reads).toContainEqual({ table: 'albums', columns: '*', filters: { user_id: 'user-1', id: 'album-7' } });
    // No memories on this album: no hosting term to choose (the website's rule).
    expect(screen.queryByTestId('order-terms')).toBeNull();
  });

  /** Place order, the tester code applied or not. */
  async function place(tester: boolean) {
    await render(<OrderScreen />);
    await screen.findByTestId('order-own-album');
    await fillDetails();
    if (tester) {
      fake.rpc.check_tester_code = { data: { ok: true, code: 'MEGYTEST' }, error: null };
      await fireEvent.press(screen.getByText('Have a tester code?'));
      await fireEvent.changeText(screen.getByTestId('tester-code-input'), 'MEGYTEST');
      await fireEvent.press(screen.getByTestId('tester-code-apply'));
      expect(await screen.findByText('✓ Tester code MEGYTEST: free')).toBeOnTheScreen();
    }
    await fireEvent.press(screen.getByTestId('order-place'));
  }

  it('a tester order: sent for THAT album from the account\'s copy; "Test order placed", its number', async () => {
    await place(true);
    expect(await screen.findByText('Test order placed')).toBeOnTheScreen();
    // The code was checked with the database first, as on the website: the
    // order's tester code is taken only from an account that checked it
    // (0057's trigger; without the check: "MEGYTEST doesn't work any more").
    expect(rec.rpcs).toContainEqual({ name: 'check_tester_code', args: { p_code: 'MEGYTEST' } });
    expect(screen.queryByTestId('tester-code-unchecked')).toBeNull();
    expect(screen.getByTestId('order-done-number')).toHaveTextContent('Order MP-2026-TEST01');
    expect(mockSend.calls).toHaveLength(1);
    const c = mockSend.calls[0];
    expect(c.plan.orderRow).toMatchObject({ album_id: 'album-7', tester_code: 'MEGYTEST', album_snapshot: { id: 'album-7', title: "Maria's Wedding" } });
    expect([c.cover, c.material, c.placed]).toEqual(['softcover', 'matte', null]);
    // Nothing of the test version: no "Stopped before sending", no test notes.
    expect(screen.queryByText('Stopped before sending')).toBeNull();
    expect(screen.queryByTestId('order-own-album')).toBeNull();
  });

  it.each([
    ['wrong', "That code doesn't work. Check the spelling."],
    ['too_many', 'Too many wrong codes. Try again in an hour.'],
  ])('a code the database refuses (%s): its words, and the album keeps its price', async (reason, words) => {
    await render(<OrderScreen />);
    await screen.findByTestId('order-own-album');
    fake.rpc.check_tester_code = { data: { ok: false, reason }, error: null };
    await fireEvent.press(screen.getByText('Have a tester code?'));
    await fireEvent.changeText(screen.getByTestId('tester-code-input'), 'MEGYTEST');
    await fireEvent.press(screen.getByTestId('tester-code-apply'));
    expect(await screen.findByText(words)).toBeOnTheScreen();
    expect(rec.rpcs).toContainEqual({ name: 'check_tester_code', args: { p_code: 'MEGYTEST' } });
    expect(screen.queryByTestId('tester-code-on')).toBeNull();
    expect(screen.queryByTestId('order-tester-line')).toBeNull();
  });

  it('the bar follows the real steps, in the website\'s words', async () => {
    let finish: () => void = () => {};
    mockSend.run = async (c) => {
      c.onStep({ step: 'order' });
      c.onStep({ step: 'cover' });
      c.onStep({ step: 'pages', done: 3, total: 40, smaller: false });
      await new Promise<void>((r) => { finish = r; });
      return { order: { id: 'order-1', order_number: 'MP-2026-TEST01', status: 'paid' }, paidByTester: true };
    };
    await place(true);
    // 3 pages done: the 4th is being made (placeProgress pagesLabel).
    expect(await screen.findByText('Making page 4 of 40…')).toBeOnTheScreen();
    expect(screen.getByText('Placing your order')).toBeOnTheScreen();
    expect(screen.getByText('Keep this screen open. This can take a few minutes.')).toBeOnTheScreen();
    expect(screen.queryByText(/Test version/)).toBeNull();
    await act(async () => { finish(); });
    expect(await screen.findByText('Test order placed')).toBeOnTheScreen();
  });

  it('a paid order: its payment step for real; "I\'ve sent" records the payment for THAT order', async () => {
    await place(false);
    expect(await screen.findByTestId('pay-order-placed')).toHaveTextContent('Order MP-2026-TEST01 is placed. Pay by bank transfer to finish.');
    expect(screen.queryByTestId('pay-test-note')).toBeNull();
    expect(screen.queryByTestId('pay-qr-test-band')).toBeNull();
    await fireEvent.changeText(screen.getByTestId('pay-reference'), '2026091012345678');
    await fireEvent.press(screen.getByTestId('pay-sent'));
    expect(await screen.findByText("Thank you — we're confirming your payment")).toBeOnTheScreen();
    expect(mockSend.payments).toHaveLength(1);
    expect(mockSend.payments[0].plan.rpc.args).toEqual({ p_order_id: 'order-1', p_reference: '2026091012345678', p_proof_path: null });
  });

  it('a step that fails: the website\'s words on the form; Place order again reuses the order', async () => {
    mockSend.run = async (c) => {
      c.onOrder({ id: 'order-1', order_number: 'MP-2026-TEST01', status: 'pending_payment' });
      throw new Error('Print file upload failed: timeout');
    };
    await place(false);
    expect(await screen.findByText('Print file upload failed: timeout')).toBeOnTheScreen();
    mockSend.run = async () => ({ order: { id: 'order-1', order_number: 'MP-2026-TEST01', status: 'pending_payment' }, paidByTester: false });
    await fireEvent.press(screen.getByTestId('order-place'));
    expect(await screen.findByTestId('pay-order-placed')).toBeOnTheScreen();
    expect(mockSend.calls).toHaveLength(2);
    expect(mockSend.calls[1].placed).toEqual({ id: 'order-1', order_number: 'MP-2026-TEST01', status: 'pending_payment' });
  });

  it('not in the account: the website\'s words, and the way back to the album', async () => {
    fake.albumRow = null;
    await render(<OrderScreen />);
    expect(await screen.findByText(ALBUM_NOT_SAVED)).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('order-back-to-album'));
    expect(mockNav.back).toHaveBeenCalled();
  });

  it('not signed in: nothing is read; Place order asks to sign in (the website\'s way)', async () => {
    mockAuth.session = null;
    await render(<OrderScreen />);
    await screen.findByTestId('order-own-album');
    expect(rec.reads.filter((r) => r.table === 'albums')).toHaveLength(0);
    await fillDetails();
    await fireEvent.press(screen.getByTestId('order-place'));
    expect(await screen.findByTestId('order-sign-in')).toBeOnTheScreen();
  });

  it('no album id (the home screen\'s test button): the test album, as before', async () => {
    mockParams.albumId = undefined;
    await render(<OrderScreen />);
    expect(await screen.findByTestId('order-test-album')).toBeOnTheScreen();
    expect(screen.queryByTestId('order-own-album')).toBeNull();
  });
});

describe('beta round 2 (Mother reproduced each one on the phone)', () => {
  async function useTesterCode() {
    fake.rpc.check_tester_code = { data: { ok: true, code: 'MEGYTEST' }, error: null };
    await fireEvent.press(screen.getByText('Have a tester code?'));
    await fireEvent.changeText(screen.getByTestId('tester-code-input'), 'MEGYTEST');
    await fireEvent.press(screen.getByTestId('tester-code-apply'));
    expect(await screen.findByText('✓ Tester code MEGYTEST: free')).toBeOnTheScreen();
  }
  /** A free test order of this album that stopped half-way (its cover sent, nothing after). */
  const STUCK = {
    id: 'order-9', order_number: 'MP-2026-QCFG5G4', status: 'pending_payment', amount: null, quoted_amount: 0,
    created_at: '2026-11-04T00:30:00Z', payment_submitted_at: null, tester_code: 'MEGYTEST',
  };

  it('a free test order that stopped half-way: never "pay that order"; Place order with the code finishes THAT order', async () => {
    fake.orderRow = STUCK;
    await render(<OrderScreen />);
    const box = await screen.findByTestId('order-already-open');
    expect(box).toHaveTextContent(/This album has a test order that didn't finish: MP-2026-QCFG5G4, placed November 4\./);
    expect(box).toHaveTextContent(/Nothing is charged for a test order\. Use your tester code and tap Place order below to finish it\./);
    expect(box).not.toHaveTextContent(/waiting for payment|pay that order/);
    await fillDetails();
    await useTesterCode();
    await fireEvent.press(screen.getByTestId('order-place'));
    // No "second order?" question: the same order is finished (an unfinished
    // one counts as unpaid, and 3 unpaid orders stop new ones: 0042).
    expect(await screen.findByText('Test order placed')).toBeOnTheScreen();
    expect(screen.queryByTestId('order-second-ask')).toBeNull();
    expect(mockSend.calls).toHaveLength(1);
    expect(mockSend.calls[0].placed).toEqual({ id: 'order-9', order_number: 'MP-2026-QCFG5G4', status: 'pending_payment' });
  });

  it('the same test order, Place order WITHOUT a code: asked first, in words that fit a test order', async () => {
    fake.orderRow = STUCK;
    await render(<OrderScreen />);
    await screen.findByTestId('order-already-open');
    await fillDetails();
    await fireEvent.press(screen.getByTestId('order-place'));
    const ask = await screen.findByTestId('order-second-ask');
    // "a second order", as its button says (it said "a new order": round 3).
    expect(ask).toHaveTextContent(/This album has test order MP-2026-QCFG5G4 that didn't finish\. Place a second order for it\?/);
    expect(ask).not.toHaveTextContent(/waiting for payment/);
    expect(mockSend.calls).toHaveLength(0);
  });

  it('asked first, then the tester code (as the box says): the question goes, Place order is back and finishes THAT order (round 3)', async () => {
    fake.orderRow = STUCK;
    await render(<OrderScreen />);
    await screen.findByTestId('order-already-open');
    await fillDetails();
    await fireEvent.press(screen.getByTestId('order-place'));
    await screen.findByTestId('order-second-ask');
    await useTesterCode();
    // It stayed up, with no Place order, and its "Yes, place a second order"
    // finished the old order (Mother, round 3).
    expect(screen.queryByTestId('order-second-ask')).toBeNull();
    await fireEvent.press(screen.getByTestId('order-place'));
    expect(await screen.findByText('Test order placed')).toBeOnTheScreen();
    expect(mockSend.calls).toHaveLength(1);
    expect(mockSend.calls[0].placed).toEqual({ id: 'order-9', order_number: 'MP-2026-QCFG5G4', status: 'pending_payment' });
  });

  it('signed in on Your order while the album was going to the account: Place order reads it again and goes on', async () => {
    // The read right at sign-in found nothing yet (the album was still being saved).
    fake.albumRow = null;
    const s = await render(<OrderScreen />);
    expect(await screen.findByText(ALBUM_NOT_SAVED)).toBeOnTheScreen();
    fake.albumRow = ROW;
    await fillDetails();
    await useTesterCode();
    await fireEvent.press(screen.getByTestId('order-place'));
    expect(await screen.findByText('Test order placed')).toBeOnTheScreen();
    expect(mockSend.calls).toHaveLength(1);
    await s.unmount();
  });

  it('the builder\'s save landing reads the account\'s copy again: the "isn\'t saved" note goes by itself', async () => {
    fake.albumRow = null;
    const s = await render(<OrderScreen />);
    expect(await screen.findByTestId('order-not-saved')).toBeOnTheScreen();
    fake.albumRow = ROW;
    mockAlbum.builder = { ...ownAlbum, lastSavedAt: new Date(Date.UTC(2026, 10, 4, 0, 44)) };
    await s.rerender(<OrderScreen />);
    await waitFor(() => expect(screen.queryByTestId('order-not-saved')).toBeNull());
  });

  it('a send that stopped: the screen goes down to its words and Place order (they were below the fold)', async () => {
    mockSend.run = async (c) => {
      c.onOrder({ id: 'order-1', order_number: 'MP-2026-TEST01', status: 'pending_payment' });
      throw new Error("We couldn't send your album's pages. Your order is saved: check your internet, then tap Place order again.");
    };
    await render(<OrderScreen />);
    await screen.findByTestId('order-own-album');
    await fillDetails();
    await fireEvent.press(screen.getByTestId('order-place'));
    expect(await screen.findByText(/We couldn't send your album's pages/)).toBeOnTheScreen();
    const toEnd = (ScrollView as unknown as { prototype: { scrollToEnd: jest.Mock } }).prototype.scrollToEnd;
    toEnd.mockClear();
    await fireEvent(screen.getByTestId('order-form'), 'contentSizeChange', 400, 3000);
    expect(toEnd).toHaveBeenCalledTimes(1);
    // Only once: typing afterwards does not jump the page down again.
    await fireEvent(screen.getByTestId('order-form'), 'contentSizeChange', 400, 3100);
    expect(toEnd).toHaveBeenCalledTimes(1);
  });

  it('tester code signed out: "Sign in first" has its Sign in button; signed in, the old words go and the code stays typed', async () => {
    mockAuth.session = null;
    const s = await render(<OrderScreen />);
    await screen.findByTestId('order-own-album');
    await fireEvent.press(screen.getByText('Have a tester code?'));
    await fireEvent.changeText(screen.getByTestId('tester-code-input'), 'MEGYTEST');
    await fireEvent.press(screen.getByTestId('tester-code-apply'));
    expect(await screen.findByText('Sign in first, then type the code.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('tester-code-sign-in'));
    expect(mockNav.push).toHaveBeenCalledWith({ pathname: '/sign-in', params: { then: 'back' } });
    mockAuth.session = { user: { id: 'user-1' } };
    await s.rerender(<OrderScreen />);
    expect(screen.queryByText('Sign in first, then type the code.')).toBeNull();
    expect(screen.queryByTestId('tester-code-sign-in')).toBeNull();
    expect(screen.getByTestId('tester-code-input').props.value).toBe('MEGYTEST');
  });
});

describe('an album with a video memory', () => {
  const clip = { code: 'k3m9p2qz', destination: 'https://example.supabase.co/storage/v1/object/public/memory-clips/k3m9p2qz.mp4', qrPngDataUrl: 'data:image/png;base64,AAAA', memoryUrl: 'https://megyprints.vercel.app/m/k3m9p2qz', createdAt: 1, kind: 'clip' as const, clipExt: 'mp4' as const };
  const withClip = pages.map((p, i) => (i === 9 ? { ...p, qrFills: [clip, null] } : p));
  beforeEach(() => {
    mockAlbum.builder = { ...ownAlbum, albumPages: withClip };
    fake.albumRow = { ...ROW, pages: withClip };
  });

  it('made in HD: the order says HD (the website: hdMemories from the album\'s videos)', async () => {
    mockTier.value = 'hd';
    await render(<OrderScreen />);
    await screen.findByTestId('order-own-album');
    await fillDetails();
    await fireEvent.press(screen.getByTestId('order-place'));
    await screen.findByTestId('pay-order-placed').catch(() => null);
    expect(mockTier.asked).toContainEqual(['k3m9p2qz']);
    expect(mockSend.calls[0].plan.orderRow).toMatchObject({ hd_memories: true });
  });

  it('made in Standard: no HD', async () => {
    await render(<OrderScreen />);
    await screen.findByTestId('order-own-album');
    await fillDetails();
    await fireEvent.press(screen.getByTestId('order-place'));
    await screen.findByTestId('pay-order-placed').catch(() => null);
    expect(mockSend.calls[0].plan.orderRow).toMatchObject({ hd_memories: false });
  });

  it('how long the memories stay live: the website\'s choice; a longer term is priced and ordered', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ORDER_SRC = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', '..', 'src/pages/Order.tsx'), 'utf8') as string;
    for (const w of ['How long should your memories stay live?', 'Your videos play from the printed QR for the whole term. Renew anytime after.']) expect(ORDER_SRC).toContain(w);
    expect(ORDER_SRC).toContain("{t.price > 0 ? `+₱${t.price}` : 'Included'}");
    await render(<OrderScreen />);
    await screen.findByTestId('order-own-album');
    expect(screen.getByText('How long should your memories stay live?')).toBeOnTheScreen();
    expect(screen.getByTestId('order-term-5')).toHaveTextContent('5 yearsIncluded');
    expect(screen.getByTestId('order-term-10')).toHaveTextContent('10 years+₱99');
    expect(screen.getByTestId('order-term-20')).toHaveTextContent('20 years+₱199');
    expect(screen.getByTestId('order-term-5').props.accessibilityState).toEqual(expect.objectContaining({ checked: true }));
    const pesos = () => Number(String(screen.getByTestId('order-total').props.children ?? '').replace(/[^0-9]/g, '') || textOf(screen.getByTestId('order-total')).replace(/[^0-9]/g, ''));
    const before = pesos();
    await fireEvent.press(screen.getByTestId('order-term-10'));
    expect(pesos() - before).toBe(99);
    expect(screen.getByTestId('order-term-10').props.accessibilityState).toEqual(expect.objectContaining({ checked: true }));
    expect(screen.getByTestId('order-term-5').props.accessibilityState).toEqual(expect.objectContaining({ checked: false }));
    // Owner, 2026-11-04: the box said "5 years of memory hosting" beside a
    // 20-year line. It names the longer term, in the picker's words.
    expect(screen.getByTestId('order-included')).toHaveTextContent(/Memories stay live for 5 years \(you added 5 more years\)/);
    await fireEvent.press(screen.getByTestId('order-term-20'));
    expect(screen.getByTestId('order-included')).toHaveTextContent(/Memories stay live for 5 years \(you added 15 more years\)/);
    expect(screen.queryByText(/QR memories/)).toBeNull();
    expect(screen.getAllByText(/7 living-memory QRs included/).length).toBeGreaterThan(0);
    await fireEvent.press(screen.getByTestId('order-term-10'));
    await fillDetails();
    await fireEvent.press(screen.getByTestId('order-place'));
    await screen.findByTestId('pay-order-placed').catch(() => null);
    expect(mockSend.calls[0].plan.orderRow).toMatchObject({ hosting_years: 10 });
  });

  it('a video that is gone: the website\'s words naming its page, back on the form', async () => {
    const { MissingClipError } = jest.requireActual('../src/lib/memories/clips') as typeof import('../src/lib/memories/clips');
    mockSend.run = async () => { throw new MissingClipError(['k3m9p2qz']); };
    await render(<OrderScreen />);
    await screen.findByTestId('order-own-album');
    await fillDetails();
    await fireEvent.press(screen.getByTestId('order-place'));
    expect(await screen.findByText('The memory video on page 10 is no longer saved. Open your album and choose the video again for the QR on page 10, then order.')).toBeOnTheScreen();
    expect(screen.getByTestId('order-place')).toBeOnTheScreen();
  });
});


describe('an event\'s album: its booking pays (the website\'s Order.tsx)', () => {
  const booking = (over: Record<string, unknown> = {}) => ({
    id: 'bk-1', user_id: 'user-1', booking_number: 'EV-2026-0007', status: 'paid', deal_total: 25000, deal_deposit: 10000,
    deal_album_size: '8x8', deal_cover: 'hard', deal_pages: 80, album_order_id: null, created_at: '2026-10-01T00:00:00Z', ...over,
  });

  it('made on another device: "Use booking … for this album"; covered: ₱0, the deal\'s cover; the booking pays after the files', async () => {
    fake.bookings = [booking(), booking({ id: 'bk-2', booking_number: 'EV-2026-0008', album_order_id: 'o-9' })];
    mockSend.run = async (c) => {
      c.onStep({ step: 'order' });
      c.onOrder({ id: 'order-1', order_number: 'MP-2026-EV0001', status: 'pending_payment' });
      return { order: { id: 'order-1', order_number: 'MP-2026-EV0001', status: 'paid' }, paidByTester: false, paidByBooking: true };
    };
    await render(<OrderScreen />);
    await screen.findByTestId('order-own-album');
    expect(await screen.findByText('Is this your event album?')).toBeOnTheScreen();
    expect(screen.queryByTestId('order-event-use-EV-2026-0008')).toBeNull(); // already has its album order
    await fireEvent.press(screen.getByTestId('order-event-use-EV-2026-0007'));
    expect(await screen.findByText('Your booking pays for this album. There’s nothing more to pay.')).toBeOnTheScreen();
    expect(screen.getByText('Your event album · booking EV-2026-0007')).toBeOnTheScreen();
    expect(screen.getByTestId('order-event-line')).toHaveTextContent('Album — part of booking EV-2026-0007₱0');
    expect(screen.getByTestId('order-total')).toHaveTextContent('₱0');
    expect(screen.getByTestId('order-covered')).toHaveTextContent('Covered by your event booking');
    expect(screen.queryByText('Have a tester code?')).toBeNull();
    expect(mockLinks['album-7']).toEqual(expect.objectContaining({ bookingId: 'bk-1', atCheckout: true }));
    await fillDetails();
    expect(screen.getByTestId('order-place')).toHaveTextContent('Place my event album order');
    await fireEvent.press(screen.getByTestId('order-place'));
    expect(await screen.findByTestId('order-paid-by-booking')).toHaveTextContent('Your event booking EV-2026-0007 paid for this album. We print it and ship it to your door.');
    const plan = mockSend.calls[0].plan as unknown as { orderRow: Record<string, unknown>; steps: { kind: string; name?: string; args?: unknown }[] };
    expect(plan.orderRow).toMatchObject({ cover: 'hardboundLeather', hd_memories: false });
    expect(plan.orderRow).not.toHaveProperty('tester_code');
    expect(plan.steps.at(-1)).toEqual(expect.objectContaining({ kind: 'rpc', name: 'cover_order_with_booking', args: { p_order_id: '<order id>', p_booking_id: 'bk-1' } }));
  });

  it('a booking that can\'t pay yet: the website\'s words; Place order sends nothing; "Not my event album" makes it a normal album again', async () => {
    fake.bookings = [booking({ status: 'booked' })];
    await render(<OrderScreen />);
    await screen.findByTestId('order-own-album');
    await fireEvent.press(await screen.findByTestId('order-event-use-EV-2026-0007'));
    const blocked = 'Pay the ₱15,000 balance for booking EV-2026-0007 first (Events → your booking). Your album prints once it’s in.';
    expect(await screen.findByText(blocked)).toBeOnTheScreen();
    expect(screen.getByTestId('order-covered-later')).toHaveTextContent('Your booking pays for it. See the note at the top.');
    await fillDetails();
    await fireEvent.press(screen.getByTestId('order-place'));
    expect(screen.getAllByText(blocked).length).toBe(2);
    expect(mockSend.calls).toHaveLength(0);
    await fireEvent.press(screen.getByTestId('order-event-unlink'));
    expect(screen.queryByTestId('order-event-deal')).toBeNull();
    expect(mockLinks['album-7']).toBeUndefined();
    expect(screen.getByTestId('order-place')).toHaveTextContent(/Place order · pay ₱/);
  });

  it('an album of another size than the deal: the website\'s words', async () => {
    fake.bookings = [booking({ deal_album_size: '11.5x8' })];
    await render(<OrderScreen />);
    await screen.findByTestId('order-own-album');
    await fireEvent.press(await screen.findByTestId('order-event-use-EV-2026-0007'));
    expect(await screen.findByText(/^Your deal’s album is 11\.5×8, hardbound, up to 80 pages\. This one is 8×8 with \d+ pages\. Change it in your album to match, or ask us to update your deal\.$/)).toBeOnTheScreen();
  });

  it('no bookings waiting: no offer', async () => {
    await render(<OrderScreen />);
    await screen.findByTestId('order-own-album');
    expect(screen.queryByTestId('order-event-offer')).toBeNull();
  });
});

function textOf(node: { children?: unknown[]; props?: { children?: unknown } }): string {
  const kids = (node as { children?: unknown[] }).children ?? [];
  return kids.map((c) => (typeof c === 'string' ? c : textOf(c as never))).join('');
}
