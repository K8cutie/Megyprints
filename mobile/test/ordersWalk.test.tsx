/* ══════════════════════════════════════════════════════════════════════════
   WHY THIS TEST: Your orders and the order screen, walked the way a
   customer goes through them: the real screens with their real parts, the
   database a stand-in holding orders in every state (waiting for payment,
   payment sent, printing, on its way with a courier number, delivered,
   cancelled, a tester-code order). Where each one is comes from its status;
   an order waiting for payment opens checkout's payment step; cancelling
   asks twice and calls the website's RPC. Nothing else is written.
   ══════════════════════════════════════════════════════════════════════════ */
import { fireEvent, render, screen } from '@testing-library/react-native';
import OrderDetails from '../src/app/order-details';
import Orders from '../src/app/orders';
import { answers, calls, orderRow, resetOrdersFake } from './helpers/fakeOrders';

const mockAuth: { session: { user: { id: string; email: string } } | null } = { session: { user: { id: 'user-1', email: 'maria@example.test' } } };
const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true };
const mockParams: { id?: string } = {};

jest.mock('../src/lib/auth', () => ({ useAuth: () => ({ session: mockAuth.session, loading: false, signOut: jest.fn() }) }));
jest.mock('../src/lib/supabase', () => ({ supabase: jest.requireActual('./helpers/fakeOrders').ordersClient, supabaseConfigured: true, supabaseUrl: 'https://example-project.supabase.co' }));
jest.mock('expo-router', () => ({
  router: { push: (...a: unknown[]) => mockRouter.push(...a), replace: (...a: unknown[]) => mockRouter.replace(...a), back: () => mockRouter.back(), canGoBack: () => mockRouter.canGoBack() },
  Redirect: ({ href }: { href: string }) => { const { Text } = jest.requireActual('react-native'); return <Text>{`redirect:${href}`}</Text>; },
  useLocalSearchParams: () => mockParams,
}));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: async () => ({ canceled: true, assets: null }) }));

const W = (o: Parameters<typeof orderRow>[0]) => orderRow(o);
const ORDERS = [
  W({ id: 'wait', order_number: 'MP-2026-WAIT001', status: 'pending_payment', created_at: '2026-10-25T17:30:00Z', quoted_amount: 1288, album_title: "Maria's Debut" }),
  W({ id: 'sent', order_number: 'MP-2026-SENT002', status: 'pending_payment', created_at: '2026-10-24T03:00:00Z', quoted_amount: 1710, payment_submitted_at: '2026-10-24T05:00:00Z', album_title: 'My Album' }),
  W({ id: 'print', order_number: 'MP-2026-PRNT003', status: 'in_production', created_at: '2026-10-20T03:00:00Z', amount: 1710, quoted_amount: 1710, album_size: '6x6', page_count: 44 }),
  W({ id: 'ship', order_number: 'MP-2026-SHIP004', status: 'shipped', created_at: '2026-10-10T03:00:00Z', amount: 2100, tracking: 'JNT-778899' }),
  W({ id: 'done', order_number: 'MP-2026-DONE005', status: 'delivered', created_at: '2026-09-10T03:00:00Z', amount: 1500 }),
  W({ id: 'gone', order_number: 'MP-2026-GONE006', status: 'cancelled', created_at: '2026-09-01T03:00:00Z', quoted_amount: 1288 }),
  W({ id: 'test', order_number: 'MP-2026-TEST007', status: 'pending_payment', created_at: '2026-08-01T03:00:00Z', quoted_amount: 0, amount: 0, tester_code: 'MEGYTEST' }),
  W({ id: 'other', order_number: 'MP-2026-OTHR008', status: 'paid', created_at: '2026-10-28T03:00:00Z', user_id: 'someone-else' }),
];

beforeEach(() => {
  resetOrdersFake();
  answers.orders = ORDERS.map((o) => ({ ...o }));
  mockAuth.session = { user: { id: 'user-1', email: 'maria@example.test' } };
  mockRouter.push.mockReset();
  delete mockParams.id;
});

/** Nothing but reads, and the RPCs a test expects. */
const writes = () => calls.rpcs.map((r) => r.name);

describe('Your orders', () => {
  it("lists this account's orders, newest first, each where it is now, in the website's words", async () => {
    await render(<Orders />);
    expect(await screen.findByText('Where each album is now. We text you at each big step too.')).toBeTruthy();
    const cards = await screen.findAllByTestId('order-card');
    expect(cards).toHaveLength(7); // not the other account's
    const headlines = screen.getAllByTestId('order-headline').map((t) => t.props.children);
    expect(headlines).toEqual([
      'Waiting for your payment',
      "Payment sent — we're confirming it",
      'Printing your album',
      'On its way to you',
      'Delivered',
      'Cancelled',
      'Test order: nothing will be printed or sent',
    ]);
    // Names: an album with a name shows it; "My Album" (never named) doesn't.
    expect(screen.getAllByTestId('order-album-name').map((t) => t.props.children)).toEqual(["Maria's Debut"]);
    expect(screen.getByText('Placed October 26, 2026 · 8×8" Square · 40 pages')).toBeTruthy();
    expect(screen.getByText('Placed October 20, 2026 · 6×6" Square · 44 pages')).toBeTruthy();
    // Prices: the asked total while waiting, the shop's amount after; none on the cancelled one; ₱0 on the test.
    expect(screen.getAllByTestId('order-price').map((t) => t.props.children)).toEqual(['₱1,288', '₱1,710', '₱1,710', '₱2,100', '₱1,500', '₱0']);
    expect(screen.getByTestId('order-pay-by').props.children).toBe('Please pay by November 2, 2026. After that this order closes by itself, and your album stays saved.');
    expect(screen.getByTestId('order-test-note').props.children).toBe('You used the tester code MEGYTEST, so nothing is charged. Thank you for testing Megy Prints!');
    expect(calls.reads[0].chain[0]).toEqual(['eq', 'user_id', 'user-1']);
    expect(writes()).toEqual([]);

    await fireEvent.press(cards[0]);
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/order-details', params: { id: 'wait' } });
  });

  it('no orders: says so, with one filled button to make an album', async () => {
    answers.orders = [];
    await render(<Orders />);
    expect(await screen.findByText('No orders yet.')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('orders-make-album'));
    expect(mockRouter.push).toHaveBeenCalledWith('/album-name');
  });

  it('a read that fails says so (never "No orders yet"), and Try again reads again', async () => {
    answers.ordersError = { message: 'Network request failed' };
    await render(<Orders />);
    expect((await screen.findByTestId('orders-error')).props.children.join('')).toBe("We couldn't load your orders: Network request failed");
    expect(screen.queryByText('No orders yet.')).toBeNull();
    answers.ordersError = null;
    await fireEvent.press(screen.getByTestId('orders-retry'));
    expect(await screen.findAllByTestId('order-card')).toHaveLength(7);
  });

  it('signed out: goes to sign in', async () => {
    mockAuth.session = null;
    await render(<Orders />);
    expect(await screen.findByText('redirect:/sign-in')).toBeTruthy();
  });
});

describe('one order', () => {
  const open = async (id: string) => {
    mockParams.id = id;
    await render(<OrderDetails />);
    return screen.findByTestId('order-details');
  };
  const stepStates = () => [0, 1, 2, 3, 4, 5].map((i) => {
    for (const s of ['done', 'now', 'waiting']) if (screen.queryByTestId(`order-step-${i}-${s}`)) return s;
    return '?';
  });

  it('waiting for payment: its steps, the payment box, and the payment step with its own number, total and last day', async () => {
    await open('wait');
    expect(screen.getByTestId('order-headline').props.children).toBe('Waiting for your payment');
    expect(screen.getByTestId('order-step-0-now').props.children).toBe('Waiting for your payment');
    expect(stepStates()).toEqual(['now', 'waiting', 'waiting', 'waiting', 'waiting', 'waiting']);
    expect(screen.getByText('Send ₱1,288 by bank transfer to finish')).toBeTruthy();
    expect(screen.getByTestId('order-pay-by').props.children).toBe('Please pay by November 2, 2026. After that this order closes by itself, and your album stays saved.');

    await fireEvent.press(screen.getByTestId('order-pay'));
    expect(screen.getByTestId('pay-step')).toBeTruthy();
    expect(screen.getByText('Send ₱1,288')).toBeTruthy();
    expect(screen.getByTestId('pay-order-placed').props.children.join('')).toBe('Order MP-2026-WAIT001 is placed. Pay by bank transfer to finish.');
    expect(screen.getByText('3. Send exactly ₱1,288 and put MP-2026-WAIT001 in the note if your app asks.')).toBeTruthy();
    expect(screen.getByTestId('pay-within').props.children).toBe('Please pay by November 2, 2026. After that this order closes by itself, and your album stays saved.');
    expect(screen.queryByTestId('pay-qr-test-band')).toBeNull(); // a real order is behind this QR
    await fireEvent.press(screen.getByTestId('pay-sent'));
    expect(screen.getByText("Test version: what I've sent would send")).toBeTruthy();
    expect(writes()).toEqual([]); // "I've sent" sends nothing in this version
    await fireEvent.press(screen.getByTestId('pay-back'));
    expect(screen.getByTestId('order-details')).toBeTruthy();
  });

  it('cancelling asks twice, in words; while it asks, its Yes is the one filled button; then the order says Cancelled', async () => {
    await open('wait');
    await fireEvent.press(screen.getByTestId('order-cancel'));
    expect(screen.queryByTestId('order-pay')).toBeNull();
    expect(screen.getByText('Yes, cancel order MP-2026-WAIT001')).toBeTruthy();
    // "Keep it" closes the question, nothing sent.
    await fireEvent.press(screen.getByTestId('order-cancel-keep'));
    expect(writes()).toEqual([]);
    expect(screen.getByTestId('order-pay')).toBeTruthy();

    answers.rpc.cancel_my_unpaid_order = () => {
      answers.orders = answers.orders.map((o) => (o.id === 'wait' ? { ...o, status: 'cancelled' } : o));
      return { data: true, error: null };
    };
    await fireEvent.press(screen.getByTestId('order-cancel'));
    await fireEvent.press(screen.getByTestId('order-cancel-yes'));
    expect(calls.rpcs).toEqual([{ name: 'cancel_my_unpaid_order', args: { p_order_id: 'wait' } }]);
    expect(await screen.findByText('Cancelled')).toBeTruthy();
    expect(screen.getByTestId('order-cancelled-note').props.children).toBe("This order was cancelled. Your album is still saved, so you can order it again. If that's a surprise, message us.");
    expect(screen.queryByTestId('order-how-to-pay')).toBeNull();
  });

  it("a cancel the database refuses says the website's words; an error says its message", async () => {
    answers.rpc.cancel_my_unpaid_order = { data: false, error: null };
    await open('wait');
    await fireEvent.press(screen.getByTestId('order-cancel'));
    await fireEvent.press(screen.getByTestId('order-cancel-yes'));
    expect((await screen.findByTestId('order-cancel-error')).props.children).toBe('This order can no longer be cancelled here. If you already sent the money, message us.');

    answers.rpc.cancel_my_unpaid_order = { data: null, error: { message: "You've cancelled 3 orders today. This one closes by itself after 7 days if it isn't paid." } };
    await fireEvent.press(screen.getByTestId('order-cancel'));
    await fireEvent.press(screen.getByTestId('order-cancel-yes'));
    expect((await screen.findByTestId('order-cancel-error')).props.children).toBe("You've cancelled 3 orders today. This one closes by itself after 7 days if it isn't paid.");
  });

  it('payment sent: no payment box, no cancel (the shop decides)', async () => {
    await open('sent');
    expect(screen.getByTestId('order-headline').props.children).toBe("Payment sent — we're confirming it");
    expect(screen.getByTestId('order-step-0-now').props.children).toBe("Payment sent — we're confirming it");
    expect(screen.queryByTestId('order-how-to-pay')).toBeNull();
    expect(screen.queryByTestId('order-cancel')).toBeNull();
  });

  it('on its way: four steps ticked, the fifth now, and the courier number', async () => {
    await open('ship');
    expect(stepStates()).toEqual(['done', 'done', 'done', 'done', 'now', 'waiting']);
    expect(screen.getByTestId('order-tracking').props.children).toBe('Courier tracking number: JNT-778899');
  });

  it('delivered: every step ticked', async () => {
    await open('done');
    expect(stepStates()).toEqual(['done', 'done', 'done', 'done', 'done', 'done']);
  });

  it('a tester-code order: nothing printed or sent, no steps, nothing to pay', async () => {
    await open('test');
    expect(screen.getByTestId('order-headline').props.children).toBe('Test order: nothing will be printed or sent');
    expect(screen.getByTestId('order-test-note').props.children).toBe('You used the tester code MEGYTEST, so nothing is charged. Thank you for testing Megy Prints!');
    expect(screen.queryByTestId('order-tracker')).toBeNull();
    expect(screen.queryByTestId('order-how-to-pay')).toBeNull();
  });

  it("another account's order is not shown", async () => {
    mockParams.id = 'other';
    await render(<OrderDetails />);
    expect(await screen.findByTestId('order-not-found')).toBeTruthy();
  });
});
