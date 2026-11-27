/* ═══════════════════════════════════════════════════════════════════════════
   VIDEO MEMORY SALE in the owner's Pricing panel (0078).

   Owner, 2026-11-24: "the price of each video is 50 regular but its 3 for
   100", "Christmas sale is urgency so end at December 31. We can always have
   a new promo theme". An extra video is ₱50; while a sale runs, any 3 are
   ₱100 (33% off), named on the pop-up's tag. The owner starts, renames or
   ends a sale here. The database refuses an end date past 6 months, and the
   sale stops by itself the day after it. Between themes the ₱50 price should
   run for real, or "33% off" stops being true.
   ═══════════════════════════════════════════════════════════════════════════ */
import { useEffect, useState } from 'react';
import { longDate, manilaToday } from '../../lib/pricing';
import { loadOwnerVideoSale, setVideoSale } from '../../lib/storeSettings';

type Sale = { name: string | null; until: string | null; single: number; packSize: number; packPrice: number };

export default function VideoSalePricing() {
  const [loaded, setLoaded] = useState<Sale | null>(null);
  const [failed, setFailed] = useState(false);
  const [name, setName] = useState('');
  const [until, setUntil] = useState('');
  const [saving, setSaving] = useState(false);
  const [said, setSaid] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    void loadOwnerVideoSale().then((s) => {
      if (!alive) return;
      if (!s) { setFailed(true); return; }
      setLoaded(s);
      setName(s.name ?? '');
      setUntil(s.until ?? '');
    });
    return () => { alive = false; };
  }, []);

  if (failed) {
    return (
      <div className="mt-5 pt-5 border-t border-sand-deep" data-testid="video-sale-pricing">
        <h4 className="font-semibold text-dark">Video memory sale</h4>
        <p className="text-xs text-medium mt-1">Not set up on this database yet (migration 0078), or owner sign-in is needed.</p>
      </div>
    );
  }

  const today = manilaToday();
  const running = !!loaded && !!loaded.name && !!loaded.until && loaded.until >= today;
  const pct = loaded ? Math.round(100 * (1 - loaded.packPrice / (loaded.packSize * loaded.single))) : null;

  const save = async (end: boolean) => {
    setErr(''); setSaid('');
    const nm = name.trim();
    if (!end && (!nm || nm.length > 30 || !until)) { setErr('Type a name (up to 30 letters) and an end date, or end the sale.'); return; }
    setSaving(true);
    const e = await setVideoSale(end ? null : nm, end ? null : until);
    setSaving(false);
    if (e) { setErr(e); return; }
    setLoaded((l) => (l ? { ...l, name: end ? null : nm, until: end ? null : until } : l));
    if (end) { setName(''); setUntil(''); }
    setSaid(end ? 'Ended: extra videos are ₱' + (loaded?.single ?? 50) + ' each.' : `Saved: "${nm}" runs until ${longDate(until)}.`);
  };

  const box = 'border border-line rounded-lg px-3 py-2 text-sm';
  const label = 'text-xs font-semibold uppercase tracking-wide text-light block mb-1';

  return (
    <div className="mt-5 pt-5 border-t border-sand-deep" data-testid="video-sale-pricing">
      <h4 className="font-semibold text-dark">Video memory sale</h4>
      <p className="text-xs text-medium mt-1 leading-snug max-w-2xl">
        An extra video is <b>₱{loaded?.single ?? 50}</b>. While a sale runs, any {loaded?.packSize ?? 3} are <b>₱{loaded?.packPrice ?? 100}</b>
        {pct !== null ? ` (${pct}% off)` : ''}, and the pop-up shows the sale&apos;s name. It ends by itself after its end date, at most
        6 months ahead. Leave a few weeks at ₱{loaded?.single ?? 50} each between sales, or &quot;% off&quot; stops being true.
      </p>
      <p className="text-xs mt-2 font-semibold" data-testid="video-sale-state">
        {loaded === null ? 'Loading…'
          : running ? `Running now: ${loaded.name}, until ${longDate(loaded.until as string)}.`
          : `No sale: extra videos are ₱${loaded.single} each.`}
      </p>
      <div className="mt-3 flex items-end gap-2 flex-wrap">
        <div>
          <label className={label}>Sale name</label>
          <input type="text" maxLength={30} value={name} placeholder="Christmas sale" data-testid="video-sale-name"
            onChange={(e) => { setName(e.target.value); setSaid(''); }} className={`w-48 ${box}`} />
        </div>
        <div>
          <label className={label}>Runs until</label>
          <input type="date" min={today} value={until} data-testid="video-sale-until"
            onChange={(e) => { setUntil(e.target.value); setSaid(''); }} className={`font-mono ${box}`} />
        </div>
        <button onClick={() => save(false)} disabled={saving} data-testid="video-sale-save"
          className="px-4 py-2 rounded-lg bg-dark text-white text-sm font-semibold disabled:opacity-40">
          {saving ? 'Saving…' : 'Save'}
        </button>
        {running && (
          <button onClick={() => save(true)} disabled={saving} data-testid="video-sale-end"
            className="px-4 py-2 rounded-lg border border-line text-sm font-semibold text-dark disabled:opacity-40">
            End the sale now
          </button>
        )}
      </div>
      {said && <p className="text-xs text-success mt-2 font-semibold">✓ {said}</p>}
      {err && <p className="text-xs text-rust-deep mt-2">Couldn&apos;t save: {err}</p>}
    </div>
  );
}
