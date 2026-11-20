import { useEffect, useState } from 'react';
import { BadgePercent, Loader2, RefreshCw, TriangleAlert } from 'lucide-react';
import {
  decideAffiliate, fetchAffiliateSales, fetchOwnerAffiliates, flagLabel, loadAffiliateSettings, payAffiliate,
  saleStatusLabel, saveAffiliateSettings, setAffiliateRate, suggestAffiliateCode, voidCommission,
  type AffiliateSettings, type OwnerAffiliate, type OwnerAffiliateSale,
} from '../../lib/affiliates';
import { formatPHPhoneDisplay } from '../../lib/contact';

/* Affiliates tab (owner only, 0061). Applications wait here for a yes (with
   a code) or a no; approved affiliates show what they sold, what is waiting
   for delivery, what can be paid, and anything that looks like their own
   order. A payout pays everything payable in one GCash transfer: type its
   reference and the sales become Paid on the affiliate's page too. */

const peso = (n: number) => `₱${Math.round(n).toLocaleString('en-PH')}`;
const when = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
};
const STATUS_LABEL: Record<OwnerAffiliate['status'], string> = { pending: 'Waiting', approved: 'Active', paused: 'Paused', rejected: 'Turned down' };
const STATUS_STYLE: Record<OwnerAffiliate['status'], string> = {
  pending: 'bg-[#FFF6E5] text-[#8A5A12]',
  approved: 'bg-[#E6F4EA] text-[#2E7D4A]',
  paused: 'bg-[#F1EDE7] text-[#8A8A8A]',
  rejected: 'bg-[#F1EDE7] text-[#8A8A8A]',
};

export default function AffiliatesPanel() {
  const [rows, setRows] = useState<OwnerAffiliate[] | null>(null);
  const [err, setErr] = useState('');
  const [program, setProgram] = useState<AffiliateSettings | null>(null);

  const load = async () => {
    setErr('');
    try { setRows(await fetchOwnerAffiliates()); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Failed to load affiliates'); setRows([]); }
  };
  useEffect(() => {
    let alive = true;
    fetchOwnerAffiliates()
      .then((r) => { if (alive) setRows(r); })
      .catch((e: Error) => { if (alive) { setErr(e.message || 'Failed to load affiliates'); setRows([]); } });
    void loadAffiliateSettings().then((s) => { if (alive) setProgram(s); });
    return () => { alive = false; };
  }, []);

  const taken = (rows ?? []).map((r) => r.code).filter((c): c is string => !!c);
  const waiting = (rows ?? []).filter((r) => r.status === 'pending');
  const others = (rows ?? []).filter((r) => r.status !== 'pending');

  return (
    <div className="max-w-4xl space-y-6" data-testid="affiliates-panel">
      <AffiliateSettingsCard onSaved={setProgram} />

      <div className="flex items-center justify-between">
        <p className="text-sm text-medium">
          {waiting.length > 0 ? <b className="text-dark">{waiting.length} waiting for your answer. </b> : null}
          People apply from <span className="font-mono">/affiliate</span> in the app.
        </p>
        <button onClick={() => { setRows(null); void load(); }}
          className="h-9 px-3 rounded-lg border border-line text-sm flex items-center gap-1.5 hover:border-peach">
          <RefreshCw size={14} /> Refresh
        </button>
      </div>
      {err && <p className="text-sm text-red-500" role="alert">{err}</p>}
      {rows === null && <div className="py-10 text-center"><Loader2 size={20} className="animate-spin inline text-light" /></div>}
      {rows && rows.length === 0 && !err && (
        <div className="py-12 text-center text-sm text-light">
          <BadgePercent size={22} className="inline mb-2 opacity-40" />
          <p>No applications yet.</p>
        </div>
      )}
      <div className="space-y-3">
        {[...waiting, ...others].map((a) => (
          <AffiliateCard key={a.id} a={a} taken={taken} minPayout={program?.minPayout ?? 0} programRate={program?.ratePct ?? null}
            onRows={setRows} />
        ))}
      </div>
    </div>
  );
}

function AffiliateSettingsCard({ onSaved }: { onSaved: (s: AffiliateSettings) => void }) {
  const [saved, setSaved] = useState<AffiliateSettings | null>(null);
  const [draft, setDraft] = useState<AffiliateSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    void loadAffiliateSettings().then((s) => {
      if (!alive) return;
      setLoading(false);
      if (!s) { setErr("Couldn't load the affiliate settings. Reload the page (has migration 0061 been applied?)."); return; }
      setSaved(s); setDraft(s);
    });
    return () => { alive = false; };
  }, []);

  const set = (patch: Partial<AffiliateSettings>) => { setDraft((d) => (d ? { ...d, ...patch } : d)); setDone(''); setErr(''); };
  const save = async () => {
    if (!draft) return;
    setSaving(true); setErr(''); setDone('');
    const problem = await saveAffiliateSettings(draft);
    setSaving(false);
    if (problem) { setErr(problem); return; }
    setSaved(draft); onSaved(draft);
    setDone(draft.on
      ? `Saved. The program is on: codes take ${peso(draft.discount)} off, affiliates earn ${draft.ratePct}%.`
      : 'Saved. The program is off: codes take nothing off and nobody can apply. Earned sales are still paid.');
  };
  const choice = (active: boolean) => (active
    ? { background: '#fff', borderColor: '#BF5E3E', color: '#2D2D2D' }
    : { background: '#F1EDE7', borderColor: '#DED5C9', color: '#8A8A8A' });
  const numField = 'w-full border border-line rounded-lg px-3 py-2 text-sm text-dark bg-white';

  return (
    <div className="rounded-2xl border-2 border-rust/40 bg-warm-white px-5 py-4" data-testid="affiliate-settings">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h3 className="font-display text-lg font-semibold text-dark">Affiliate program</h3>
          <p className="text-sm text-medium mt-0.5 max-w-xl">
            An affiliate's code takes the discount off their client's order; the affiliate earns the commission on the album price
            (after the discount) once the album is delivered. Extra pages and add-ons earn nothing.
            To keep your own earnings per album the same, raise the markup on the Pricing tab by about the commission plus the discount.
          </p>
        </div>
        <span className="text-[11px] font-bold uppercase tracking-wide px-2 py-1 rounded-full"
          style={saved?.on ? { background: '#E6F4EA', color: '#2E7D4A' } : { background: '#F1EDE7', color: '#8A8A8A' }}
          data-testid="affiliate-program-status">
          {loading ? '…' : saved?.on ? 'On now' : 'Off now'}
        </span>
      </div>
      {draft && (
        <>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-light mb-1">Program</p>
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Affiliate program on or off">
                {([true, false] as const).map((v) => (
                  <button key={String(v)} type="button" role="radio" aria-checked={draft.on === v} onClick={() => set({ on: v })}
                    data-testid={v ? 'affiliate-on' : 'affiliate-off'}
                    className="py-2 px-3 text-sm font-semibold rounded-lg border transition-colors" style={choice(draft.on === v)}>
                    {v ? 'On' : 'Off'}
                  </button>
                ))}
              </div>
            </div>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-light block mb-1">Commission (%)</span>
              <input type="number" min={0} max={50} step={0.5} value={draft.ratePct} data-testid="affiliate-rate"
                onChange={(e) => set({ ratePct: Number(e.target.value) })} className={numField} />
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-light block mb-1">Customer discount (₱)</span>
              <input type="number" min={0} max={2000} step={10} value={draft.discount} data-testid="affiliate-discount"
                onChange={(e) => set({ discount: Math.round(Number(e.target.value)) })} className={numField} />
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-light block mb-1">A link counts for (days)</span>
              <input type="number" min={1} max={365} value={draft.windowDays} data-testid="affiliate-window"
                onChange={(e) => set({ windowDays: Math.round(Number(e.target.value)) })} className={numField} />
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-light block mb-1">Smallest payout (₱)</span>
              <input type="number" min={0} max={100000} step={50} value={draft.minPayout} data-testid="affiliate-min-payout"
                onChange={(e) => set({ minPayout: Math.round(Number(e.target.value)) })} className={numField} />
            </label>
          </div>
          <div className="mt-3 flex items-center justify-end">
            <button type="button" onClick={() => void save()} disabled={saving} data-testid="affiliate-settings-save"
              className="py-2 px-4 text-sm font-semibold rounded-lg text-white disabled:opacity-60" style={{ background: '#BF5E3E' }}>
              {saving ? 'Saving…' : 'Save affiliate settings'}
            </button>
          </div>
        </>
      )}
      {done && <p className="text-xs text-success mt-2 font-semibold" data-testid="affiliate-settings-saved">✓ {done}</p>}
      {err && <p className="text-xs text-rust-deep mt-2" role="alert" data-testid="affiliate-settings-error">{err}</p>}
    </div>
  );
}

function AffiliateCard({ a, taken, minPayout, programRate, onRows }: {
  a: OwnerAffiliate; taken: string[]; minPayout: number; programRate: number | null;
  onRows: (rows: OwnerAffiliate[]) => void;
}) {
  const [code, setCode] = useState(() => a.code ?? suggestAffiliateCode(a.fullName, taken));
  const [rate, setRate] = useState(a.ratePct == null ? '' : String(a.ratePct));
  const [ref, setRef] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const [sales, setSales] = useState<OwnerAffiliateSale[] | null>(null);
  const [showSales, setShowSales] = useState(false);

  const act = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true); setErr(''); setNote('');
    try { await fn(); } catch (e) { setErr(e instanceof Error ? e.message : 'That didn\'t work.'); } finally { setBusy(false); }
  };
  const loadSales = () => act(async () => { setSales(await fetchAffiliateSales(a.id)); });
  const active = a.status === 'approved' || a.status === 'paused';
  const btn = 'px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-60';

  return (
    <div className="rounded-xl border border-line-soft bg-white p-4" data-testid="affiliate-card">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <p className="font-semibold text-dark truncate">{a.fullName}</p>
          {a.code && <span className="font-mono text-sm text-blush-pink">{a.code}</span>}
          <span className={`text-[11px] px-2 py-0.5 rounded-full ${STATUS_STYLE[a.status]}`}>{STATUS_LABEL[a.status]}</span>
          {a.flagged > 0 && (
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#FDECEA] text-[#B3261E] inline-flex items-center gap-1" title="Sales that look like the affiliate's own orders">
              <TriangleAlert size={11} /> {a.flagged} to check
            </span>
          )}
        </div>
        <p className="text-xs text-light">Applied {when(a.appliedAt)}</p>
      </div>
      <p className="mt-1 text-sm text-medium">
        {a.email ?? 'no email'} · GCash {formatPHPhoneDisplay(a.gcashNumber)}{a.tin ? ` · TIN ${a.tin}` : ' · no TIN'}
      </p>
      {/* Rendered as text: it is what the applicant typed. */}
      <p className="mt-1 text-sm text-dark whitespace-pre-wrap break-words">{a.promoteWhere}</p>

      {(a.status === 'pending' || a.status === 'rejected') && (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="block">
            <span className="text-[11px] font-semibold text-light block mb-0.5">Their code</span>
            <input value={code} maxLength={20} onChange={(e) => setCode(e.target.value.toUpperCase())} data-testid="affiliate-approve-code"
              className="w-36 border border-line rounded-lg px-2 py-1.5 text-sm font-mono uppercase" />
          </label>
          <button type="button" disabled={busy} data-testid="affiliate-approve" className={`${btn} text-white`} style={{ background: '#2E7D4A' }}
            onClick={() => void act(async () => { onRows(await decideAffiliate(a.id, 'approve', code)); })}>
            Approve with this code
          </button>
          {a.status === 'pending' && (
            <button type="button" disabled={busy} data-testid="affiliate-reject" className={`${btn} border border-line text-medium`}
              onClick={() => void act(async () => { onRows(await decideAffiliate(a.id, 'reject')); })}>
              Turn down
            </button>
          )}
        </div>
      )}

      {active && (
        <>
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
            <div><p className="text-[11px] text-light">Sales</p><p className="font-semibold text-dark">{a.sales}</p></div>
            <div><p className="text-[11px] text-light">Waiting for delivery</p><p className="font-semibold text-dark">{peso(a.pending)}</p></div>
            <div><p className="text-[11px] text-light">To be paid</p><p className="font-semibold text-dark" data-testid="affiliate-card-payable">{peso(a.payable)}</p></div>
            <div><p className="text-[11px] text-light">Paid</p><p className="font-semibold text-dark">{peso(a.paid)}</p></div>
          </div>

          {a.payable > 0 && (
            <div className="mt-3 rounded-lg border border-peach bg-blush px-3 py-2.5">
              <p className="text-xs text-cocoa">
                Send <b>{peso(a.payable)}</b> by GCash to {formatPHPhoneDisplay(a.gcashNumber)}, then type the transfer's reference number.
                {a.payable < minPayout && <> It's under the {peso(minPayout)} smallest payout: you can still pay it now.</>}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <input value={ref} maxLength={64} onChange={(e) => setRef(e.target.value)} placeholder="GCash reference number"
                  data-testid="affiliate-pay-ref" className="flex-1 min-w-[10rem] border border-line rounded-lg px-2 py-1.5 text-sm font-mono bg-white" />
                <button type="button" disabled={busy || !ref.trim()} data-testid="affiliate-pay" className={`${btn} text-white`} style={{ background: '#BF5E3E' }}
                  onClick={() => void act(async () => {
                    const r = await payAffiliate(a.id, ref);
                    setRef('');
                    setNote(`Recorded: ${peso(r.amount)} paid for ${r.count} ${r.count === 1 ? 'sale' : 'sales'}.`);
                    onRows(await fetchOwnerAffiliates());
                    if (showSales) setSales(await fetchAffiliateSales(a.id));
                  })}>
                  Mark {peso(a.payable)} paid
                </button>
              </div>
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-end gap-2">
            <label className="block">
              <span className="text-[11px] font-semibold text-light block mb-0.5">Their rate (%)</span>
              <input type="number" min={0} max={50} step={0.5} value={rate} onChange={(e) => setRate(e.target.value)}
                placeholder={programRate != null ? `${programRate} (program)` : 'program'} data-testid="affiliate-own-rate"
                className="w-32 border border-line rounded-lg px-2 py-1.5 text-sm" />
            </label>
            <button type="button" disabled={busy} className={`${btn} border border-line text-dark`} data-testid="affiliate-rate-save"
              onClick={() => void act(async () => {
                const v = rate.trim() === '' ? null : Number(rate);
                if (v != null && (!Number.isFinite(v) || v < 0 || v > 50)) throw new Error('A rate is 0 to 50%. Leave it empty for the program rate.');
                onRows(await setAffiliateRate(a.id, v));
                setNote(v == null ? 'Rate saved: the program rate.' : `Rate saved: ${v}% on their next sales.`);
              })}>
              Save rate
            </button>
            <button type="button" disabled={busy} className={`${btn} border border-line text-dark`} data-testid="affiliate-pause"
              onClick={() => void act(async () => { onRows(await decideAffiliate(a.id, a.status === 'approved' ? 'pause' : 'resume')); })}>
              {a.status === 'approved' ? 'Pause their code' : 'Resume their code'}
            </button>
            <button type="button" disabled={busy} className={`${btn} border border-line text-dark`} data-testid="affiliate-sales-toggle"
              onClick={() => { const next = !showSales; setShowSales(next); if (next) void loadSales(); }}>
              {showSales ? 'Hide sales' : 'Show sales'}
            </button>
          </div>
        </>
      )}

      {note && <p className="mt-2 text-xs text-success font-semibold">✓ {note}</p>}
      {err && <p className="mt-2 text-xs text-red-500" role="alert">{err}</p>}

      {showSales && active && (
        <div className="mt-3" data-testid="affiliate-sales-list">
          {sales === null ? <Loader2 size={16} className="animate-spin text-light" />
            : sales.length === 0 ? <p className="text-xs text-light">No sales yet.</p>
              : (
                <ul className="divide-y divide-line-soft text-sm">
                  {sales.map((s) => (
                    <li key={s.id} className="py-2 flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-dark"><span className="font-mono">{s.orderNumber ?? '—'}</span> · {when(s.earnedAt)} · order {s.orderStatus ?? 'gone'}</p>
                        <p className="text-xs text-light">{s.ratePct}% of {peso(s.baseAmount)}</p>
                        {flagLabel(s.flag) && <p className="text-xs text-[#B3261E]">{flagLabel(s.flag)}</p>}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`font-semibold ${s.status === 'void' ? 'line-through text-light' : 'text-dark'}`}>{peso(s.amount)}</span>
                        <span className="text-[11px] text-medium">{s.ownerVoided ? 'Voided by you' : saleStatusLabel(s.status)}</span>
                        {s.status !== 'paid' && (
                          <button type="button" disabled={busy} data-testid="affiliate-void"
                            className="text-xs underline text-medium"
                            onClick={() => void act(async () => {
                              setSales(await voidCommission(s.id, !s.ownerVoided));
                              onRows(await fetchOwnerAffiliates());
                            })}>
                            {s.ownerVoided ? 'Undo void' : 'Void'}
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
        </div>
      )}
    </div>
  );
}
