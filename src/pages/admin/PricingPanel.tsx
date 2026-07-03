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
import { SHEET, SIZES, costOf, sheetsFor, type Binding } from '../../lib/pricing';
import { getPriceMultiple, setPriceMultiple } from '../../lib/storeSettings';

const ORDER: AlbumSizePreset[] = ['6x4', '6x6', '8x8', '9x9', '11.5x8', '8.5x11'];

const peso = (n: number) => '₱' + Math.round(n).toLocaleString('en-PH');
// Competitor 8×8: ₱3,000 base (20 pages) + ₱30/pg; voucher ≈ 51% of regular.
const rival8 = (p: number) => { const reg = 3000 + Math.max(0, p - 20) * 30; return { reg, vou: Math.round(reg * 0.51) }; };

export default function PricingPanel() {
  const [size, setSize] = useState<AlbumSizePreset>('8x8');
  const [bind, setBind] = useState<Binding>('soft');
  const [pages, setPages] = useState(40);
  const [mult, setMult] = useState(3);

  // ── Persisted store price multiple (drives the LIVE checkout price) ──
  const [storeMult, setStoreMult] = useState(getPriceMultiple());
  const [savingMult, setSavingMult] = useState(false);
  const [savedMult, setSavedMult] = useState(false);
  const [saveErr, setSaveErr] = useState('');

  // Seed from the loaded cache once on mount (App loads it on start).
  useEffect(() => { setStoreMult(getPriceMultiple()); }, []);

  const saveStoreMult = async () => {
    setSavingMult(true);
    setSavedMult(false);
    setSaveErr('');
    const err = await setPriceMultiple(storeMult);
    setSavingMult(false);
    if (err) setSaveErr(err);
    else { setSavedMult(true); setTimeout(() => setSavedMult(false), 2500); }
  };

  const cost = costOf(size, bind, pages);
  const price = cost * mult;
  const profit = price - cost;
  const cpp = SHEET / SIZES[size].pps;
  const marginPct = Math.round((1 - cost / price) * 100);
  const r = rival8(pages);

  return (
    <div className="space-y-8">
      {/* Intro */}
      <div>
        <h2 className="font-display text-2xl font-semibold text-[#2D2D2D]">Pricing model</h2>
        <p className="text-sm text-[#6B6B6B] mt-1 max-w-2xl">
          Your cost to print a page is a fraction of what the market charges. This tool shows where prices can sit —
          under the competition's sale price, with the margin still in your favor. A few inputs are estimates
          (flagged below); confirm them and we lock these into checkout.
        </p>
      </div>

      {/* Store price multiple — the PERSISTED setting that drives live checkout */}
      <div className="rounded-2xl border-2 border-[#BF5E3E]/40 bg-[#FBF6F1] px-5 py-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h3 className="font-display text-lg font-semibold text-[#2D2D2D]">Store price multiple</h3>
            <p className="text-sm text-[#6B6B6B] mt-0.5 max-w-lg">
              This drives the <b>live checkout price</b> customers pay (production cost × this number).
              Customers never see it. Distinct from the explore slider below.
            </p>
          </div>
          <div className="flex items-end gap-3">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-[#9B9B9B] block mb-1">Multiple</label>
              <input
                type="number" min={1} max={10} step={0.25} value={storeMult}
                onChange={(e) => { setStoreMult(+e.target.value); setSavedMult(false); }}
                className="w-24 border border-[#DED5C9] rounded-lg px-3 py-2 text-sm font-mono tabular-nums text-[#2D2D2D] bg-white"
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
        {savedMult && <p className="text-xs text-[#2E7D4A] mt-2 font-semibold">✓ Saved — live checkout now uses {storeMult}×.</p>}
        {saveErr && <p className="text-xs text-[#B0503A] mt-2">Couldn't save: {saveErr}</p>}
      </div>

      {/* Thesis strip */}
      <div className="grid sm:grid-cols-3 gap-px bg-[#EAE3DA] border border-[#EAE3DA] rounded-2xl overflow-hidden">
        {[
          { k: 'Your cost / page — 8×8', v: '₱6.63', sub: 'paper + print, split across the sheet', c: 'text-[#2E7D4A]' },
          { k: 'Competitor charge / page — 8×8', v: '₱30.00', sub: '₱60 on their 14×10 landscape', c: 'text-[#B0503A]' },
          { k: 'The gap', v: '≈ 4.5×', sub: 'on the biggest price driver', c: 'text-[#2D2D2D]' },
        ].map((s) => (
          <div key={s.k} className="bg-white p-4">
            <div className="text-xs text-[#9B9B9B]">{s.k}</div>
            <div className={`font-mono text-2xl font-semibold tabular-nums mt-1 ${s.c}`}>{s.v}</div>
            <div className="text-xs text-[#9B9B9B] mt-0.5">{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Calculator */}
      <div className="grid lg:grid-cols-2 gap-px bg-[#E8E8E8] border border-[#E8E8E8] rounded-2xl overflow-hidden">
        {/* Controls */}
        <div className="bg-white p-5 space-y-5">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-[#9B9B9B] block mb-2">Album size</label>
            <div className="grid grid-cols-3 gap-1.5">
              {ORDER.map((k) => (
                <button key={k} onClick={() => setSize(k)} aria-pressed={size === k}
                  className="py-2 px-1 text-sm font-semibold rounded-lg border transition-colors"
                  style={size === k
                    ? { background: '#BF5E3E', borderColor: '#BF5E3E', color: '#fff' }
                    : { background: '#FAF8F5', borderColor: '#DED5C9', color: '#2D2D2D' }}>
                  {SIZES[k].label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-[#9B9B9B] block mb-2">Binding</label>
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
              <label className="text-xs font-semibold uppercase tracking-wide text-[#9B9B9B]">Pages</label>
              <span className="font-mono text-sm font-semibold tabular-nums text-[#2D2D2D]">{pages}</span>
            </div>
            <input type="range" min={40} max={200} step={2} value={pages}
              onChange={(e) => setPages(+e.target.value)} className="w-full accent-[#BF5E3E]" />
            <p className="text-xs text-[#9B9B9B] mt-1">40-page minimum · rounds up to whole printed sheets</p>
          </div>
          <div>
            <div className="flex justify-between items-baseline mb-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide text-[#9B9B9B]">Margin multiple</label>
              <span className="font-mono text-sm font-semibold tabular-nums text-[#2D2D2D]">{mult.toFixed(2).replace(/0$/, '')}×</span>
            </div>
            <input type="range" min={2} max={6} step={0.25} value={mult}
              onChange={(e) => setMult(+e.target.value)} className="w-full accent-[#BF5E3E]" />
            <p className="text-xs mt-1" style={{ color: '#8B6F47' }}>
              {mult <= 3 ? <><b>Beats their sale</b> — under the voucher price customers actually pay.</>
                : mult >= 4.75 ? <><b>Their regular price</b> ceiling — hold on premium + the QR feature.</>
                : 'Between their sale and regular price — solid premium room.'}
            </p>
          </div>
        </div>

        {/* Result */}
        <div className="bg-gradient-to-b from-white to-[#FBF6F1] p-5">
          <div className="flex justify-between items-end pb-4 border-b border-[#EAE3DA] mb-4">
            <div>
              <div className="text-xs uppercase tracking-wide text-[#9B9B9B]">Your price</div>
              <div className="font-mono text-4xl font-semibold tabular-nums text-[#2D2D2D] leading-none mt-1">{peso(price)}</div>
            </div>
            <span className="font-mono text-xs font-semibold px-2.5 py-1 rounded-full bg-[#E7F1EA] text-[#2E7D4A] whitespace-nowrap">
              {mult.toFixed(2).replace(/0$/, '')}× · {marginPct}% margin
            </span>
          </div>
          <div className="grid grid-cols-2 gap-px bg-[#E8E8E8] border border-[#E8E8E8] rounded-xl overflow-hidden">
            {[
              { k: 'Production cost', n: peso(cost), c: 'text-[#2D2D2D]' },
              { k: 'Profit / album', n: peso(profit), c: 'text-[#2E7D4A]' },
              { k: 'Printed sheets', n: String(sheetsFor(size, pages)), c: 'text-[#2D2D2D]' },
              { k: 'Cost / extra page', n: '₱' + cpp.toFixed(2), c: 'text-[#2D2D2D]' },
            ].map((s) => (
              <div key={s.k} className="bg-white px-3.5 py-3">
                <div className="text-[11px] text-[#9B9B9B]">{s.k}</div>
                <div className={`font-mono text-base font-semibold tabular-nums ${s.c}`}>{s.n}</div>
              </div>
            ))}
          </div>

          {size === '8x8' ? (
            <div className="mt-4 rounded-xl border border-[#EAD3CB] bg-[#F6E7E2] px-4 py-3 text-sm">
              <div className="text-xs font-semibold uppercase tracking-wide text-[#B0503A] mb-1.5">vs. competitor · same 8×8, {pages} pages</div>
              {[['Their regular', r.reg], ['Their voucher price', r.vou], ['You', price]].map(([l, v]) => (
                <div key={l as string} className="flex justify-between py-0.5">
                  <span className="text-[#6B4A42]">{l}</span>
                  <span className="font-mono tabular-nums text-[#2D2D2D]">{peso(v as number)}</span>
                </div>
              ))}
              <div className="mt-2 font-semibold" style={{ color: price <= r.vou ? '#2E7D4A' : '#B0503A' }}>
                {price <= r.vou
                  ? `↓ ${peso(r.vou - price)} under their voucher price`
                  : `↑ ${peso(price - r.vou)} over their voucher — you're selling the feature here`}
              </div>
            </div>
          ) : (
            <div className="mt-4 rounded-xl border border-[#EAE3DA] bg-[#FAF8F5] px-4 py-3 text-sm text-[#6B6B6B]">
              <div className="text-xs font-semibold uppercase tracking-wide text-[#9B9B9B] mb-1">vs. competitor</div>
              Direct checkout data on file for <b>8×8 (₱30/pg)</b> and <b>14×10 (₱60/pg)</b>. Switch to 8×8 for the live head-to-head — the cost gap holds at every size.
            </div>
          )}
        </div>
      </div>

      {/* Reference table */}
      <div>
        <h3 className="font-display text-lg font-semibold text-[#2D2D2D] mb-1">Reference sheet — the 40-page floor</h3>
        <p className="text-sm text-[#6B6B6B] mb-3">
          <b>3×</b> is the recommended baseline (under their sale); <b>5×</b> is the ceiling (their regular price) — worth holding on premium hardbound where the QR living-memory sells it.
        </p>
        <div className="overflow-x-auto border border-[#DED5C9] rounded-xl">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="bg-[#F4EEE7] text-[#9B9B9B]">
                {['Size', 'Cost', '3× price', '5× price', 'Cost / extra page'].map((h, i) => (
                  <th key={h} className={`px-4 py-2.5 text-[11px] uppercase tracking-wide font-semibold ${i === 0 ? 'text-left' : 'text-right'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="font-mono tabular-nums">
              {(['soft', 'hard'] as Binding[]).map((bg) => (
                <PricingGroup key={bg} bind={bg} />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Competitor decode */}
      <div>
        <h3 className="font-display text-lg font-semibold text-[#2D2D2D] mb-1">What the competition charges</h3>
        <p className="text-sm text-[#6B6B6B] mb-3">Decoded from their live checkout — flat ₱3,000 base (20 pages) + a per-page rate that climbs with size.</p>
        <div className="grid sm:grid-cols-2 gap-4">
          <RivalCard title="8×8 Hardcover Photobook" meta="Imagewrap hardcover · 116 pages (20 + 96)"
            lines={[['Base · 20 pages', '₱3,000', ''], ['+96 pages @ ₱30', '₱2,880', 'rival'], ['Matte lamination', '₱150', ''], ['Regular', '₱6,030', 'rule'], ['After voucher', '₱3,078', 'pay']]} />
          <RivalCard title="14×10 Landscape Hardcover" meta="Imagewrap hardcover · 64 pages (20 + 44)"
            lines={[['Base · 20 pages', '₱3,000', ''], ['+44 pages @ ₱60', '₱2,640', 'rival'], ['Regular', '₱5,640', 'rule'], ['After voucher', '₱3,462', 'pay']]} />
        </div>
      </div>

      {/* QR strategy — decided: free inclusion, value priced into the album */}
      <div className="rounded-xl border border-[#F4C2A1]/70 bg-[#FBEDE7] px-5 py-4">
        <h4 className="text-sm font-semibold text-[#2D2D2D] flex items-center gap-2">
          <QrCode size={16} className="text-[#E8A598]" /> Living-memory QR — free with every album
        </h4>
        <p className="text-sm text-[#41392F] mt-1.5">
          Not billed per code. Charging per QR would tax the best growth lever we have — every scan is a free
          impression and a potential customer — and put friction on our differentiator. The value is
          <b> priced into the album</b>, which justifies sitting at the <b>upper end of the margin band
          (3.5–5×)</b> — and it's a headline selling point: <i>"free living-memory QR with every album."</i>
        </p>
      </div>

      {/* Assumptions */}
      <div className="border-l-[3px] border-[#E8A598] bg-[#FBEDE7] rounded-r-xl px-5 py-4 text-sm text-[#41392F]">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-[#BF5E3E] mb-2">Numbers to confirm before locking in</h4>
        <ul className="list-disc pl-5 space-y-1">
          <li>Pages per 12.5×19 sheet for <b>8×8 and up</b> — estimated at 4/sheet.</li>
          <li>Your <b>thick cover-paper price</b> — softcover cover estimated at ₱50 (paper + print + ₱16 lamination).</li>
          <li><b>Hardbound cost per size</b> — estimated across your ₱250–500 range.</li>
        </ul>
      </div>
    </div>
  );
}

function PricingGroup({ bind }: { bind: Binding }) {
  return (
    <>
      <tr className="bg-[#FBF6F1]">
        <td colSpan={5} className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-[#BF5E3E]">
          {bind === 'soft' ? 'Softcover' : 'Hardbound'} · 40 pages
        </td>
      </tr>
      {ORDER.map((k) => {
        const c = costOf(k, bind, 40);
        const cpp = SHEET / SIZES[k].pps;
        return (
          <tr key={k} className="border-t border-[#EEE7DE]">
            <td className="px-4 py-2.5 text-left font-sans text-[#2D2D2D]">{SIZES[k].label}</td>
            <td className="px-4 py-2.5 text-right text-[#2D2D2D]">{peso(c)}</td>
            <td className="px-4 py-2.5 text-right text-[#2E7D4A]">{peso(c * 3)}</td>
            <td className="px-4 py-2.5 text-right text-[#BF5E3E]">{peso(c * 5)}</td>
            <td className="px-4 py-2.5 text-right text-[#6B6B6B]">₱{cpp.toFixed(2)}</td>
          </tr>
        );
      })}
    </>
  );
}

function RivalCard({ title, meta, lines }: { title: string; meta: string; lines: [string, string, string][] }) {
  return (
    <div className="border border-[#DED5C9] rounded-xl p-4 bg-white">
      <h4 className="text-sm font-semibold text-[#2D2D2D]">{title}</h4>
      <p className="text-xs text-[#9B9B9B] mb-3">{meta}</p>
      <div className="font-mono tabular-nums text-[13px]">
        {lines.map(([l, v, kind]) => (
          <div key={l}
            className={`flex justify-between py-1 ${kind === 'rule' ? 'border-t border-[#EAE3DA] mt-1 pt-2 font-semibold' : ''}`}
            style={{ color: kind === 'rival' ? '#B0503A' : kind === 'pay' ? '#2E7D4A' : '#2D2D2D', fontWeight: kind === 'pay' ? 600 : undefined }}>
            <span className="font-sans text-[#6B6B6B]">{l}</span><span>{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
