// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { saveCheckoutOrder, resumableCheckoutOrder, saveCheckoutForm, readCheckoutForm, clearCheckoutOrder, type CheckoutOrder } from './checkoutSession';
import { readDraftAlbumForOrder, DRAFT_STORAGE_KEY } from './localDraft';
import { EMPTY_ADDRESS } from './contact';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/* ══════════════════════════════════════════════════════════════════════════
   CHECKOUT SURVIVES A RELOAD (1-star testers, 2026-10-04): a reload priced a
   9×9 album as an 8×8, wiped the form, and lost an order already placed, so
   the only way to pay was a second, duplicate order.
   ══════════════════════════════════════════════════════════════════════════ */

const order = (over: Partial<CheckoutOrder> = {}): CheckoutOrder => ({
  albumId: 'album-1', orderId: 'order-1', orderNumber: 'MP-2026-ABCDEFG', material: 'matte', cover: 'hardboundLeather',
  albumSize: '9x9', amount: 2886, stage: 'payment', albumEditedAt: 1000, ...over,
} as CheckoutOrder);

beforeEach(() => { sessionStorage.clear(); localStorage.clear(); });

describe('the order placed in this checkout comes back after a reload', () => {
  it('same album, unchanged → the order, its amount and how far it got', () => {
    saveCheckoutOrder(order());
    expect(resumableCheckoutOrder('album-1', 1000)).toMatchObject({ orderNumber: 'MP-2026-ABCDEFG', amount: 2886, stage: 'payment', albumSize: '9x9' });
  });

  it('a different album is a new order', () => {
    saveCheckoutOrder(order());
    expect(resumableCheckoutOrder('album-2', 1000)).toBeNull();
    expect(resumableCheckoutOrder(undefined, 1000)).toBeNull();
  });

  it('the same album edited after the order was placed is a new order (the old one froze the old pages)', () => {
    saveCheckoutOrder(order({ albumEditedAt: 1000 }));
    expect(resumableCheckoutOrder('album-1', 1001)).toBeNull();
    expect(resumableCheckoutOrder('album-1', 999)).not.toBeNull();
  });

  it('cleared, missing or broken storage → nothing to resume (never a crash)', () => {
    expect(resumableCheckoutOrder('album-1', 0)).toBeNull();
    saveCheckoutOrder(order()); clearCheckoutOrder();
    expect(resumableCheckoutOrder('album-1', 1000)).toBeNull();
    sessionStorage.setItem('megy-checkout-order', '{not json');
    expect(resumableCheckoutOrder('album-1', 1000)).toBeNull();
  });
});

describe('the form comes back as typed', () => {
  it('for the same album only', () => {
    const address = { ...EMPTY_ADDRESS, street: '12 Test St.', zip: '1102' };
    saveCheckoutForm({ albumId: 'album-1', name: 'Quinn Returner', phone: '0917 555 0101', address, material: 'glossy', cover: 'softcover' });
    expect(readCheckoutForm('album-1')).toMatchObject({ name: 'Quinn Returner', phone: '0917 555 0101', material: 'glossy', address: { street: '12 Test St.', zip: '1102' } });
    expect(readCheckoutForm('album-2')).toBeNull();
    expect(readCheckoutForm(undefined)).toBeNull();
  });
});

describe('readDraftAlbumForOrder — the device draft can price the album after a reload', () => {
  const draft = (over: Record<string, unknown> = {}) => localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({
    albumId: 'album-1', albumSize: '9x9', editedAt: 1234,
    albumPages: Array.from({ length: 41 }, (_, i) => ({ slotFills: [i] })), uploadedPhotos: [], ...over,
  }));

  it('size, every page and the last edit — so a 9×9 is priced as a 9×9, not the old 8×8 fallback', () => {
    draft();
    const d = readDraftAlbumForOrder('album-1')!;
    expect(d.albumSize).toBe('9x9');
    expect(d.pages).toHaveLength(41);
    expect(d.editedAt).toBe(1234);
  });

  it('another album\'s draft, or a draft with no pages, prices nothing', () => {
    draft();
    expect(readDraftAlbumForOrder('album-2')).toBeNull();
    draft({ albumPages: [] });
    expect(readDraftAlbumForOrder('album-1')).toBeNull();
    localStorage.removeItem(DRAFT_STORAGE_KEY);
    expect(readDraftAlbumForOrder('album-1')).toBeNull();
  });
});

describe('the order page never prices from defaults (source guard)', () => {
  const src = readFileSync(resolve(__dirname, '../pages/Order.tsx'), 'utf8');
  it('Place order needs the album: no album → nothing to price', () => {
    expect(src).toMatch(/const priceReady = settingsReady && schedule !== null && info !== null;/);
  });
  it('no free size picker: the size always comes from the album', () => {
    expect(src).not.toMatch(/setSize\(/);
  });
  it('an order placed in this checkout is recorded at every stage, and resumed after a reload', () => {
    expect(src).toMatch(/recordOrder\('placed'\)/);
    expect(src).toMatch(/recordOrder\('payment'\)/);
    expect(src).toMatch(/recordOrder\('tracking'\)/);
    expect(src).toMatch(/resumableCheckoutOrder\(info\.albumId, info\.editedAt\)/);
  });
  it('the payment screen asks for the amount the order was placed at', () => {
    expect(src).toMatch(/\(placedAmount \?\? totalPrice\)/);
  });
});
