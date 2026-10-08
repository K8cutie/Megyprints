/* ══════════════════════════════════════════════════════════════════════════
   Pricing model — operator reference + live calculator. Cost basis is real
   (paper + print + binding); a few inputs are ESTIMATES flagged below. The
   "Store price multiple" here drives the LIVE checkout price (cost × multiple,
   via lib/pricing + storeSettings); the calculator underneath is an explore
   tool. Raw cost figures are admin-only — never rendered to customers.
   ══════════════════════════════════════════════════════════════════════════ */
import { useState, useEffect } from 'react';
import { QrCode } from 'lucide-react';
import type { AlbumSizePreset } from '../builder/types';
import { ALBUM_SIZES } from '../builder/types';
import { SIZE_LABELS, costOf, perPageCost, sheetsFor, ownerPriceOf, formulaPriceOf, fixedPriceOf, type Binding, type FixedPrices, type PricingModel, hostingTiersOf } from '../../lib/pricing';
import { setPriceMultiple, getDisabledSizes, setDisabledSizes, loadOwnerPricingModel, setHostingReserve, setHostingTiers, setHdMemoriesPrice, setFixedPrices } from '../../lib/storeSettings';

const ORDER: AlbumSizePreset[] = ['6x4', '8x6', '6x8', '6x6', '8x8', '9x9', '11.5x8', '8.5x11'];
const BINDINGS: Binding[] = ['soft', 'hard'];

const peso = (n: number) => '₱' + Math.round(n).toLocaleString('en-PH');

// Photobook PH (photobook.com.ph), read from their own price API on 8 Oct 2026:
// 40-page LIST prices for their standard-bind books, by our nearest size. A
// standing 50% code ("PERFECTSAVING", valid to 1 Jan 2027) halves them, so the
// sale price is what their customers actually pay. Extra pages ≈ ₱40 each at
// list (their 20- vs 40-page prices). They sell no 6×4, 6×8 or 9×9.
const PHOTOBOOK_CHECKED = '8 Oct 2026';
const PHOTOBOOK_PER_PAGE = 40;
const PHOTOBOOK: Partial<Record<AlbumSizePreset, { label: string; soft: number; hard: number }>> = {
  '6x6':    { label: '6×6',    soft: 900,  hard: 1000 },
  '8x6':    { label: '8×6',    soft: 1400, hard: 2750 },
  '6x8':    { label: '8×6',    soft: 1400, hard: 2750 },
  '8x8':    { label: '8×8',    soft: 1600, hard: 3000 },
  '9x9':    { label: '8×11',   soft: 1800, hard: 3250 },
  '11.5x8': { label: '11×8.5', soft: 2100, hard: 3500 },
  '8.5x11': { label: '8×11',   soft: 1800, hard: 3250 },
};
const rival = (size: AlbumSizePreset, bind: Binding, pages: number) => {
  const p = PHOTOBOOK[size];
  if (!p) return null;
  const reg = p[bind] + Math.max(0, pages - 40) * PHOTOBOOK_PER_PAGE;
  return { label: p.label, reg, sale: Math.round(reg / 2) };
};

// The fixed-price inputs, keyed "<size>:<binding>"; '' = use the formula.
type FixedDraft = Record<string, string>;
const draftKey = (size: AlbumSizePreset, bind: Binding) => `${size}:${bind}`;
const draftFrom = (m: PricingModel): FixedDraft => Object.fromEntries(
  ORDER.flatMap((s) => BINDINGS.map((b) => [draftKey(s, b), String(fixedPriceOf(m, s, b) ?? '')])),
);
const pricesFrom = (draft: FixedDraft): FixedPrices => {
  const out: FixedPrices = {};
  for (const s of ORDER)
    for (const b of BINDINGS) {
      const t = (draft[draftKey(s, b)] ?? '').trim();
      if (t !== '') out[s] = { ...out[s], [b]: Number(t) };
    }
  return out;
};

export default function PricingPanel() {
  const [size, setSize] = useState<AlbumSizePreset>('8x8');
  const [bind, setBind] = useState<Binding>('soft');
  const [pages, setPages] = useState(40);
  const [mult, setMult] = useState(3);

  // ── Raw cost model — owner-only, fetched from owner_pricing_model() (0024).
  // It is no longer a client constant, so this panel cannot render until it
  // arrives; a non-owner reaching here gets the error, not the figures.
  const [model, setModel] = useState<PricingModel | null>(null);
  const [modelErr, setModelErr] = useState('');

  // ── Persisted store price multiple (drives the LIVE checkout price) ──
  const [storeMult, setStoreMult] = useState(3);
  const [savingMult, setSavingMult] = useState(false);
  const [savedMult, setSavedMult] = useState(false);
  const [saveErr, setSaveErr] = useState('');

  // ── Persisted "sizes offered" toggle (drives the customer size picker) ──
  // ── Persisted flat hosting reserve (10-year living-memory hosting buffer) ──
  const [reserve, setReserve] = useState(50);
  const [savingReserve, setSavingReserve] = useState(false);
  const [savedReserve, setSavedReserve] = useState(false);
  const [reserveErr, setReserveErr] = useState('');

  // ── Persisted HD memory upgrade price (one-time, per album) ──
  const [hdPrice, setHdPrice] = useState(49);
  const [savingHd, setSavingHd] = useState(false);
  const [savedHd, setSavedHd] = useState(false);
  const [hdErr, setHdErr] = useState('');

  // ── Persisted hosting TERMS (5/10/15/20 yrs; first = included) ──
  const [tiers, setTiers] = useState<{ years: number; price: number }[]>([]);
  const [savingTiers, setSavingTiers] = useState(false);
  const [savedTiers, setSavedTiers] = useState(false);
  const [tiersErr, setTiersErr] = useState('');

  // ── Persisted fixed 40-page prices (0041) ──
  const [fixedDraft, setFixedDraft] = useState<FixedDraft>({});
  const [savingFixed, setSavingFixed] = useState(false);
  const [savedFixed, setSavedFixed] = useState(false);
  const [fixedErr, setFixedErr] = useState('');

  const [disabledSizes, setDisabledSizesState] = useState<AlbumSizePreset[]>(getDisabledSizes());
  const [savingSizes, setSavingSizes] = useState(false);
  const [savedSizes, setSavedSizes] = useState(false);
  const [sizeErr, setSizeErr] = useState('');

  // Size curation comes from the cache App loaded on start; the cost model and
  // the live multiple are fetched here, owner-gated.
  useEffect(() => {
    let alive = true;
    setDisabledSizesState(getDisabledSizes());
    void loadOwnerPricingModel().then((m) => {
      if (!alive) return;
      if (m) { setModel(m); setStoreMult(Number(m.price_multiple)); setReserve(Number(m.hosting_reserve ?? 0)); setTiers(hostingTiersOf(m)); setHdPrice(Number(m.hd_memories_price ?? 0)); setFixedDraft(draftFrom(m)); }
      else setModelErr('Could not load the cost model. Owner sign-in is required to view pricing.');
    });
    return () => { alive = false; };
  }, []);

  const saveStoreMult = async () => {
    setSavingMult(true);
    setSavedMult(false);
    setSaveErr('');
    const err = await setPriceMultiple(storeMult);
    setSavingMult(false);
    if (err) setSaveErr(err);
    else { setSavedMult(true); setTimeout(() => setSavedMult(false), 2500); }
  };

  const saveReserve = async () => {
    setSavingReserve(true); setSavedReserve(false); setReserveErr('');
    const err = await setHostingReserve(reserve);
    setSavingReserve(false);
    if (err) setReserveErr(err);
    else {
      setModel((m) => (m ? { ...m, hosting_reserve: Math.round(reserve) } : m));
      setSavedReserve(true); setTimeout(() => setSavedReserve(false), 2500);
    }
  };

  const saveHd = async () => {
    setSavingHd(true); setSavedHd(false); setHdErr('');
    const err = await setHdMemoriesPrice(hdPrice);
    setSavingHd(false);
    if (err) setHdErr(err);
    else {
      setModel((m) => (m ? { ...m, hd_memories_price: Math.round(hdPrice) } : m));
      setSavedHd(true); setTimeout(() => setSavedHd(false), 2500);
    }
  };

  const saveTiers = async () => {
    setSavingTiers(true); setSavedTiers(false); setTiersErr('');
    const clean = hostingTiersOf({ hosting_tiers: tiers });
    if (!clean.length) { setTiersErr('Keep at least one term.'); setSavingTiers(false); return; }
    const err = await setHostingTiers(clean);
    setSavingTiers(false);
    if (err) setTiersErr(err);
    else {
      setTiers(clean);
      setModel((m) => (m ? { ...m, hosting_tiers: clean } : m));
      setSavedTiers(true); setTimeout(() => setSavedTiers(false), 2500);
    }
  };

  const saveFixed = async () => {
    setSavingFixed(true); setSavedFixed(false); setFixedErr('');
    const res = await setFixedPrices(pricesFrom(fixedDraft));
    setSavingFixed(false);
    if ('error' in res) { setFixedErr(res.error); return; }
    if (model) {
      const next = { ...model, fixed_prices: res.saved };
      setModel(next);
      setFixedDraft(draftFrom(next));
    }
    setSavedFixed(true); setTimeout(() => setSavedFixed(false), 2500);
  };

  const toggleSize = (preset: AlbumSizePreset) => {
    setDisabledSizesState((prev) => prev.includes(preset) ? prev.filter((p) => p !== preset) : [...prev, preset]);
    setSavedSizes(false);
  };
  const saveSizes = async () => {
    if (ALBUM_SIZES.length - disabledSizes.length < 1) { setSizeErr('Keep at least one size enabled.'); return; }
    setSavingSizes(true); setSavedSizes(false); setSizeErr('');
    const err = await setDisabledSizes(disabledSizes);
    setSavingSizes(false);
    if (err) setSizeErr(err);
    else { setSavedSizes(true); setTimeout(() => setSavedSizes(false), 2500); }
  };

  // Every hook is declared above, so this early return is safe. Nothing below
  // can render without the model — the figures it needs no longer exist client-side.
  if (!model) {
    return (
      <div className="py-16 text-center text-sm text-medium">
        {modelErr || 'Loading pricing model…'}
      </div>
    );
  }

  const cost = costOf(model, size, bind, pages);
  const surcharge = model.sizes[size].surcharge;
  const isFixed = fixedPriceOf(model, size, bind) !== null;
  const price = ownerPriceOf(model, size, bind, pages, mult); // fixed price, or marked-up cost + size premium
  const profit = price - cost;
  const cpp = perPageCost(model, size);
  const marginPct = Math.round((1 - cost / price) * 100);
  const effMult = price / cost; // effective markup once the size premium is added
  const r = rival(size, bind, pages);
  const sheetRate = model.sheet_cost * model.price_multiple;

  return (
    <div className="space-y-8">
      {/* Intro */}
      <div>
        <h2 className="font-display text-2xl font-semibold text-dark">Pricing model</h2>
        <p className="text-sm text-medium mt-1 max-w-2xl">
          Your cost to print a page is a fraction of what the market charges. This tool shows where prices can sit —
          under the competition's sale price, with the margin still in your favor. A few inputs are estimates
          (flagged below); confirm them and we lock these into checkout.
        </p>
      </div>

      {/* Store price multiple — the PERSISTED setting that drives live checkout */}
      <div className="rounded-2xl border-2 border-rust/40 bg-warm-white px-5 py-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h3 className="font-display text-lg font-semibold text-dark">Store price multiple</h3>
            <p className="text-sm text-medium mt-0.5 max-w-lg">
              Production cost × this number is the <b>live checkout price</b> for any size and cover without a
              fixed price below, and it prices the <b>extra pages</b> on every album. Customers never see it.
              Distinct from the explore slider further down.
            </p>
          </div>
          <div className="flex items-end gap-3">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-light block mb-1">Multiple</label>
              <input
                type="number" min={1} max={10} step={0.25} value={storeMult}
                onChange={(e) => { setStoreMult(+e.target.value); setSavedMult(false); }}
                className="w-24 border border-line rounded-lg px-3 py-2 text-sm font-mono tabular-nums text-dark bg-white"
              />
            </div>
            <button
              onClick={saveStoreMult}
              disabled={savingMult || storeMult <= 0}
              className="py-2 px-4 text-sm font-semibold rounded-lg text-white transition-colors disabled:opacity-60"
              style={{ background: '#BF5E3E' }}
            >
              {savingMult ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
        {savedMult && <p className="text-xs text-success mt-2 font-semibold">✓ Saved — live checkout now uses {storeMult}×.</p>}
        {saveErr && <p className="text-xs text-rust-deep mt-2">Couldn't save: {saveErr}</p>}

        {/* Hosting reserve — flat per-album buffer for ~10 years of memory hosting */}
        <div className="mt-5 pt-5 border-t border-sand-deep">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-[220px]">
              <h4 className="font-semibold text-dark">Hosting reserve</h4>
              <p className="text-xs text-medium mt-1 leading-snug">
                Flat ₱ added to <b>every album</b> after the markup (like the size premium — never multiplied).
                Funds ~10 years of hosting for the {7} included living-memory videos: ≈₱29 on R2 at today's rates,
                so ₱50 buffers price drift and scans. Extra QRs pay their own ₱20.
              </p>
            </div>
            <div className="flex items-end gap-2">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-light block mb-1">₱ / album</label>
                <input type="number" min={0} max={10000} step={5} value={reserve}
                  onChange={(e) => { setReserve(+e.target.value); setSavedReserve(false); }}
                  className="w-28 border border-line rounded-lg px-3 py-2 font-mono text-sm tabular-nums" />
              </div>
              <button onClick={saveReserve} disabled={savingReserve || reserve === model.hosting_reserve}
                className="px-4 py-2 rounded-lg bg-dark text-white text-sm font-semibold disabled:opacity-40">
                {savingReserve ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
          {savedReserve && <p className="text-xs text-success mt-2 font-semibold">✓ Saved — every album now carries a ₱{model.hosting_reserve} hosting reserve.</p>}
          {reserveErr && <p className="text-xs text-rust-deep mt-2">Couldn't save: {reserveErr}</p>}
        </div>

        {/* HD memories - one-time upgrade from the included 720p to 1080p */}
        <div className="mt-5 pt-5 border-t border-sand-deep">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-[220px]">
              <h4 className="font-semibold text-dark">HD memories</h4>
              <p className="text-xs text-medium mt-1 leading-snug">
                One-time upgrade from the included <b>720p</b> to <b>1080p</b> for every memory video in an album.
                The extra hosting cost is only about {peso(14)} over ten years, so this is a value tier - price it like one.
              </p>
            </div>
            <div className="flex items-end gap-2">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-light block mb-1">Price / album</label>
                <input type="number" min={0} max={100000} step={1} value={hdPrice}
                  onChange={(e) => { setHdPrice(+e.target.value); setSavedHd(false); }}
                  className="w-28 border border-line rounded-lg px-3 py-2 font-mono text-sm tabular-nums" />
              </div>
              <button onClick={saveHd} disabled={savingHd || hdPrice === model.hd_memories_price}
                className="px-4 py-2 rounded-lg bg-dark text-white text-sm font-semibold disabled:opacity-40">
                {savingHd ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
          {savedHd && <p className="text-xs text-success mt-2 font-semibold">Saved - HD memories now cost {peso(model.hd_memories_price)}.</p>}
          {hdErr && <p className="text-xs text-rust-deep mt-2">Couldn't save: {hdErr}</p>}
        </div>

        {/* Hosting TERMS — sold at checkout; the shortest is the included term */}
        <div className="mt-5 pt-5 border-t border-sand-deep">
          <h4 className="font-semibold text-dark">Memory hosting terms</h4>
          <p className="text-xs text-medium mt-1 leading-snug">
            The customer picks how long their videos stay live. The <b>shortest term is included</b> (keep its price at 0);
            longer terms are flat add-ons. Cost to you ≈ ₱3 per album per year on R2 — the rest is margin.
          </p>
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
            {tiers.map((t, i) => (
              <div key={i} className="rounded-lg border border-line p-2">
                <label className="text-[10px] font-semibold uppercase tracking-wide text-light block">Years</label>
                <input type="number" min={1} max={50} value={t.years}
                  onChange={(e) => { const v = +e.target.value; setTiers((ts) => ts.map((x, j) => (j === i ? { ...x, years: v } : x))); setSavedTiers(false); }}
                  className="w-full border border-line rounded px-2 py-1 font-mono text-sm tabular-nums" />
                <label className="text-[10px] font-semibold uppercase tracking-wide text-light block mt-1.5">₱ add-on</label>
                <input type="number" min={0} max={100000} step={1} value={t.price}
                  onChange={(e) => { const v = +e.target.value; setTiers((ts) => ts.map((x, j) => (j === i ? { ...x, price: v } : x))); setSavedTiers(false); }}
                  className="w-full border border-line rounded px-2 py-1 font-mono text-sm tabular-nums" />
              </div>
            ))}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <button onClick={saveTiers} disabled={savingTiers}
              className="px-4 py-2 rounded-lg bg-dark text-white text-sm font-semibold disabled:opacity-40">
              {savingTiers ? 'Saving…' : 'Save terms'}
            </button>
            {savedTiers && <p className="text-xs text-success font-semibold">✓ Saved — checkout now offers these terms.</p>}
            {tiersErr && <p className="text-xs text-rust-deep">Couldn't save: {tiersErr}</p>}
          </div>
        </div>
      </div>

      {/* Fixed 40-page prices — the PERSISTED per-size price customers pay (0041) */}
      <div className="rounded-2xl border-2 border-rust/40 bg-warm-white px-5 py-4">
        <h3 className="font-display text-lg font-semibold text-dark">Album prices · {model.min_pages} pages</h3>
        <p className="text-sm text-medium mt-0.5 max-w-2xl">
          Type what customers pay for a {model.min_pages}-page album in that size and cover. Leave a box
          empty to use cost × the store multiple (shown greyed in the box). The {peso(model.hosting_reserve)} hosting
          reserve comes out of the price you type. Extra pages always add {peso(sheetRate)} a printed sheet.
        </p>
        <div className="mt-3 overflow-x-auto border border-line rounded-xl bg-white">
          <table className="w-full min-w-[620px] text-sm">
            <thead>
              <tr className="bg-warm-white text-light">
                {['Size', 'Softcover', 'Hardbound', 'Photobook PH · sale (regular)'].map((h) => (
                  <th key={h} className="px-3 py-2 text-[11px] uppercase tracking-wide font-semibold text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ORDER.map((s) => {
                const pb = PHOTOBOOK[s];
                return (
                  <tr key={s} className="border-t border-line-soft align-top">
                    <td className="px-3 py-2.5 font-semibold text-dark whitespace-nowrap">
                      {SIZE_LABELS[s]}
                      {disabledSizes.includes(s) && <span className="block text-[10px] font-normal text-light">off in the picker</span>}
                    </td>
                    {BINDINGS.map((b) => {
                      const key = draftKey(s, b);
                      const text = fixedDraft[key] ?? '';
                      const n = Number(text);
                      const c = costOf(model, s, b, model.min_pages);
                      const floor = c + model.hosting_reserve;
                      const bad = text.trim() !== '' && (!Number.isInteger(n) || n < 1);
                      const low = !bad && text.trim() !== '' && n < floor;
                      return (
                        <td key={b} className="px-3 py-2.5">
                          <input
                            type="number" min={1} step={1} inputMode="numeric"
                            aria-label={`${SIZE_LABELS[s]} ${b === 'soft' ? 'softcover' : 'hardbound'} price for ${model.min_pages} pages`}
                            value={text}
                            placeholder={`${peso(formulaPriceOf(model, s, b, model.min_pages, model.price_multiple))}`}
                            onChange={(e) => { setFixedDraft((d) => ({ ...d, [key]: e.target.value })); setSavedFixed(false); }}
                            className="w-28 border border-line rounded-lg px-2.5 py-1.5 font-mono text-sm tabular-nums text-dark bg-white placeholder:text-light"
                          />
                          <div className={`text-[11px] mt-1 ${bad || low ? 'text-rust-deep font-semibold' : 'text-light'}`}>
                            {bad ? 'Whole pesos only'
                              : low ? `Below cost ${peso(Math.ceil(c))} + ${peso(model.hosting_reserve)} reserve`
                              : text.trim() === '' ? 'Formula price'
                              : `You keep ${peso(n - c - model.hosting_reserve)}`}
                          </div>
                        </td>
                      );
                    })}
                    <td className="px-3 py-2.5 text-[12px] text-medium">
                      {pb ? (
                        <>
                          <div className="font-mono tabular-nums text-dark">{peso(pb.soft / 2)} · {peso(pb.hard / 2)}</div>
                          <div className="font-mono tabular-nums text-light">({peso(pb.soft)} · {peso(pb.hard)})</div>
                          {pb.label !== SIZE_LABELS[s] && <div className="text-[10px] text-light">their {pb.label}</div>}
                        </>
                      ) : <span className="text-light">They don't sell {SIZE_LABELS[s]}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-light mt-2">
          Photobook PH prices: their own price list, checked {PHOTOBOOK_CHECKED}. Soft · hard. The sale price is
          their standing 50% code, valid to 1 Jan 2027.
        </p>
        <div className="mt-3 flex items-center gap-3 flex-wrap">
          <button onClick={saveFixed} disabled={savingFixed}
            className="py-2 px-4 text-sm font-semibold rounded-lg text-white transition-colors disabled:opacity-60"
            style={{ background: '#BF5E3E' }}>
            {savingFixed ? 'Saving…' : 'Save prices'}
          </button>
          {savedFixed && <p className="text-xs text-success font-semibold">✓ Saved — checkout now charges these prices.</p>}
          {fixedErr && <p className="text-xs text-rust-deep">Couldn't save: {fixedErr}</p>}
        </div>
      </div>

      {/* Album sizes offered — hides sizes from the customer picker (owner-only) */}
      <div className="rounded-2xl border-2 border-rust/40 bg-warm-white px-5 py-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h3 className="font-display text-lg font-semibold text-dark">Album sizes offered</h3>
            <p className="text-sm text-medium mt-0.5 max-w-lg">
              Turn a size on/off in the <b>customer size picker</b>. Existing albums and orders in a
              hidden size still print fine — this only stops <i>new</i> albums at that size.
            </p>
          </div>
          <button
            onClick={saveSizes}
            disabled={savingSizes}
            className="py-2 px-4 text-sm font-semibold rounded-lg text-white transition-colors disabled:opacity-60"
            style={{ background: '#BF5E3E' }}
          >
            {savingSizes ? 'Saving…' : 'Save'}
          </button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-4">
          {ALBUM_SIZES.map((s) => {
            const on = !disabledSizes.includes(s.preset);
            return (
              <button key={s.preset} onClick={() => toggleSize(s.preset)} aria-pressed={on}
                className="py-2 px-3 text-sm font-semibold rounded-lg border transition-colors text-left flex items-center justify-between gap-2"
                style={on
                  ? { background: '#fff', borderColor: '#BF5E3E', color: '#2D2D2D' }
                  : { background: '#F1EDE7', borderColor: '#DED5C9', color: '#B4A99A' }}>
                <span className={on ? '' : 'line-through'}>{s.name}</span>
                <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: on ? '#2E7D4A' : '#9B9B9B' }}>
                  {on ? 'On' : 'Off'}
                </span>
              </button>
            );
          })}
        </div>
        {savedSizes && <p className="text-xs text-success mt-2 font-semibold">✓ Saved — the size picker now offers {ALBUM_SIZES.length - disabledSizes.length} of {ALBUM_SIZES.length} sizes.</p>}
        {sizeErr && <p className="text-xs text-rust-deep mt-2">{sizeErr}</p>}
      </div>

      {/* Thesis strip */}
      <div className="grid sm:grid-cols-3 gap-px bg-sand-deep border border-sand-deep rounded-2xl overflow-hidden">
        {[
          { k: 'Your cost / page — 8×8', v: '₱' + perPageCost(model, '8x8').toFixed(2), sub: 'paper + print, split across the sheet', c: 'text-success' },
          { k: 'Photobook PH / extra page — 8×8', v: '₱' + PHOTOBOOK_PER_PAGE.toFixed(2), sub: 'list price, from their 20- vs 40-page books', c: 'text-rust-deep' },
          { k: 'The gap', v: '≈ ' + (PHOTOBOOK_PER_PAGE / perPageCost(model, '8x8')).toFixed(0) + '×', sub: 'on the biggest price driver', c: 'text-dark' },
        ].map((s) => (
          <div key={s.k} className="bg-white p-4">
            <div className="text-xs text-light">{s.k}</div>
            <div className={`font-mono text-2xl font-semibold tabular-nums mt-1 ${s.c}`}>{s.v}</div>
            <div className="text-xs text-light mt-0.5">{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Calculator */}
      <div className="grid lg:grid-cols-2 gap-px bg-line border border-line rounded-2xl overflow-hidden">
        {/* Controls */}
        <div className="bg-white p-5 space-y-5">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-light block mb-2">Album size</label>
            <div className="grid grid-cols-3 gap-1.5">
              {ORDER.map((k) => (
                <button key={k} onClick={() => setSize(k)} aria-pressed={size === k}
                  className="py-2 px-1 text-sm font-semibold rounded-lg border transition-colors"
                  style={size === k
                    ? { background: '#BF5E3E', borderColor: '#BF5E3E', color: '#fff' }
                    : { background: '#FAF8F5', borderColor: '#DED5C9', color: '#2D2D2D' }}>
                  {SIZE_LABELS[k]}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-light block mb-2">Binding</label>
            <div className="grid grid-cols-2 gap-1.5">
              {(['soft', 'hard'] as Binding[]).map((b) => (
                <button key={b} onClick={() => setBind(b)} aria-pressed={bind === b}
                  className="py-2 text-sm font-semibold rounded-lg border transition-colors"
                  style={bind === b
                    ? { background: '#BF5E3E', borderColor: '#BF5E3E', color: '#fff' }
                    : { background: '#FAF8F5', borderColor: '#DED5C9', color: '#2D2D2D' }}>
                  {b === 'soft' ? 'Softcover' : 'Hardbound'}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="flex justify-between items-baseline mb-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide text-light">Pages</label>
              <span className="font-mono text-sm font-semibold tabular-nums text-dark">{pages}</span>
            </div>
            <input type="range" min={40} max={200} step={2} value={pages}
              onChange={(e) => setPages(+e.target.value)} className="w-full accent-rust" />
            <p className="text-xs text-light mt-1">40-page minimum · rounds up to whole printed sheets</p>
          </div>
          <div>
            <div className="flex justify-between items-baseline mb-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide text-light">Margin multiple</label>
              <span className="font-mono text-sm font-semibold tabular-nums text-dark">{mult.toFixed(2).replace(/0$/, '')}×</span>
            </div>
            <input type="range" min={2} max={6} step={0.25} value={mult}
              onChange={(e) => setMult(+e.target.value)} className="w-full accent-rust" />
            <p className="text-xs mt-1" style={{ color: '#8B6F47' }}>
              Explore only — this slider never changes checkout.
              {isFixed && <> {SIZE_LABELS[size]} {bind === 'soft' ? 'softcover' : 'hardbound'} has a fixed price, so here it only moves the extra pages.</>}
            </p>
          </div>
        </div>

        {/* Result */}
        <div className="bg-gradient-to-b from-white to-warm-white p-5">
          <div className="flex justify-between items-end pb-4 border-b border-sand-deep mb-4">
            <div>
              <div className="text-xs uppercase tracking-wide text-light">Your price</div>
              <div className="font-mono text-4xl font-semibold tabular-nums text-dark leading-none mt-1">{peso(price)}</div>
              {isFixed ? (
                <div className="text-[11px] text-cocoa mt-1">
                  fixed {model.min_pages}-page price{pages > model.min_pages && <> + extra sheets at {mult.toFixed(2).replace(/0$/, '')}×</>} · incl. {peso(model.hosting_reserve)} hosting reserve
                </div>
              ) : (surcharge > 0 || model.hosting_reserve > 0) && (
                <div className="text-[11px] text-cocoa mt-1">
                  incl.{surcharge > 0 && <> +{peso(surcharge)} size premium</>}
                  {surcharge > 0 && model.hosting_reserve > 0 && <> ·</>}
                  {model.hosting_reserve > 0 && <> +{peso(model.hosting_reserve)} hosting reserve</>}
                  {' '}({mult.toFixed(2).replace(/0$/, '')}× base)
                </div>
              )}
            </div>
            <span className="font-mono text-xs font-semibold px-2.5 py-1 rounded-full bg-[#E7F1EA] text-success whitespace-nowrap">
              {effMult.toFixed(2).replace(/0$/, '')}× · {marginPct}% margin
            </span>
          </div>
          <div className="grid grid-cols-2 gap-px bg-line border border-line rounded-xl overflow-hidden">
            {[
              { k: 'Production cost', n: peso(cost), c: 'text-dark' },
              { k: 'Profit / album', n: peso(profit), c: 'text-success' },
              { k: 'Printed sheets', n: String(sheetsFor(model.sizes[size].pps, model.min_pages, pages)), c: 'text-dark' },
              { k: 'Cost / extra page', n: '₱' + cpp.toFixed(2), c: 'text-dark' },
            ].map((s) => (
              <div key={s.k} className="bg-white px-3.5 py-3">
                <div className="text-[11px] text-light">{s.k}</div>
                <div className={`font-mono text-base font-semibold tabular-nums ${s.c}`}>{s.n}</div>
              </div>
            ))}
          </div>

          {r ? (
            <div className="mt-4 rounded-xl border border-line bg-blush px-4 py-3 text-sm">
              <div className="text-xs font-semibold uppercase tracking-wide text-rust-deep mb-1.5">
                vs. Photobook PH · their {r.label} {bind === 'soft' ? 'softcover' : 'hardcover'}, {pages} pages
              </div>
              {[['Their regular', r.reg], ['Their sale (50% code)', r.sale], ['You', price]].map(([l, v]) => (
                <div key={l as string} className="flex justify-between py-0.5">
                  <span className="text-[#6B4A42]">{l}</span>
                  <span className="font-mono tabular-nums text-dark">{peso(v as number)}</span>
                </div>
              ))}
              <div className="mt-2 font-semibold" style={{ color: price <= r.sale ? '#2E7D4A' : '#B0503A' }}>
                {price === r.sale ? '= their sale price'
                  : price < r.sale ? `↓ ${peso(r.sale - price)} under their sale price`
                  : `↑ ${peso(price - r.sale)} over their sale price`}
              </div>
              {pages > 40 && <div className="text-[11px] text-light mt-1">Their extra pages ≈ ₱{PHOTOBOOK_PER_PAGE} each at list — an estimate.</div>}
            </div>
          ) : (
            <div className="mt-4 rounded-xl border border-sand-deep bg-warm-white px-4 py-3 text-sm text-medium">
              <div className="text-xs font-semibold uppercase tracking-wide text-light mb-1">vs. Photobook PH</div>
              They don't sell a {SIZE_LABELS[size]} album, so there's nothing to compare it with.
            </div>
          )}
        </div>
      </div>

      {/* Reference table */}
      <div>
        <h3 className="font-display text-lg font-semibold text-dark mb-1">Reference sheet — the 40-page floor</h3>
        <p className="text-sm text-medium mb-3">
          <b>Customers pay</b> is the live price (a fixed price where you set one, else cost × {model.price_multiple}).
          The <b>3×/5×</b> columns are what the formula alone would charge, and include the flat <b>size premium</b> (marked beside the size): <b>+₱150</b> on 9×9, <b>+₱300</b> on 11.5×8 &amp; 8.5×11.
        </p>
        <div className="overflow-x-auto border border-line rounded-xl">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="bg-warm-white text-light">
                {['Size', 'Cost', 'Customers pay', '3× formula', '5× formula', 'Cost / extra page'].map((h, i) => (
                  <th key={h} className={`px-4 py-2.5 text-[11px] uppercase tracking-wide font-semibold ${i === 0 ? 'text-left' : 'text-right'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="font-mono tabular-nums">
              {(['soft', 'hard'] as Binding[]).map((bg) => (
                <PricingGroup key={bg} bind={bg} model={model} />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Competitor prices — Photobook PH, read from their own price list */}
      <div>
        <h3 className="font-display text-lg font-semibold text-dark mb-1">What Photobook PH charges</h3>
        <p className="text-sm text-medium mb-3">
          Their standard-bind books start at <b>40 pages</b>, checked {PHOTOBOOK_CHECKED}. A standing 50% code
          ("PERFECTSAVING", valid to 1 Jan 2027) halves every price, and shipping is free nationwide. Extra pages
          run about ₱{PHOTOBOOK_PER_PAGE} each at list.
        </p>
        <div className="overflow-x-auto border border-line rounded-xl">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="bg-warm-white text-light">
                {['Their size', 'Softcover', 'with code', 'Hardcover', 'with code'].map((h, i) => (
                  <th key={h} className={`px-4 py-2.5 text-[11px] uppercase tracking-wide font-semibold ${i === 0 ? 'text-left' : 'text-right'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="font-mono tabular-nums">
              {[...new Map(Object.values(PHOTOBOOK).map((p) => [p!.label, p!])).values()].map((p) => (
                <tr key={p.label} className="border-t border-line-soft">
                  <td className="px-4 py-2.5 text-left font-sans text-dark">{p.label}</td>
                  <td className="px-4 py-2.5 text-right text-medium">{peso(p.soft)}</td>
                  <td className="px-4 py-2.5 text-right text-dark">{peso(p.soft / 2)}</td>
                  <td className="px-4 py-2.5 text-right text-medium">{peso(p.hard)}</td>
                  <td className="px-4 py-2.5 text-right text-dark">{peso(p.hard / 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* QR strategy — decided: free inclusion, value priced into the album */}
      <div className="rounded-xl border border-peach/70 bg-blush px-5 py-4">
        <h4 className="text-sm font-semibold text-dark flex items-center gap-2">
          <QrCode size={16} className="text-blush-pink" /> Living-memory QR — free with every album
        </h4>
        <p className="text-sm text-[#41392F] mt-1.5">
          Not billed per code. Charging per QR would tax the best growth lever we have — every scan is a free
          impression and a potential customer — and put friction on our differentiator. The value is
          <b> priced into the album</b>, which justifies sitting at the <b>upper end of the margin band
          (3.5–5×)</b> — and it's a headline selling point: <i>"free living-memory QR with every album."</i>
        </p>
      </div>

      {/* Assumptions */}
      <div className="border-l-[3px] border-blush-pink bg-blush rounded-r-xl px-5 py-4 text-sm text-[#41392F]">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-rust mb-2">Numbers to confirm before locking in</h4>
        <ul className="list-disc pl-5 space-y-1">
          <li>Pages per 12.5×19 sheet for <b>8×8 and up</b> — estimated at 4/sheet.</li>
          <li>Your <b>thick cover-paper price</b> — softcover cover estimated at ₱50 (paper + print + ₱16 lamination).</li>
          <li><b>Hardbound cost per size</b> — estimated across your ₱250–500 range.</li>
        </ul>
      </div>
    </div>
  );
}

function PricingGroup({ bind, model }: { bind: Binding; model: PricingModel }) {
  return (
    <>
      <tr className="bg-warm-white">
        <td colSpan={6} className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-rust">
          {bind === 'soft' ? 'Softcover' : 'Hardbound'} · 40 pages
        </td>
      </tr>
      {ORDER.map((k) => {
        const c = costOf(model, k, bind, 40);
        const cpp = perPageCost(model, k);
        const prem = model.sizes[k].surcharge;
        const isFixed = fixedPriceOf(model, k, bind) !== null;
        return (
          <tr key={k} className="border-t border-line-soft">
            <td className="px-4 py-2.5 text-left font-sans text-dark">
              {SIZE_LABELS[k]}
              {prem > 0 && <span className="ml-1.5 text-[10px] font-sans text-cocoa">+{peso(prem)}</span>}
            </td>
            <td className="px-4 py-2.5 text-right text-dark">{peso(c)}</td>
            <td className="px-4 py-2.5 text-right text-dark font-semibold">
              {peso(ownerPriceOf(model, k, bind, 40, model.price_multiple))}
              {isFixed && <span className="ml-1.5 text-[10px] font-sans font-normal text-cocoa">fixed</span>}
            </td>
            <td className="px-4 py-2.5 text-right text-success">{peso(formulaPriceOf(model, k, bind, 40, 3))}</td>
            <td className="px-4 py-2.5 text-right text-rust">{peso(formulaPriceOf(model, k, bind, 40, 5))}</td>
            <td className="px-4 py-2.5 text-right text-medium">₱{cpp.toFixed(2)}</td>
          </tr>
        );
      })}
    </>
  );
}
