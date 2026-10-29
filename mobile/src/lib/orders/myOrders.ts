/* ══════════════════════════════════════════════════════════════════════════
   YOUR ORDERS IN THE APP: the signed-in customer's own orders, read and
   cancelled through the website's own code (src/lib/myOrdersCloud.ts,
   shared), with the app's Supabase client.

   The app reads the website's columns plus quoted_amount: the total the
   database saved as the order was placed (0055), which the payment step
   asks the customer to send (orders.amount stays NULL until the shop
   confirms the payment, see lib/checkout/openOrder.ts askedToPay).
   ══════════════════════════════════════════════════════════════════════════ */
import {
  cancelMyUnpaidOrderWith,
  getMyOrderWith,
  lastShippingWith,
  listMyOrdersWith,
  type LastShipping,
  type MyOrder,
  type OrdersCaller,
  type OrdersReader,
} from '@web/lib/myOrdersCloud';
import { OPEN_ORDER_COLUMNS } from '../checkout/openOrder';

/** One of my orders, as the app reads it. */
export type AppOrder = MyOrder & {
  /** The total the customer was asked to pay (0055). NULL on older orders. */
  quoted_amount?: number | null;
};

/** The columns the app reads: the website's Your orders columns + quoted_amount. */
export const APP_ORDER_COLUMNS = OPEN_ORDER_COLUMNS;

/** My orders, newest first. Throws when they could not be read. */
export function listAppOrders(client: OrdersReader, userId: string): Promise<AppOrder[]> {
  return listMyOrdersWith(client, userId, APP_ORDER_COLUMNS);
}

/** One of my orders by its id, or null (not mine, or no such order). */
export function getAppOrder(client: OrdersReader, userId: string, orderId: string): Promise<AppOrder | null> {
  return getMyOrderWith(client, userId, orderId, APP_ORDER_COLUMNS);
}

/** Cancel my order that is still waiting for payment. False: it can no longer be cancelled here. */
export function cancelUnpaidOrder(client: OrdersCaller, orderId: string): Promise<boolean> {
  return cancelMyUnpaidOrderWith(client, orderId);
}

/** The delivery details from my newest order, or null (no orders yet). */
export function lastShipping(client: OrdersReader, userId: string): Promise<LastShipping | null> {
  return lastShippingWith(client, userId);
}

export type { LastShipping };
