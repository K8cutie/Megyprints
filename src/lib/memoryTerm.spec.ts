// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/* ══════════════════════════════════════════════════════════════════════════
   THE MEMORY TERM THE CUSTOMER PAID FOR (1-star testers round 2):
   • MMC-1: paid +₱99 for 10 years, and My Memories said "Live until October
     2031" (the included 5) on every memory, with no word that the term
     changes once the payment is confirmed (apply_order_hosting_term).
   • MMC-6: the 10-year pick reset to 5 years — and the total with it — when
     the order page reloaded, while the delivery details came back.
   ══════════════════════════════════════════════════════════════════════════ */

const q = vi.hoisted(() => ({ calls: [] as unknown[][], rows: [] as unknown[] }));
vi.mock('./supabase', () => {
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'not', 'order']) chain[m] = (...a: unknown[]) => { q.calls.push([m, ...a]); return chain; };
  (chain as { then: unknown }).then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: q.rows, error: null }).then(ok);
  return { supabase: { from: (t: string) => { q.calls.push(['from', t]); return chain; } } };
});

import { memoryCodesInSnapshot, pendingTermsByCode, pendingUntil } from './qrMemories';
import { saveCheckoutForm, readCheckoutForm } from './checkoutSession';
import { EMPTY_ADDRESS } from './contact';

beforeEach(() => { q.calls = []; q.rows = []; sessionStorage.clear(); });

describe('MMC-1: a term waiting on payment is said', () => {
  const snapshot = {
    pages: [
      { qrFills: [null, { code: 'abcd2345' }] },
      { text_slot_qr: [{ code: 'wxyz6789' }] },
      { qrFills: [{ code: 'NOT-A-CODE' }] },
    ],
  };
  it('the codes in the order\'s frozen album — the same ones apply_order_hosting_term updates', () => {
    expect(memoryCodesInSnapshot(snapshot).sort()).toEqual(['abcd2345', 'wxyz6789']);
    expect(memoryCodesInSnapshot(null)).toEqual([]);
  });
  it('asks for the customer\'s own unpaid orders that bought a term', async () => {
    q.rows = [{ order_number: 'MP-2026-5FT8Z2C', hosting_years: 10, album_snapshot: snapshot }];
    const p = await pendingTermsByCode('user-1');
    expect(p.abcd2345).toEqual({ years: 10, orderNumber: 'MP-2026-5FT8Z2C' });
    expect(q.calls).toContainEqual(['eq', 'user_id', 'user-1']);
    expect(q.calls).toContainEqual(['eq', 'status', 'pending_payment']);
    expect(q.calls).toContainEqual(['not', 'hosting_years', 'is', null]);
  });
  it('the line shows only while the paid term is longer than the one shown', () => {
    const row = { kind: 'clip' as const, created_at: '2026-10-04T00:00:00Z', expires_at: '2031-10-04T00:00:00Z' };
    expect(pendingUntil(row, { years: 10, orderNumber: 'MP-1' })).toMatch(/^2036-10-04/);
    // Applied already (the shop confirmed): nothing more to say.
    expect(pendingUntil({ ...row, expires_at: '2036-10-04T00:00:00Z' }, { years: 10, orderNumber: 'MP-1' })).toBeNull();
    // The included term: nothing to say.
    expect(pendingUntil(row, { years: 5, orderNumber: 'MP-1' })).toBeNull();
    expect(pendingUntil({ ...row, kind: 'link' }, { years: 10, orderNumber: 'MP-1' })).toBeNull();
    expect(pendingUntil(row, undefined)).toBeNull();
  });
  it('My Memories says it under the term (source guard)', () => {
    const src = readFileSync(resolve(__dirname, '../pages/MyMemories.tsx'), 'utf8');
    expect(src).toMatch(/Your \{pending!\.years\}-year term \(to \{fmtMonth\(until\)\}\) starts once we confirm your payment for order/);
  });
});

describe('MMC-6: the term picked survives a reload', () => {
  it('saved with the checkout form, read back with it', () => {
    saveCheckoutForm({ albumId: 'a1', name: 'Mae', phone: '09171234567', address: EMPTY_ADDRESS, material: 'matte', cover: 'softcover', hostingYears: 10 });
    expect(readCheckoutForm('a1')?.hostingYears).toBe(10);
  });
  it('checkout restores it and keeps saving it (source guard)', () => {
    const src = readFileSync(resolve(__dirname, '../pages/Order.tsx'), 'utf8');
    expect(src).toMatch(/if \(form\.hostingYears != null\) setHostingYears\(form\.hostingYears\);/);
    expect(src).toMatch(/saveCheckoutForm\(\{ albumId: info\.albumId, name, phone, address, material, cover, hostingYears \}\);/);
  });
});
