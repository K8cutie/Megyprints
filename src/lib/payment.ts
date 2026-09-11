/* ══════════════════════════════════════════════════════════════════════════
   Manual bank-transfer payment (0033).

   The customer pays by scanning the owner's GoTyme InstaPay / QR Ph code with
   any PH bank or e-wallet app, then attaches the receipt and the bank's
   reference number here so the operator can match the deposit in the GoTyme
   app and tap "Mark paid". No gateway, no fees on our side (GoTyme does not
   charge to receive InstaPay; the sender's app may). Xendit slots in later.

   Single source of truth for the payee — the Order page and any future
   "how to pay" surface read from here.
   ══════════════════════════════════════════════════════════════════════════ */

import { supabase } from './supabase';

export const PAYEE = {
  bank: 'GoTyme Bank',
  name: 'ARCHIE GARCIA',
  /** Only the tail is shown; the full number lives inside the QR. */
  accountLast4: '2370',
  rail: 'InstaPay · QR Ph',
  /** Drop the QR screenshot at public/pay/gotyme-instapay.png (see docs/payment-qr.md). */
  qrSrc: '/pay/gotyme-instapay.png',
} as const;

export const PROOF_BUCKET = 'payment-proofs';
/** Mirrors the bucket's file_size_limit (0033). A phone receipt screenshot is ~0.2–2 MB. */
export const PROOF_MAX_BYTES = 8 * 1024 * 1024;

export type ProofExt = 'jpg' | 'png' | 'webp' | 'pdf';

/** Map a picked receipt to the extension the storage policy accepts. Falls
 *  back to the file name when the browser reports a blank/generic mime. */
export function proofExtFor(file: { type: string; name?: string }): ProofExt | null {
  const t = (file.type || '').toLowerCase();
  if (t === 'image/jpeg' || t === 'image/jpg') return 'jpg';
  if (t === 'image/png') return 'png';
  if (t === 'image/webp') return 'webp';
  if (t === 'application/pdf') return 'pdf';
  const m = /\.([a-z0-9]+)$/i.exec(file.name || '');
  const ext = m?.[1]?.toLowerCase();
  if (ext === 'jpg' || ext === 'jpeg') return 'jpg';
  if (ext === 'png' || ext === 'webp' || ext === 'pdf') return ext;
  return null;
}

export function proofMimeFor(ext: ProofExt): string {
  return ext === 'jpg' ? 'image/jpeg' : ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'application/pdf';
}

/** Object name inside the bucket — exactly what the INSERT policy and the RPC
 *  path check accept: "<order id>.<ext>", no separators. */
export function proofObjectPath(orderId: string, ext: ProofExt): string {
  return `${orderId}.${ext}`;
}

/** Client-side gate before the upload. Returns a customer-facing message or null. */
export function checkProof(file: { type: string; name?: string; size: number }): string | null {
  if (!proofExtFor(file)) return 'Please attach a screenshot (JPG, PNG, WebP) or a PDF receipt.';
  if (file.size > PROOF_MAX_BYTES) return `That file is over ${Math.round(PROOF_MAX_BYTES / 1_048_576)} MB. A screenshot of the receipt is enough.`;
  if (file.size === 0) return 'That file is empty. Please pick the receipt screenshot again.';
  return null;
}

/** Keep only what a bank reference can contain; the RPC applies the same rule. */
export function cleanReference(raw: string): string {
  return raw.replace(/[^A-Za-z0-9 _./-]/g, '').trim().slice(0, 64);
}

/** Upload the receipt to the private bucket. Upsert: a re-pick replaces it. */
export async function uploadPaymentProof(orderId: string, file: File): Promise<string> {
  const ext = proofExtFor(file);
  if (!ext) throw new Error('Please attach a screenshot (JPG, PNG, WebP) or a PDF receipt.');
  const path = proofObjectPath(orderId, ext);
  const { error } = await supabase.storage.from(PROOF_BUCKET).upload(path, file, {
    contentType: proofMimeFor(ext),
    upsert: true,
    cacheControl: '0',
  });
  if (error) throw new Error(`Could not upload your receipt (${error.message}). You can still tap "I've sent the payment" — we'll confirm from our bank app.`);
  return path;
}

/** Record the reference + receipt path on the order (0033 RPC; customers have
 *  no direct UPDATE on orders). Safe to call without either — it still stamps
 *  payment_submitted_at so the console shows "customer says paid". */
export async function submitPaymentProof(orderId: string, opts: { reference?: string; proofPath?: string | null }): Promise<void> {
  const { error } = await supabase.rpc('submit_payment_proof', {
    p_order_id: orderId,
    p_reference: opts.reference ? cleanReference(opts.reference) : null,
    p_proof_path: opts.proofPath ?? null,
  });
  if (error) throw new Error(`Could not record your payment (${error.message}).`);
}
