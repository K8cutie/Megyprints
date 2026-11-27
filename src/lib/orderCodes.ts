/* ══════════════════════════════════════════════════════════════════════════
   CHECKOUT CODES AND AFFILIATES: THE RULES, for the website and the 2.0 app
   (src/shared/sharedModules.ts). The tester code (0057) and affiliate codes
   (0061) share one code box at checkout; an affiliate's page shows their
   application, code, sales and payouts.

   The database decides all of it (check_order_code, the order insert,
   affiliate_commissions). This file only reads what it answered and says it
   in the customer's words. No browser, no Supabase: the calls take the
   caller's client (the website passes its own in lib/affiliates.ts and
   lib/testerCode.ts, the app passes the phone's).
   ══════════════════════════════════════════════════════════════════════════ */
import { normalizePHPhone } from './contact';

const peso = (n: number) => `₱${Math.round(n).toLocaleString('en-PH')}`;
const num = (v: unknown, fallback = 0) => { const n = Number(v); return Number.isFinite(n) ? n : fallback; };

/** What the code calls need from a Supabase client. */
export interface CodesClient {
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: { code?: string | null; message?: string } | null }>;
}

// ── The tester code (0057) ──────────────────────────────────────────────────

/** A code the database said works: the album is free. */
export interface TesterCode { code: string }

/** The shape the database keeps a code in (store_settings_tester_code_chk). */
export const TESTER_CODE_PATTERN = /^[A-Z0-9]{4,24}$/;
/** The order was placed with a code that has since stopped working (0057). */
export const TESTER_CODE_GONE_SQLSTATE = 'MP007';

/** As the database compares it: no spaces, capitals. */
export function normalizeTesterCode(raw: string): string {
  return raw.replace(/\s+/g, '').toUpperCase();
}

/** What a tester pays: nothing while a code is on, else the total. */
export function amountToPay(total: number, tester: TesterCode | null): number {
  return tester ? 0 : total;
}

/** The checkout line under the real price. */
export function testerLine(t: TesterCode): string {
  return `Tester code ${t.code}: free`;
}

/** Why a code didn't work, in the customer's words. */
export function testerCheckMessage(reason: string | undefined): string {
  if (reason === 'sign_in') return 'Sign in first, then type the code.';
  if (reason === 'too_many') return 'Too many wrong codes. Try again in an hour.';
  return "That code doesn't work. Check the spelling.";
}

// ── Affiliate codes at checkout (0061) ──────────────────────────────────────

/** A code the database said works: this much off the order. */
export interface AffiliateCode { code: string; discount: number }

/** The shape the database keeps an affiliate code in (affiliates_code_chk). */
export const AFFILIATE_CODE_PATTERN = /^[A-Z0-9]{3,20}$/;
/** The order was placed with a code that stopped working, or can't take it (0061). */
export const AFFILIATE_CODE_GONE_SQLSTATE = 'MP009';

/** As the database compares it: no spaces, capitals (the tester code's rule). */
export const normalizeAffiliateCode = normalizeTesterCode;

/** Where a shared link points when nothing else is set: the public site. */
export const DEFAULT_PUBLIC_ORIGIN = 'https://megyprints.vercel.app';

/** An affiliate's link on a given site. */
export function affiliateLinkOn(origin: string, code: string): string {
  return `${origin.replace(/\/+$/, '')}/?ref=${encodeURIComponent(code)}`;
}

/** What an affiliate code takes off this order. A Megy Mini takes nothing
 *  off (owner, 2026-11-19: "only mini"): its client pays the full price and
 *  the affiliate still earns their commission on it. The database decides the
 *  same on the order (0065). */
export function affiliateDiscountOn(a: AffiliateCode, mini: boolean): number {
  return mini ? 0 : Math.max(0, Math.round(a.discount));
}

/** What the customer pays: nothing with the tester code, the discount less
 *  with an affiliate code (never below zero; none on a Megy Mini), else the total. */
export function checkoutPayTotal(total: number, tester: TesterCode | null, affiliate: AffiliateCode | null, mini = false): number {
  if (tester) return 0;
  if (affiliate) return Math.max(0, total - affiliateDiscountOn(affiliate, mini));
  return total;
}

/** The checkout line under the price. `mini`: a stapled booklet, true or its
 *  name ("Megy Magazine"); true says "Megy Mini". */
export function affiliateLine(a: AffiliateCode, mini: boolean | string = false): string {
  if (mini) return `Code ${a.code}: no discount on a ${typeof mini === 'string' ? mini : 'Megy Mini'}`;
  return `Code ${a.code}: ${peso(a.discount)} off`;
}

export type CodeCheck =
  | { ok: true; tester: TesterCode }
  | { ok: true; affiliate: AffiliateCode; windowDays: number }
  | { ok: false; message: string; reason?: string };

/** Why a code didn't work, in the customer's words. */
export function codeCheckMessage(reason: string | undefined): string {
  if (reason === 'own') return "That's your own affiliate code. It can't take money off your own order.";
  return testerCheckMessage(reason);
}

/** PostgREST's answer when a function isn't there: a database without 0061. */
const missingFunction = (e: { code?: string | null }) => e.code === 'PGRST202';

/** The checkout's one code box: the tester code or an affiliate code. Never
 *  throws. `testerOnly`: the tester code's own check, for a database that
 *  doesn't have 0061 yet. */
export async function checkOrderCodeWith(
  client: CodesClient,
  raw: string,
  testerOnly: (raw: string) => Promise<{ ok: true; tester: TesterCode } | { ok: false; message: string }>,
): Promise<CodeCheck> {
  const code = normalizeAffiliateCode(raw);
  if (!code) return { ok: false, message: 'Type the code first.' };
  let answer: Awaited<ReturnType<CodesClient['rpc']>>;
  try {
    answer = await client.rpc('check_order_code', { p_code: code });
  } catch {
    return { ok: false, message: "We couldn't check the code. Check your internet, then try again." };
  }
  const { data, error } = answer;
  if (error) {
    // Before 0061 is applied the tester code still works, through its own check.
    if (missingFunction(error)) return testerOnly(raw);
    return { ok: false, message: "We couldn't check the code. Check your internet, then try again." };
  }
  const r = (data ?? {}) as { ok?: boolean; kind?: string; code?: unknown; discount?: unknown; window_days?: unknown; reason?: string };
  if (r.ok && r.kind === 'tester' && typeof r.code === 'string' && TESTER_CODE_PATTERN.test(r.code)) {
    return { ok: true, tester: { code: r.code } };
  }
  if (r.ok && r.kind === 'affiliate' && typeof r.code === 'string' && AFFILIATE_CODE_PATTERN.test(r.code)) {
    const d = Number(r.discount);
    const w = Number(r.window_days);
    return {
      ok: true,
      affiliate: { code: r.code, discount: Number.isFinite(d) && d > 0 ? Math.round(d) : 0 },
      windowDays: Number.isFinite(w) && w >= 1 ? Math.round(w) : 30,
    };
  }
  return { ok: false, message: codeCheckMessage(r.reason), reason: r.reason };
}

/** The code stopped working between checking it and placing the order (the
 *  owner paused it or switched the program off), or this order can't take
 *  it. Nothing was placed; the message is the database's own. */
export class AffiliateCodeGoneError extends Error {
  constructor(message: string) {
    super(message || "That code doesn't work any more, so nothing was ordered. Remove it to order at the normal price.");
    this.name = 'AffiliateCodeGoneError';
  }
}

export function isAffiliateCodeGoneError(error: { code?: string | null } | null | undefined): boolean {
  return !!error && error.code === AFFILIATE_CODE_GONE_SQLSTATE;
}

// ── The program, and the person's own page ──────────────────────────────────

export interface AffiliateProgram { on: boolean; ratePct: number; discount: number; windowDays: number; minPayout: number }

export function parseProgram(raw: unknown): AffiliateProgram | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  return {
    on: r.on === true,
    ratePct: num(r.rate_pct, 10),
    discount: Math.round(num(r.discount, 100)),
    windowDays: Math.round(num(r.window_days, 30)),
    minPayout: Math.round(num(r.min_payout, 500)),
  };
}

/** Anyone can read it: the invite page shows the rate and the discount. */
export async function fetchAffiliateProgramWith(client: CodesClient): Promise<AffiliateProgram | null> {
  try {
    const { data, error } = await client.rpc('affiliate_program');
    if (error) return null;
    return parseProgram(data);
  } catch {
    return null;
  }
}

export type AffiliateStatus = 'pending' | 'approved' | 'rejected' | 'paused';
export type SaleStatus = 'pending' | 'payable' | 'paid' | 'void';

export interface MyAffiliate {
  program: AffiliateProgram | null;
  affiliate: {
    status: AffiliateStatus;
    code: string | null;
    fullName: string;
    gcashLast4: string;
    ratePct: number;
    appliedAt: string;
    decidedAt: string | null;
    reapplyFrom: string | null;
  } | null;
  totals: { sales: number; pending: number; payable: number; paid: number; thisMonth: number; allTime: number };
  sales: { earnedAt: string; albumSize: string | null; cover: string | null; amount: number; status: SaleStatus; paidAt: string | null }[];
  payouts: { amount: number; reference: string; paidAt: string }[];
}

const EMPTY_TOTALS: MyAffiliate['totals'] = { sales: 0, pending: 0, payable: 0, paid: 0, thisMonth: 0, allTime: 0 };
const STATUSES: AffiliateStatus[] = ['pending', 'approved', 'rejected', 'paused'];
const SALE_STATUSES: SaleStatus[] = ['pending', 'payable', 'paid', 'void'];
const str = (v: unknown) => (typeof v === 'string' ? v : null);
const arr = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter((x) => x && typeof x === 'object') as Record<string, unknown>[] : []);

export function parseMyAffiliate(raw: unknown): MyAffiliate {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const a = r.affiliate && typeof r.affiliate === 'object' ? r.affiliate as Record<string, unknown> : null;
  const t = r.totals && typeof r.totals === 'object' ? r.totals as Record<string, unknown> : null;
  const status = STATUSES.includes(a?.status as AffiliateStatus) ? a!.status as AffiliateStatus : null;
  return {
    program: parseProgram(r.program),
    affiliate: a && status ? {
      status,
      code: str(a.code),
      fullName: str(a.full_name) ?? '',
      gcashLast4: str(a.gcash_last4) ?? '',
      ratePct: num(a.rate_pct, 10),
      appliedAt: str(a.applied_at) ?? '',
      decidedAt: str(a.decided_at),
      reapplyFrom: str(a.reapply_from),
    } : null,
    totals: t ? {
      sales: Math.round(num(t.sales)),
      pending: Math.round(num(t.pending)),
      payable: Math.round(num(t.payable)),
      paid: Math.round(num(t.paid)),
      thisMonth: Math.round(num(t.this_month)),
      allTime: Math.round(num(t.all_time)),
    } : { ...EMPTY_TOTALS },
    sales: arr(r.sales).map((s) => ({
      earnedAt: str(s.earned_at) ?? '',
      albumSize: str(s.album_size),
      cover: str(s.cover),
      amount: Math.round(num(s.amount)),
      status: SALE_STATUSES.includes(s.status as SaleStatus) ? s.status as SaleStatus : 'pending',
      paidAt: str(s.paid_at),
    })),
    payouts: arr(r.payouts).map((p) => ({
      amount: Math.round(num(p.amount)),
      reference: str(p.reference) ?? '',
      paidAt: str(p.paid_at) ?? '',
    })),
  };
}

/** The signed-in person's application and earnings. Throws a plain sentence. */
export async function fetchMyAffiliateWith(client: CodesClient): Promise<MyAffiliate> {
  const fail = "We couldn't load your affiliate page. Check your internet, then try again.";
  let answer: Awaited<ReturnType<CodesClient['rpc']>>;
  try { answer = await client.rpc('my_affiliate'); } catch { throw new Error(fail); }
  if (answer.error) throw new Error(fail);
  return parseMyAffiliate(answer.data);
}

export interface AffiliateApplication { fullName: string; gcash: string; tin: string; promoteWhere: string; agree: boolean }

/** What's wrong with the form, in order, or null when it can be sent. */
export function applicationProblem(f: AffiliateApplication): string | null {
  const name = f.fullName.trim().replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 80) return 'Please type your full name.';
  if (!normalizePHPhone(f.gcash)) return 'Please type your GCash number, like 0917 123 4567.';
  const tin = f.tin.replace(/\D/g, '');
  if (tin && !/^\d{9,14}$/.test(tin)) return "A TIN has 9 to 14 digits. Leave it empty if you don't have one yet.";
  const where = f.promoteWhere.trim();
  if (where.length < 3) return "Tell us where you'll share your code.";
  if (where.length > 300) return 'Please keep "where you\'ll share it" under 300 letters.';
  if (!f.agree) return 'Please agree to the affiliate terms.';
  return null;
}

/** Send the application. Throws the problem, or a plain sentence. */
export async function applyAffiliateWith(client: CodesClient, f: AffiliateApplication): Promise<MyAffiliate> {
  const problem = applicationProblem(f);
  if (problem) throw new Error(problem);
  const fail = "We couldn't send your application. Check your internet, then try again.";
  let answer: Awaited<ReturnType<CodesClient['rpc']>>;
  try {
    answer = await client.rpc('apply_affiliate', {
      p_full_name: f.fullName.trim(),
      p_gcash: f.gcash,
      p_tin: f.tin.replace(/\D/g, '') || null,
      p_promote_where: f.promoteWhere.trim(),
      p_agree: f.agree,
    });
  } catch {
    throw new Error(fail);
  }
  const { data, error } = answer;
  if (error) {
    // The database's own sentence for its checks (MP010), a plain one otherwise.
    throw new Error(error.code === 'MP010' && error.message ? error.message : fail);
  }
  return parseMyAffiliate(data);
}

/** A sale's status in the affiliate's words. */
export function saleStatusLabel(s: SaleStatus): string {
  switch (s) {
    case 'pending': return 'Waiting for delivery';
    case 'payable': return 'To be paid';
    case 'paid': return 'Paid';
    default: return 'Cancelled';
  }
}

/** What a sale earns at these settings, for the invite page's example: the
 *  rate of the album price after the customer's discount. */
export function exampleCommission(albumPrice: number, s: Pick<AffiliateProgram, 'ratePct' | 'discount'>): number {
  return Math.round(Math.max(0, albumPrice - s.discount) * s.ratePct / 100);
}

/** The rules, in the program's own numbers. Shown on the page and agreed to in the form. */
export function affiliateTerms(p: AffiliateProgram): string[] {
  return [
    `You earn ${p.ratePct}% of the album price (the album with its included pages, after your client's ${peso(p.discount)} off) on every order placed with your code, or within ${p.windowDays} days of your client opening your link. Extra pages and add-ons don't earn.`,
    `A Megy Mini or Megy Magazine has no discount for your client, and you still earn ${p.ratePct}% of its price.`,
    'A sale is paid once its album is delivered. A cancelled or refunded order earns nothing.',
    `We pay by GCash to the number you give us, once you have at least ${peso(p.minPayout)} to be paid. Your earnings are yours to declare for tax; we withhold tax where the law requires it.`,
    "Your own orders don't earn and don't get the discount. An order sent to your own number or name is checked and may be cancelled.",
    "Don't post your code on coupon or deal sites, and don't run ads on the Megy Prints name.",
    'When you post about us, say it\'s an affiliate link (for example #ad or #affiliate).',
    'We may change these terms or the rates, or end a code, at any time. Sales already delivered are still paid.',
  ];
}
