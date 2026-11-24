import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { orderScanHash, orderScanDestination, scannedOrders } from './orderScan';

const ROOT = resolve(__dirname, '../..');
const read = (f: string) => readFileSync(resolve(ROOT, f), 'utf8');

/** Where public/o.js (the page vercel.json serves at /o/…) sends a browser. */
function oJsTarget(pathname: string): string {
  let to = '';
  runInNewContext(read('public/o.js'), {
    location: { pathname, replace: (u: string) => { to = u; } },
    document: { getElementById: () => null },
  });
  return to;
}

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

describe('on the live site, /o/<number> is a page of its own (the site is not served there)', () => {
  // The site links its files relatively (vite base './'): served at /o/…
  // it looked for /o/assets/… and showed a blank page (the PR preview, 2026-11-24).
  it('vercel.json serves o.html for /o/<number>, and never the site', () => {
    const v = JSON.parse(read('vercel.json')) as { rewrites: { source: string; destination: string }[] };
    expect(v.rewrites).toContainEqual({ source: '/o/:number', destination: '/o.html' });
    const shell = v.rewrites.find((r) => r.destination === '/index.html')!;
    // Its source is a plain regular expression (a negative lookahead).
    const catchAll = new RegExp(`^${shell.source}$`);
    expect(catchAll.test('/o/MP-2026-9M5572U')).toBe(false);
    expect(catchAll.test('/o.js')).toBe(false);
    expect(catchAll.test('/orders')).toBe(true);
  });

  it('the service worker leaves /o/ to the network, as it does /m/', () => {
    const cfg = read('vite.config.ts');
    const denylist = cfg.split('\n').find((l) => l.includes('navigateFallbackDenylist:')) ?? '';
    expect(denylist).toContain('/^\\/o\\//');
    expect(cfg).toContain("!url.pathname.startsWith('/o/')");
  });

  it('o.js sends the browser where orderScanHash says', () => {
    for (const p of ['/o/MP-2026-9M5572U', '/o/MP-2026-9M5572U/', '/o/mp-2026-9m5572u']) {
      expect(oJsTarget(p)).toBe(orderScanHash(p, ''));
    }
    expect(oJsTarget('/o/<script>')).toBe('/');
    expect(oJsTarget('/o/MP-2026-9M5572U/extra')).toBe('/');
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
