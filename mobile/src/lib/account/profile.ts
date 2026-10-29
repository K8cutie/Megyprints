/* ══════════════════════════════════════════════════════════════════════════
   MY PROFILE: the account's name (the website's Profile page: the name kept
   in the account, "Edit Profile" → "Display Name" → "Save Changes"), and the
   delivery details from the newest order (read through the shared
   myOrdersCloud): the website keeps no phone or address on the account; it
   keeps them on each order, and offers the last one at the next checkout.
   ══════════════════════════════════════════════════════════════════════════ */
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { formatPHPhoneDisplay } from '@web/lib/contact';
import type { LastShipping } from '../orders/myOrders';

export const PROFILE_TITLE = 'My Profile';
export const EDIT = 'Edit Profile';
export const NAME_LABEL = 'Display Name';
export const NAME_PLACEHOLDER = 'Your name';
export const SAVE = 'Save Changes';
export const SAVING = 'Saving...';
export const SAVED = 'Saved!';
export const SAVE_FAILED = 'Error saving';
export const CANCEL = 'Cancel';
/** The website's name for an account with none. */
export const NO_NAME = 'Photo Enthusiast';

export const DELIVERY_TITLE = 'Your delivery details';
export const deliveryFrom = (orderNumber: string): string => `From your last order, ${orderNumber}. You can change them when you order.`;
export const NO_DELIVERY = 'No delivery details yet. You type them when you order, and they show here after.';
export const DELIVERY_FAILED = "We couldn't load your delivery details.";

/** The name kept in the account ('' when none). */
export function accountName(user: Pick<User, 'user_metadata'> | null | undefined): string {
  const n = user?.user_metadata?.full_name;
  return typeof n === 'string' ? n : '';
}

/** The name shown: the account's, else the website's "Photo Enthusiast". */
export function displayName(user: Pick<User, 'user_metadata'> | null | undefined): string {
  return accountName(user).trim() || NO_NAME;
}

/** Two letters for the round badge (the website's initials). */
export function initials(name: string): string {
  return name.split(' ').map((n) => n[0] ?? '').join('').toUpperCase().slice(0, 2);
}

/** Saves the name as the website does (updateUser, full_name, trimmed). */
export async function saveName(client: Pick<SupabaseClient, 'auth'>, name: string): Promise<boolean> {
  try {
    const { error } = await client.auth.updateUser({ data: { full_name: name.trim() } });
    return !error;
  } catch {
    return false;
  }
}

/** The delivery details as Profile lists them. */
export function deliveryLines(s: LastShipping): { label: string; value: string }[] {
  const lines: { label: string; value: string }[] = [];
  if (s.ship_name) lines.push({ label: 'Name', value: s.ship_name });
  if (s.ship_phone) lines.push({ label: 'Phone', value: formatPHPhoneDisplay(s.ship_phone) });
  if (s.ship_address) lines.push({ label: 'Address', value: s.ship_address });
  return lines;
}
