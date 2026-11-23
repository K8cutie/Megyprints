/* ═══════════════════════════════════════════════════════════════════════════
   LAUNCH PRICE in the owner's Pricing panel (0072).

   Owner, 2026-11-24: "Megyprints is a premium product with premium features",
   "a % discount", then "Yes, 40% to Mar 31". Today's album prices are the
   launch price: N% off a regular price (today's ÷ (1 − N%)), crossed out at
   checkout and on the app's size step. The database refuses more than 90%
   or an end date more than 6 months out, and stops sending it after the end
   date. Albums only: the Megy Mini and the add-ons are never discounted.
   ═══════════════════════════════════════════════════════════════════════════ */
import { useEffect, useState } from 'react';
import { longDate, manilaToday, priceOf } from '../../lib/pricing';
import { getPriceSchedule, loadOwnerLaunchPrice, setLaunchPrice } from '../../lib/storeSettings';

const peso = (n: number) => `₱${Math.round(n).toLocaleString('en-PH')}`;

export default function LaunchPricing() {
  const [loaded, setLoaded] = useState<{ pct: number | null; until: string | null } | null>(null);
  const [failed, setFailed] = useState(false);
  const [pct, setPct] = useState('');
  const [until, setUntil] = useState('');
  const [saving, setSaving] = useState(false);
  const [said, setSaid] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    void loadOwnerLaunchPrice().then((l) => {
      if (!alive) return;
      if (!l) { setFailed(true); return; }
      setLoaded(l);
      setPct(l.pct != null ? String(l.pct) : '');
      setUntil(l.until ?? '');
    });
    return () => { alive = false; };
  }, []);

  if (failed) {
    return (
      <div className="mt-5 pt-5 border-t border-sand-deep" data-testid="launch-pricing">
        <h4 className="font-semibold text-dark">Launch price</h4>
        <p className="text-xs text-medium mt-1">Not set up on this database yet (migration 0072), or owner sign-in is needed.</p>
      </div>
    );
  }

  const today = manilaToday();
  const running = !!loaded && loaded.pct != null && !!loaded.until && loaded.until >= today;
  const n = Number(pct);
  const schedule = getPriceSchedule();
  // The owner sees what it does to one album before saving.
  const example = schedule?.sizes?.['8x8'] && Number.isInteger(n) && n >= 1 && n <= 90
    ? (() => { const now = priceOf(schedule, '8x8', 'hard', schedule.min_pages); return { now, regular: Math.round(now / (1 - n / 100)) }; })()
    : null;

  const save = async (clear: boolean) => {
    setErr(''); setSaid('');
    if (!clear && (!Number.isInteger(n) || n < 1 || n > 90 || !until)) { setErr('Type a whole % from 1 to 90 and an end date, or end it now.'); return; }
    setSaving(true);
    const e = await setLaunchPrice(clear ? null : n, clear ? null : until);
    setSaving(false);
    if (e) { setErr(e); return; }
    setLoaded(clear ? { pct: null, until: null } : { pct: n, until });
    if (clear) { setPct(''); setUntil(''); }
    setSaid(clear ? 'Ended: checkout no longer shows a launch price.' : `Saved: albums show ${n}% off until ${longDate(until)}.`);
  };

  const box = 'border border-line rounded-lg px-3 py-2 font-mono text-sm tabular-nums';
  const label = 'text-xs font-semibold uppercase tracking-wide text-light block mb-1';

  return (
    <div className="mt-5 pt-5 border-t border-sand-deep" data-testid="launch-pricing">
      <h4 className="font-semibold text-dark">Launch price (% off, regular price crossed out)</h4>
      <p className="text-xs text-medium mt-1 leading-snug max-w-2xl">
        Customers pay today&apos;s prices. Checkout and the app&apos;s size step show them as <b>% off a regular price</b>
        (today&apos;s price ÷ (1 − %)), crossed out. Only honest if you <b>really charge that regular price</b> after the end
        date: on that day, raise the markup to it. Albums only: the Megy Mini and the add-ons are never discounted. It turns
        itself off after the end date, at most 6 months ahead, and replaces the was price while it runs.
      </p>
      <p className="text-xs mt-2 font-semibold" data-testid="launch-state">
        {loaded === null ? 'Loading…'
          : running ? `Running now: ${loaded.pct}% off until ${longDate(loaded.until as string)}.`
          : 'Not running.'}
      </p>
      <div className="mt-3 flex items-end gap-2 flex-wrap">
        <div>
          <label className={label}>% off</label>
          <input type="number" min={1} max={90} step={1} value={pct} data-testid="launch-pct"
            onChange={(e) => { setPct(e.target.value); setSaid(''); }} className={`w-20 ${box}`} />
        </div>
        <div>
          <label className={label}>Runs until</label>
          <input type="date" min={today} value={until} data-testid="launch-until"
            onChange={(e) => { setUntil(e.target.value); setSaid(''); }} className={box} />
        </div>
        <button onClick={() => save(false)} disabled={saving} data-testid="launch-save"
          className="px-4 py-2 rounded-lg bg-dark text-white text-sm font-semibold disabled:opacity-40">
          {saving ? 'Saving…' : 'Save'}
        </button>
        {running && (
          <button onClick={() => save(true)} disabled={saving} data-testid="launch-end"
            className="px-4 py-2 rounded-lg border border-line text-sm font-semibold text-dark disabled:opacity-40">
            End it now
          </button>
        )}
      </div>
      {example && (
        <p className="text-xs text-medium mt-2" data-testid="launch-example">
          8×8 hardcover, 40 pages: <s>{peso(example.regular)}</s> {peso(example.now)}. From the day after the end date, charge {peso(example.regular)}.
        </p>
      )}
      {said && <p className="text-xs text-success mt-2 font-semibold">✓ {said}</p>}
      {err && <p className="text-xs text-rust-deep mt-2">Couldn&apos;t save: {err}</p>}
    </div>
  );
}
