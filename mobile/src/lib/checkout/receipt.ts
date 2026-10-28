/* The receipt for a bank transfer: picked from the phone (its photos and
   screenshots, or a PDF), checked with the website's rules (payment.ts
   checkProof: JPG, PNG, WebP or PDF, at most 8 MB). Copied into the app's
   cache so it can still be read when the order sends it. */
import { getDocumentAsync, type DocumentPickerAsset } from 'expo-document-picker';
import { checkProof, type ProofFile } from './payment';

export const RECEIPT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

export interface PickedReceipt extends ProofFile {
  uri: string;
  name: string;
}

/** A picked file as the checks see it. */
export function toReceipt(a: Pick<DocumentPickerAsset, 'uri' | 'name' | 'size' | 'mimeType'>): PickedReceipt {
  return { uri: a.uri, name: a.name ?? 'receipt', type: a.mimeType ?? '', size: typeof a.size === 'number' ? a.size : 0 };
}

/** "receipt.png · 214 KB", as the website shows a picked receipt. */
export function receiptLabel(r: PickedReceipt): string {
  return `${r.name} · ${Math.max(1, Math.round(r.size / 1024))} KB`;
}

export type ReceiptPick = { picked: PickedReceipt } | { problem: string } | null;

/** Opens Android's picker on the phone's pictures and PDFs. Null = closed. */
export async function pickReceipt(): Promise<ReceiptPick> {
  const res = await getDocumentAsync({ type: RECEIPT_TYPES, multiple: false, copyToCacheDirectory: true });
  if (res.canceled || !res.assets?.length) return null;
  const r = toReceipt(res.assets[0]);
  const problem = checkProof(r);
  return problem ? { problem } : { picked: r };
}
