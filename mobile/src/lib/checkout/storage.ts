/* ══════════════════════════════════════════════════════════════════════════
   CREATE-ONLY UPLOADS (the website's src/lib/storageUpload.ts, for the app):
   the print files and the receipt go to private buckets the customer can't
   read, so an upload never upserts (Storage would refuse it), and a retry
   that finds the file already there counts as done: Storage writes the row
   only after the file is fully stored. test/sendOrder.test.ts holds
   isAlreadyExists to the website's.
   ══════════════════════════════════════════════════════════════════════════ */
import type { CreateOnlyUpload } from './sendOrder';

type StorageErrorLike = { message?: string; status?: number; statusCode?: string | number } | null | undefined;

/** Storage's answer to a create-only upload whose object already exists (409 "Duplicate"). */
export function isAlreadyExists(error: StorageErrorLike): boolean {
  if (!error) return false;
  if (error.status === 409 || String(error.statusCode ?? '') === '409') return true;
  return /already exists|duplicate/i.test(error.message || '');
}

interface StorageClient {
  storage: {
    from(bucket: string): {
      upload(path: string, body: ArrayBuffer, opts: { contentType: string; cacheControl?: string; upsert: false }): Promise<{ error: StorageErrorLike }>;
    };
  };
}

/** uploadOnce, on the app's Supabase client. */
export function createOnlyUpload(client: StorageClient): CreateOnlyUpload {
  return async (bucket, path, body, opts) => {
    // Storage takes an ArrayBuffer in React Native (not a Blob made from bytes).
    const buffer = body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer;
    const { error } = await client.storage.from(bucket).upload(path, buffer, { ...opts, upsert: false });
    if (!error || isAlreadyExists(error)) return null;
    return { message: error.message || 'upload failed' };
  };
}
