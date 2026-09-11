import { describe, it, expect } from 'vitest';
import { PAYEE, PROOF_MAX_BYTES, proofExtFor, proofMimeFor, proofObjectPath, checkProof, cleanReference } from './payment';

/* ══════════════════════════════════════════════════════════════════════════
   MANUAL PAYMENT — the pure half. The object name must match the storage
   policy in 0033 ("<order id>.<jpg|png|webp|pdf>") and the RPC's path check
   exactly, or receipts are rejected at upload or at submit.
   ══════════════════════════════════════════════════════════════════════════ */

const ORDER = '3f1c2b7a-9d4e-4c1a-8b2f-6e5d4c3b2a10';
const POLICY_NAME = new RegExp(`^${ORDER}\\.(jpg|png|webp|pdf)$`);

describe('payee — the one place the bank details live', () => {
  it('names GoTyme, the account holder, the last four digits, and a QR under /pay', () => {
    expect(PAYEE.bank).toBe('GoTyme Bank');
    expect(PAYEE.name).toBe('ARCHIE GARCIA');
    expect(PAYEE.accountLast4).toMatch(/^\d{4}$/);
    expect(PAYEE.qrSrc).toMatch(/^\/pay\/.+\.png$/);
  });
});

describe('receipt extension mapping', () => {
  it('maps the accepted mimes and falls back to the file name for blank/generic mimes (Android gallery)', () => {
    expect(proofExtFor({ type: 'image/jpeg', name: 'IMG_1.jpg' })).toBe('jpg');
    expect(proofExtFor({ type: 'image/png' })).toBe('png');
    expect(proofExtFor({ type: 'image/webp' })).toBe('webp');
    expect(proofExtFor({ type: 'application/pdf', name: 'receipt.pdf' })).toBe('pdf');
    expect(proofExtFor({ type: '', name: 'Screenshot_2026.JPEG' })).toBe('jpg');
    expect(proofExtFor({ type: 'application/octet-stream', name: 'r.png' })).toBe('png');
  });
  it('rejects everything else', () => {
    expect(proofExtFor({ type: 'image/gif', name: 'x.gif' })).toBeNull();
    expect(proofExtFor({ type: 'video/mp4', name: 'x.mp4' })).toBeNull();
    expect(proofExtFor({ type: '', name: 'noext' })).toBeNull();
  });
  it('mime round-trips to the bucket allowlist', () => {
    expect(proofMimeFor('jpg')).toBe('image/jpeg');
    expect(proofMimeFor('pdf')).toBe('application/pdf');
  });
});

describe('object naming ↔ storage policy ↔ RPC path check', () => {
  it('every accepted ext yields the exact name the policy and the RPC accept', () => {
    for (const ext of ['jpg', 'png', 'webp', 'pdf'] as const) expect(proofObjectPath(ORDER, ext)).toMatch(POLICY_NAME);
  });
  it('never produces a separator (no path traversal into another order)', () => {
    expect(proofObjectPath(ORDER, 'jpg')).not.toContain('/');
  });
});

describe('client gate mirrors the bucket cap', () => {
  it('accepts a phone screenshot, rejects the wrong type, an empty file, and over-cap', () => {
    expect(checkProof({ type: 'image/png', size: 1_500_000 })).toBeNull();
    expect(checkProof({ type: 'text/plain', name: 'x.txt', size: 10 })).toMatch(/JPG, PNG, WebP/);
    expect(checkProof({ type: 'image/png', size: 0 })).toMatch(/empty/);
    expect(checkProof({ type: 'image/png', size: PROOF_MAX_BYTES + 1 })).toMatch(/over 8 MB/);
  });
});

describe('reference cleaning matches the RPC', () => {
  it('keeps bank-style references, strips markup, caps at 64', () => {
    expect(cleanReference(' 2026091012345678 ')).toBe('2026091012345678');
    expect(cleanReference('REF-2026/09.10_A')).toBe('REF-2026/09.10_A');
    expect(cleanReference('<script>alert(1)</script>')).toBe('scriptalert1/script'); // '/' is legal in bank refs; angle brackets are not
    expect(cleanReference('x'.repeat(100))).toHaveLength(64);
  });
});
