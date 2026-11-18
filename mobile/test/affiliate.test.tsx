/* ══════════════════════════════════════════════════════════════════════════
   WHY THIS TEST: the Affiliate page in the app (0061), walked the way a
   person goes through it: a visitor reads how it works and is asked to sign
   in; a signed-in customer applies (the website's checks, then the
   database's apply_affiliate); an applicant sees where it is; an approved
   affiliate sees their code, their link (the public website, ?ref=CODE),
   what they earned and what was paid, never who bought. The words are the
   website's (src/pages/Affiliate.tsx). The database is a stand-in.
   ══════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Share } from 'react-native';

const mockAuth: { session: { user: { id: string } } | null } = { session: null };
const mockNav = { push: jest.fn() };
type Answer = { data: unknown; error: { code?: string; message?: string } | null };
const mockDb: { answers: Record<string, Answer>; calls: { name: string; args: unknown }[] } = { answers: {}, calls: [] };
const mockCopied: string[] = [];

jest.mock('../src/lib/auth', () => ({ useAuth: () => ({ session: mockAuth.session, loading: false }) }));
jest.mock('expo-router', () => ({ router: { push: (...a: unknown[]) => mockNav.push(...a) } }));
jest.mock('../src/lib/supabase', () => ({
  supabaseConfigured: true,
  supabase: {
    rpc: async (name: string, args?: unknown) => {
      mockDb.calls.push({ name, args });
      return mockDb.answers[name] ?? { data: null, error: null };
    },
  },
}));
jest.mock('../src/lib/checkout/copyText', () => ({ copyText: async (t: string) => { mockCopied.push(t); return true; } }));

import Affiliate from '../src/app/affiliate';

const PROGRAM = { on: true, rate_pct: 10, discount: 100, window_days: 30, min_payout: 500 };
const LIVE_PRICES = {
  hosting_reserve: 50, min_pages: 40, sheet_rate: 66.25,
  sizes: { '8x8': { hard_rate: 1075, pps: 4, soft_rate: 575 } },
};
const APPROVED = {
  program: PROGRAM,
  affiliate: { status: 'approved', code: 'ANNA', full_name: 'Anna Reyes', gcash_last4: '4567', rate_pct: 10, applied_at: '2026-11-10T02:00:00Z', decided_at: '2026-11-11T02:00:00Z', reapply_from: null },
  totals: { sales: 2, pending: 161, payable: 261, paid: 0, this_month: 422, all_time: 422 },
  sales: [
    { earned_at: '2026-11-12T03:00:00Z', album_size: '8x8', cover: 'hardboundLeather', amount: 261, status: 'payable', paid_at: null, customer: 'should never show' },
    { earned_at: '2026-11-14T03:00:00Z', album_size: '6x6', cover: 'softcover', amount: 161, status: 'pending', paid_at: null },
  ],
  payouts: [{ amount: 300, reference: 'GC123456', paid_at: '2026-11-01T03:00:00Z' }],
};

beforeEach(() => {
  mockAuth.session = null;
  mockNav.push.mockClear();
  mockDb.calls = [];
  mockCopied.length = 0;
  mockDb.answers = {
    affiliate_program: { data: PROGRAM, error: null },
    public_price_schedule: { data: LIVE_PRICES, error: null },
    my_affiliate: { data: { program: PROGRAM, affiliate: null, totals: null, sales: [], payouts: [] }, error: null },
  };
});

describe('a visitor (not signed in)', () => {
  it("reads how it works, in the website's words, with today's 8×8 price, and is asked to sign in", async () => {
    await render(<Affiliate />);
    expect(await screen.findByTestId('affiliate-pitch')).toBeTruthy();
    expect(screen.getByText('Become a Megy Prints affiliate')).toBeTruthy();
    expect(screen.getByTestId('affiliate-pitch')).toHaveTextContent('Share your own code. Your clients get ₱100 off their album, and you earn 10% of every album they order, paid by GCash.', { exact: false });
    // 8×8 hardbound, 40 pages: 10 sheets × ₱66.25 + ₱1,075 + ₱50 = ₱1,788; the client pays ₱1,688; 10% of that.
    expect(await screen.findByTestId('affiliate-example')).toHaveTextContent('For example: an 8×8 hardbound album is ₱1,788. Your client pays ₱1,688, and you earn about ₱169.');
    expect(screen.getByTestId('affiliate-sign-in')).toHaveTextContent('Sign in to apply. It takes two minutes.', { exact: false });
    await fireEvent.press(screen.getByTestId('affiliate-sign-in-button'));
    expect(mockNav.push).toHaveBeenCalledWith({ pathname: '/sign-in', params: { then: 'back' } });
    expect(mockDb.calls.map((c) => c.name)).not.toContain('my_affiliate');
  });

  it('program off: says applications are closed, no sign-in button', async () => {
    mockDb.answers.affiliate_program = { data: { ...PROGRAM, on: false }, error: null };
    await render(<Affiliate />);
    expect(await screen.findByText('Applications are closed right now.')).toBeTruthy();
    expect(screen.queryByTestId('affiliate-sign-in-button')).toBeNull();
  });

  it('the terms open, in the program\'s own numbers', async () => {
    await render(<Affiliate />);
    await fireEvent.press(await screen.findByTestId('affiliate-terms-toggle'));
    expect(screen.getByText(/^1\. You earn 10% of the album price \(the album with its included pages, after your client's ₱100 off\)/)).toBeTruthy();
    expect(screen.getByText(/once you have at least ₱500 to be paid/)).toBeTruthy();
  });
});

describe('a signed-in customer applies', () => {
  beforeEach(() => { mockAuth.session = { user: { id: 'user-1' } }; });

  it("the website's checks first, then the database; then where the application is", async () => {
    mockDb.answers.apply_affiliate = { data: { program: PROGRAM, affiliate: { status: 'pending', code: null, full_name: 'Anna Reyes', gcash_last4: '4567', rate_pct: 10, applied_at: '2026-11-19T02:00:00Z' }, sales: [], payouts: [] }, error: null };
    await render(<Affiliate />);
    expect(await screen.findByTestId('affiliate-apply')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('aff-send'));
    expect(screen.getByTestId('aff-error')).toHaveTextContent('Please type your full name.');
    await fireEvent.changeText(screen.getByTestId('aff-name'), 'Anna Reyes');
    await fireEvent.changeText(screen.getByTestId('aff-gcash'), '12345');
    await fireEvent.press(screen.getByTestId('aff-send'));
    expect(screen.getByTestId('aff-error')).toHaveTextContent('Please type your GCash number, like 0917 123 4567.');
    await fireEvent.changeText(screen.getByTestId('aff-gcash'), '0917 123 4567');
    await fireEvent.changeText(screen.getByTestId('aff-where'), 'My wedding photography page in Cebu');
    await fireEvent.press(screen.getByTestId('aff-send'));
    expect(screen.getByTestId('aff-error')).toHaveTextContent('Please agree to the affiliate terms.');
    expect(mockDb.calls.map((c) => c.name)).not.toContain('apply_affiliate');
    await fireEvent.press(screen.getByTestId('aff-agree'));
    await fireEvent.press(screen.getByTestId('aff-send'));
    expect(mockDb.calls.find((c) => c.name === 'apply_affiliate')?.args).toEqual({
      p_full_name: 'Anna Reyes', p_gcash: '0917 123 4567', p_tin: null, p_promote_where: 'My wedding photography page in Cebu', p_agree: true,
    });
    expect(await screen.findByTestId('affiliate-pending')).toHaveTextContent("Thank you, Anna! We're looking at your application.", { exact: false });
    expect(screen.getByTestId('affiliate-pending')).toHaveTextContent('You applied on November 19, 2026.', { exact: false });
  });

  it("the database's own sentence when it refuses (MP010), a plain one otherwise", async () => {
    mockDb.answers.apply_affiliate = { data: null, error: { code: 'MP010', message: 'Applications are closed right now.' } };
    await render(<Affiliate />);
    await fireEvent.changeText(await screen.findByTestId('aff-name'), 'Anna Reyes');
    await fireEvent.changeText(screen.getByTestId('aff-gcash'), '09171234567');
    await fireEvent.changeText(screen.getByTestId('aff-where'), 'Facebook');
    await fireEvent.press(screen.getByTestId('aff-agree'));
    await fireEvent.press(screen.getByTestId('aff-send'));
    expect(await screen.findByTestId('aff-error')).toHaveTextContent('Applications are closed right now.');
    mockDb.answers.apply_affiliate = { data: null, error: { code: '08006', message: 'connection reset' } };
    await fireEvent.press(screen.getByTestId('aff-send'));
    expect(await screen.findByTestId('aff-error')).toHaveTextContent("We couldn't send your application. Check your internet, then try again.");
  });

  it('turned down: when they can apply again, and a way to message us', async () => {
    mockDb.answers.my_affiliate = { data: { program: PROGRAM, affiliate: { status: 'rejected', code: null, full_name: 'Anna Reyes', gcash_last4: '4567', rate_pct: 10, applied_at: '2026-11-10T02:00:00Z', reapply_from: '2099-01-10T02:00:00Z' } }, error: null };
    await render(<Affiliate />);
    expect(await screen.findByTestId('affiliate-rejected')).toHaveTextContent('You can apply again from January 10, 2099.', { exact: false });
    expect(screen.queryByTestId('affiliate-apply')).toBeNull();
  });

  it('the page could not be read: says so, and Try again reads it again', async () => {
    mockDb.answers.my_affiliate = { data: null, error: { message: 'offline' } };
    await render(<Affiliate />);
    expect(await screen.findByTestId('affiliate-error')).toHaveTextContent("We couldn't load your affiliate page. Check your internet, then try again.");
    mockDb.answers.my_affiliate = { data: APPROVED, error: null };
    await fireEvent.press(screen.getByTestId('affiliate-retry'));
    expect(await screen.findByTestId('affiliate-dashboard')).toBeTruthy();
  });
});

describe('an approved affiliate', () => {
  beforeEach(() => {
    mockAuth.session = { user: { id: 'user-1' } };
    mockDb.answers.my_affiliate = { data: APPROVED, error: null };
  });

  it('their code, their link (the public website), what they earned and what was paid; never who bought', async () => {
    await render(<Affiliate />);
    expect(await screen.findByText('Your affiliate page')).toBeTruthy();
    expect(screen.getByTestId('affiliate-code')).toHaveTextContent('ANNA');
    expect(screen.getByTestId('affiliate-link')).toHaveTextContent('https://megyprints.vercel.app/?ref=ANNA');
    expect(screen.getByTestId('affiliate-this-month')).toHaveTextContent('₱422');
    expect(screen.getByTestId('affiliate-pending-total')).toHaveTextContent('₱161');
    expect(screen.getByTestId('affiliate-payable')).toHaveTextContent('₱261');
    expect(screen.getByTestId('affiliate-paid')).toHaveTextContent('₱0');
    expect(screen.getByTestId('affiliate-payout-note')).toHaveTextContent('We send a payout by GCash (number ending 4567) once you have ₱500 to be paid. 2 sales so far, ₱422 earned in all.');
    expect(screen.getByTestId('affiliate-sales')).toHaveTextContent('8×8" Square · Hardbound', { exact: false });
    expect(screen.getByTestId('affiliate-sales')).toHaveTextContent('To be paid', { exact: false });
    expect(screen.getByTestId('affiliate-sales')).toHaveTextContent('Waiting for delivery', { exact: false });
    expect(screen.getByTestId('affiliate-payouts')).toHaveTextContent('GCash reference GC123456', { exact: false });
    expect(screen.queryByText(/should never show/)).toBeNull();
  });

  it('copy the code, copy the link, share', async () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' } as never);
    await render(<Affiliate />);
    await fireEvent.press(await screen.findByTestId('affiliate-copy-code'));
    await fireEvent.press(screen.getByTestId('affiliate-copy-link'));
    expect(mockCopied).toEqual(['ANNA', 'https://megyprints.vercel.app/?ref=ANNA']);
    await act(async () => { fireEvent.press(screen.getByTestId('affiliate-share')); });
    expect(share).toHaveBeenCalledWith({ message: 'Make your photo album with Megy Prints and get ₱100 off with my code ANNA. https://megyprints.vercel.app/?ref=ANNA' });
    share.mockRestore();
  });

  it('paused: says the code takes nothing off now, and what was earned is still paid', async () => {
    mockDb.answers.my_affiliate = { data: { ...APPROVED, affiliate: { ...APPROVED.affiliate, status: 'paused' } }, error: null };
    await render(<Affiliate />);
    expect(await screen.findByTestId('affiliate-paused')).toHaveTextContent("Your code is paused, so it doesn't take money off right now. What you already earned is still paid.", { exact: false });
  });
});

describe("the website's words", () => {
  const WEB = readFileSync(path.resolve(__dirname, '../../src/pages/Affiliate.tsx'), 'utf8').replace(/\s+/g, ' ');
  it.each([
    'Sign in to apply. It takes two minutes.',
    "We usually answer within 2 days. When you're approved, your code and link appear right here.",
    "We couldn't approve your application this time.",
    'Applications are closed right now. Please check back soon.',
    'Great for wedding and event photographers, coordinators, schools, parishes and creators.',
    'No sales yet. Share your code with your next client!',
    'Full name (as on your GCash)',
    'Where will you share your code?',
    'Send my application',
  ])('%s', (line) => {
    expect(WEB).toContain(line);
    const APP = readFileSync(path.resolve(__dirname, '../src/app/affiliate.tsx'), 'utf8').replace(/\s+/g, ' ');
    expect(APP).toContain(line);
  });
});
