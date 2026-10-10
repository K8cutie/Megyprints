// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { saveCheckoutOrder, resumableCheckoutOrder, saveCheckoutForm, readCheckoutForm, clearCheckoutOrder, forgetCheckoutOnDevice, saveLastDelivery, readLastDelivery, prefillPlan, type CheckoutOrder } from './checkoutSession';
import { setPendingPrintJob, getPendingPrintJob, noteOrderHandoff, readOrderHandoff, clearPendingPrintJob, type PrintJob } from './printQueue';
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
    expect(resumableCheckoutOrder('album-1', 1000, 'user-1')).toMatchObject({ orderNumber: 'MP-2026-ABCDEFG', amount: 2886, stage: 'payment', albumSize: '9x9' });
  });

  it('a different album is a new order', () => {
    saveCheckoutOrder(order());
    expect(resumableCheckoutOrder('album-2', 1000, 'user-1')).toBeNull();
    expect(resumableCheckoutOrder(undefined, 1000, 'user-1')).toBeNull();
  });

  it('the same album edited after the order was placed is a new order (the old one froze the old pages)', () => {
    saveCheckoutOrder(order({ albumEditedAt: 1000 }));
    expect(resumableCheckoutOrder('album-1', 1001, 'user-1')).toBeNull();
    expect(resumableCheckoutOrder('album-1', 999, 'user-1')).not.toBeNull();
  });

  it('cleared, missing or broken storage → nothing to resume (never a crash)', () => {
    expect(resumableCheckoutOrder('album-1', 0, 'user-1')).toBeNull();
    saveCheckoutOrder(order()); clearCheckoutOrder();
    expect(resumableCheckoutOrder('album-1', 1000, 'user-1')).toBeNull();
    sessionStorage.setItem('megy-checkout-order', '{not json');
    expect(resumableCheckoutOrder('album-1', 1000, 'user-1')).toBeNull();
  });
});

describe('the form comes back as typed', () => {
  it('for the same album only', () => {
    const address = { ...EMPTY_ADDRESS, street: '12 Test St.', zip: '1102' };
    saveCheckoutForm({ albumId: 'album-1', name: 'Quinn Returner', phone: '0917 555 0101', address, material: 'glossy', cover: 'softcover' });
    expect(readCheckoutForm('album-1', 'user-1')).toMatchObject({ name: 'Quinn Returner', phone: '0917 555 0101', material: 'glossy', address: { street: '12 Test St.', zip: '1102' } });
    expect(readCheckoutForm('album-2', 'user-1')).toBeNull();
    expect(readCheckoutForm(undefined, 'user-1')).toBeNull();
  });
});

/* ── Only for the account it belongs to (Kraken, 2026-10-05) ──
   The next person in the tab got the last one's name, phone, address and
   unpaid order: nothing was cleared on sign-out, and nothing checked whose. */
describe('one account\'s checkout is never another\'s', () => {
  const address = { ...EMPTY_ADDRESS, street: '12 Test St.', zip: '1102' };
  it('an order placed by one account does not come back for another, or for nobody', () => {
    saveCheckoutOrder(order({ userId: 'user-1' }));
    expect(resumableCheckoutOrder('album-1', 1000, 'user-1')).not.toBeNull();
    expect(resumableCheckoutOrder('album-1', 1000, 'user-2')).toBeNull();
    expect(resumableCheckoutOrder('album-1', 1000, undefined)).toBeNull();
  });
  it('a form typed under an account is that account\'s only', () => {
    saveCheckoutForm({ albumId: 'album-1', name: 'Ana One', phone: '09175550101', address, material: 'matte', cover: 'softcover', userId: 'user-1' });
    expect(readCheckoutForm('album-1', 'user-1')?.name).toBe('Ana One');
    expect(readCheckoutForm('album-1', 'user-2')).toBeNull();
    expect(readCheckoutForm('album-1', undefined)).toBeNull();
  });
  it('a guest\'s form comes back to whoever they sign in as (the Google round trip reloads)', () => {
    saveCheckoutForm({ albumId: 'album-1', name: 'Gina Guest', phone: '09175550102', address, material: 'matte', cover: 'softcover', userId: null });
    expect(readCheckoutForm('album-1', 'user-9')?.name).toBe('Gina Guest');
  });
  it('signing out forgets the form, the order, the last delivery, the album handed over and its note', () => {
    saveCheckoutForm({ albumId: 'album-1', name: 'Ana One', phone: '09175550101', address, material: 'matte', cover: 'softcover', userId: 'user-1' });
    saveCheckoutOrder(order({ userId: 'user-1' }));
    saveLastDelivery({ userId: 'user-1', name: 'Ana One', phone: '09175550101', address });
    setPendingPrintJob({ albumId: 'album-1', pages: [], photos: [] } as unknown as PrintJob);
    noteOrderHandoff({ albumId: 'album-1', saved: true });
    forgetCheckoutOnDevice();
    clearPendingPrintJob();
    expect(readCheckoutForm('album-1', 'user-1')).toBeNull();
    expect(resumableCheckoutOrder('album-1', 1000, 'user-1')).toBeNull();
    expect(readLastDelivery('user-1')).toBeNull();
    expect(getPendingPrintJob()).toBeNull();
    expect(readOrderHandoff()).toBeNull();
  });
  it('any sign-out does it (an expired session, another tab), and the menu even when signing out fails (source guard)', () => {
    const src = readFileSync(resolve(__dirname, './authContext.tsx'), 'utf8');
    expect(src).toMatch(/if \(event === 'SIGNED_OUT'\) forgetAccountInTab\(\);/);
    expect(src).toMatch(/forgetAccountInTab\(\);\s+try \{\s+const \{ error: signOutError \} = await supabase\.auth\.signOut\(\);/);
  });
});

describe('a returning customer\'s last order fills only what is untouched', () => {
  const defaults = { material: 'matte', cover: 'softcover' };
  const blank = { name: '', phone: '', address: EMPTY_ADDRESS, material: 'matte', cover: 'softcover' };
  it('an untouched form: the delivery details and the finish', () => {
    expect(prefillPlan(blank, defaults)).toEqual({ delivery: true, finish: true });
  });
  it('a guest typed their details, then signed in on the page: what they typed stays', () => {
    expect(prefillPlan({ ...blank, name: 'Gina Guest', phone: '09175550102', address: { ...EMPTY_ADDRESS, street: '12 Guest St.' } }, defaults).delivery).toBe(false);
  });
  it('any part typed keeps all of it (never one person\'s name with another\'s address)', () => {
    expect(prefillPlan({ ...blank, phone: '0917' }, defaults).delivery).toBe(false);
    expect(prefillPlan({ ...blank, address: { ...EMPTY_ADDRESS, regionCode: '13' } }, defaults).delivery).toBe(false);
    expect(prefillPlan({ ...blank, name: '   ' }, defaults).delivery).toBe(true);
  });
  it('a paper or cover already picked stays', () => {
    expect(prefillPlan({ ...blank, material: 'glossy' }, defaults).finish).toBe(false);
    expect(prefillPlan({ ...blank, cover: 'hardboundLeather' }, defaults).finish).toBe(false);
  });
  it('checkout asks it with what is on the form at the moment the last order arrives (source guard)', () => {
    const src = readFileSync(resolve(__dirname, '../pages/Order.tsx'), 'utf8');
    expect(src).toMatch(/const plan = prefillPlan\(formNowRef\.current, \{ material: DEFAULT_MATERIAL, cover: DEFAULT_COVER \}\);/);
    expect(src).toMatch(/if \(d && delivery\) \{ setName\(d\.name\);/);
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

  it('another ACCOUNT\'s draft on a shared device prices nothing for this one (a guest\'s or its own does)', () => {
    draft({ accountId: 'user-a' });
    expect(readDraftAlbumForOrder('album-1', 'user-b')).toBeNull();
    expect(readDraftAlbumForOrder('album-1', 'user-a')).not.toBeNull();
    draft({ accountId: null });
    expect(readDraftAlbumForOrder('album-1', 'user-b')).not.toBeNull();
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
    // (and, with memory videos, until this album's own video tier is read, 0042)
    expect(src).toMatch(/const priceReady = settingsReady && schedule !== null && info !== null( && clipTierReady)?;/);
  });
  it('no free size picker: the size always comes from the album', () => {
    expect(src).not.toMatch(/setSize\(/);
  });
  it('an order placed in this checkout is recorded at every stage, and resumed after a reload', () => {
    expect(src).toMatch(/recordOrder\('placed'\)/);
    expect(src).toMatch(/recordOrder\('payment'\)/);
    expect(src).toMatch(/recordOrder\('tracking'\)/);
    expect(src).toMatch(/resumableCheckoutOrder\(album\.albumId, album\.editedAt, user\?\.id\)/);
  });
  it('the payment screen asks for the amount the order was placed at', () => {
    expect(src).toMatch(/\(placedAmount \?\? totalPrice\)/);
  });
});
