import { describe, it, expect, vi, beforeEach } from 'vitest';

/* ══════════════════════════════════════════════════════════════════════════
   THE TESTER CODE, APP SIDE (0057). The database decides; these keep the app
   saying exactly what it answered, in plain words, and never sending a code
   the owner can't save.
   ══════════════════════════════════════════════════════════════════════════ */

const h = vi.hoisted(() => ({
  rpc: [] as [string, unknown][],
  answer: { data: null as unknown, error: null as null | { message: string; code?: string } },
  updates: [] as unknown[],
  updated: [{ id: 1 }] as unknown[] | null,
}));
vi.mock('./supabase', () => ({
  supabaseConfigured: true,
  supabase: {
    rpc: async (name: string, args: unknown) => { h.rpc.push([name, args]); return h.answer; },
    from: () => ({
      update: (row: unknown) => { h.updates.push(row); return { eq: () => ({ select: async () => ({ data: h.updated, error: null }) }) }; },
    }),
  },
}));

import {
  amountToPay, checkTesterCode, claimTesterOrder, isTesterCodeGoneError, normalizeTesterCode, saveTesterSettings,
  testerCheckMessage, testerLine, TesterCodeGoneError, TESTER_CODE_PATTERN,
} from './testerCode';

beforeEach(() => { h.rpc = []; h.updates = []; h.updated = [{ id: 1 }]; h.answer = { data: null, error: null }; });

describe('the code as typed', () => {
  it('is compared without spaces, in capitals (as the database does)', () => {
    expect(normalizeTesterCode(' megy test ')).toBe('MEGYTEST');
    expect(TESTER_CODE_PATTERN.test('MEGYTEST')).toBe(true);
    expect(TESTER_CODE_PATTERN.test('MEG')).toBe(false);
    expect(TESTER_CODE_PATTERN.test('MEGY-TEST')).toBe(false);
  });
});

describe('what a tester pays', () => {
  it('nothing while a code is on, else the real total', () => {
    expect(amountToPay(1078, null)).toBe(1078);
    expect(amountToPay(1078, { code: 'MEGYTEST' })).toBe(0);
  });
  it('says so in one line', () => {
    expect(testerLine({ code: 'MEGYTEST' })).toBe('Tester code MEGYTEST: free');
  });
});

describe('checking a code', () => {
  it('sends the code as the database compares it, and takes its answer', async () => {
    h.answer = { data: { ok: true, code: 'MEGYTEST' }, error: null };
    expect(await checkTesterCode('megy test')).toEqual({ ok: true, tester: { code: 'MEGYTEST' } });
    expect(h.rpc).toEqual([['check_tester_code', { p_code: 'MEGYTEST' }]]);
  });
  it('a wrong code, too many tries, or no account: a plain sentence', async () => {
    for (const [reason, words] of [['wrong', "That code doesn't work. Check the spelling."], ['too_many', 'Too many wrong codes. Try again in an hour.'], ['sign_in', 'Sign in first, then type the code.']]) {
      h.answer = { data: { ok: false, reason }, error: null };
      expect(await checkTesterCode('X1234')).toEqual({ ok: false, message: words });
      expect(testerCheckMessage(reason)).toBe(words);
    }
  });
  it('nothing typed: no call', async () => {
    expect(await checkTesterCode('   ')).toEqual({ ok: false, message: 'Type the code first.' });
    expect(h.rpc).toEqual([]);
  });
  it('an answer it does not understand is not a free album', async () => {
    h.answer = { data: { ok: true }, error: null };
    expect((await checkTesterCode('MEGYTEST')).ok).toBe(false);
    h.answer = { data: { ok: true, code: 'not a code!' }, error: null };
    expect((await checkTesterCode('MEGYTEST')).ok).toBe(false);
    h.answer = { data: null, error: { message: 'Failed to fetch' } };
    expect(await checkTesterCode('MEGYTEST')).toEqual({ ok: false, message: "We couldn't check the code. Check your internet, then try again." });
  });
});

describe('a tester order', () => {
  it('asks the database to mark it paid', async () => {
    await claimTesterOrder('order-1');
    expect(h.rpc).toEqual([['claim_tester_order', { p_order_id: 'order-1' }]]);
  });
  it("a refusal reads as a sentence, never the database's words", async () => {
    h.answer = { data: null, error: { message: "This order isn't free with a tester code.", code: 'MP008' } };
    await expect(claimTesterOrder('order-1')).rejects.toThrow("We couldn't finish your free tester order. Your order is saved: tap Place order again.");
  });
  it('a code that stopped working is told apart (MP007)', () => {
    expect(isTesterCodeGoneError({ code: 'MP007' })).toBe(true);
    expect(isTesterCodeGoneError({ code: 'MP001' })).toBe(false);
    expect(isTesterCodeGoneError(null)).toBe(false);
    expect(new TesterCodeGoneError('MEGYTEST').message).toBe("The tester code MEGYTEST doesn't work any more, so nothing was ordered. Remove the code to order at the normal price.");
  });
});

describe("the owner's settings", () => {
  it('saves the code as the database keeps it', async () => {
    expect(await saveTesterSettings({ code: ' megy test ', on: true })).toBeNull();
    expect(h.updates).toEqual([expect.objectContaining({ tester_code: 'MEGYTEST', tester_code_on: true })]);
    expect(Object.keys(h.updates[0] as object).sort()).toEqual(['tester_code', 'tester_code_on', 'updated_at']);
  });
  it('a code the database would refuse is never sent', async () => {
    expect(await saveTesterSettings({ code: 'MEG', on: true })).toBe('The code must be 4 to 24 letters or numbers, no spaces.');
    expect(await saveTesterSettings({ code: 'MEGY-TEST', on: true })).toBe('The code must be 4 to 24 letters or numbers, no spaces.');
    expect(h.updates).toEqual([]);
  });
  it('a save the database quietly skipped (not the owner) says so', async () => {
    h.updated = [];
    expect(await saveTesterSettings({ code: 'MEGYTEST', on: false })).toBe('Not saved: only the owner can change the tester code.');
  });
});
