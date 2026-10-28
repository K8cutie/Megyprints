/* ══════════════════════════════════════════════════════════════════════════
   CHECKING THE ORDER FORM before Place order: the website's checks, in the
   website's order and words (src/pages/Order.tsx handleProceedToPayment,
   then the first lines of placeOrder).

     1. a cover the printer can't make is said (shared printSheet rules);
     2. name, phone and address, each said under its own box (shared
        contact rules; the street is never cut, a long one is said);
     3. the details are tidied to what the order stores ("+63 917 123 4567");
     4. signed in, or "You must be signed in to check out…";
     5. this album already has an order waiting: ask before a second one;
     6. an album short of 40 photos is not ordered (shared albumMinimum).

   test/checkoutForm.test.ts checks these words against the website's source.
   ══════════════════════════════════════════════════════════════════════════ */
import {
  formatPHPhoneDisplay,
  isValidFullName,
  normalizeFullName,
  normalizePHPhone,
  validateAddress,
  type AddressValue,
} from '@web/lib/contact';
import { albumPhotoCount, photosShortBy, tooFewToOrderMessage } from '@web/pages/builder/albumMinimum';
import type { AlbumPage } from '@web/pages/builder/types';

export const NAME_PROBLEM = 'Please enter your full name.';
export const PHONE_PROBLEM = 'Enter a valid PH mobile number, e.g. 0917 123 4567.';
export const SIGN_IN_PROBLEM = 'You must be signed in to check out — it ties the order to your album and lets us contact you.';
export const COVER_PROBLEM = 'This cover is too big for our printer. Choose another cover.';

export type AddressErrors = Partial<Record<keyof AddressValue, string>>;

export type CheckoutCheck =
  /** Stop: a message for the whole form (cover, sign in, too few photos). */
  | { ok: false; kind: 'message'; message: string; signIn?: boolean; openAlbum?: boolean; name?: string; phone?: string }
  /** Stop: things to fix in the boxes; `first` is where to scroll. */
  | { ok: false; kind: 'fields'; errors: { name?: string; phone?: string }; addressErrors: AddressErrors; first: 'name' | 'phone' | 'address' }
  /** Ask first: this album has an order waiting for payment. */
  | { ok: false; kind: 'askSecond'; name: string; phone: string }
  /** Go: with the details tidied as the order stores them. */
  | { ok: true; name: string; phone: string };

export interface CheckoutCheckInput {
  name: string;
  phone: string;
  address: AddressValue;
  /** The chosen cover fits the press sheet (coverFitsSheet). */
  coverFits: boolean;
  /** coverChoiceNote, when a cover is left out. */
  coverNote: string | null;
  signedIn: boolean;
  /** This album has an order waiting for payment, and a second one wasn't
   *  asked for yet. */
  openOrderUnanswered: boolean;
  pages: readonly AlbumPage[];
}

export function checkCheckout(i: CheckoutCheckInput): CheckoutCheck {
  if (!i.coverFits) return { ok: false, kind: 'message', message: i.coverNote ?? COVER_PROBLEM };
  const cleanName = normalizeFullName(i.name);
  const canonicalPhone = normalizePHPhone(i.phone);
  const addressErrors = validateAddress(i.address);
  const errors: { name?: string; phone?: string } = {};
  if (!isValidFullName(cleanName)) errors.name = NAME_PROBLEM;
  if (!canonicalPhone) errors.phone = PHONE_PROBLEM;
  if (Object.keys(errors).length > 0 || Object.keys(addressErrors).length > 0) {
    return { ok: false, kind: 'fields', errors, addressErrors, first: errors.name ? 'name' : errors.phone ? 'phone' : 'address' };
  }
  const name = cleanName;
  const phone = formatPHPhoneDisplay(canonicalPhone as string);
  if (!i.signedIn) return { ok: false, kind: 'message', message: SIGN_IN_PROBLEM, signIn: true, name, phone };
  if (i.openOrderUnanswered) return { ok: false, kind: 'askSecond', name, phone };
  const have = albumPhotoCount(i.pages);
  if (photosShortBy(have) > 0) return { ok: false, kind: 'message', message: tooFewToOrderMessage(have), openAlbum: true, name, phone };
  return { ok: true, name, phone };
}

/** The phone box tidies a number it can read when you leave it (onBlur). */
export function phoneOnBlur(raw: string): string {
  const c = normalizePHPhone(raw);
  return c ? formatPHPhoneDisplay(c) : raw;
}
