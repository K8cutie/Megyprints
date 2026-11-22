/* ══════════════════════════════════════════════════════════════════════════
   WHY THIS TEST: "Order this album again" on an order (the website's link on
   every order not waiting for payment, src/pages/MyOrders.tsx). A reprint is
   a new order from the phone: the shop deletes its print file 90 days after
   delivery, the album stays in the account and its photos on the phone.
   Walked the way a customer does it: the order screen, the tap, the album
   read in by the same loadAlbum My albums uses, then the Preview asked to
   order it (its checks and save: test/previewScreen.test.tsx holds that
   part). The database is a stand-in; nothing is written.
   ══════════════════════════════════════════════════════════════════════════ */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { colors } from '../src/lib/theme';
import { answers, calls, orderRow, resetOrdersFake } from './helpers/fakeOrders';

const mockAuth = { session: { user: { id: 'user-1', email: 'maria@example.test' } } };
const mockSteps: string[] = [];
const mockParams: { id?: string } = {};

jest.mock('../src/lib/auth', () => ({ useAuth: () => ({ session: mockAuth.session, loading: false, signOut: jest.fn() }) }));
jest.mock('../src/lib/supabase', () => ({ supabase: jest.requireActual('./helpers/fakeOrders').ordersClient, supabaseConfigured: true, supabaseUrl: 'https://example-project.supabase.co' }));
jest.mock('expo-router', () => ({
  router: { push: (r: unknown) => { mockSteps.push(`push ${String(r)}`); }, replace: jest.fn(), back: jest.fn(), canGoBack: () => true },
  Redirect: ({ href }: { href: string }) => { const { Text } = jest.requireActual('react-native'); return <Text>{`redirect:${href}`}</Text>; },
  useLocalSearchParams: () => mockParams,
}));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: async () => ({ canceled: true, assets: null }) }));
jest.mock('../src/lib/checkout/phoneSend', () => ({ sendPaymentFromPhone: async () => ({ receiptError: null }) }));

/** The account's albums as the cloud has them, and the one on the phone. */
const mockCloud: {
  online: boolean;
  onScreen: string | undefined;
  asked: string[];
  rows: Record<string, { pages: unknown[] }>;
  release: (() => void) | null;
  hold: boolean;
} = { online: true, onScreen: undefined, asked: [], rows: {}, release: null, hold: false };

// The website's builder, as far as opening an album goes (test/albumsOpen.test.tsx's stand-in).
jest.mock('../src/builder/BuilderProvider', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { memoryStore } = jest.requireActual('../src/builder/deviceStore') as typeof import('../src/builder/deviceStore');
  const store = memoryStore();
  return {
    useOptionalBuilder: () => {
      const [st, setSt] = React.useState({ pages: [] as unknown[], loading: false });
      const builder = {
        albumTitle: 'On the phone', albumPages: st.pages, uploadedPhotos: [], isLoadingCloud: st.loading,
        getAlbumId: () => mockCloud.onScreen,
        goToPage: (i: number) => { mockSteps.push(`page ${i}`); },
        loadAlbum: async (id: string) => {
          mockCloud.asked.push(id);
          setSt((s) => ({ ...s, loading: true }));
          if (mockCloud.hold) await new Promise<void>((r) => { mockCloud.release = r; });
          const row = mockCloud.rows[id];
          if (!mockCloud.online || !row) { setSt((s) => ({ ...s, loading: false })); return; }
          mockCloud.onScreen = id;
          setSt({ pages: row.pages, loading: false });
        },
      };
      return { builder, platform: { deviceStore: store } };
    },
  };
});

import OrderDetails from '../src/app/order-details';
import { takeOrderRequest } from '../src/builder/orderRequest';

/** 40 pages with photos on them: a made album (opens at its Preview). */
const madePages = Array.from({ length: 40 }, (_, i) => ({ slotFills: [i], photos: [] }));
const W = (o: Parameters<typeof orderRow>[0]) => orderRow(o);
const ORDERS = [
  W({ id: 'done', order_number: 'MP-2026-DONE005', status: 'delivered', created_at: '2026-09-10T03:00:00Z', amount: 1500 }),
  W({ id: 'gone', order_number: 'MP-2026-GONE006', status: 'cancelled', created_at: '2026-09-01T03:00:00Z', quoted_amount: 1288 }),
  W({ id: 'print', order_number: 'MP-2026-PRNT003', status: 'in_production', created_at: '2026-10-20T03:00:00Z', amount: 1710 }),
  W({ id: 'ship', order_number: 'MP-2026-SHIP004', status: 'shipped', created_at: '2026-10-10T03:00:00Z', amount: 2100 }),
  W({ id: 'wait', order_number: 'MP-2026-WAIT001', status: 'pending_payment', created_at: '2026-10-25T17:30:00Z', quoted_amount: 1288 }),
  W({ id: 'noalbum', order_number: 'MP-2026-NOAL010', status: 'delivered', created_at: '2026-09-10T03:00:00Z', amount: 1500, album_id: null }),
];

beforeEach(() => {
  resetOrdersFake();
  answers.orders = ORDERS.map((o) => ({ ...o }));
  mockSteps.length = 0;
  mockCloud.online = true;
  mockCloud.onScreen = undefined;
  mockCloud.asked = [];
  mockCloud.hold = false;
  mockCloud.release = null;
  mockCloud.rows = { 'album-1': { pages: madePages } };
  takeOrderRequest(undefined); // nothing asked from an earlier test
});

const open = async (id: string) => {
  mockParams.id = id;
  await render(<OrderDetails />);
  return screen.findByTestId('order-details');
};
const filled = () => expect(screen.getByTestId('order-again')).toHaveStyle({ backgroundColor: colors.accent });
const plain = () => expect(screen.getByTestId('order-again')).toHaveStyle({ backgroundColor: colors.card });

describe('which orders offer "Order this album again"', () => {
  it('delivered: the one filled button, with a line saying the photos on this phone print it again', async () => {
    await open('done');
    expect(screen.getByText('Order this album again')).toBeTruthy();
    filled();
    expect(screen.getByTestId('order-again-note').props.children).toBe('Want another copy? Your album is still saved, and we print it again from the photos on this phone.');
  });

  it('cancelled: filled too (the note above it says "you can order it again"), without the delivered line', async () => {
    await open('gone');
    filled();
    expect(screen.queryByTestId('order-again-note')).toBeNull();
  });

  it.each(['print', 'ship'])('%s, still on its way: there, but plain', async (id) => {
    await open(id);
    plain();
    expect(screen.queryByTestId('order-again-note')).toBeNull();
  });

  it('waiting for payment: not there (pay or cancel that one first), as on the website', async () => {
    await open('wait');
    expect(screen.queryByTestId('order-again')).toBeNull();
    expect(screen.getByTestId('order-pay')).toBeTruthy();
  });

  it('its album was deleted in My albums: not there (nothing is saved to order again)', async () => {
    await open('noalbum');
    expect(screen.queryByTestId('order-again')).toBeNull();
  });
});

describe('tapping it', () => {
  it('opens the album (the same loadAlbum as My albums), at its cover, then the Preview, asked to order it once', async () => {
    await open('done');
    await fireEvent.press(screen.getByTestId('order-again'));
    await waitFor(() => expect(mockSteps).toContain('push /preview'));
    expect(mockCloud.asked).toEqual(['album-1']);
    expect(mockSteps).toEqual(['page 0', 'push /preview']);
    expect(takeOrderRequest('album-1')).toBe(true);
    expect(takeOrderRequest('album-1')).toBe(false); // once
    // nothing written (my_unsent_orders, 0068, only reads)
    expect(calls.rpcs.filter((c) => c.name !== 'my_unsent_orders')).toEqual([]);
  });

  it('a second tap while it opens does nothing; the button shows it is working, never greyed', async () => {
    mockCloud.hold = true;
    await open('done');
    await fireEvent.press(screen.getByTestId('order-again'));
    expect(screen.getByTestId('order-again').props.accessibilityState).toMatchObject({ busy: true });
    filled();
    await fireEvent.press(screen.getByTestId('order-again'));
    expect(mockCloud.asked).toEqual(['album-1']);
    await act(async () => { mockCloud.release?.(); });
    await waitFor(() => expect(mockSteps).toContain('push /preview'));
  });

  it('the album could not be read (offline): says so, opens nothing, asks nothing', async () => {
    mockCloud.online = false;
    await open('done');
    await fireEvent.press(screen.getByTestId('order-again'));
    expect((await screen.findByTestId('order-again-error')).props.children).toBe('Could not open this album. Check that the phone is online, then try again.');
    expect(mockSteps).toEqual([]);
    expect(takeOrderRequest('album-1')).toBe(false);
    // Back online, the same button tries again.
    mockCloud.online = true;
    await fireEvent.press(screen.getByTestId('order-again'));
    await waitFor(() => expect(mockSteps).toContain('push /preview'));
    expect(screen.queryByTestId('order-again-error')).toBeNull();
  });

  it('an album no longer made (its pages gone): it opens at its next step, and orders nothing', async () => {
    mockCloud.rows = { 'album-1': { pages: [] } };
    await open('done');
    await fireEvent.press(screen.getByTestId('order-again'));
    await waitFor(() => expect(mockSteps.some((s) => s.startsWith('push '))).toBe(true));
    expect(mockSteps).not.toContain('push /preview');
    expect(takeOrderRequest('album-1')).toBe(false);
  });
});
