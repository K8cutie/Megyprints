/* An upload with no answer is a failed try, not a wait forever (beta round 4,
   Mother: the connection dropped while the pages file was going, and the
   order screen said "Sending your print file…" for 13+ minutes until the app
   was closed. React Native's network client has no time limit of its own,
   and Supabase's upload takes no cancel signal). Each try gets a time limit
   long enough for its file on 4G at its slowest; then the next try goes, and
   after the last one the customer gets the plain words and Place order. */
import { createOnlyUpload, uploadTimeLimitMs } from '../src/lib/checkout/storage';

/** A Storage client whose uploads go out and never come back (the connection dropped). */
function droppedConnection() {
  const sent: string[] = [];
  const client = { storage: { from: () => ({ upload: (path: string) => { sent.push(path); return new Promise<never>(() => {}); } }) } };
  return { client, sent };
}

afterEach(() => { jest.useRealTimers(); });

describe('uploadTimeLimitMs: a minute, plus the file at 1 Mbit/s (4G at its slowest)', () => {
  it('an 11 MB pages file: about 2.5 minutes; a 40 MB one: about 6', () => {
    expect(uploadTimeLimitMs(11_000_000)).toBe(60_000 + 88_000);
    expect(uploadTimeLimitMs(40_000_000)).toBe(60_000 + 320_000);
    expect(uploadTimeLimitMs(0)).toBe(60_000);
  });
});

describe('createOnlyUpload', () => {
  it('no answer within the time limit: the try fails, in words the order screen turns into plain ones', async () => {
    jest.useFakeTimers();
    const { client } = droppedConnection();
    const up = createOnlyUpload(client);
    const bytes = new Uint8Array(11_000_000);
    let answer: { message: string } | null | undefined;
    void up('print-pdfs', 'order-1.pdf', bytes, { contentType: 'application/pdf' }).then((a) => { answer = a; });
    await jest.advanceTimersByTimeAsync(uploadTimeLimitMs(bytes.byteLength) - 1);
    expect(answer).toBeUndefined();
    await jest.advanceTimersByTimeAsync(1);
    expect(answer).toEqual({ message: expect.stringMatching(/timed out/i) });
  });

  it('an answer in time is the answer, and nothing is left waiting', async () => {
    jest.useFakeTimers();
    const client = { storage: { from: () => ({ upload: async () => ({ error: null }) }) } };
    await expect(createOnlyUpload(client)('print-pdfs', 'order-1.pdf', new Uint8Array(10), { contentType: 'application/pdf' })).resolves.toBeNull();
    expect(jest.getTimerCount()).toBe(0);
  });
});
