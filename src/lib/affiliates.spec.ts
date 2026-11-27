// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/* ══════════════════════════════════════════════════════════════════════════
   AFFILIATES, APP SIDE (0061). The database decides; these keep the app
   saying exactly what it answered, charging what the database will ask,
   keeping a shared link only while it counts, and never sending a form or a
   setting the database would refuse.
   ══════════════════════════════════════════════════════════════════════════ */

const h = vi.hoisted(() => ({
  rpc: [] as [string, unknown][],
  answers: {} as Record<string, { data: unknown; error: null | { message: string; code?: string } }>,
  updates: [] as unknown[],
  updated: [{ id: 1 }] as unknown[] | null,
}));
vi.mock('./supabase', () => ({
  supabaseConfigured: true,
  supabase: {
    rpc: async (name: string, args: unknown) => { h.rpc.push([name, args]); return h.answers[name] ?? { data: null, error: null }; },
    from: () => ({
      update: (row: unknown) => { h.updates.push(row); return { eq: () => ({ select: async () => ({ data: h.updated, error: null }) }) }; },
    }),
  },
}));

import {
  affiliateDiscountOn, affiliateLine, affiliateLink, affiliateTerms, applicationProblem, applyAffiliate, captureAffiliateRef, checkCheckoutCode,
  checkoutPayTotal, exampleCommission, flagLabel, parseMyAffiliate, parseOwnerAffiliates, refFromUrl, REF_KEY,
  saleStatusLabel, saveAffiliateSettings, settingsProblem, storedAffiliateRef, suggestAffiliateCode,
} from './affiliates';

beforeEach(() => { h.rpc = []; h.answers = {}; h.updates = []; h.updated = [{ id: 1 }]; localStorage.clear(); });

describe('what the customer pays', () => {
  it('the total; nothing with the tester code; the discount less with an affiliate code, never below ₱0', () => {
    expect(checkoutPayTotal(1788, null, null)).toBe(1788);
    expect(checkoutPayTotal(1788, { code: 'MEGYTEST' }, null)).toBe(0);
    expect(checkoutPayTotal(1788, null, { code: 'ANNA', discount: 100 })).toBe(1688);
    expect(checkoutPayTotal(60, null, { code: 'ANNA', discount: 100 })).toBe(0);
    // The tester code wins: the database refuses both on one order anyway.
    expect(checkoutPayTotal(1788, { code: 'MEGYTEST' }, { code: 'ANNA', discount: 100 })).toBe(0);
  });
  it('says so in one line', () => {
    expect(affiliateLine({ code: 'ANNA', discount: 100 })).toBe('Code ANNA: ₱100 off');
    expect(affiliateLine({ code: 'ANNA', discount: 1500 })).toBe('Code ANNA: ₱1,500 off');
  });
  it('a Megy Mini takes no client discount (owner, 2026-11-19: "only mini"), as the database decides (0065)', () => {
    const anna = { code: 'ANNA', discount: 100 };
    expect(affiliateDiscountOn(anna, true)).toBe(0);
    expect(affiliateDiscountOn(anna, false)).toBe(100);
    expect(checkoutPayTotal(470, null, anna, true)).toBe(470);
    expect(checkoutPayTotal(1288, null, anna, false)).toBe(1188);
    expect(affiliateLine(anna, true)).toBe('Code ANNA: no discount on a Megy Mini');
    const m = readFileSync(resolve(__dirname, '../../supabase/migrations/0065_affiliate_mini_full_price.sql'), 'utf8');
    expect(m).toMatch(/if new\.album_size = '5\.8x8\.3' or new\.cover = 'staple' then\s+v_discount := 0;/);
  });
});

describe('what an affiliate earns (as the database rounds it)', () => {
  it("10% of the album after the client's ₱100: ₱1,788 → ₱169 (the live proof's number)", () => {
    expect(exampleCommission(1788, { ratePct: 10, discount: 100 })).toBe(169);
    expect(exampleCommission(2095, { ratePct: 10, discount: 100 })).toBe(200); // at a 3× markup
    expect(exampleCommission(80, { ratePct: 10, discount: 100 })).toBe(0);
  });
});

describe('the one code box', () => {
  it('asks check_order_code, the code tidied as the database compares it', async () => {
    h.answers.check_order_code = { data: { ok: true, kind: 'affiliate', code: 'ANNA', discount: 100, window_days: 45 }, error: null };
    expect(await checkCheckoutCode(' an na ')).toEqual({ ok: true, affiliate: { code: 'ANNA', discount: 100 }, windowDays: 45 });
    expect(h.rpc).toEqual([['check_order_code', { p_code: 'ANNA' }]]);
  });
  it('the tester code still comes back as the tester code', async () => {
    h.answers.check_order_code = { data: { ok: true, kind: 'tester', code: 'MEGYTEST' }, error: null };
    expect(await checkCheckoutCode('megytest')).toEqual({ ok: true, tester: { code: 'MEGYTEST' } });
  });
  it("your own code, a wrong one, too many: the customer's words", async () => {
    for (const [reason, words] of [
      ['own', "That's your own affiliate code. It can't take money off your own order."],
      ['wrong', "That code doesn't work. Check the spelling."],
      ['too_many', 'Too many wrong codes. Try again in an hour.'],
      ['sign_in', 'Sign in first, then type the code.'],
    ] as const) {
      h.answers.check_order_code = { data: { ok: false, reason }, error: null };
      expect(await checkCheckoutCode('X1234')).toEqual({ ok: false, message: words, reason });
    }
  });
  it('an empty box asks nothing; a lost connection says so', async () => {
    expect(await checkCheckoutCode('  ')).toEqual({ ok: false, message: 'Type the code first.' });
    expect(h.rpc).toEqual([]);
    h.answers.check_order_code = { data: null, error: { message: 'Failed to fetch' } };
    expect(await checkCheckoutCode('ANNA')).toEqual({ ok: false, message: "We couldn't check the code. Check your internet, then try again." });
  });
  it('before 0061 is applied (no such function), the tester code still works through its own check', async () => {
    h.answers.check_order_code = { data: null, error: { message: 'not found', code: 'PGRST202' } };
    h.answers.check_tester_code = { data: { ok: true, code: 'MEGYTEST' }, error: null };
    expect(await checkCheckoutCode('megytest')).toEqual({ ok: true, tester: { code: 'MEGYTEST' } });
    expect(h.rpc.map(([n]) => n)).toEqual(['check_order_code', 'check_tester_code']);
  });
  it('an answer in the wrong shape is not trusted', async () => {
    h.answers.check_order_code = { data: { ok: true, kind: 'affiliate', code: 'an-na' }, error: null };
    expect((await checkCheckoutCode('ANNA')).ok).toBe(false);
  });
});

describe('a shared link (?ref=CODE)', () => {
  it('is read before the # or inside the #/route?query, tidied, and only in the code shape', () => {
    expect(refFromUrl('?ref=anna', '')).toBe('ANNA');
    expect(refFromUrl('', '#/order?ref=Anna2')).toBe('ANNA2');
    expect(refFromUrl('?utm=x', '#/')).toBeNull();
    expect(refFromUrl('?ref=a', '')).toBeNull();
    expect(refFromUrl('?ref=<script>', '')).toBeNull();
  });
  it('the link points at the public site, not the app shell', () => {
    expect(affiliateLink('ANNA')).toBe('https://megyprints.vercel.app/?ref=ANNA');
  });
  it('is kept on the device, taken out of the address bar, and counts for the window only', () => {
    window.history.replaceState(null, '', '/?ref=anna&utm_source=fb#/');
    const now = Date.UTC(2026, 10, 15);
    expect(captureAffiliateRef(now)).toBe('ANNA');
    expect(window.location.search).toBe('?utm_source=fb');
    expect(window.location.hash).toBe('#/');
    expect(JSON.parse(localStorage.getItem(REF_KEY)!)).toEqual({ code: 'ANNA', at: now });
    expect(storedAffiliateRef(30, now + 29 * 86_400_000)).toBe('ANNA');
    expect(storedAffiliateRef(30, now + 31 * 86_400_000)).toBeNull();
    expect(localStorage.getItem(REF_KEY)).toBeNull(); // forgotten once too old
  });
  it('the last link opened wins', () => {
    window.history.replaceState(null, '', '/?ref=anna');
    captureAffiliateRef(1);
    window.history.replaceState(null, '', '/#/?ref=ben');
    captureAffiliateRef(2);
    expect(storedAffiliateRef(30, 3)).toBe('BEN');
    expect(window.location.hash).toBe('#/');
  });
  it('a broken saved value is ignored', () => {
    localStorage.setItem(REF_KEY, '{nope');
    expect(storedAffiliateRef()).toBeNull();
    localStorage.setItem(REF_KEY, JSON.stringify({ code: 'x y', at: Date.now() }));
    expect(storedAffiliateRef()).toBeNull();
  });
});

describe('the application form', () => {
  const ok = { fullName: 'Anna Reyes', gcash: '0917 555 0001', tin: '', promoteWhere: 'Wedding photographer, Cebu', agree: true };
  it('says the first thing to fix, in order, before anything is sent', () => {
    expect(applicationProblem(ok)).toBeNull();
    expect(applicationProblem({ ...ok, fullName: ' A ' })).toBe('Please type your full name.');
    expect(applicationProblem({ ...ok, gcash: '12345' })).toBe('Please type your GCash number, like 0917 123 4567.');
    expect(applicationProblem({ ...ok, tin: '12-34' })).toBe("A TIN has 9 to 14 digits. Leave it empty if you don't have one yet.");
    expect(applicationProblem({ ...ok, tin: '123-456-789-000' })).toBeNull();
    expect(applicationProblem({ ...ok, promoteWhere: 'fb' })).toBe("Tell us where you'll share your code.");
    expect(applicationProblem({ ...ok, agree: false })).toBe('Please agree to the affiliate terms.');
  });
  it('sends the tidy values; the database refusing says its own sentence', async () => {
    h.answers.apply_affiliate = { data: { affiliate: { status: 'pending', full_name: 'Anna Reyes', gcash_last4: '0001', rate_pct: 10, applied_at: '2026-11-15T00:00:00Z' } }, error: null };
    const m = await applyAffiliate({ ...ok, tin: '123-456-789' });
    expect(h.rpc[0]).toEqual(['apply_affiliate', { p_full_name: 'Anna Reyes', p_gcash: '0917 555 0001', p_tin: '123456789', p_promote_where: 'Wedding photographer, Cebu', p_agree: true }]);
    expect(m.affiliate?.status).toBe('pending');
    h.answers.apply_affiliate = { data: null, error: { message: 'You already applied.', code: 'MP010' } };
    await expect(applyAffiliate(ok)).rejects.toThrow('You already applied.');
    h.answers.apply_affiliate = { data: null, error: { message: 'connection reset' } };
    await expect(applyAffiliate(ok)).rejects.toThrow("We couldn't send your application. Check your internet, then try again.");
  });
  it('a form with a problem is never sent', async () => {
    await expect(applyAffiliate({ ...ok, agree: false })).rejects.toThrow('Please agree to the affiliate terms.');
    expect(h.rpc).toEqual([]);
  });
});

describe("the affiliate's page", () => {
  it('reads what the database sent, and survives what it did not', () => {
    const m = parseMyAffiliate({
      program: { on: true, rate_pct: 10, discount: 100, window_days: 30, min_payout: 500 },
      affiliate: { status: 'approved', code: 'ANNA', full_name: 'Anna Reyes', gcash_last4: '0001', rate_pct: 12 },
      totals: { sales: 3, pending: 169, payable: 338, paid: 0, this_month: 507, all_time: 507 },
      sales: [{ earned_at: '2026-11-15T01:00:00Z', album_size: '8x8', cover: 'softcover', amount: 169, status: 'payable' }, 'junk'],
      payouts: [],
    });
    expect(m.affiliate).toMatchObject({ status: 'approved', code: 'ANNA', ratePct: 12 });
    expect(m.totals).toEqual({ sales: 3, pending: 169, payable: 338, paid: 0, thisMonth: 507, allTime: 507 });
    expect(m.sales).toEqual([{ earnedAt: '2026-11-15T01:00:00Z', albumSize: '8x8', cover: 'softcover', amount: 169, status: 'payable', paidAt: null }]);
    expect(parseMyAffiliate(null)).toMatchObject({ affiliate: null, sales: [], payouts: [], totals: { sales: 0 } });
    expect(parseMyAffiliate({ affiliate: { status: 'hacked' } }).affiliate).toBeNull();
  });
  it("a sale's status in the affiliate's words", () => {
    expect(['pending', 'payable', 'paid', 'void'].map((s) => saleStatusLabel(s as 'pending'))).toEqual(['Waiting for delivery', 'To be paid', 'Paid', 'Cancelled']);
  });
  it("the terms use the program's own numbers", () => {
    const t = affiliateTerms({ on: true, ratePct: 12, discount: 150, windowDays: 45, minPayout: 800 }).join(' ');
    expect(t).toContain('12% of the album price');
    expect(t).toContain('₱150 off');
    expect(t).toContain('within 45 days');
    expect(t).toContain('at least ₱800');
    expect(t).toMatch(/coupon or deal sites/);
    expect(t).toContain('A Megy Mini or Megy Magazine has no discount for your client, and you still earn 12% of its price.');
  });
});

describe('the owner', () => {
  it('a suggested code from the first name, never one already taken', () => {
    expect(suggestAffiliateCode('Anna Reyes')).toBe('ANNA');
    expect(suggestAffiliateCode('Anna Cruz', ['ANNA'])).toBe('ANNA2');
    expect(suggestAffiliateCode('Jo Lim')).toBe('JOMEGY');
    expect(suggestAffiliateCode('Ñiño Santos')).toBe('NINO'); // the letters, without the marks
  });
  it('reads the list, dropping anything malformed', () => {
    const rows = parseOwnerAffiliates([
      { id: 'a1', status: 'pending', full_name: 'Anna', gcash_number: '+639175550001', promote_where: 'fb', applied_at: 'x', rate_pct: null, sales: 0 },
      { id: 'a2', status: 'weird' },
      'junk',
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: 'a1', status: 'pending', ratePct: null, sales: 0 });
  });
  it('a flag says why a sale may be their own', () => {
    expect(flagLabel('same_phone')).toBe("Delivered to the affiliate's own GCash number");
    expect(flagLabel(null)).toBeNull();
  });
  it("settings inside the database's limits only; a non-owner save says so", async () => {
    const s = { on: true, ratePct: 10, discount: 100, windowDays: 30, minPayout: 500 };
    expect(settingsProblem(s)).toBeNull();
    expect(settingsProblem({ ...s, ratePct: 60 })).toBe('The commission is 0 to 50%.');
    expect(settingsProblem({ ...s, windowDays: 0 })).toBe('A link counts for 1 to 365 days.');
    expect(await saveAffiliateSettings({ ...s, discount: -5 })).toBe('The customer discount is ₱0 to ₱2,000.');
    expect(h.updates).toEqual([]);
    expect(await saveAffiliateSettings(s)).toBeNull();
    expect(h.updates[0]).toMatchObject({ affiliate_on: true, affiliate_rate_pct: 10, affiliate_discount: 100, affiliate_window_days: 30, affiliate_min_payout: 500 });
    h.updated = [];
    expect(await saveAffiliateSettings(s)).toBe('Not saved: only the owner can change the affiliate program.');
  });
});
