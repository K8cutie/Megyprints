/* ══════════════════════════════════════════════════════════════════════════
   WHY THIS TEST: two website files hold rules checkout needs but can't be
   shared until they are split (after Nov 9): src/lib/payment.ts (receipt
   and reference rules, the payee) and src/lib/testerCode.ts (the tester
   code). The app keeps a copy of their rules (lib/checkout/payment.ts and
   testerCode.ts). This test runs the WEBSITE's functions next to the app's
   on the same inputs and fails on the first difference, so the copies can't
   drift. The database is a stand-in (helpers/fakeSupabase.ts).
   ══════════════════════════════════════════════════════════════════════════ */
import * as appPay from '../src/lib/checkout/payment';
import * as appTester from '../src/lib/checkout/testerCode';
import { fake, fakeClient, resetFake } from './helpers/fakeSupabase';

jest.mock('@web/lib/supabase', () => jest.requireActual('./helpers/fakeSupabase').supabaseModule);
jest.mock('@web/lib/storageUpload', () => jest.requireActual('./helpers/fakeSupabase').storageUploadModule);

/* eslint-disable @typescript-eslint/no-require-imports */
const webPay = require('@web/lib/payment') as typeof appPay;
const webTester = require('@web/lib/testerCode') as Omit<typeof appTester, 'checkTesterCode' | 'checkTesterCodeOffline'> & { checkTesterCode: (raw: string) => Promise<appTester.TesterCheck> };
/* eslint-enable @typescript-eslint/no-require-imports */

beforeEach(resetFake);

describe("payment rules: the website's", () => {
  it('the same payee (the QR picture is read from the website)', () => {
    expect(appPay.PAYEE).toEqual(webPay.PAYEE);
    expect(appPay.PAYEE_QR_URL).toBe(`https://megyprints.vercel.app${webPay.PAYEE.qrSrc}`);
    expect(appPay.PROOF_BUCKET).toBe(webPay.PROOF_BUCKET);
    expect(appPay.PROOF_MAX_BYTES).toBe(webPay.PROOF_MAX_BYTES);
  });

  const references = [
    '', '   ', '2026091012345678', ' 2026091012345678 ', 'FT2410ABCD1234', '1234 5678 9012', 'GC-2026-0001.23',
    'lol nope 🙃 <script>alert(4)</script> !!!!', 'lol nope', 'abc123', 'ref#2026-0001', 'x'.repeat(80) + '1234',
    'Ref: 99887766', '１２３４５', 'MAYA_2026/10/29', 'ñ1234', '12 34',
  ];
  it.each(references)('reference %j: same problem, same cleaned text', (ref) => {
    expect(appPay.referenceProblem(ref)).toBe(webPay.referenceProblem(ref));
    expect(appPay.cleanReference(ref)).toBe(webPay.cleanReference(ref));
  });

  const files = [
    { type: 'image/png', name: 'a.png', size: 1000 }, { type: 'image/jpeg', name: 'a.jpg', size: 1 }, { type: 'image/jpg', name: 'x', size: 5 },
    { type: 'image/webp', name: 'w', size: 9 }, { type: 'application/pdf', name: 'r.pdf', size: 30_000 }, { type: '', name: 'receipt.JPEG', size: 10 },
    { type: '', name: 'r.PDF', size: 10 }, { type: 'application/octet-stream', name: 'r.webp', size: 10 }, { type: 'image/heic', name: 'IMG_1.HEIC', size: 10 },
    { type: 'image/gif', name: 'a.gif', size: 10 }, { type: '', name: '', size: 10 }, { type: 'image/png', name: 'big.png', size: 8 * 1024 * 1024 + 1 },
    { type: 'image/png', name: 'edge.png', size: 8 * 1024 * 1024 }, { type: 'image/png', name: 'empty.png', size: 0 },
  ];
  it.each(files.map((f) => [`${f.type || '(no type)'} ${f.name || '(no name)'} ${f.size} B`, f] as const))('receipt %s: same answer', (_l, f) => {
    expect(appPay.checkProof(f)).toBe(webPay.checkProof(f));
    expect(appPay.proofExtFor(f)).toBe(webPay.proofExtFor(f));
    const ext = appPay.proofExtFor(f);
    if (ext) {
      expect(appPay.proofMimeFor(ext)).toBe(webPay.proofMimeFor(ext));
      expect(appPay.proofObjectPath('order-1', ext)).toBe(webPay.proofObjectPath('order-1', ext));
    }
  });
});

describe("tester code: the website's", () => {
  const typed = ['MEGYTEST', 'megytest', ' megy test ', 'MEGY\tTEST\n', '', '   ', 'abc', 'ABCD', 'A'.repeat(24), 'A'.repeat(25), 'MEGY-TEST', 'ñandu1234'];
  it.each(typed)('%j: same normalised code', (t) => {
    expect(appTester.normalizeTesterCode(t)).toBe(webTester.normalizeTesterCode(t));
    expect(appTester.TESTER_CODE_PATTERN.test(appTester.normalizeTesterCode(t))).toBe(webTester.TESTER_CODE_PATTERN.test(webTester.normalizeTesterCode(t)));
  });

  it('the same amount to pay, line and messages', () => {
    for (const total of [0, 1, 1710, 2886, 12_345]) {
      expect(appTester.amountToPay(total, null)).toBe(webTester.amountToPay(total, null));
      expect(appTester.amountToPay(total, { code: 'MEGYTEST' })).toBe(webTester.amountToPay(total, { code: 'MEGYTEST' }));
    }
    expect(appTester.testerLine({ code: 'MEGYTEST' })).toBe(webTester.testerLine({ code: 'MEGYTEST' }));
    for (const r of ['sign_in', 'too_many', 'wrong', undefined, 'other']) expect(appTester.testerCheckMessage(r)).toBe(webTester.testerCheckMessage(r));
    expect(new appTester.TesterCodeGoneError('MEGYTEST').message).toBe(new (webTester as unknown as { TesterCodeGoneError: new (c: string) => Error }).TesterCodeGoneError('MEGYTEST').message);
    expect(appTester.TESTER_CODE_GONE_SQLSTATE).toBe(webTester.TESTER_CODE_GONE_SQLSTATE);
  });

  const answers: [string, { data: unknown; error: { message: string } | null }][] = [
    ['works', { data: { ok: true, code: 'MEGYTEST' }, error: null }],
    ['wrong', { data: { ok: false, reason: 'wrong' }, error: null }],
    ['too many tries', { data: { ok: false, reason: 'too_many' }, error: null }],
    ['not signed in', { data: { ok: false, reason: 'sign_in' }, error: null }],
    ['no connection', { data: null, error: { message: 'Failed to fetch' } }],
    ['a strange answer', { data: { ok: true, code: 'bad code!' }, error: null }],
  ];
  it.each(answers)('database says %s: the same message, from the same call', async (_l, answer) => {
    fake.rpc.check_tester_code = answer;
    const w = await webTester.checkTesterCode(' megy test ');
    const a = await appTester.checkTesterCode(fakeClient, ' megy test ', true);
    expect(a).toEqual(w);
    // Both asked the database with the same call.
    const { rec } = jest.requireActual('./helpers/fakeSupabase') as typeof import('./helpers/fakeSupabase');
    expect(rec.rpcs).toEqual([{ name: 'check_tester_code', args: { p_code: 'MEGYTEST' } }, { name: 'check_tester_code', args: { p_code: 'MEGYTEST' } }]);
  });

  it('an empty code is never sent', async () => {
    expect(await appTester.checkTesterCode(fakeClient, '  ', true)).toEqual(await webTester.checkTesterCode('  '));
  });
});
