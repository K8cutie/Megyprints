import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BadgePercent, Check, Copy, Loader2, Share2, Wallet } from 'lucide-react';
import { useAuth } from '../lib/authContext';
import { useAuthModal } from '../components/AuthModalProvider';
import {
  affiliateLink, applicationProblem, applyAffiliate, exampleCommission, fetchAffiliateProgram, fetchMyAffiliate,
  affiliateTerms, saleStatusLabel, type AffiliateApplication, type AffiliateProgram, type MyAffiliate, type SaleStatus,
} from '../lib/affiliates';
import { getPriceSchedule, onStoreSettingsChange } from '../lib/storeSettings';
import { priceOf } from '../lib/pricing';
import { ALBUM_SIZES } from './builder/types';

/* ══════════════════════════════════════════════════════════════════════════
   Become an affiliate / your affiliate page (0061). Owner, 2026-11-15:
   "Become an affiliate on the app" — a visitor reads how it works and signs
   in to apply; an applicant sees where their application is; an approved
   affiliate sees their code, their link, what they earned and what was paid.
   Never who bought: a sale shows its date, album, amount and status only.
   ══════════════════════════════════════════════════════════════════════════ */

const peso = (n: number) => `₱${Math.round(n).toLocaleString('en-PH')}`;
const fmtDate = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-PH', { day: 'numeric', month: 'long', year: 'numeric' });
};
const sizeName = (preset: string | null) => ALBUM_SIZES.find((s) => s.preset === preset)?.name ?? preset ?? '';
const coverName = (cover: string | null) => (cover == null ? '' : cover === 'softcover' ? 'Softcover' : 'Hardbound');

const STATUS_STYLE: Record<SaleStatus, string> = {
  pending: 'bg-[#FFF6E5] text-[#8A5A12]',
  payable: 'bg-[#E8F0FE] text-[#1F4E99]',
  paid: 'bg-[#E6F4EA] text-[#2E7D4A]',
  void: 'bg-[#F1EDE7] text-[#8A8A8A]',
};

export default function Affiliate() {
  const { user, loading: authLoading } = useAuth();
  const { openLogin } = useAuthModal();
  const [program, setProgram] = useState<AffiliateProgram | null | undefined>(undefined);
  const [mine, setMine] = useState<MyAffiliate | null>(null);
  const [err, setErr] = useState('');
  const [, setPriceTick] = useState(0);
  useEffect(() => onStoreSettingsChange(() => setPriceTick((n) => n + 1)), []);

  useEffect(() => {
    if (authLoading) return;
    let alive = true;
    if (!user) {
      void fetchAffiliateProgram().then((p) => { if (!alive) return; setErr(''); setMine(null); setProgram(p); });
    } else {
      fetchMyAffiliate()
        .then((m) => { if (!alive) return; setErr(''); setMine(m); setProgram(m.program); })
        .catch((e: Error) => { if (!alive) return; setErr(e.message); setProgram(null); });
    }
    return () => { alive = false; };
  }, [user, authLoading]);

  // The example: an 8×8 hardbound with its included pages, at today's price.
  const schedule = getPriceSchedule();
  const examplePrice = schedule?.sizes?.['8x8'] ? priceOf(schedule, '8x8', 'hard', schedule.min_pages) : null;

  const loading = program === undefined || authLoading;
  // Read once: "can apply again" is decided against when the page opened.
  const [openedAt] = useState(() => Date.now());
  const a = mine?.affiliate ?? null;

  return (
    // pt-24: below the fixed header.
    <div className="max-w-3xl mx-auto px-4 pt-24 pb-12" data-testid="affiliate-page">
      <div className="flex items-center gap-2 mb-1">
        <BadgePercent className="text-blush-pink" size={22} />
        <h1 className="font-display text-2xl font-semibold text-dark">
          {a?.status === 'approved' || a?.status === 'paused' ? 'Your affiliate page' : 'Become a Megy Prints affiliate'}
        </h1>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-light py-10 justify-center"><Loader2 size={16} className="animate-spin" /> Loading…</div>
      )}
      {!loading && err && <p className="text-sm text-red-500 my-4" role="alert">{err}</p>}
      {!loading && !err && program === null && (
        <p className="text-sm text-medium my-4">The affiliate program can't be loaded right now. Please try again later.</p>
      )}

      {!loading && program && (a?.status === 'approved' || a?.status === 'paused') && mine && (
        <Dashboard mine={mine} program={program} />
      )}

      {!loading && program && !(a?.status === 'approved' || a?.status === 'paused') && (
        <>
          <Pitch program={program} examplePrice={examplePrice} />
          <div className="mt-6">
            {!user ? (
              <div className="rounded-2xl bg-white p-5 shadow-sm text-center" data-testid="affiliate-sign-in">
                <p className="text-sm text-dark font-semibold">
                  {program.on ? 'Sign in to apply. It takes two minutes.' : 'Applications are closed right now.'}
                </p>
                {program.on && (
                  <button type="button" onClick={openLogin}
                    className="mt-3 px-5 py-2.5 bg-blush-pink text-white rounded-lg text-sm font-semibold hover:brightness-105">
                    Sign in to apply
                  </button>
                )}
              </div>
            ) : a?.status === 'pending' ? (
              <div className="rounded-2xl bg-white p-5 shadow-sm" data-testid="affiliate-pending">
                <p className="text-base font-semibold text-dark">Thank you, {a.fullName.split(' ')[0]}! We're looking at your application.</p>
                <p className="mt-1 text-sm text-medium">You applied on {fmtDate(a.appliedAt)}. We usually answer within 2 days. When you're approved, your code and link appear right here.</p>
              </div>
            ) : a?.status === 'rejected' && a.reapplyFrom && new Date(a.reapplyFrom).getTime() > openedAt ? (
              <div className="rounded-2xl bg-white p-5 shadow-sm" data-testid="affiliate-rejected">
                <p className="text-base font-semibold text-dark">We couldn't approve your application this time.</p>
                <p className="mt-1 text-sm text-medium">You can apply again from {fmtDate(a.reapplyFrom)}. Questions? <Link to="/contact" className="underline font-semibold">Message us</Link>.</p>
              </div>
            ) : !program.on ? (
              <div className="rounded-2xl bg-white p-5 shadow-sm" data-testid="affiliate-closed">
                <p className="text-sm text-dark font-semibold">Applications are closed right now. Please check back soon.</p>
              </div>
            ) : (
              <ApplyForm program={program} again={a?.status === 'rejected'} onApplied={(m) => { setMine(m); setProgram(m.program); }} />
            )}
          </div>
          <Terms program={program} />
        </>
      )}
    </div>
  );
}

function Pitch({ program, examplePrice }: { program: AffiliateProgram; examplePrice: number | null }) {
  const earn = examplePrice != null ? exampleCommission(examplePrice, program) : null;
  return (
    <div data-testid="affiliate-pitch">
      <p className="text-sm text-medium">
        Share your own code. Your clients get <b className="text-dark">{peso(program.discount)} off</b> their album,
        and you earn <b className="text-dark">{program.ratePct}%</b> of every album they order, paid by GCash.
      </p>
      <ol className="mt-5 grid gap-3 sm:grid-cols-3">
        {[
          ['Apply', 'Tell us who you are and where you\'ll share. We answer within 2 days.'],
          ['Share', 'Give clients your code, or send your link. It counts for ' + program.windowDays + ' days after they open it.'],
          ['Get paid', `When the album is delivered, it's yours. We send it by GCash once you have ${peso(program.minPayout)}.`],
        ].map(([t, d], i) => (
          <li key={t} className="rounded-2xl bg-white p-4 shadow-sm">
            <p className="text-xs font-bold text-blush-pink">STEP {i + 1}</p>
            <p className="font-display text-lg font-semibold text-dark">{t}</p>
            <p className="mt-1 text-xs text-medium">{d}</p>
          </li>
        ))}
      </ol>
      {examplePrice != null && earn != null && (
        <p className="mt-4 rounded-xl border border-peach bg-blush px-4 py-3 text-sm text-cocoa" data-testid="affiliate-example">
          For example: an 8×8 hardbound album is {peso(examplePrice)}. Your client pays {peso(Math.max(0, examplePrice - program.discount))},
          and you earn about <b className="text-dark">{peso(earn)}</b>.
        </p>
      )}
      <p className="mt-3 text-xs text-light">Great for wedding and event photographers, coordinators, schools, parishes and creators.</p>
    </div>
  );
}

function ApplyForm({ program, again, onApplied }: { program: AffiliateProgram; again: boolean; onApplied: (m: MyAffiliate) => void }) {
  const [f, setF] = useState<AffiliateApplication>({ fullName: '', gcash: '', tin: '', promoteWhere: '', agree: false });
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState('');
  const set = (patch: Partial<AffiliateApplication>) => { setF((cur) => ({ ...cur, ...patch })); if (err) setErr(''); };
  const send = async () => {
    if (sending) return;
    const problem = applicationProblem(f);
    if (problem) { setErr(problem); return; }
    setSending(true);
    try { onApplied(await applyAffiliate(f)); }
    catch (e) { setErr(e instanceof Error ? e.message : "We couldn't send your application. Try again."); }
    finally { setSending(false); }
  };
  const field = 'w-full border border-[#C9BBAF] rounded-lg px-3 py-2 text-sm bg-[#FFFAF6] focus:outline-none focus:ring-2 focus:ring-peach/30 focus:border-peach';
  return (
    <form className="rounded-2xl bg-white p-5 shadow-sm space-y-4" data-testid="affiliate-apply"
      onSubmit={(e) => { e.preventDefault(); void send(); }}>
      <p className="text-base font-semibold text-dark">{again ? 'Apply again' : 'Apply'}</p>
      <div>
        <label htmlFor="aff-name" className="text-xs font-semibold text-dark block mb-1">Full name (as on your GCash)</label>
        <input id="aff-name" value={f.fullName} maxLength={80} autoComplete="name" onChange={(e) => set({ fullName: e.target.value })}
          className={field} data-testid="aff-name" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="aff-gcash" className="text-xs font-semibold text-dark block mb-1">GCash number</label>
          <input id="aff-gcash" value={f.gcash} inputMode="tel" autoComplete="tel" placeholder="0917 123 4567"
            onChange={(e) => set({ gcash: e.target.value })} className={field} data-testid="aff-gcash" />
          <p className="mt-1 text-[11px] text-light">Where we send what you earn.</p>
        </div>
        <div>
          <label htmlFor="aff-tin" className="text-xs font-semibold text-dark block mb-1">TIN <span className="font-normal text-light">(if you have one)</span></label>
          <input id="aff-tin" value={f.tin} inputMode="numeric" placeholder="123-456-789-000"
            onChange={(e) => set({ tin: e.target.value })} className={field} data-testid="aff-tin" />
        </div>
      </div>
      <div>
        <label htmlFor="aff-where" className="text-xs font-semibold text-dark block mb-1">Where will you share your code?</label>
        <textarea id="aff-where" value={f.promoteWhere} maxLength={300} rows={3}
          placeholder="For example: I'm a wedding photographer in Cebu, about 3 weddings a month, and my Facebook page"
          onChange={(e) => set({ promoteWhere: e.target.value })} className={field} data-testid="aff-where" />
      </div>
      <label className="flex items-start gap-2 text-sm text-dark">
        <input type="checkbox" checked={f.agree} onChange={(e) => set({ agree: e.target.checked })} className="mt-1" data-testid="aff-agree" />
        <span>I agree to the affiliate terms below ({program.ratePct}% of each album, paid by GCash after delivery).</span>
      </label>
      {err && <p className="text-xs text-red-500" role="alert" data-testid="aff-error">{err}</p>}
      <button type="submit" disabled={sending} data-testid="aff-send"
        className="w-full py-3 bg-peach text-white font-semibold rounded-xl hover:brightness-105 disabled:opacity-60 flex items-center justify-center gap-2">
        {sending ? <><Loader2 size={16} className="animate-spin" /> Sending…</> : 'Send my application'}
      </button>
    </form>
  );
}

function Terms({ program }: { program: AffiliateProgram }) {
  return (
    <details className="mt-6 rounded-2xl bg-white p-5 shadow-sm" data-testid="affiliate-terms">
      <summary className="cursor-pointer text-sm font-semibold text-dark">Affiliate terms</summary>
      <ol className="mt-3 list-decimal pl-5 space-y-1.5 text-xs text-medium">
        {affiliateTerms(program).map((t) => <li key={t}>{t}</li>)}
      </ol>
    </details>
  );
}

function CopyButton({ text, label, testId }: { text: string; label: string; testId: string }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1800); } catch { /* clipboard blocked */ }
  };
  return (
    <button type="button" onClick={() => void copy()} data-testid={testId}
      className="shrink-0 px-3 py-1.5 rounded-lg border border-peach bg-white text-xs font-semibold text-cocoa hover:bg-blush inline-flex items-center gap-1.5">
      {done ? <><Check size={13} /> Copied</> : <><Copy size={13} /> {label}</>}
    </button>
  );
}

function Dashboard({ mine, program }: { mine: MyAffiliate; program: AffiliateProgram }) {
  const a = mine.affiliate!;
  const code = a.code ?? '';
  const link = affiliateLink(code);
  const t = mine.totals;
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const share = () => {
    void navigator.share?.({
      title: 'Megy Prints',
      text: `Make your photo album with Megy Prints and get ${peso(program.discount)} off with my code ${code}.`,
      url: link,
    }).catch(() => { /* closed */ });
  };
  return (
    <div data-testid="affiliate-dashboard">
      {a.status === 'paused' ? (
        <p className="mt-2 rounded-xl border border-[#E8C9A0] bg-[#FFF6E5] px-4 py-3 text-sm text-[#8A5A12]" data-testid="affiliate-paused">
          Your code is paused, so it doesn't take money off right now. What you already earned is still paid.
          Questions? <Link to="/contact" className="underline font-semibold">Message us</Link>.
        </p>
      ) : (
        <p className="text-sm text-medium">
          Your clients get <b className="text-dark">{peso(program.discount)} off</b>. You earn <b className="text-dark">{a.ratePct}%</b> of each album they order.
        </p>
      )}

      <div className="mt-4 rounded-2xl bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-light">Your code</p>
        <div className="mt-1 flex items-center justify-between gap-3">
          <p className="font-mono text-3xl font-bold text-blush-pink tracking-wider" data-testid="affiliate-code">{code}</p>
          <CopyButton text={code} label="Copy code" testId="affiliate-copy-code" />
        </div>
        <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-light">Your link</p>
        <div className="mt-1 flex items-center gap-2">
          <p className="flex-1 min-w-0 truncate font-mono text-sm text-dark" data-testid="affiliate-link">{link}</p>
          <CopyButton text={link} label="Copy link" testId="affiliate-copy-link" />
          {canShare && (
            <button type="button" onClick={share} data-testid="affiliate-share"
              className="shrink-0 px-3 py-1.5 rounded-lg bg-blush-pink text-white text-xs font-semibold hover:brightness-105 inline-flex items-center gap-1.5">
              <Share2 size={13} /> Share
            </button>
          )}
        </div>
        <p className="mt-2 text-[11px] text-light">The link counts for {program.windowDays} days after your client opens it, on the same phone or computer.</p>
      </div>

      <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3" data-testid="affiliate-totals">
        {([
          ['This month', t.thisMonth, 'affiliate-this-month'],
          ['Waiting for delivery', t.pending, 'affiliate-pending-total'],
          ['To be paid', t.payable, 'affiliate-payable'],
          ['Paid to you', t.paid, 'affiliate-paid'],
        ] as const).map(([label, amount, id]) => (
          <div key={id} className="rounded-2xl bg-white p-4 shadow-sm">
            <p className="text-[11px] font-semibold text-light">{label}</p>
            <p className="font-display text-xl font-bold text-dark" data-testid={id}>{peso(amount)}</p>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-medium flex items-start gap-1.5" data-testid="affiliate-payout-note">
        <Wallet size={14} className="shrink-0 mt-0.5 text-blush-pink" />
        {t.payable >= program.minPayout
          ? <>Your next GCash payout ({peso(t.payable)}) goes to the number ending {a.gcashLast4}.</>
          : <>We send a payout by GCash (number ending {a.gcashLast4}) once you have {peso(program.minPayout)} to be paid. {t.sales} {t.sales === 1 ? 'sale' : 'sales'} so far, {peso(t.allTime)} earned in all.</>}
      </p>

      <h2 className="mt-6 font-display text-lg font-semibold text-dark">Your sales</h2>
      {mine.sales.length === 0 ? (
        <p className="mt-1 text-sm text-light" data-testid="affiliate-no-sales">No sales yet. Share your code with your next client!</p>
      ) : (
        <ul className="mt-2 divide-y divide-line-soft rounded-2xl bg-white shadow-sm" data-testid="affiliate-sales">
          {mine.sales.map((s, i) => (
            <li key={`${s.earnedAt}-${i}`} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm text-dark">{[sizeName(s.albumSize), coverName(s.cover)].filter(Boolean).join(' · ') || 'Album'}</p>
                <p className="text-xs text-light">{fmtDate(s.earnedAt)}</p>
              </div>
              <div className="text-right shrink-0">
                <p className={`text-sm font-semibold ${s.status === 'void' ? 'text-light line-through' : 'text-dark'}`}>{peso(s.amount)}</p>
                <span className={`text-[11px] px-2 py-0.5 rounded-full ${STATUS_STYLE[s.status]}`}>{saleStatusLabel(s.status)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}

      {mine.payouts.length > 0 && (
        <>
          <h2 className="mt-6 font-display text-lg font-semibold text-dark">Payouts</h2>
          <ul className="mt-2 divide-y divide-line-soft rounded-2xl bg-white shadow-sm" data-testid="affiliate-payouts">
            {mine.payouts.map((p, i) => (
              <li key={`${p.paidAt}-${i}`} className="flex items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p className="text-sm text-dark">{fmtDate(p.paidAt)}</p>
                  <p className="text-xs text-light">GCash reference <span className="font-mono">{p.reference}</span></p>
                </div>
                <p className="text-sm font-semibold text-success">{peso(p.amount)}</p>
              </li>
            ))}
          </ul>
        </>
      )}
      <Terms program={program} />
    </div>
  );
}
