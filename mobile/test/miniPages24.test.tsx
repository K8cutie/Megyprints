/* ══════════════════════════════════════════════════════════════════════════
   WHY THIS TEST: the Megy Mini comes at 16 pages (₱350) or 24 pages (₱449)
   (owner, 2026-11-23: "24 pages at 449", "an additional a second staple
   offering", one product "Megy Mini, 16 or 24 pages"). The size step offers
   both, each with its price, only once the price list sells both (0070);
   the photos step, checkout and the editor follow the Mini's own pages.
   ══════════════════════════════════════════════════════════════════════════ */
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Alert } from 'react-native';
import type { PriceSchedule } from '@web/lib/pricing';
import { MINI_SIZE } from '@web/lib/megyMini';
import { checkoutPrice } from '../src/lib/checkout/price';
import { photoStepFor, PICK_24_PAGES, MAKE_ALBUM_INSTEAD, pickerProgress } from '../src/lib/photoDraft';
import { miniPagesTap, sizeTap } from '../src/builder/albumFlow';
import { canAddPage, canDeletePage } from '../src/editor/photos/actions';
import { layoutSpreadNote, miniPagesFixed } from '../src/editor/photos/words';

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

const MINI_16 = { size: '8.3x11.7', cover: 'staple', pages: 16, price: 350, package_price: 299, shipping_fee: 120, free_qr: 2 };
const MINI_BOTH = { ...MINI_16, options: [{ pages: 16, price: 350, package_price: 299 }, { pages: 24, price: 449, package_price: 399 }] };
const list = (mini: unknown) => ({
  disabled_sizes: [], free_shipping_value: 200, hd_memories_price: 99, hosting_reserve: 50,
  hosting_tiers: [{ price: 0, years: 5 }, { price: 99, years: 10 }], min_pages: 40, sheet_rate: 60.95,
  sizes: { '8x8': { hard_rate: 1005, pps: 4, soft_rate: 545 } }, mini,
}) as unknown as PriceSchedule;

/** Photos going in, as the builder lists them. */
const photos = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i}` }));
/** A made book of `n` pages (a photo on page 1). */
const madePages = (n: number) => Array.from({ length: n }, (_, i) => ({ slotFills: i === 0 ? [0] : [] }));

beforeEach(() => {
  mockRpc.answer = { data: list(MINI_BOTH), error: null };
  Object.assign(mockBuilder, { albumSize: '8x8', albumPages: [], uploadedPhotos: [], miniPages: 16 });
  jest.clearAllMocks();
});

describe('the size step', () => {
  it('offers the Mini at 16 or 24 pages, each with its photos and price', async () => {
    await render(<AlbumSize />);
    expect(await screen.findByTestId('size-mini-pages-24')).toBeTruthy();
    expect(screen.getByTestId('size-mini-pages-16')).toHaveTextContent('16 pages16–40 photos₱350');
    expect(screen.getByTestId('size-mini-pages-24')).toHaveTextContent('24 pages24–60 photos₱449');
    expect(screen.getByTestId('size-mini')).toHaveTextContent(/A4 · 16 or 24 pages/);
    expect(screen.getByTestId('size-mini')).toHaveTextContent(/A stapled booklet with 2 video memories included\. Shipping ₱120 on top\./);
  });

  it('a tap on 24 pages makes the album a 24-page Mini (nothing made yet)', async () => {
    await render(<AlbumSize />);
    fireEvent.press(await screen.findByTestId('size-mini-pages-24'));
    expect(mockBuilder.setMiniPages).toHaveBeenCalledWith(24);
    expect(mockBuilder.setAlbumSize).toHaveBeenCalledWith(MINI_SIZE);
  });

  it('on a Mini not made yet, a tap on the other count just picks it', async () => {
    Object.assign(mockBuilder, { albumSize: MINI_SIZE, miniPages: 16 });
    await render(<AlbumSize />);
    fireEvent.press(await screen.findByTestId('size-mini-pages-24'));
    expect(mockBuilder.setMiniPages).toHaveBeenCalledWith(24);
    expect(mockBuilder.setAlbumSize).not.toHaveBeenCalled();
  });

  it('on a made Mini, a tap on the other count asks first', async () => {
    Object.assign(mockBuilder, { albumSize: MINI_SIZE, miniPages: 16, albumPages: madePages(16), uploadedPhotos: photos(30) });
    const ask = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await render(<AlbumSize />);
    fireEvent.press(await screen.findByTestId('size-mini-pages-24'));
    expect(ask).toHaveBeenCalledWith('Make it 24 pages?', expect.stringContaining('laid out again'), expect.any(Array));
    expect(mockBuilder.setMiniPages).not.toHaveBeenCalled();
    ask.mockRestore();
  });

  it('a price list without page counts (before 0070): the 16-page card as before', async () => {
    mockRpc.answer = { data: list(MINI_16), error: null };
    await render(<AlbumSize />);
    expect(await screen.findByTestId('size-mini')).toHaveTextContent(/A4 · 16 pages · 16–40 photos/);
    expect(screen.getByTestId('size-mini')).toHaveTextContent(/₱350 \+ ₱120 shipping\./);
    expect(screen.queryByTestId('size-mini-pages-24')).toBeNull();
  });
});

describe('a page-count tap', () => {
  const b = (o: Partial<typeof mockBuilder>) => ({ ...mockBuilder, ...o } as unknown as Parameters<typeof miniPagesTap>[0]);
  it('sets, asks, or says why the photos do not fit', () => {
    expect(miniPagesTap(b({ albumSize: MINI_SIZE, miniPages: 16 }), 24)).toEqual({ kind: 'set' });
    expect(miniPagesTap(b({ albumSize: MINI_SIZE, miniPages: 24 }), 24)).toEqual({ kind: 'same' });
    expect(miniPagesTap(b({ albumSize: MINI_SIZE, miniPages: 16, albumPages: madePages(16), uploadedPhotos: photos(30) }), 24).kind).toBe('ask');
    expect(miniPagesTap(b({ albumSize: MINI_SIZE, miniPages: 16, albumPages: madePages(16), uploadedPhotos: photos(20) }), 24))
      .toEqual({ kind: 'tooFew', message: 'A 24-page Megy Mini needs at least 24 photos. Add 4 more.' });
    expect(miniPagesTap(b({ albumSize: MINI_SIZE, miniPages: 24, albumPages: madePages(24), uploadedPhotos: photos(50) }), 16))
      .toEqual({ kind: 'tooFew', message: 'A Megy Mini holds up to 40 photos. Remove 10, or make an album instead.' });
  });

  it('a made album going to a 24-page Mini is checked against 24 to 60 photos', () => {
    const made = b({ albumSize: '8x8', albumPages: madePages(40), uploadedPhotos: photos(50) });
    expect(sizeTap({ ...made, miniPages: 16 } as never, MINI_SIZE).kind).toBe('tooFew');
    expect(sizeTap({ ...made, miniPages: 24 } as never, MINI_SIZE).kind).toBe('ask');
  });
});

describe('the photos step', () => {
  it('a 24-page Mini takes 24 to 60 photos', () => {
    expect(photoStepFor(0, MINI_SIZE, { miniPages: 24 }).message).toBe('Pick the photos for your Megy Mini: 24 to 60 photos for its 24 pages.');
    expect(photoStepFor(20, MINI_SIZE, { miniPages: 24 }).message).toBe('You have 20 photos. A 24-page Megy Mini needs at least 24, one for every page: add 4 more.');
    const ok = photoStepFor(50, MINI_SIZE, { miniPages: 24 });
    expect([ok.canGoOn, ok.message]).toEqual([true, 'You have 50 photos ready for your Megy Mini. Go on to pick your cover.']);
    expect(photoStepFor(60, MINI_SIZE, { miniPages: 24 }).secondLabel).toBeNull();
    expect(pickerProgress(50, 5, MINI_SIZE, 24)).toBe('Enough photos for a Megy Mini.');
    expect(pickerProgress(50, 15, MINI_SIZE, 24)).toBe('A Megy Mini holds up to 60 photos: 5 too many.');
  });

  it('a 16-page Mini with 41 to 60 photos is pointed to 24 pages, while they are on sale', () => {
    const over = photoStepFor(45, MINI_SIZE, { miniPages: 16, miniPagesOnSale: [16, 24] });
    expect([over.canGoOn, over.main, over.mainLabel]).toEqual([false, 'size', PICK_24_PAGES]);
    expect(over.message).toBe('You have 45 photos. A Megy Mini holds up to 40: take out 5 (tap × on a photo), or pick 24 pages, which hold up to 60.');
    expect(photoStepFor(45, MINI_SIZE, { miniPages: 16, miniPagesOnSale: [16] }).mainLabel).toBe(MAKE_ALBUM_INSTEAD);
    expect(photoStepFor(70, MINI_SIZE, { miniPages: 16, miniPagesOnSale: [16, 24] }).mainLabel).toBe(MAKE_ALBUM_INSTEAD);
  });
});

describe('checkout', () => {
  const input = (pageCount: number) => ({ albumSize: MINI_SIZE, cover: 'staple' as const, pageCount, qrCount: 0, hostingYears: null, hdMemories: false, tester: null });
  it('a 24-page Mini is ₱449 + ₱120 shipping; a 16-page one still ₱350', () => {
    const p24 = checkoutPrice(list(MINI_BOTH), input(24));
    expect([p24.ready, p24.total, p24.shipping]).toEqual([true, 569, 120]);
    expect(p24.breakdown.items[0]).toEqual({ label: 'Megy Mini — A4 · 24 pages · staples · 2 video memories included', amount: 449 });
    expect(checkoutPrice(list(MINI_BOTH), input(16)).total).toBe(470);
  });

  it('a 24-page Mini on a price list that sells 16 only is not on sale, never priced as 16', () => {
    const p = checkoutPrice(list(MINI_16), input(24));
    expect([p.ready, p.miniOff]).toEqual([false, true]);
  });
});

describe('the editor', () => {
  const ctx = (pages: number) => ({ builder: { albumSize: MINI_SIZE, albumPages: madePages(pages) } } as never);
  it('no page goes in or out of a 24-page Mini, and the words say its own pages', () => {
    expect(canDeletePage(ctx(24))).toBe(false);
    expect(canAddPage(ctx(24))).toBe(false);
    expect(miniPagesFixed(24)).toBe("A Megy Mini is always 24 pages, so pages can't be added or deleted.");
    expect(layoutSpreadNote(11)).toBe('This is the middle spread: one photo across pages 12 and 13. Tap the photo to change it, move it or zoom.');
    expect(layoutSpreadNote(7)).toBe('This is the middle spread: one photo across pages 8 and 9. Tap the photo to change it, move it or zoom.');
  });
});
