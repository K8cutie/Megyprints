/* ══════════════════════════════════════════════════════════════════════════
   CHECKOUT SURVIVES A RELOAD (1-star testers, 2026-10-04). The order page
   kept everything in memory: a reload (or the Google sign-in round trip)
   priced a 9×9 album as an 8×8 (₱2,886 → ₱1,710), wiped the form, and lost
   an order already placed — the only way to pay was to place it again, a
   duplicate. What it needs to come back to is kept here, in sessionStorage:
   this tab only, gone when the tab closes, never sent anywhere.

     • the order placed in this checkout (number, frozen specs and amount,
       how far it got) — so a reload returns to the payment / thank-you
       screen instead of making a second order;
     • the form as typed — so a reload or a detour to the album doesn't wipe
       the customer's name, phone and address.

   An order is resumed only for the SAME album, unchanged since it was
   placed: an album edited afterwards is a new order.
   ══════════════════════════════════════════════════════════════════════════ */

import type { AlbumSizePreset, CoverType, MaterialType } from '../pages/builder/types';
import type { AddressValue } from './contact';

const ORDER_KEY = 'megy-checkout-order';
const FORM_KEY = 'megy-checkout-form';

export type CheckoutStage = 'placed' | 'payment' | 'tracking';

export interface CheckoutOrder {
  albumId: string;
  orderId: string;
  orderNumber: string;
  material: MaterialType;
  cover: CoverType;
  albumSize: AlbumSizePreset;
  /** The amount shown when the order was placed — what the customer sends. */
  amount: number;
  /** 'placed' = order row made, print file not yet uploaded (Place order
   *  retries with the SAME row); 'payment' = waiting for the transfer;
   *  'tracking' = payment sent. */
  stage: CheckoutStage;
  /** The album's last edit (ms) when the order was placed; a later edit
   *  means the customer changed it, so the old order isn't resumed. */
  albumEditedAt: number;
}

export interface CheckoutForm {
  albumId: string;
  name: string;
  phone: string;
  address: AddressValue;
  material: MaterialType;
  cover: CoverType;
  /** The memory-hosting term picked (null = the included one). It reset to
   *  the included 5 years on a reload, and the total with it (round 2, MMC-6). */
  hostingYears?: number | null;
}

function read<T>(key: string): T | null {
  try { const raw = sessionStorage.getItem(key); return raw ? (JSON.parse(raw) as T) : null; } catch { return null; }
}
function write(key: string, value: unknown): void {
  try { sessionStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode / full: checkout still works, just not across a reload */ }
}

export function saveCheckoutOrder(order: CheckoutOrder): void { write(ORDER_KEY, order); }
export function clearCheckoutOrder(): void { try { sessionStorage.removeItem(ORDER_KEY); } catch { /* ignore */ } }

/** The order to come back to for this album, or null. Not resumed when the
 *  album was edited after the order was placed (that is a new order). */
export function resumableCheckoutOrder(albumId: string | undefined, albumEditedAt: number): CheckoutOrder | null {
  const o = read<CheckoutOrder>(ORDER_KEY);
  if (!o || typeof o.orderId !== 'string' || typeof o.orderNumber !== 'string') return null;
  if (!albumId || o.albumId !== albumId) return null;
  if (albumEditedAt > (o.albumEditedAt || 0)) return null;
  return o;
}

export function saveCheckoutForm(form: CheckoutForm): void { write(FORM_KEY, form); }

export function readCheckoutForm(albumId: string | undefined): CheckoutForm | null {
  const f = read<CheckoutForm>(FORM_KEY);
  if (!f || !albumId || f.albumId !== albumId) return null;
  return f;
}
