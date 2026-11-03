/* ══════════════════════════════════════════════════════════════════════════
   BACK FROM CHECKOUT KEEPS WHAT WAS TYPED (beta testers 2026-11-04, Carlo:
   one Back from "Your order" to the album, Order this album again, and the
   name, phone and whole address were gone).

   The website's checkout keeps the form as typed (lib/checkoutSession.ts
   saveCheckoutForm / readCheckoutForm: "a reload or a detour to the album
   doesn't wipe the customer's name, phone and address"), with its rules:
     • only for the SAME album;
     • one typed under an account is that account's only; a guest's comes
       back to whoever they sign in as;
     • signing out (or being signed out) forgets it (forgetCheckoutOnDevice).
   The website keeps it in the tab (sessionStorage: gone when the tab
   closes). The app keeps it in memory: gone when the app closes, never
   written to the phone's storage.
   ══════════════════════════════════════════════════════════════════════════ */
import type { CoverType, MaterialType } from '@web/pages/builder/types';
import type { AddressValue } from '@web/lib/contact';

/** The website's CheckoutForm. */
export interface CheckoutForm {
  albumId: string;
  name: string;
  phone: string;
  address: AddressValue;
  material: MaterialType;
  cover: CoverType;
  /** The memory-hosting term picked (null = the included one). */
  hostingYears?: number | null;
  /** Who typed it: an account, or null for a guest. */
  userId?: string | null;
}

let kept: CheckoutForm | null = null;

/** The form as typed now (the website's saveCheckoutForm). */
export function keepCheckoutForm(form: CheckoutForm): void {
  kept = form;
}

/** The form as typed for this album, or null (the website's readCheckoutForm). */
export function keptCheckoutForm(albumId: string | undefined, userId: string | null | undefined): CheckoutForm | null {
  const f = kept;
  if (!f || !albumId || f.albumId !== albumId) return null;
  if (f.userId && f.userId !== userId) return null;
  return f;
}

/** Signing out takes it with it (the website's forgetCheckoutOnDevice). */
export function forgetCheckoutOnPhone(): void {
  kept = null;
}
