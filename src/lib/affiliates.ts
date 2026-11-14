/* ══════════════════════════════════════════════════════════════════════════
   AFFILIATES (0061). Owner, 2026-11-15: "lets go with affiliates" —
   people who send us customers get a code and a link; their customer gets
   money off, they earn a commission, paid by GCash once the album is
   delivered. "Become an affiliate" is in the app: apply from your account,
   the owner approves, and the account gets an Affiliate page.

   The database decides all of it: whether a code works (check_order_code,
   the same 10-wrong-tries limit as the tester code), what an order asks
   (orders_with_affiliate_code), what each sale earns and when it can be paid
   (orders_affiliate_commission). The app only shows what it answered.
   ══════════════════════════════════════════════════════════════════════════ */
import { supabase, supabaseConfigured } from './supabase';
import { normalizePHPhone } from './contact';
import { checkTesterCode, normalizeTesterCode, testerCheckMessage, TESTER_CODE_PATTERN, type TesterCode } from './testerCode';

/** A code the database said works: this much off the order. */
export interface AffiliateCode { code: string; discount: number }

/** The shape the database keeps an affiliate code in (affiliates_code_chk). */
export const AFFILIATE_CODE_PATTERN = /^[A-Z0-9]{3,20}$/;
/** The order was placed with a code that stopped working, or can't take it (0061). */
export const AFFILIATE_CODE_GONE_SQLSTATE = 'MP009';

/** As the database compares it: no spaces, capitals (the tester code's rule). */
export const normalizeAffiliateCode = normalizeTesterCode;

/** Where a shared link points. The app inside the Android shell has its own
 *  origin, so links always name the public site (overridable like QR codes). */
export const PUBLIC_ORIGIN: string =
  (import.meta.env.VITE_MEMORY_BASE as string | undefined)?.replace(/\/+$/, '') || 'https://megyprints.vercel.app';

export const affiliateLink = (code: string): string => `${PUBLIC_ORIGIN}/?ref=${encodeURIComponent(code)}`;

const peso = (n: number) => `₱${Math.round(n).toLocaleString('en-PH')}`;

// ── Checkout ────────────────────────────────────────────────────────────────

/** What the customer pays: nothing with the tester code, the discount less
 *  with an affiliate code (never below zero), else the total. */
export function checkoutPayTotal(total: number, tester: TesterCode | null, affiliate: AffiliateCode | null): number {
  if (tester) return 0;
  if (affiliate) return Math.max(0, total - Math.max(0, Math.round(affiliate.discount)));
  return total;
}

/** The checkout line under the price. */
export function affiliateLine(a: AffiliateCode): string {
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

/** The checkout's one code box: the tester code or an affiliate code. Never throws. */
export async function checkCheckoutCode(raw: string): Promise<CodeCheck> {
  const code = normalizeAffiliateCode(raw);
  if (!code) return { ok: false, message: 'Type the code first.' };
  if (!supabaseConfigured) return { ok: false, message: "Codes can't be checked right now. Try again later." };
  const { data, error } = await supabase.rpc('check_order_code', { p_code: code });
  if (error) {
    // Before 0061 is applied the tester code still works, through its own check.
    if (missingFunction(error)) {
      const t = await checkTesterCode(raw);
      return t.ok ? { ok: true, tester: t.tester } : { ok: false, message: t.message };
    }
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

// ── The link (?ref=CODE) ────────────────────────────────────────────────────
// The last link opened wins. Kept on this device with the time it was opened;
// checkout uses it while it is younger than the program's window.

/** Where this device keeps the code of the last affiliate link it opened. */
export const REF_KEY = 'megy-affiliate-ref';
const DAY_MS = 86_400_000;

interface StoredRef { code: string; at: number }

/** The ?ref= code in a URL — before the # or inside the #/route?query. */
export function refFromUrl(search: string, hash: string): string | null {
  const read = (q: string) => {
    try { return new URLSearchParams(q).get('ref'); } catch { return null; }
  };
  const fromSearch = read(search);
  const qAt = hash.indexOf('?');
  const fromHash = qAt >= 0 ? read(hash.slice(qAt)) : null;
  const raw = fromSearch ?? fromHash;
  if (!raw) return null;
  const code = normalizeAffiliateCode(raw);
  return AFFILIATE_CODE_PATTERN.test(code) ? code : null;
}

/** Keep the code of a link this visit came from, and tidy it out of the
 *  address bar (a shared screenshot shouldn't carry someone's code). */
export function captureAffiliateRef(now: number = Date.now()): string | null {
  if (typeof window === 'undefined') return null;
  const code = refFromUrl(window.location.search, window.location.hash);
  if (!code) return null;
  try { localStorage.setItem(REF_KEY, JSON.stringify({ code, at: now } satisfies StoredRef)); } catch { /* private window */ }
  try {
    const url = new URL(window.location.href);
    url.searchParams.delete('ref');
    const qAt = url.hash.indexOf('?');
    if (qAt >= 0) {
      const params = new URLSearchParams(url.hash.slice(qAt));
      params.delete('ref');
      const rest = params.toString();
      url.hash = url.hash.slice(0, qAt) + (rest ? `?${rest}` : '');
    }
    window.history.replaceState(window.history.state, '', url.toString());
  } catch { /* leave the address bar as it is */ }
  return code;
}

/** The kept code while it still counts, else null (and forgotten). */
export function storedAffiliateRef(windowDays = 30, now: number = Date.now()): string | null {
  let s: StoredRef | null = null;
  try { s = JSON.parse(localStorage.getItem(REF_KEY) ?? 'null') as StoredRef | null; } catch { s = null; }
  if (!s || typeof s.code !== 'string' || !AFFILIATE_CODE_PATTERN.test(s.code) || !Number.isFinite(s.at)) {
    return null;
  }
  if (now - s.at > windowDays * DAY_MS) { clearAffiliateRef(); return null; }
  return s.code;
}

export function clearAffiliateRef(): void {
  try { localStorage.removeItem(REF_KEY); } catch { /* ignore */ }
}

// ── The program, and the person's own page ──────────────────────────────────

export interface AffiliateProgram { on: boolean; ratePct: number; discount: number; windowDays: number; minPayout: number }

const num = (v: unknown, fallback = 0) => { const n = Number(v); return Number.isFinite(n) ? n : fallback; };

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
export async function fetchAffiliateProgram(): Promise<AffiliateProgram | null> {
  if (!supabaseConfigured) return null;
  const { data, error } = await supabase.rpc('affiliate_program');
  if (error) return null;
  return parseProgram(data);
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
export async function fetchMyAffiliate(): Promise<MyAffiliate> {
  if (!supabaseConfigured) throw new Error('Not connected. Try again later.');
  const { data, error } = await supabase.rpc('my_affiliate');
  if (error) throw new Error("We couldn't load your affiliate page. Check your internet, then try again.");
  return parseMyAffiliate(data);
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

export async function applyAffiliate(f: AffiliateApplication): Promise<MyAffiliate> {
  const problem = applicationProblem(f);
  if (problem) throw new Error(problem);
  if (!supabaseConfigured) throw new Error('Not connected: nothing was sent.');
  const { data, error } = await supabase.rpc('apply_affiliate', {
    p_full_name: f.fullName.trim(),
    p_gcash: f.gcash,
    p_tin: f.tin.replace(/\D/g, '') || null,
    p_promote_where: f.promoteWhere.trim(),
    p_agree: f.agree,
  });
  if (error) {
    // The database's own sentence for its checks (MP010), a plain one otherwise.
    throw new Error(error.code === 'MP010' && error.message ? error.message : "We couldn't send your application. Check your internet, then try again.");
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

// ── The owner (admin Affiliates tab) ────────────────────────────────────────

export interface OwnerAffiliate {
  id: string;
  status: AffiliateStatus;
  code: string | null;
  fullName: string;
  email: string | null;
  gcashNumber: string;
  tin: string | null;
  promoteWhere: string;
  ratePct: number | null;
  appliedAt: string;
  decidedAt: string | null;
  sales: number;
  pending: number;
  payable: number;
  paid: number;
  flagged: number;
}

export function parseOwnerAffiliates(raw: unknown): OwnerAffiliate[] {
  return arr(raw).flatMap((a) => {
    const status = a.status as AffiliateStatus;
    if (typeof a.id !== 'string' || !STATUSES.includes(status)) return [];
    const rate = a.rate_pct == null ? null : num(a.rate_pct);
    return [{
      id: a.id,
      status,
      code: str(a.code),
      fullName: str(a.full_name) ?? '',
      email: str(a.email),
      gcashNumber: str(a.gcash_number) ?? '',
      tin: str(a.tin),
      promoteWhere: str(a.promote_where) ?? '',
      ratePct: rate,
      appliedAt: str(a.applied_at) ?? '',
      decidedAt: str(a.decided_at),
      sales: Math.round(num(a.sales)),
      pending: Math.round(num(a.pending)),
      payable: Math.round(num(a.payable)),
      paid: Math.round(num(a.paid)),
      flagged: Math.round(num(a.flagged)),
    }];
  });
}

export interface OwnerAffiliateSale {
  id: string;
  orderId: string | null;
  orderNumber: string | null;
  orderStatus: string | null;
  albumSize: string | null;
  cover: string | null;
  earnedAt: string;
  baseAmount: number;
  ratePct: number;
  amount: number;
  status: SaleStatus;
  flag: string | null;
  ownerVoided: boolean;
  paidAt: string | null;
}

export function parseOwnerSales(raw: unknown): OwnerAffiliateSale[] {
  return arr(raw).flatMap((s) => (typeof s.id !== 'string' ? [] : [{
    id: s.id,
    orderId: str(s.order_id),
    orderNumber: str(s.order_number),
    orderStatus: str(s.order_status),
    albumSize: str(s.album_size),
    cover: str(s.cover),
    earnedAt: str(s.earned_at) ?? '',
    baseAmount: Math.round(num(s.base_amount)),
    ratePct: num(s.rate_pct),
    amount: Math.round(num(s.amount)),
    status: SALE_STATUSES.includes(s.status as SaleStatus) ? s.status as SaleStatus : 'pending',
    flag: str(s.flag),
    ownerVoided: s.owner_voided === true,
    paidAt: str(s.paid_at),
  }]));
}

/** A flag in the owner's words: why this sale may be the affiliate's own. */
export function flagLabel(flag: string | null): string | null {
  if (flag === 'same_phone') return "Delivered to the affiliate's own GCash number";
  if (flag === 'same_name') return "Delivered under the affiliate's own name";
  if (flag === 'no_price') return 'No saved price on the order: earned ₱0';
  return null;
}

async function ownerRpc(name: string, args?: Record<string, unknown>): Promise<unknown> {
  if (!supabaseConfigured) throw new Error('Not connected.');
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(error.message || 'That didn\'t work. Try again.');
  return data;
}

export const fetchOwnerAffiliates = async () => parseOwnerAffiliates(await ownerRpc('owner_affiliates'));
export const decideAffiliate = async (id: string, action: 'approve' | 'reject' | 'pause' | 'resume', code?: string) =>
  parseOwnerAffiliates(await ownerRpc('owner_decide_affiliate', { p_id: id, p_action: action, p_code: code ?? null }));
export const setAffiliateRate = async (id: string, ratePct: number | null) =>
  parseOwnerAffiliates(await ownerRpc('owner_set_affiliate_rate', { p_id: id, p_rate: ratePct }));
export const fetchAffiliateSales = async (id: string) => parseOwnerSales(await ownerRpc('owner_affiliate_sales', { p_affiliate_id: id }));
export const voidCommission = async (id: string, voided: boolean) =>
  parseOwnerSales(await ownerRpc('owner_void_commission', { p_id: id, p_void: voided }));
export async function payAffiliate(id: string, reference: string): Promise<{ amount: number; count: number }> {
  const r = (await ownerRpc('owner_pay_affiliate', { p_id: id, p_reference: reference.trim() })) as Record<string, unknown> | null;
  return { amount: Math.round(num(r?.amount)), count: Math.round(num(r?.count)) };
}

/** A code from a name: "Anna Reyes" → "ANNA". The owner can change it. */
export function suggestAffiliateCode(fullName: string, taken: readonly string[] = []): string {
  const first = fullName.trim().split(/\s+/)[0] ?? '';
  // Ñ → N, É → E: Filipino names keep their letters, without the marks.
  let base = first.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16);
  if (base.length < 3) base = (base + 'MEGY').slice(0, Math.max(3, base.length + 4));
  if (!taken.includes(base)) return base;
  for (let i = 2; i < 100; i++) {
    const next = `${base}${i}`;
    if (!taken.includes(next)) return next;
  }
  return base;
}

// The program's settings, on the owner's store_settings row (0025: owner only).
export type AffiliateSettings = AffiliateProgram;

export async function loadAffiliateSettings(): Promise<AffiliateSettings | null> {
  if (!supabaseConfigured) return null;
  const { data, error } = await supabase
    .from('store_settings')
    .select('affiliate_on, affiliate_rate_pct, affiliate_discount, affiliate_window_days, affiliate_min_payout')
    .eq('id', 1)
    .maybeSingle();
  if (error || !data) return null;
  const r = data as Record<string, unknown>;
  return parseProgram({ on: r.affiliate_on, rate_pct: r.affiliate_rate_pct, discount: r.affiliate_discount, window_days: r.affiliate_window_days, min_payout: r.affiliate_min_payout });
}

/** What's wrong with the settings (the database's own limits), or null. */
export function settingsProblem(s: AffiliateSettings): string | null {
  if (!Number.isFinite(s.ratePct) || s.ratePct < 0 || s.ratePct > 50) return 'The commission is 0 to 50%.';
  if (!Number.isInteger(s.discount) || s.discount < 0 || s.discount > 2000) return 'The customer discount is ₱0 to ₱2,000.';
  if (!Number.isInteger(s.windowDays) || s.windowDays < 1 || s.windowDays > 365) return 'A link counts for 1 to 365 days.';
  if (!Number.isInteger(s.minPayout) || s.minPayout < 0 || s.minPayout > 100000) return 'The smallest payout is ₱0 to ₱100,000.';
  return null;
}

/** Save the settings. Returns a message, or null when saved. */
export async function saveAffiliateSettings(next: AffiliateSettings): Promise<string | null> {
  const problem = settingsProblem(next);
  if (problem) return problem;
  if (!supabaseConfigured) return 'Not connected: nothing was saved.';
  const { data, error } = await supabase
    .from('store_settings')
    .update({
      affiliate_on: next.on,
      affiliate_rate_pct: next.ratePct,
      affiliate_discount: next.discount,
      affiliate_window_days: next.windowDays,
      affiliate_min_payout: next.minPayout,
      updated_at: new Date().toISOString(),
    })
    .eq('id', 1)
    .select('id');
  if (error) return error.message;
  if (!data || data.length === 0) return 'Not saved: only the owner can change the affiliate program.';
  return null;
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
    'A sale is paid once its album is delivered. A cancelled or refunded order earns nothing.',
    `We pay by GCash to the number you give us, once you have at least ${peso(p.minPayout)} to be paid. Your earnings are yours to declare for tax; we withhold tax where the law requires it.`,
    "Your own orders don't earn and don't get the discount. An order sent to your own number or name is checked and may be cancelled.",
    "Don't post your code on coupon or deal sites, and don't run ads on the Megy Prints name.",
    'When you post about us, say it\'s an affiliate link (for example #ad or #affiliate).',
    'We may change these terms or the rates, or end a code, at any time. Sales already delivered are still paid.',
  ];
}
