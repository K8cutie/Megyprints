// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

/* ══════════════════════════════════════════════════════════════════════════
   BECOME AN AFFILIATE / YOUR AFFILIATE PAGE (owner, 2026-11-15): "Can we do
   a 'Become an affiliate on the app'?" … "so in that the affiliates can see
   what they earned etc?" — a visitor reads how it works and signs in; an
   applicant sees where they stand; an approved affiliate sees their code,
   link, earnings and payouts — and never who bought.
   ══════════════════════════════════════════════════════════════════════════ */

const PROGRAM = { on: true, rate_pct: 10, discount: 100, window_days: 30, min_payout: 500 };
const h = vi.hoisted(() => ({
  auth: { user: null as { id: string } | null, loading: false },
  login: 0,
  rpc: [] as [string, unknown][],
  answers: {} as Record<string, { data: unknown; error: null | { message: string; code?: string } }>,
}));
vi.mock('../lib/authContext', () => ({ useAuth: () => h.auth }));
vi.mock('../components/AuthModalProvider', () => ({ useAuthModal: () => ({ openLogin: () => { h.login++; } }) }));
vi.mock('../lib/supabase', () => ({
  supabaseConfigured: true,
  supabase: { rpc: async (name: string, args: unknown) => { h.rpc.push([name, args]); return h.answers[name] ?? { data: null, error: null }; } },
}));
vi.mock('../lib/storeSettings', () => {
  const sizes = { '8x8': { pps: 4, soft_rate: 575, hard_rate: 1075 } };
  // The live 8×8 hardbound: round(10 sheets × ₱66.25 + ₱1,075) + ₱50 = ₱1,788.
  const schedule = { min_pages: 40, sheet_rate: 66.25, hosting_reserve: 50, hosting_tiers: [], disabled_sizes: [], sizes };
  return { getPriceSchedule: () => schedule, onStoreSettingsChange: () => () => {} };
});

import Affiliate from './Affiliate';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  h.auth = { user: null, loading: false }; h.login = 0; h.rpc = []; h.answers = {};
  h.answers.affiliate_program = { data: PROGRAM, error: null };
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); });

const settle = () => act(async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)); });
const open = async () => { await act(async () => { root.render(createElement(MemoryRouter, null, createElement(Affiliate))); }); await settle(); };
const $ = (id: string) => host.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const type = async (id: string, v: string) => {
  const el = $(id) as HTMLInputElement | HTMLTextAreaElement;
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  await act(async () => { Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); });
};
const mine = (affiliate: unknown, extra: Record<string, unknown> = {}) => ({ data: { program: PROGRAM, affiliate, ...extra }, error: null });

describe('a visitor (not signed in)', () => {
  it('reads how it works in the program\'s numbers, with a real example, and signs in to apply', async () => {
    await open();
    expect($('affiliate-pitch')?.textContent).toContain('₱100 off');
    expect($('affiliate-pitch')?.textContent).toContain('10%');
    // ₱1,788 album: the client pays ₱1,688; 10% of it is ₱169.
    expect($('affiliate-example')?.textContent).toBe('For example: an 8×8 hardbound album is ₱1,788. Your client pays ₱1,688, and you earn about ₱169.');
    expect($('affiliate-terms')?.textContent).toContain('within 30 days');
    expect(h.rpc.map(([n]) => n)).toEqual(['affiliate_program']);
    const btn = $('affiliate-sign-in')!.querySelector('button')!;
    expect(btn.textContent).toBe('Sign in to apply');
    await act(async () => { btn.click(); });
    expect(h.login).toBe(1);
  });
  it('while the program is off, it says applications are closed (no sign-in button)', async () => {
    h.answers.affiliate_program = { data: { ...PROGRAM, on: false }, error: null };
    await open();
    expect($('affiliate-sign-in')?.textContent).toBe('Applications are closed right now.');
    expect($('affiliate-sign-in')?.querySelector('button')).toBeNull();
  });
  it('before the database has the program, it says so instead of a blank page', async () => {
    h.answers.affiliate_program = { data: null, error: { message: 'not found', code: 'PGRST202' } };
    await open();
    expect(host.textContent).toContain("The affiliate program can't be loaded right now.");
  });
});

describe('a signed-in customer applies', () => {
  beforeEach(() => { h.auth = { user: { id: 'u1' }, loading: false }; });

  it('fills the form; a problem shows before anything is sent; then it says the application is in', async () => {
    h.answers.my_affiliate = mine(null);
    await open();
    expect($('affiliate-apply')).not.toBeNull();
    await type('aff-name', 'Anna Reyes');
    await type('aff-gcash', '0917 555 0001');
    await type('aff-where', 'Wedding photographer in Cebu, about 3 weddings a month');
    await act(async () => { $('aff-send')!.click(); });
    await settle();
    expect($('aff-error')?.textContent).toBe('Please agree to the affiliate terms.');
    expect(h.rpc.map(([n]) => n)).toEqual(['my_affiliate']);

    h.answers.apply_affiliate = mine({ status: 'pending', full_name: 'Anna Reyes', gcash_last4: '0001', rate_pct: 10, applied_at: '2026-11-15T02:00:00Z' });
    await act(async () => { ($('aff-agree') as HTMLInputElement).click(); });
    await act(async () => { $('aff-send')!.click(); });
    await settle();
    expect(h.rpc.at(-1)).toEqual(['apply_affiliate', { p_full_name: 'Anna Reyes', p_gcash: '0917 555 0001', p_tin: null, p_promote_where: 'Wedding photographer in Cebu, about 3 weddings a month', p_agree: true }]);
    expect($('affiliate-pending')?.textContent).toContain("Thank you, Anna! We're looking at your application.");
    expect($('affiliate-apply')).toBeNull();
  });

  it('turned down less than 30 days ago: when they can apply again, and no form', async () => {
    const later = new Date(Date.now() + 10 * 86_400_000).toISOString();
    h.answers.my_affiliate = mine({ status: 'rejected', full_name: 'Anna Reyes', gcash_last4: '0001', rate_pct: 10, applied_at: 'x', reapply_from: later });
    await open();
    expect($('affiliate-rejected')?.textContent).toContain('You can apply again from');
    expect($('affiliate-apply')).toBeNull();
  });
});

describe('an approved affiliate', () => {
  beforeEach(() => { h.auth = { user: { id: 'u1' }, loading: false }; });
  const approved = (status = 'approved') => mine(
    { status, code: 'ANNA', full_name: 'Anna Reyes', gcash_last4: '0001', rate_pct: 10, applied_at: 'x' },
    {
      totals: { sales: 3, pending: 169, payable: 338, paid: 169, this_month: 507, all_time: 676 },
      sales: [
        { earned_at: '2026-11-14T02:00:00Z', album_size: '8x8', cover: 'hardboundLinen', amount: 169, status: 'payable' },
        { earned_at: '2026-11-10T02:00:00Z', album_size: '8x8', cover: 'softcover', amount: 119, status: 'void' },
      ],
      payouts: [{ amount: 169, reference: 'GC-1234', paid_at: '2026-11-01T02:00:00Z' }],
    });

  it('sees their code, their link to the public site, what they earned, and the payouts', async () => {
    h.answers.my_affiliate = approved();
    await open();
    expect(host.querySelector('h1')?.textContent).toBe('Your affiliate page');
    expect($('affiliate-code')?.textContent).toBe('ANNA');
    expect($('affiliate-link')?.textContent).toBe('https://megyprints.vercel.app/?ref=ANNA');
    expect($('affiliate-this-month')?.textContent).toBe('₱507');
    expect($('affiliate-pending-total')?.textContent).toBe('₱169');
    expect($('affiliate-payable')?.textContent).toBe('₱338');
    expect($('affiliate-paid')?.textContent).toBe('₱169');
    // Under the ₱500 smallest payout: says when it will be sent.
    expect($('affiliate-payout-note')?.textContent).toContain('once you have ₱500 to be paid');
    expect($('affiliate-sales')?.textContent).toContain('To be paid');
    expect($('affiliate-sales')?.textContent).toContain('Cancelled');
    expect($('affiliate-sales')?.textContent).toContain('Hardbound');
    expect($('affiliate-payouts')?.textContent).toContain('GC-1234');
  });

  it('paused: the page says the code takes nothing off now, and earned sales are still paid', async () => {
    h.answers.my_affiliate = approved('paused');
    await open();
    expect($('affiliate-paused')?.textContent).toContain("Your code is paused, so it doesn't take money off right now.");
    expect($('affiliate-code')?.textContent).toBe('ANNA');
  });
});
