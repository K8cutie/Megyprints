/* ══════════════════════════════════════════════════════════════════════════
   Create-only uploads for the customer's side of the PRIVATE buckets
   (print-pdfs, payment-proofs).

   Customers have NO read (SELECT) policy on those buckets, on purpose: 0008
   keeps the print file out of their hands so the album can't be printed
   elsewhere, 0033 keeps receipts operator-only. Supabase Storage checks an
   upload by first running its INSERT as the customer. With upsert switched on
   that INSERT is `… ON CONFLICT DO UPDATE … RETURNING *`, and RETURNING needs read
   access to the new row, so every non-operator gets "new row violates
   row-level security policy". Operators pass the operator read policy, which is
   why orders placed from the owner's account always went through. A plain
   create is a bare INSERT and only needs the insert policy.

   So these uploads never upsert. A retry that finds the object already there
   counts as done: Storage writes the row only after the file is fully stored,
   so an existing object is a finished upload for this same order.
   ══════════════════════════════════════════════════════════════════════════ */

import { supabase } from './supabase';

type StorageErrorLike = { message?: string; status?: number; statusCode?: string | number } | null | undefined;

/** Storage's answer to a create-only upload whose object already exists (409 "Duplicate"). */
export function isAlreadyExists(error: StorageErrorLike): boolean {
  if (!error) return false;
  if (error.status === 409 || String(error.statusCode ?? '') === '409') return true;
  return /already exists|duplicate/i.test(error.message || '');
}

/** Upload `body` to `bucket/path` without overwriting. Resolves to null when the
 *  file is in the bucket (just now, or by an earlier attempt), or to the storage
 *  error when it isn't. */
export async function uploadOnce(
  bucket: string,
  path: string,
  body: Blob,
  opts: { contentType: string; cacheControl?: string },
): Promise<{ message: string } | null> {
  const { error } = await supabase.storage.from(bucket).upload(path, body, { ...opts, upsert: false });
  if (!error || isAlreadyExists(error)) return null;
  return error;
}
