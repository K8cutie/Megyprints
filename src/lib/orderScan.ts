/* ══════════════════════════════════════════════════════════════════════════
   THE ORDER TAG'S QR CODE, SCANNED (orderTag.ts prints it on every album's
   back cover: https://megyprints.vercel.app/o/<order number>).

   Who scans it, and where they go:
     • the shop (an owner or a Team member, signed in) → that order in
       Admin (#/admin?order=<number>), so a book is never mixed up while it
       is printed, packed or handed to the courier;
     • the customer it belongs to, signed in → their order in Your orders;
     • anyone else → a page with only the order number: no name, address or
       price (the database shows a signed-in customer only their own orders).
   ══════════════════════════════════════════════════════════════════════════ */
import { isOrderNumber } from '../pages/builder/orderTag';

/** This site is a HashRouter app: the printed /o/<number> is shown at
 *  #/o/<number>. The address to switch to, or null when this isn't one. */
export function orderScanHash(pathname: string, hash: string): string | null {
  const m = /^\/o\/([A-Za-z0-9-]{1,40})\/?$/.exec(pathname);
  if (!m || (hash && hash !== '#' && hash !== '#/')) return null;
  return `/#/o/${m[1].toUpperCase()}`;
}

/** Where a scan goes once we know who is looking: null = stay on the page. */
export function orderScanDestination(o: { number: string; role: string | null; ownOrderId: string | null }): string | null {
  if (!isOrderNumber(o.number)) return null;
  if (o.role) return `/admin?order=${o.number}`;
  if (o.ownOrderId) return `/orders?order=${o.ownOrderId}`;
  return null;
}

/** Admin opened for one scanned order: which orders to show, and whether to
 *  load the next page to look for it (the list is newest first, a page at a
 *  time; a book being printed or packed is a recent order). */
export function scannedOrders<T extends { order_number: string }>(orders: T[], total: number, scanned: string | null): {
  shown: T[];
  keepLooking: boolean;
  notFound: boolean;
} {
  if (!scanned) return { shown: orders, keepLooking: false, notFound: false };
  const shown = orders.filter((o) => o.order_number === scanned);
  const more = orders.length < total;
  return { shown, keepLooking: !shown.length && more, notFound: !shown.length && !more };
}
