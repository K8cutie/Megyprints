import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const { upload, from } = vi.hoisted(() => {
  const upload = vi.fn();
  return { upload, from: vi.fn(() => ({ upload })) };
});
vi.mock('./supabase', () => ({ supabase: { storage: { from } } }));

import { uploadOnce, isAlreadyExists } from './storageUpload';

/* ══════════════════════════════════════════════════════════════════════════
   CREATE-ONLY UPLOADS — the print PDF, cover wrap and payment receipt.
   Customers have no read policy on print-pdfs / payment-proofs, so Storage
   refuses an upsert from them ("new row violates row-level security policy")
   while letting a plain create through. Operators CAN read, which is how the
   owner's own test orders hid this from July to September 2026.
   ══════════════════════════════════════════════════════════════════════════ */

// What Storage actually sends back (storage-js StorageApiError fields).
const DUPLICATE = { message: 'The resource already exists', status: 409, statusCode: '409' };
const RLS = { message: 'new row violates row-level security policy', status: 403, statusCode: '403' };

beforeEach(() => { upload.mockReset(); from.mockClear(); });

describe('uploadOnce', () => {
  it('never asks Storage to upsert', async () => {
    upload.mockResolvedValue({ data: {}, error: null });
    const blob = new Blob(['%PDF']);
    await uploadOnce('print-pdfs', 'abc.pdf', blob, { contentType: 'application/pdf' });
    expect(from).toHaveBeenCalledWith('print-pdfs');
    expect(upload).toHaveBeenCalledWith('abc.pdf', blob, { contentType: 'application/pdf', upsert: false });
  });

  it('keeps extra options (cacheControl) and still forces upsert off', async () => {
    upload.mockResolvedValue({ data: {}, error: null });
    await uploadOnce('payment-proofs', 'abc.jpg', new Blob(['x']), { contentType: 'image/jpeg', cacheControl: '0' });
    expect(upload.mock.calls[0][2]).toEqual({ contentType: 'image/jpeg', cacheControl: '0', upsert: false });
  });

  it('a fresh upload is done', async () => {
    upload.mockResolvedValue({ data: {}, error: null });
    await expect(uploadOnce('print-pdfs', 'abc.pdf', new Blob(['x']), { contentType: 'application/pdf' })).resolves.toBeNull();
  });

  it('a retry that finds the file already there is done too', async () => {
    upload.mockResolvedValue({ data: null, error: DUPLICATE });
    await expect(uploadOnce('print-pdfs', 'abc.pdf', new Blob(['x']), { contentType: 'application/pdf' })).resolves.toBeNull();
  });

  it('any other refusal comes back to the caller', async () => {
    upload.mockResolvedValue({ data: null, error: RLS });
    await expect(uploadOnce('print-pdfs', 'abc.pdf', new Blob(['x']), { contentType: 'application/pdf' })).resolves.toBe(RLS);
  });
});

describe('isAlreadyExists', () => {
  it('recognises the duplicate answer by HTTP status, body statusCode, or message', () => {
    expect(isAlreadyExists(DUPLICATE)).toBe(true);
    expect(isAlreadyExists({ message: 'x', status: 409 })).toBe(true);
    expect(isAlreadyExists({ message: 'x', statusCode: '409' })).toBe(true);
    expect(isAlreadyExists({ message: 'Duplicate' })).toBe(true);
  });
  it('does not mistake a refusal or a missing error for success', () => {
    expect(isAlreadyExists(RLS)).toBe(false);
    expect(isAlreadyExists({ message: 'The object exceeded the maximum allowed size', statusCode: '413' })).toBe(false);
    expect(isAlreadyExists(null)).toBe(false);
    expect(isAlreadyExists(undefined)).toBe(false);
  });
});

// Guardrail: an `upsert: true` storage upload from the customer's side reaches
// a bucket they can't read and fails for every real customer, while passing
// every test run from an operator account. Keep it out of the source.
describe('no customer code hard-codes an upserting upload', () => {
  const src = join(process.cwd(), 'src');
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(name) && !/\.spec\.ts$/.test(name)) files.push(p);
    }
  };
  walk(src);

  it('scans the app source', () => { expect(files.length).toBeGreaterThan(20); });

  it('finds no `upsert: true`', () => {
    const offenders = files.filter((f) => /upsert:\s*true/.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('the print PDF, cover and receipt go through uploadOnce, not a raw .upload(', () => {
    for (const f of ['lib/orders.ts', 'lib/payment.ts']) {
      const code = readFileSync(join(src, f), 'utf8');
      expect(code, f).toMatch(/uploadOnce\(/);
      expect(code, f).not.toMatch(/\.upload\(/);
    }
  });
});
