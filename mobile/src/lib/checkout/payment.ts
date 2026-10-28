/* ══════════════════════════════════════════════════════════════════════════
   PAYING BY BANK TRANSFER: the website's rules, for the app's payment step.

   A MIRROR of the pure part of src/lib/payment.ts. That file can't be shared
   as it is (it also uploads the receipt through the website's Supabase
   client), and splitting it changes code the website runs, which waits until
   after the Nov 9 re-apply. So the rules are written here once more, and
   test/checkoutParity.test.ts runs the WEBSITE's functions next to these on
   the same inputs and fails on any difference. When payment.ts is split,
   this file becomes a re-export of the shared half.

   Same payee, same receipt types and size limit, same words, same receipt
   file name in the same private bucket (payment-proofs/<order id>.<ext>).
   ══════════════════════════════════════════════════════════════════════════ */
import { siteFile } from './site';

export const PAYEE = {
  bank: 'GoTyme Bank',
  name: 'ARCHIE GARCIA',
  /** Only the tail is shown; the full number lives inside the QR. */
  accountLast4: '2370',
  rail: 'InstaPay · QR Ph',
  /** The website's path for the QR picture (public/pay/gotyme-instapay.png). */
  qrSrc: '/pay/gotyme-instapay.png',
} as const;

/** The QR picture, read from the website (see site.ts). */
export const PAYEE_QR_URL = siteFile(PAYEE.qrSrc);

export const PROOF_BUCKET = 'payment-proofs';
/** Mirrors the bucket's file_size_limit (0033). */
export const PROOF_MAX_BYTES = 8 * 1024 * 1024;

export type ProofExt = 'jpg' | 'png' | 'webp' | 'pdf';

/** A picked receipt as the checks need it (the phone's picker gives these). */
export interface ProofFile { type: string; name?: string; size: number }

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

export function proofObjectPath(orderId: string, ext: ProofExt): string {
  return `${orderId}.${ext}`;
}

/** Before the upload. A customer-facing message, or null when it is fine. */
export function checkProof(file: ProofFile): string | null {
  if (!proofExtFor(file)) return 'Please attach a screenshot (JPG, PNG, WebP) or a PDF receipt.';
  if (file.size > PROOF_MAX_BYTES) return `That file is over ${Math.round(PROOF_MAX_BYTES / 1_048_576)} MB. A screenshot of the receipt is enough.`;
  if (file.size === 0) return 'That file is empty. Please pick the receipt screenshot again.';
  return null;
}

/** Keep only what a bank reference can contain; the RPC applies the same rule. */
export function cleanReference(raw: string): string {
  return raw.replace(/[^A-Za-z0-9 _./-]/g, '').trim().slice(0, 64);
}

/** What's wrong with a typed reference number ('' = fine; empty is fine too). */
export function referenceProblem(raw: string): string {
  const t = raw.trim();
  if (!t) return '';
  if (/[^A-Za-z0-9 _./-]/.test(t)) return "Use only the letters and numbers on your bank's receipt (e.g. 2026091012345678).";
  if ((t.match(/\d/g) ?? []).length < 4) return "A reference number has digits in it. Copy it from your bank's receipt, or leave this empty.";
  return '';
}

/** What "I've sent ₱X" sends, in the website's order (handlePaymentSent):
 *  the receipt to payment-proofs (create-only), then submit_payment_proof. */
export interface PaymentSubmitPlan {
  upload: { bucket: string; path: string; contentType: string; mode: 'create-only' } | null;
  rpc: { name: 'submit_payment_proof'; args: { p_order_id: string; p_reference: string | null; p_proof_path: string | null } };
}

/** The payment step's writes for an order, without sending anything. */
export function paymentSubmitPlan(orderId: string, reference: string, proof: ProofFile | null): PaymentSubmitPlan {
  const ext = proof && !checkProof(proof) ? proofExtFor(proof) : null;
  const path = ext ? proofObjectPath(orderId, ext) : null;
  // submitPaymentProof(order.id, { reference: cleanReference(payRef), proofPath }):
  // an empty reference is sent as null.
  const cleaned = cleanReference(reference);
  return {
    upload: ext && path ? { bucket: PROOF_BUCKET, path, contentType: proofMimeFor(ext), mode: 'create-only' } : null,
    rpc: { name: 'submit_payment_proof', args: { p_order_id: orderId, p_reference: cleaned ? cleanReference(cleaned) : null, p_proof_path: path } },
  };
}
