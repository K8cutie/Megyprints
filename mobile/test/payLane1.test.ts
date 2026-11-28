/* Bug hunt lane 1, round 1 (2026-11-28, confirmed by Mother):
   B-D4  a second receipt was dropped quietly: the upload is create-only (one
         file per order, 0042), and "already exists" counted as sent. Now the
         first is kept and the customer is told.
   B-D3  "I've sent" offline showed the phone's raw error
         ("java.net.ConnectException: Failed to connect to /10.0.2.2:59321").
   B-D6  with ~16 MB free, Place order saved the order and then couldn't make
         the cover ("close your other apps"): the room is checked before. */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PAYMENT_OFFLINE, RECEIPT_ALREADY_KEPT, sendPayment, type SendDeps } from '../src/lib/checkout/sendOrder';
import { paymentSubmitPlan } from '../src/lib/checkout/payment';
import { createOnlyUpload } from '../src/lib/checkout/storage';
import { lowSpaceWords, MIN_FREE_BYTES, PHONE_ALMOST_FULL } from '../src/lib/checkout/sizeLimits';

const ORDER = '6f1c2d3e-4a5b-4c6d-8e7f-0123456789ab';
const RECEIPT = { name: 'receipt.png', size: 214_000, type: 'image/png' };

function deps(upload: SendDeps['upload'], rpcError: { message: string; code?: string } | null = null) {
  const rpcs: { name: string; args: Record<string, unknown> }[] = [];
  return {
    rpcs,
    d: {
      upload,
      db: { rpc: async (name: string, args?: Record<string, unknown>) => { rpcs.push({ name, args: args ?? {} }); return { data: null, error: rpcError }; } } as unknown as SendDeps['db'],
    },
  };
}

describe('"I\'ve sent the payment"', () => {
  const plan = () => paymentSubmitPlan(ORDER, '2026091012345678', RECEIPT as never);

  it('a receipt already there for this order: the first is kept and said, never dropped quietly (B-D4)', async () => {
    const asked: unknown[] = [];
    const { d, rpcs } = deps(async (_b, _p, _body, opts) => { asked.push(opts); return { message: 'already exists', alreadyThere: true }; });
    const r = await sendPayment(plan(), new Uint8Array([1, 2, 3]), d);
    expect(asked[0]).toMatchObject({ reportExisting: true });
    expect(r.receiptError).toBe(RECEIPT_ALREADY_KEPT);
    // The payment is still recorded, pointing at the receipt the shop has.
    expect(rpcs[0].args.p_proof_path).toBe(`${ORDER}.png`);
  });

  it('a new receipt: sent and linked, no words', async () => {
    const { d, rpcs } = deps(async () => null);
    const r = await sendPayment(plan(), new Uint8Array([1]), d);
    expect(r.receiptError).toBeNull();
    expect(rpcs[0].args.p_proof_path).toBe(`${ORDER}.png`);
  });

  it('no connection: plain words, not the phone\'s own error (B-D3)', async () => {
    for (const message of ['TypeError: Network request failed', 'Error: fetch failed: java.net.ConnectException: Failed to connect to /10.0.2.2:59321']) {
      const { d } = deps(async () => null, { message });
      await expect(sendPayment(plan(), null, d)).rejects.toThrow(PAYMENT_OFFLINE);
    }
    expect(PAYMENT_OFFLINE).not.toMatch(/java|fetch|Error/);
  });

  it('any other refusal keeps the database\'s words, as before', async () => {
    const { d } = deps(async () => null, { message: 'Order not found, or it is already paid.', code: 'MP003' });
    await expect(sendPayment(plan(), null, d)).rejects.toThrow('Could not record your payment (Order not found, or it is already paid.).');
  });
});

describe('the create-only upload', () => {
  const client = (error: { message: string; statusCode?: string } | null) => ({
    storage: { from: () => ({ upload: async () => ({ error }) }) },
  }) as unknown as Parameters<typeof createOnlyUpload>[0];

  it('a file already there counts as sent for the print files (a retry), and is said when asked (a receipt)', async () => {
    const exists = { message: 'The resource already exists', statusCode: '409' };
    expect(await createOnlyUpload(client(exists))('print-pdfs', 'o/x.pdf', new Uint8Array([1]), { contentType: 'application/pdf' })).toBeNull();
    expect(await createOnlyUpload(client(exists))('payment-proofs', 'o.png', new Uint8Array([1]), { contentType: 'image/png', reportExisting: true }))
      .toEqual({ message: 'already exists', alreadyThere: true });
  });
});

describe('room on the phone before an order is saved (B-D6)', () => {
  it('under 150 MB free: the words, before any order row', () => {
    expect(MIN_FREE_BYTES).toBe(150 * 1024 * 1024);
    expect(lowSpaceWords(16 * 1024 * 1024)).toBe(PHONE_ALMOST_FULL);
    expect(lowSpaceWords(MIN_FREE_BYTES - 1)).toBe(PHONE_ALMOST_FULL);
    expect(lowSpaceWords(MIN_FREE_BYTES)).toBeNull();
    expect(lowSpaceWords(4 * 1024 * 1024 * 1024)).toBeNull();
    // Unknown room (the phone can't say): go on, as before.
    expect(lowSpaceWords(undefined)).toBeNull();
    expect(lowSpaceWords(Number.NaN)).toBeNull();
  });

  it('checkout checks it before Place order builds or finishes anything, and before Finish sending', () => {
    const src = readFileSync(path.join(__dirname, '../src/app/order.tsx'), 'utf8').replace(/\r\n/g, '\n');
    const room = src.indexOf('const tooFull = live ? roomWords() : null;\n    if (tooFull) { setMessage(tooFull); return; }');
    expect(room).toBeGreaterThan(0);
    expect(room).toBeLessThan(src.indexOf('if (retryFinishesSavedOrder({ live, placed: placedRef.current'));
    expect(room).toBeLessThan(src.indexOf('const p = placeOrderPlan({'));
    const finish = src.indexOf('const startFinishing = async (savedId?: string) => {');
    const finishRoom = src.indexOf('const tooFull = roomWords();', finish);
    expect(finishRoom).toBeGreaterThan(finish);
    expect(finishRoom).toBeLessThan(src.indexOf('const order = await loadFinishOrder(', finish));
  });
});
