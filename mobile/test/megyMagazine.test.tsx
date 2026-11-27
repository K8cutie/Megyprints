/* ══════════════════════════════════════════════════════════════════════════
   WHY THIS TEST: Megy Magazine, the A4 booklet, is its own product beside
   the Megy Mini (owner, 2026-11-27: "A5 stays, with its current prices, the
   A4 album becomes another product which is the gap between mini and the
   cheapest album"; "₱599 / ₱699"). The size step shows its card under the
   Mini's, from its own price list (.a4, 0076), only while it is on sale; its
   photos step, checkout and page sheet use its own name, pages and prices;
   and the Mini is exactly as it was.
   ══════════════════════════════════════════════════════════════════════════ */
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { PriceSchedule } from '@web/lib/pricing';
import { A4_SIZE, MINI_SIZE } from '@web/lib/megyMini';
import { checkoutPrice, placeOrderLabel } from '../src/lib/checkout/price';
import { photoStepFor, pickerProgress, PICK_24_PAGES } from '../src/lib/photoDraft';
import { miniPagesTap, sizeName, sizeTap } from '../src/builder/albumFlow';
import { miniPagesFixed } from '../src/editor/photos/words';

const mockRpc: { answer: { data: unknown; error: unknown } } = { answer: { data: null, error: null } };
const mockBuilder = {
  albumTitle: 'Our trip', albumSize: '8x8' as string, albumPages: [] as unknown[], coverFront: null, uploadedPhotos: [] as unknown[],
  photosPerPage: undefined, miniPages: 16 as number,
  setAlbumTitle: jest.fn(), setAlbumSize: jest.fn(), setMiniPages: jest.fn(),
};
jest.mock('expo-router', () => ({ router: { push: jest.fn() }, useFocusEffect: () => {} }));
jest.mock('../src/builder/BuilderProvider', () => {
  const { memoryStore } = jest.requireActual('../src/builder/deviceStore') as typeof import('../src/builder/deviceStore');
  return { useBuilder: () => ({ builder: mockBuilder, platform: { deviceStore: memoryStore() } }) };
});
jest.mock('../src/lib/supabase', () => ({
  supabaseConfigured: true,
  supabase: { rpc: async () => mockRpc.answer },
}));

import AlbumSize from '../src/app/album-size';

const MINI = { size: '5.8x8.3', cover: 'staple', pages: 16, price: 350, package_price: 299, shipping_fee: 120, free_qr: 2,
  options: [{ pages: 16, price: 350, package_price: 299 }, { pages: 24, price: 449, package_price: 399 }] };
const A4 = { size: '8.3x11.7', cover: 'staple', pages: 16, price: 599, package_price: 549, shipping_fee: 120, free_qr: 2,
  options: [{ pages: 16, price: 599, package_price: 549 }, { pages: 24, price: 699, package_price: 649 }] };
const list = (mini: unknown, a4: unknown) => ({
  disabled_sizes: [], free_shipping_value: 200, hd_memories_price: 99, hosting_reserve: 50,
  hosting_tiers: [{ price: 0, years: 5 }, { price: 99, years: 10 }], min_pages: 40, sheet_rate: 60.95,
  sizes: { '8x8': { hard_rate: 1005, pps: 4, soft_rate: 545 } }, mini, a4,
}) as unknown as PriceSchedule;

const photos = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i}` }));
const madePages = (n: number) => Array.from({ length: n }, (_, i) => ({ slotFills: i === 0 ? [0] : [] }));

beforeEach(() => {
  mockRpc.answer = { data: list(MINI, A4), error: null };
  Object.assign(mockBuilder, { albumSize: '8x8', albumPages: [], uploadedPhotos: [], miniPages: 16 });
  jest.clearAllMocks();
});

describe('the size step: two booklets', () => {
  it('shows Megy Magazine under the Mini, each with its own pages and prices', async () => {
    await render(<AlbumSize />);
    expect(await screen.findByTestId('size-a4')).toBeTruthy();
    expect(screen.getByText('Or a stapled booklet')).toBeTruthy();
    expect(screen.getByTestId('size-a4')).toHaveTextContent(/Megy Magazine/);
    expect(screen.getByTestId('size-a4')).toHaveTextContent(/A4 · 16 or 24 pages/);
    expect(screen.getByTestId('size-a4')).toHaveTextContent(/A bigger stapled booklet, A4 pages, with 2 video memories included\. Shipping ₱120 on top\./);
    expect(screen.getByTestId('size-a4-pages-16')).toHaveTextContent('16 pages16–40 photos₱599');
    expect(screen.getByTestId('size-a4-pages-24')).toHaveTextContent('24 pages24–60 photos₱699');
    // the Mini, as it was
    expect(screen.getByTestId('size-mini')).toHaveTextContent(/Megy Mini/);
    expect(screen.getByTestId('size-mini')).toHaveTextContent(/A5 · 16 or 24 pages/);
    expect(screen.getByTestId('size-mini-pages-16')).toHaveTextContent('16 pages16–40 photos₱350');
    expect(screen.getByTestId('size-mini-pages-24')).toHaveTextContent('24 pages24–60 photos₱449');
  });

  it('shows no Megy Magazine while the price list has none (an older database, or off)', async () => {
    mockRpc.answer = { data: list(MINI, null), error: null };
    await render(<AlbumSize />);
    expect(await screen.findByTestId('size-mini')).toBeTruthy();
    expect(screen.queryByTestId('size-a4')).toBeNull();
    expect(screen.getByText('Or a small booklet')).toBeTruthy();
  });

  it('shows Megy Magazine alone when only it is on sale', async () => {
    mockRpc.answer = { data: list(null, A4), error: null };
    await render(<AlbumSize />);
    expect(await screen.findByTestId('size-a4')).toBeTruthy();
    expect(screen.queryByTestId('size-mini')).toBeNull();
  });

  it('a tap on its 24 pages makes the album a 24-page Megy Magazine', async () => {
    await render(<AlbumSize />);
    fireEvent.press(await screen.findByTestId('size-a4-pages-24'));
    expect(mockBuilder.setMiniPages).toHaveBeenCalledWith(24);
    expect(mockBuilder.setAlbumSize).toHaveBeenCalledWith(A4_SIZE);
  });

  it('on a Mini not made yet, a tap on Megy Magazine just moves it to A4', async () => {
    Object.assign(mockBuilder, { albumSize: MINI_SIZE, miniPages: 16 });
    await render(<AlbumSize />);
    fireEvent.press(await screen.findByTestId('size-a4'));
    expect(mockBuilder.setAlbumSize).toHaveBeenCalledWith(A4_SIZE);
  });

  it('only the picked booklet shows its tick and its page choice', async () => {
    Object.assign(mockBuilder, { albumSize: A4_SIZE, miniPages: 24 });
    await render(<AlbumSize />);
    expect(await screen.findByTestId('size-a4')).toHaveProp('accessibilityState', { checked: true, busy: false });
    expect(screen.getByTestId('size-mini')).toHaveProp('accessibilityState', { checked: false, busy: false });
    expect(screen.getByTestId('size-a4-pages-24')).toHaveProp('accessibilityState', { checked: true });
    expect(screen.getByTestId('size-mini-pages-24')).toHaveProp('accessibilityState', { checked: false });
  });
});

describe('its own name and pages along the way', () => {
  it('a made Megy Magazine is laid out again at the other count, asked first, in its name', () => {
    const fits = { albumSize: A4_SIZE, albumPages: madePages(16), uploadedPhotos: photos(30), miniPages: 16 } as never;
    expect(miniPagesTap(fits, 24)).toEqual({ kind: 'ask', question: 'Every page is laid out again from your photos for 24 pages. Your video memories stay on their photos.' });
    const short = { albumSize: A4_SIZE, albumPages: madePages(16), uploadedPhotos: photos(20), miniPages: 16 } as never;
    expect(miniPagesTap(short, 24)).toEqual({ kind: 'tooFew', message: 'A 24-page Megy Magazine needs at least 24 photos. Add 4 more.' });
  });

  it('names it in the size words, the photos step and the picker', () => {
    expect(sizeName(A4_SIZE)).toBe('Megy Magazine');
    expect(sizeName(MINI_SIZE)).toBe('Megy Mini');
    expect(photoStepFor(0, A4_SIZE).message).toBe('Pick the photos for your Megy Magazine: 16 to 40 photos for its 16 pages.');
    expect(photoStepFor(10, A4_SIZE).message).toBe('You have 10 photos. A Megy Magazine needs at least 16, one for every page: add 6 more.');
    expect(photoStepFor(30, A4_SIZE).message).toBe('You have 30 photos ready for your Megy Magazine. Go on to pick your cover.');
    const over = photoStepFor(45, A4_SIZE, { miniPages: 16, miniPagesOnSale: [16, 24] });
    expect(over.mainLabel).toBe(PICK_24_PAGES);
    expect(over.message).toMatch(/^You have 45 photos\. A Megy Magazine holds up to 40/);
    expect(pickerProgress(10, 0, A4_SIZE, 16)).toBe('A Megy Magazine needs at least 16 photos. Pick 6 more.');
    expect(pickerProgress(30, 0, A4_SIZE, 16)).toBe('Enough photos for a Megy Magazine.');
    expect(miniPagesFixed(24, 'Megy Magazine')).toBe("A Megy Magazine is always 24 pages, so pages can't be added or deleted.");
    // the Mini's words are as they were
    expect(photoStepFor(30, MINI_SIZE).message).toBe('You have 30 photos ready for your Megy Mini. Go on to pick your cover.');
    expect(miniPagesFixed(16)).toBe("A Megy Mini is always 16 pages, so pages can't be added or deleted.");
  });

  it('a made album of 30 photos moves to Megy Magazine, asked first', () => {
    const tap = sizeTap({ albumSize: '8x8', albumPages: madePages(40), uploadedPhotos: photos(30), photosPerPage: undefined, miniPages: 16 } as never, A4_SIZE);
    // 30 photos fit 16 A4 pages: the question, not a refusal
    expect(tap.kind).toBe('ask');
    // 70 photos don't fit even 24: refused in its name
    const over = sizeTap({ albumSize: '8x8', albumPages: madePages(40), uploadedPhotos: photos(70), photosPerPage: undefined, miniPages: 24 } as never, A4_SIZE);
    expect(over).toEqual({ kind: 'tooFew', message: 'A 24-page Megy Magazine holds up to 60 photos. Remove 10, or make an album instead.' });
  });
});

describe('checkout', () => {
  const input = (size: string, pageCount: number) => ({
    albumSize: size, cover: 'staple', pageCount, qrCount: 0, hostingYears: null, hdMemories: false, tester: null,
  }) as never;

  it('bills Megy Magazine from its own list: ₱599 or ₱699 + ₱120', () => {
    const s = list(MINI, A4);
    const p16 = checkoutPrice(s, input(A4_SIZE, 16));
    expect(p16.ready).toBe(true);
    expect(p16.breakdown.items.map((i) => [i.label, i.amount])).toEqual([
      ['Megy Magazine — A4 · 16 pages · staples · 2 video memories included', 599],
      ['Shipping', 120],
    ]);
    expect(p16.total).toBe(719);
    expect(checkoutPrice(s, input(A4_SIZE, 24)).total).toBe(819);
    // the Mini beside it, as it was
    expect(checkoutPrice(s, input(MINI_SIZE, 16)).total).toBe(470);
    expect(checkoutPrice(s, input(MINI_SIZE, 24)).total).toBe(569);
  });

  it('says Megy Magazine is not on sale, in its name, when the list has none', () => {
    const p = checkoutPrice(list(MINI, null), input(A4_SIZE, 16));
    expect(p.ready).toBe(false);
    expect(p.miniOff).toBe(true);
    expect(placeOrderLabel({ ready: false, loading: false, retrying: false, tester: false, total: 0, miniOff: true, miniName: 'Megy Magazine' }))
      .toBe("Megy Magazine isn't on sale right now — tap to check again");
    // never billed at the Mini's prices
    expect(p.total).toBe(0);
  });
});
