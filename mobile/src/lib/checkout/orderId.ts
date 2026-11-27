/* The order's id, chosen on the phone (bug hunt L1-47, 2026-11-27).
   A Place order whose answer was lost (the network cut the moment the row was
   saved) used to leave a saved order the phone didn't know about; Place order
   again then made a SECOND order. Now the phone picks the id once per checkout
   visit and sends it with the order: if the first one was saved, the second
   insert is refused as a duplicate (orders_pkey) and the app finishes the saved
   order instead (OrderAlreadySavedError). The table's default
   (gen_random_uuid()) stays for every other caller. */
import { getRandomBytes } from 'expo-crypto';

/** A random (version 4) UUID from the phone's secure random numbers. */
export function newOrderId(): string {
  const b = getRandomBytes(16);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
