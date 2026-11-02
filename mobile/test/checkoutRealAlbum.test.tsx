/* ══════════════════════════════════════════════════════════════════════════
   CHECKOUT ON THE CUSTOMER'S OWN ALBUM (Phase 5, step 2).

   The Preview's "Order this album" opens checkout with the album's id
   (lib/checkout/orderStart.ts). Checkout then orders THAT album: its pages
   from the app's album, and the copy in the account, read back by its id
   (the website's selectOrderAlbum: never another album). Still the test
   version: Place order builds what it would send, shows it, and sends
   nothing (step 3 sends it). Opened from the home screen's test button,
   with no album id, checkout keeps its test album (checkoutWalk.test.tsx).

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

jest.mock('../src/lib/auth', () => ({ useAuth: () => ({ session: mockAuth.session, loading: false }) }));
jest.mock('../src/lib/supabase', () => ({ supabase: jest.requireActual('./helpers/fakeSupabase').fakeClient, supabaseConfigured: true }));
jest.mock('expo-router', () => ({
  router: { push: (...a: unknown[]) => mockNav.push(...a), back: () => mockNav.back() },
  useLocalSearchParams: () => mockParams,
}));
jest.mock('../src/builder/BuilderProvider', () => ({ useOptionalBuilder: () => (mockAlbum.builder ? { builder: mockAlbum.builder } : null) }));
jest.mock('expo-keep-awake', () => ({ useKeepAwake: jest.fn() }));
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
  });

  it('Place order builds the order for THAT album from the account\'s copy, and sends nothing', async () => {
    await render(<OrderScreen />);
    await screen.findByTestId('order-own-album');
    await fillDetails();
    await fireEvent.press(screen.getByText('Have a tester code?'));
    await fireEvent.changeText(screen.getByTestId('tester-code-input'), 'MEGYTEST');
    await fireEvent.press(screen.getByTestId('tester-code-apply'));
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
    await fireEvent.press(screen.getByText('Place order · free with tester code'));
    for (let i = 0; i < 400 && screen.queryByTestId('order-placing'); i++) await act(async () => { jest.advanceTimersByTime(1000); });
    jest.useRealTimers();
    expect(await screen.findByText('Stopped before sending')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('test-panel-toggle'));
    const shown = JSON.parse(String(screen.getByText(/"orders": \{/).props.children)) as { orders: { album_id: string; album_snapshot: { title: string; id: string } } };
    expect(shown.orders.album_id).toBe('album-7');
    expect(shown.orders.album_snapshot).toMatchObject({ id: 'album-7', title: "Maria's Wedding" });
    expect(rec.inserts).toHaveLength(0);
    expect(rec.uploads).toHaveLength(0);
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
