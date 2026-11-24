import { describe, it, expect } from 'vitest';
import { orderScanHash, orderScanDestination, scannedOrders } from './orderScan';

/* The order tag's QR (the back cover) scanned: the printed /o/<number>
   reaches its page on this HashRouter site, and each person goes where they
   should (the shop to Admin, the customer to Your orders, others nowhere). */

describe('the printed address reaches its page', () => {
  it('/o/<number> becomes #/o/<number>', () => {
    expect(orderScanHash('/o/MP-2026-9M5572U', '')).toBe('/#/o/MP-2026-9M5572U');
    expect(orderScanHash('/o/MP-2026-9M5572U/', '#/')).toBe('/#/o/MP-2026-9M5572U');
    // A phone that lower-cased the address still lands on the number.
    expect(orderScanHash('/o/mp-2026-9m5572u', '')).toBe('/#/o/MP-2026-9M5572U');
  });

  it('leaves every other address alone', () => {
    expect(orderScanHash('/', '')).toBeNull();
    expect(orderScanHash('/', '#/o/MP-2026-9M5572U')).toBeNull();
    expect(orderScanHash('/m/abc123', '')).toBeNull();
    expect(orderScanHash('/o/', '')).toBeNull();
    expect(orderScanHash('/o/MP-2026-9M5572U/extra', '')).toBeNull();
    expect(orderScanHash('/o/<script>', '')).toBeNull();
    // Already on a page of the site: not taken over.
    expect(orderScanHash('/o/MP-2026-9M5572U', '#/orders')).toBeNull();
  });
});

describe('who goes where', () => {
  const number = 'MP-2026-9M5572U';
  it('the shop (owner or Team) to the order in Admin', () => {
    expect(orderScanDestination({ number, role: 'owner', ownOrderId: null })).toBe('/admin?order=MP-2026-9M5572U');
    expect(orderScanDestination({ number, role: 'fulfillment', ownOrderId: null })).toBe('/admin?order=MP-2026-9M5572U');
  });
  it('the customer to that order in Your orders', () => {
    expect(orderScanDestination({ number, role: null, ownOrderId: 'abc' })).toBe('/orders?order=abc');
  });
  it('anyone else stays on the page with only the number', () => {
    expect(orderScanDestination({ number, role: null, ownOrderId: null })).toBeNull();
    expect(orderScanDestination({ number: 'not-a-number', role: 'owner', ownOrderId: null })).toBeNull();
  });
});

describe('Admin opened for one scanned order', () => {
  const page = [{ order_number: 'MP-2026-AAAAAAA' }, { order_number: 'MP-2026-9M5572U' }];
  it('shows only that order', () => {
    expect(scannedOrders(page, 2, 'MP-2026-9M5572U')).toEqual({ shown: [page[1]], keepLooking: false, notFound: false });
  });
  it('not on this page: loads the next one; none left: says it was not found', () => {
    expect(scannedOrders(page, 250, 'MP-2026-BBBBBBB')).toEqual({ shown: [], keepLooking: true, notFound: false });
    expect(scannedOrders(page, 2, 'MP-2026-BBBBBBB')).toEqual({ shown: [], keepLooking: false, notFound: true });
  });
  it('no scan: every order, as before', () => {
    expect(scannedOrders(page, 250, null)).toEqual({ shown: page, keepLooking: false, notFound: false });
  });
});
