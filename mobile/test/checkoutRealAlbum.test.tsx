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
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { PriceSchedule } from '@web/lib/pricing';
import OrderScreen from '../src/app/order';
import { fixtureCheckoutAlbum, fixturePhotos } from '../src/lib/checkout/fixtureAlbum';
import { ALBUM_NOT_SAVED } from '../src/lib/checkout/orderStart';
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
// The quality the album's memory videos were made for (read from the phone's store).
const mockTier = { value: 'standard' as 'standard' | 'hd', asked: [] as string[][] };
jest.mock('../src/lib/memories/albumTier', () => ({ albumClipTier: async (codes: string[]) => { mockTier.asked.push(codes); return mockTier.value; } }));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: async () => ({ canceled: true, assets: null }) }));

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
      await fireEvent.press(screen.getByText('Have a tester code?'));
      await fireEvent.changeText(screen.getByTestId('tester-code-input'), 'MEGYTEST');
      await fireEvent.press(screen.getByTestId('tester-code-apply'));
    }
    await fireEvent.press(screen.getByTestId('order-place'));
  }

  it('a tester order: sent for THAT album from the account\'s copy; "Test order placed", its number', async () => {
    await place(true);
    expect(await screen.findByText('Test order placed')).toBeOnTheScreen();
    expect(screen.getByTestId('order-done-number')).toHaveTextContent('Order MP-2026-TEST01');
    expect(mockSend.calls).toHaveLength(1);
    const c = mockSend.calls[0];
    expect(c.plan.orderRow).toMatchObject({ album_id: 'album-7', tester_code: 'MEGYTEST', album_snapshot: { id: 'album-7', title: "Maria's Wedding" } });
    expect([c.cover, c.material, c.placed]).toEqual(['softcover', 'matte', null]);
    // Nothing of the test version: no "Stopped before sending", no test notes.
    expect(screen.queryByText('Stopped before sending')).toBeNull();
    expect(screen.queryByTestId('order-own-album')).toBeNull();
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

function textOf(node: { children?: unknown[]; props?: { children?: unknown } }): string {
  const kids = (node as { children?: unknown[] }).children ?? [];
  return kids.map((c) => (typeof c === 'string' ? c : textOf(c as never))).join('');
}
