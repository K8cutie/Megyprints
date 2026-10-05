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

   And only for the SAME account. Signing out forgets all of it
   (forgetCheckoutOnDevice): the next person in the tab got the last one's
   name, phone, address and unpaid order (Kraken, 2026-10-05).
   ══════════════════════════════════════════════════════════════════════════ */

import type { AlbumSizePreset, CoverType, MaterialType } from '../pages/builder/types';
import { isEmptyAddress, type AddressValue } from './contact';

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
  /** The account that placed it. Never resumed for another one. */
  userId?: string | null;
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
  /** Who typed it: an account, or null for a guest (who may sign in on the
   *  way, even via the Google round trip, and keeps what they typed). */
  userId?: string | null;
}

function read<T>(key: string): T | null {
  try { const raw = sessionStorage.getItem(key); return raw ? (JSON.parse(raw) as T) : null; } catch { return null; }
}
function write(key: string, value: unknown): void {
  try { sessionStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode / full: checkout still works, just not across a reload */ }
}

export function saveCheckoutOrder(order: CheckoutOrder): void { write(ORDER_KEY, order); }
export function clearCheckoutOrder(): void { try { sessionStorage.removeItem(ORDER_KEY); } catch { /* ignore */ } }

/** The order to come back to for this album and account, or null. Not
 *  resumed when the album was edited after the order was placed (that is a
 *  new order), or for anyone but the account that placed it. */
export function resumableCheckoutOrder(albumId: string | undefined, albumEditedAt: number, userId: string | undefined): CheckoutOrder | null {
  const o = read<CheckoutOrder>(ORDER_KEY);
  if (!o || typeof o.orderId !== 'string' || typeof o.orderNumber !== 'string') return null;
  if (!albumId || o.albumId !== albumId) return null;
  if (!userId || (o.userId && o.userId !== userId)) return null;
  if (albumEditedAt > (o.albumEditedAt || 0)) return null;
  return o;
}

export function saveCheckoutForm(form: CheckoutForm): void { write(FORM_KEY, form); }

/* ── The delivery details of the customer's last order, on THIS device ──
   A returning customer typed name, phone and the whole address again (RC-1).
   Kept per account in localStorage — the order row holds the address as
   names, the picker needs its PSGC codes — and offered on the next checkout
   whose form is still empty. Never another account's. */
const DELIVERY_KEY = 'megy-last-delivery';
export interface LastDelivery { userId: string; name: string; phone: string; address: AddressValue }
export function saveLastDelivery(d: LastDelivery): void {
  try { localStorage.setItem(DELIVERY_KEY, JSON.stringify(d)); } catch { /* private mode */ }
}
/** Signing out forgets them: a shared device doesn't keep someone's address. */
export function clearLastDelivery(): void {
  try { localStorage.removeItem(DELIVERY_KEY); } catch { /* private mode */ }
}
/** What a returning customer's last order may fill in on this form: only
 *  what is still untouched. A guest who typed everything and then signed in
 *  on the checkout page had it all replaced by the account's last order
 *  (Kraken, 2026-10-05). The delivery details go in whole or not at all, so
 *  one person's name never sits with another's address. */
export function prefillPlan(
  now: { name: string; phone: string; address: AddressValue; material: string; cover: string },
  defaults: { material: string; cover: string },
): { delivery: boolean; finish: boolean } {
  return {
    delivery: !now.name.trim() && !now.phone.trim() && isEmptyAddress(now.address),
    finish: now.material === defaults.material && now.cover === defaults.cover,
  };
}

export function readLastDelivery(userId: string | undefined): LastDelivery | null {
  if (!userId) return null;
  try {
    const d = JSON.parse(localStorage.getItem(DELIVERY_KEY) || 'null') as LastDelivery | null;
    return d && d.userId === userId && d.address ? d : null;
  } catch { return null; }
}

/** The form as typed in this tab for this album, or null. One typed under an
 *  account is that account's only; a guest's comes back to whoever they
 *  signed in as. */
export function readCheckoutForm(albumId: string | undefined, userId: string | undefined): CheckoutForm | null {
  const f = read<CheckoutForm>(FORM_KEY);
  if (!f || !albumId || f.albumId !== albumId) return null;
  if (f.userId && f.userId !== userId) return null;
  return f;
}

/** Signing out (or being signed out: an expired session, another tab) takes
 *  this tab's checkout with it — the form, the order placed, and the last
 *  delivery details. */
export function forgetCheckoutOnDevice(): void {
  try { sessionStorage.removeItem(FORM_KEY); } catch { /* ignore */ }
  clearCheckoutOrder();
  clearLastDelivery();
}
