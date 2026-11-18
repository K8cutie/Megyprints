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
   The rules and the customer's calls are in lib/orderCodes.ts, shared with
   the 2.0 app; this file adds the website's own: its client, the ?ref= link
   kept in the browser, and the owner's Affiliates tab.
   ══════════════════════════════════════════════════════════════════════════ */
import { supabase, supabaseConfigured } from './supabase';
import { checkTesterCode } from './testerCode';
import {
  AFFILIATE_CODE_PATTERN, affiliateLinkOn, applicationProblem, applyAffiliateWith, checkOrderCodeWith, DEFAULT_PUBLIC_ORIGIN,
  fetchAffiliateProgramWith, fetchMyAffiliateWith, normalizeAffiliateCode, parseProgram,
  type AffiliateApplication, type AffiliateProgram, type AffiliateStatus, type CodeCheck, type MyAffiliate, type SaleStatus,
} from './orderCodes';

export {
  AFFILIATE_CODE_GONE_SQLSTATE, AFFILIATE_CODE_PATTERN, affiliateDiscountOn, affiliateLine, AffiliateCodeGoneError, affiliateTerms, applicationProblem,
  checkoutPayTotal, codeCheckMessage, exampleCommission, isAffiliateCodeGoneError, normalizeAffiliateCode, parseMyAffiliate,
  parseProgram, saleStatusLabel,
} from './orderCodes';
export type {
  AffiliateApplication, AffiliateCode, AffiliateProgram, AffiliateStatus, CodeCheck, MyAffiliate, SaleStatus,
} from './orderCodes';

const num = (v: unknown, fallback = 0) => { const n = Number(v); return Number.isFinite(n) ? n : fallback; };
const STATUSES: AffiliateStatus[] = ['pending', 'approved', 'rejected', 'paused'];
const SALE_STATUSES: SaleStatus[] = ['pending', 'payable', 'paid', 'void'];
const str = (v: unknown) => (typeof v === 'string' ? v : null);
const arr = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter((x) => x && typeof x === 'object') as Record<string, unknown>[] : []);

/** Where a shared link points. The app inside the Android shell has its own
 *  origin, so links always name the public site (overridable like QR codes). */
export const PUBLIC_ORIGIN: string =
  (import.meta.env.VITE_MEMORY_BASE as string | undefined)?.replace(/\/+$/, '') || DEFAULT_PUBLIC_ORIGIN;

export const affiliateLink = (code: string): string => affiliateLinkOn(PUBLIC_ORIGIN, code);

// ── Checkout ────────────────────────────────────────────────────────────────

/** The checkout's one code box: the tester code or an affiliate code. Never throws. */
export async function checkCheckoutCode(raw: string): Promise<CodeCheck> {
  if (!normalizeAffiliateCode(raw)) return { ok: false, message: 'Type the code first.' };
  if (!supabaseConfigured) return { ok: false, message: "Codes can't be checked right now. Try again later." };
  return checkOrderCodeWith(supabase, raw, checkTesterCode);
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

/** Anyone can read it: the invite page shows the rate and the discount. */
export async function fetchAffiliateProgram(): Promise<AffiliateProgram | null> {
  if (!supabaseConfigured) return null;
  return fetchAffiliateProgramWith(supabase);
}

/** The signed-in person's application and earnings. Throws a plain sentence. */
export async function fetchMyAffiliate(): Promise<MyAffiliate> {
  if (!supabaseConfigured) throw new Error('Not connected. Try again later.');
  return fetchMyAffiliateWith(supabase);
}

export async function applyAffiliate(f: AffiliateApplication): Promise<MyAffiliate> {
  if (!supabaseConfigured) throw new Error(applicationProblem(f) ?? 'Not connected: nothing was sent.');
  return applyAffiliateWith(supabase, f);
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