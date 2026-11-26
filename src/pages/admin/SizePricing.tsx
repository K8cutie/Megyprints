/* ═══════════════════════════════════════════════════════════════════════════
   ALBUM PRICES BY SIZE in the owner's Pricing panel (0074).

   Owner, 2026-11-26: "i want this pricing standardized since we have a pricing
   calculator in the admin panel. We can customize the pricing calculator based
   on album size instead not XX percent across the board." Then "Yes, build it".

   The owner types the price of the smallest album (40 pages, shipping and
   hosting included) for each size and cover. Beside it: Bridgemedia's cost,
   the multiple of cost, the full cost (shipping, hosting, the ₱200 rebate card,
   an affiliate's cut), the profit, each partner's half (the profit is split
   50/50), the affiliate's share, and the crossed-out regular price while the
   launch price runs. A row is flagged when it loses money, or when the
   affiliate would earn more than each partner. The database refuses a price
   under the floor (Bridgemedia cost + shipping + hosting); this box says so
   before asking.
   ═══════════════════════════════════════════════════════════════════════════ */
import { useEffect, useState } from 'react';
import type { AlbumSizePreset } from '../builder/types';
import {
  SIZE_LABELS, costOf, hostingReserveOf, manilaToday, ownerPriceOf, setPriceOf, shippingAllowanceOf,
  type Binding, type PricingModel,
} from '../../lib/pricing';
import { getDisabledSizes, loadOwnerLaunchPrice, loadOwnerPricingModel, setSizePrices } from '../../lib/storeSettings';
import { loadAffiliateSettings } from '../../lib/affiliates';

/** Album sizes in the order the size picker shows them. */
const ORDER: AlbumSizePreset[] = ['6x4', '8x6', '6x8', '6x6', '8x8', '11.5x8', '8.5x11'];
const COVERS: Binding[] = ['soft', 'hard'];
const COVER_LABEL: Record<Binding, string> = { soft: 'Softcover', hard: 'Hardcover' };
/** The profit is split 50/50 (owner, 2026-11-26: "divided by 2 because of partnership"). */
const PARTNERS = 2;
const MAX_PRICE = 50000;

const peso = (n: number) => `${n < 0 ? '−' : ''}₱${Math.abs(Math.round(n)).toLocaleString('en-PH')}`;
const key = (size: AlbumSizePreset, cover: Binding) => `${size}:${cover}`;

export interface SizeRow {
  price: number;
  cost: number;
  floor: number;
  times: number;
  fullCost: number;
  profit: number;
  partner: number;
  affiliate: number;
  regular: number | null;
  losesMoney: boolean;
  affiliateAhead: boolean;
}

/** One size and cover at the smallest album, worst case as asked: every
 *  customer claims the rebate (when counted) and every sale comes through an
 *  affiliate (when counted), whose client gets the discount and who earns the
 *  rate on what the client pays. Pure, for the spec. */
export function sizeRow(
  model: PricingModel,
  size: AlbumSizePreset,
  cover: Binding,
  price: number,
  opts: { rebate: number; affiliate: { ratePct: number; discount: number } | null; launchPct: number | null },
): SizeRow {
  const pages = model.min_pages;
  const cost = costOf(model, size, cover, pages);
  const fixed = shippingAllowanceOf(model) + hostingReserveOf(model);
  const paid = opts.affiliate ? price - opts.affiliate.discount : price;
  const affiliate = opts.affiliate ? (opts.affiliate.ratePct / 100) * paid : 0;
  const fullCost = cost + fixed + opts.rebate + affiliate;
  const profit = paid - fullCost;
  const partner = profit / PARTNERS;
  return {
    price,
    cost,
    floor: Math.ceil(cost + fixed),
    times: (price - fixed) / cost,
    fullCost,
    profit,
    partner,
    affiliate,
    regular: opts.launchPct ? Math.round(price / (1 - opts.launchPct / 100)) : null,
    losesMoney: profit < 0,
    affiliateAhead: !!opts.affiliate && affiliate > partner,
  };
}

interface Props {
  model: PricingModel;
  onSaved: (m: PricingModel) => void;
}

export default function SizePricing({ model, onSaved }: Props) {
  const sizes = ORDER.filter((s) => model.sizes[s] && !getDisabledSizes().includes(s));
  const current = (s: AlbumSizePreset, c: Binding) =>
    setPriceOf(model, s, c) ?? ownerPriceOf(model, s, c, model.min_pages, Number(model.price_multiple));

  const [draft, setDraft] = useState<Record<string, string>>({});
  const [rebateOn, setRebateOn] = useState(true);
  const [rebate, setRebate] = useState('200');
  const [affiliateOn, setAffiliateOn] = useState(true);
  const [program, setProgram] = useState<{ ratePct: number; discount: number }>({ ratePct: 10, discount: 100 });
  const [launchPct, setLaunchPct] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [said, setSaid] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    void loadAffiliateSettings().then((a) => {
      if (alive && a) setProgram({ ratePct: a.ratePct, discount: a.discount });
    });
    void loadOwnerLaunchPrice().then((l) => {
      if (alive && l && l.pct != null && l.until && l.until >= manilaToday()) setLaunchPct(l.pct);
    });
    return () => { alive = false; };
  }, []);

  const valueOf = (s: AlbumSizePreset, c: Binding) => draft[key(s, c)] ?? String(current(s, c));
  const rebateAmount = rebateOn ? Math.max(0, Math.round(Number(rebate) || 0)) : 0;
  const opts = { rebate: rebateAmount, affiliate: affiliateOn ? program : null, launchPct };
  const sheetRate = model.sheet_cost * Number(model.price_multiple);

  const changed = Object.entries(draft).filter(([k, v]) => {
    const [s, c] = k.split(':') as [AlbumSizePreset, Binding];
    const set = setPriceOf(model, s, c);
    return v.trim() === '' ? set !== null : Number(v) !== current(s, c) || set === null;
  });

  const save = async () => {
    setErr(''); setSaid('');
    const payload: Partial<Record<AlbumSizePreset, { soft?: number | null; hard?: number | null }>> = {};
    for (const [k, v] of changed) {
      const [s, c] = k.split(':') as [AlbumSizePreset, Binding];
      if (v.trim() === '') { payload[s] = { ...payload[s], [c]: null }; continue; }
      const n = Number(v);
      const floor = sizeRow(model, s, c, n, opts).floor;
      if (!Number.isInteger(n)) { setErr(`${SIZE_LABELS[s]} ${COVER_LABEL[c].toLowerCase()}: type whole pesos.`); return; }
      if (n < floor) { setErr(`${SIZE_LABELS[s]} ${COVER_LABEL[c].toLowerCase()}: ${peso(n)} is under the floor of ${peso(floor)} (Bridgemedia cost + shipping + hosting).`); return; }
      if (n > MAX_PRICE) { setErr(`${SIZE_LABELS[s]} ${COVER_LABEL[c].toLowerCase()}: ${peso(n)} is over ${peso(MAX_PRICE)}.`); return; }
      payload[s] = { ...payload[s], [c]: n };
    }
    if (Object.keys(payload).length === 0) { setSaid('Nothing changed.'); return; }
    setSaving(true);
    const e = await setSizePrices(payload);
    if (e) { setSaving(false); setErr(e); return; }
    const fresh = await loadOwnerPricingModel();
    setSaving(false);
    if (fresh) onSaved(fresh);
    setDraft({});
    const n = Object.values(payload).reduce((t, p) => t + Object.keys(p ?? {}).length, 0);
    setSaid(`Saved ${n} price${n === 1 ? '' : 's'}. Checkout, the website and the app use ${n === 1 ? 'it' : 'them'} now.`);
  };

  const th = 'px-2 py-2 text-right font-semibold text-light text-[11px] uppercase tracking-wide whitespace-nowrap';
  const td = 'px-2 py-1.5 text-right font-mono tabular-nums whitespace-nowrap';

  return (
    <div className="rounded-2xl border-2 border-rust/40 bg-warm-white px-5 py-4" data-testid="size-pricing">
      <h3 className="font-display text-lg font-semibold text-dark">Album prices by size</h3>
      <p className="text-sm text-medium mt-0.5 max-w-3xl leading-snug">
        The price of a <b>{model.min_pages}-page album</b>, shipping and hosting included: what the customer pays. Each extra
        sheet adds {peso(sheetRate)} (the store multiple below × Bridgemedia&apos;s sheet cost). A size without its own price
        here is priced by the multiple. Clear a box to go back to the multiple.
      </p>

      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-dark">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={rebateOn} onChange={(e) => setRebateOn(e.target.checked)} data-testid="size-rebate-on" />
          Count the rebate card (every customer claims)
          <input type="number" min={0} step={1} value={rebate} onChange={(e) => setRebate(e.target.value)} disabled={!rebateOn}
            className="w-16 border border-line rounded px-1.5 py-0.5 font-mono tabular-nums" data-testid="size-rebate" />
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={affiliateOn} onChange={(e) => setAffiliateOn(e.target.checked)} data-testid="size-affiliate-on" />
          Count an affiliate sale ({peso(program.discount)} off for the client, {program.ratePct}% to the affiliate)
        </label>
        <span className="text-medium">Profit split 50/50 between the partners.</span>
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="text-sm border-collapse">
          <thead>
            <tr className="border-b border-sand-deep">
              <th className={`${th} text-left`}>Album</th>
              <th className={th}>Price</th>
              {launchPct != null && <th className={th}>Crossed out</th>}
              <th className={th}>Bridgemedia</th>
              <th className={th}>× cost</th>
              <th className={th}>Full cost</th>
              <th className={th}>Profit</th>
              <th className={th}>Each partner</th>
              <th className={th}>Affiliate</th>
              <th className={th}>Per extra page</th>
            </tr>
          </thead>
          <tbody>
            {sizes.flatMap((s) => COVERS.map((c) => {
              const v = valueOf(s, c);
              const n = Number(v);
              const ok = v.trim() !== '' && Number.isFinite(n);
              const r = ok ? sizeRow(model, s, c, n, opts) : null;
              const byMultiple = setPriceOf(model, s, c) === null && draft[key(s, c)] === undefined;
              const flag = r?.losesMoney ? 'loses money' : r?.affiliateAhead ? 'affiliate earns more than each partner' : '';
              return (
                <tr key={key(s, c)} data-testid={`size-row-${key(s, c)}`}
                  className={`border-b border-sand-deep/60 ${r?.losesMoney ? 'bg-rust/10' : r?.affiliateAhead ? 'bg-amber-50' : ''}`}>
                  <td className="px-2 py-1.5 text-left whitespace-nowrap text-dark">
                    {SIZE_LABELS[s]} {COVER_LABEL[c].toLowerCase()}
                    {byMultiple && <span className="ml-1 text-[11px] text-light">(by the multiple)</span>}
                  </td>
                  <td className="px-2 py-1">
                    <input type="number" min={0} step={1} value={v} data-testid={`size-price-${key(s, c)}`}
                      onChange={(e) => { setDraft((d) => ({ ...d, [key(s, c)]: e.target.value })); setSaid(''); }}
                      className="w-24 border border-line rounded-lg px-2 py-1 text-sm font-mono tabular-nums text-dark bg-white text-right" />
                  </td>
                  {launchPct != null && <td className={`${td} text-medium`}><s>{r?.regular != null ? peso(r.regular) : ''}</s></td>}
                  <td className={td}>{r ? peso(r.cost) : ''}</td>
                  <td className={td} data-testid={`size-times-${key(s, c)}`}>{r ? `${r.times.toFixed(1)}×` : ''}</td>
                  <td className={td}>{r ? peso(r.fullCost) : ''}</td>
                  <td className={`${td} ${r?.losesMoney ? 'text-rust-deep font-semibold' : 'text-success'}`} data-testid={`size-profit-${key(s, c)}`}>{r ? peso(r.profit) : ''}</td>
                  <td className={td} data-testid={`size-partner-${key(s, c)}`}>{r ? peso(r.partner) : ''}</td>
                  <td className={td} data-testid={`size-affiliate-${key(s, c)}`}>
                    {r ? peso(r.affiliate) : ''}
                    {flag && <span className="block text-[10px] font-sans text-rust-deep" data-testid={`size-flag-${key(s, c)}`}>{flag}</span>}
                  </td>
                  <td className={`${td} text-medium`}>{peso(sheetRate / model.sizes[s].pps)}</td>
                </tr>
              );
            }))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center gap-3 flex-wrap">
        <button onClick={save} disabled={saving || changed.length === 0} data-testid="size-save"
          className="py-2 px-4 text-sm font-semibold rounded-lg text-white transition-colors disabled:opacity-50"
          style={{ background: '#BF5E3E' }}>
          {saving ? 'Saving…' : 'Save prices'}
        </button>
        <span className="text-xs text-medium">
          Full cost = Bridgemedia + {peso(shippingAllowanceOf(model))} shipping + {peso(hostingReserveOf(model))} hosting
          {rebateAmount > 0 ? ` + ${peso(rebateAmount)} rebate` : ''}{affiliateOn ? ` + ${program.ratePct}% to the affiliate` : ''}. Taxes not included.
        </span>
      </div>
      {said && <p className="text-xs text-success mt-2 font-semibold" data-testid="size-said">✓ {said}</p>}
      {err && <p className="text-xs text-rust-deep mt-2" data-testid="size-err">Couldn&apos;t save: {err}</p>}
    </div>
  );
}
