/* ══════════════════════════════════════════════════════════════════════════
   CREATE-ONLY UPLOADS (the website's src/lib/storageUpload.ts, for the app):
   the print files and the receipt go to private buckets the customer can't
   read, so an upload never upserts (Storage would refuse it), and a retry
   that finds the file already there counts as done: Storage writes the row
   only after the file is fully stored. test/sendOrder.test.ts holds
   isAlreadyExists to the website's.

   Each try has a time limit (uploadTimeLimitMs): no answer by then and the
   try has failed. A connection that dropped under the pages file left the
   order screen on "Sending your print file…" for 13+ minutes (beta round 4):
   React Native's network client has no time limit, and Supabase's upload
   takes no cancel signal, so the request is left to end by itself; a file it
   does store later makes the next try's answer "already there", which is
   "done".
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

/** How long one try may go unanswered: a minute, plus the file at 1 Mbit/s
 *  (4G at its slowest: an 11 MB pages file gets about 2.5 minutes). */
export function uploadTimeLimitMs(bytes: number): number {
  return 60_000 + Math.ceil(bytes / 125_000) * 1000;
}

/** uploadOnce, on the app's Supabase client. */
export function createOnlyUpload(client: StorageClient): CreateOnlyUpload {
  return async (bucket, path, body, opts) => {
    // Storage takes an ArrayBuffer in React Native (not a Blob made from bytes).
    const buffer = body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timedOut = new Promise<'timed out'>((done) => { timer = setTimeout(() => done('timed out'), uploadTimeLimitMs(body.byteLength)); });
    try {
      const answer = await Promise.race([client.storage.from(bucket).upload(path, buffer, { ...opts, upsert: false }), timedOut]);
      if (answer === 'timed out') return { message: 'Upload timed out: no answer from the server' };
      const { error } = answer;
      if (!error || isAlreadyExists(error)) return null;
      return { message: error.message || 'upload failed' };
    } finally {
      clearTimeout(timer);
    }
  };
}
