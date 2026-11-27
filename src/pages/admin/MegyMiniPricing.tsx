/* ═══════════════════════════════════════════════════════════════════════════
   MEGY MINI in the owner's Pricing panel (0062, lib/megyMini).

   Owner, 2026-11-16: a 16-page A5 booklet with staples, "as an item not part
   of a package 350+shipping", ₱299 inside a package, "2 QR videos free".
   Megy Mini stays OFF until the owner turns it on here, and it can't be
   turned on without a shipping fee (the database refuses it: set_megy_mini).
   The app shows the Megy Mini card only while it is on.
   ═══════════════════════════════════════════════════════════════════════════ */
import { useState } from 'react';
import type { PricingModel } from '../../lib/pricing';
import { setMegyMini } from '../../lib/storeSettings';

const peso = (n: number) => `₱${Math.round(n).toLocaleString('en-PH')}`;

export default function MegyMiniPricing({ model, onSaved }: { model: PricingModel; onSaved: (m: PricingModel) => void }) {
  const [on, setOn] = useState(!!model.mini_on);
  const [price, setPrice] = useState(model.mini_price ?? 350);
  const [packagePrice, setPackagePrice] = useState(model.mini_package_price ?? 299);
  const [fee, setFee] = useState<string>(model.mini_shipping_fee != null ? String(model.mini_shipping_fee) : '');
  const [freeQr, setFreeQr] = useState(model.mini_free_qr ?? 2);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState('');

  // An older database (before 0062) has no Megy Mini to set.
  if (model.mini_price === undefined) {
    return (
      <div className="mt-5 pt-5 border-t border-sand-deep">
        <h4 className="font-semibold text-dark">Megy Mini</h4>
        <p className="text-xs text-medium mt-1">Not set up on this database yet (migration 0062).</p>
      </div>
    );
  }

  const feeNum = fee.trim() === '' ? null : Number(fee);
  const cost = model.mini_cost ?? 0;
  const reserve = model.mini_hosting_reserve ?? 0;
  const keepSingle = price - cost - reserve;
  const keepPackage = packagePrice - cost;
  const changed = on !== !!model.mini_on || price !== model.mini_price || packagePrice !== model.mini_package_price
    || feeNum !== (model.mini_shipping_fee ?? null) || freeQr !== model.mini_free_qr;

  const save = async () => {
    setErr(''); setSaved(false);
    if (on && feeNum == null) { setErr('Type the shipping fee before turning Megy Mini on.'); return; }
    if (feeNum != null && (!Number.isFinite(feeNum) || feeNum < 0)) { setErr('The shipping fee must be ₱0 or more.'); return; }
    setSaving(true);
    const e = await setMegyMini({ on, price, packagePrice, shippingFee: feeNum, freeQr });
    setSaving(false);
    if (e) { setErr(e); return; }
    setSaved(true);
    onSaved({ ...model, mini_on: on, mini_price: price, mini_package_price: packagePrice, mini_shipping_fee: feeNum, mini_free_qr: freeQr });
  };

  const box = 'w-24 border border-line rounded-lg px-3 py-2 font-mono text-sm tabular-nums';
  const label = 'text-xs font-semibold uppercase tracking-wide text-light block mb-1';

  return (
    <div className="mt-5 pt-5 border-t border-sand-deep" data-testid="megy-mini-pricing">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-[220px] max-w-md">
          <h4 className="font-semibold text-dark">Megy Mini</h4>
          <p className="text-xs text-medium mt-1 leading-snug">
            A 16-page A5 booklet with staples, sold next to the albums. Its shipping is <b>charged on top</b> (albums ship free).
            The app shows it only while it is on.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm font-semibold text-dark">
          <input type="checkbox" checked={on} onChange={(e) => { setOn(e.target.checked); setSaved(false); }} data-testid="megy-mini-on" />
          {on ? 'On sale' : 'Off'}
        </label>
      </div>
      <div className="flex items-end gap-3 flex-wrap mt-3">
        <div>
          <label className={label}>Price</label>
          <input type="number" min={1} step={1} value={price} onChange={(e) => { setPrice(+e.target.value); setSaved(false); }} className={box} />
        </div>
        <div>
          <label className={label}>In a package</label>
          <input type="number" min={1} step={1} value={packagePrice} onChange={(e) => { setPackagePrice(+e.target.value); setSaved(false); }} className={box} />
        </div>
        <div>
          <label className={label}>Shipping fee</label>
          <input type="number" min={0} step={10} value={fee} placeholder="₱" onChange={(e) => { setFee(e.target.value); setSaved(false); }} className={box} data-testid="megy-mini-fee" />
        </div>
        <div>
          <label className={label}>Free videos</label>
          <input type="number" min={0} max={50} step={1} value={freeQr} onChange={(e) => { setFreeQr(+e.target.value); setSaved(false); }} className={box} />
        </div>
        <button onClick={save} disabled={saving || !changed}
          className="px-4 py-2 rounded-lg bg-dark text-white text-sm font-semibold disabled:opacity-40" data-testid="megy-mini-save">
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
      <p className="text-xs text-medium mt-2">
        You keep about <b>{peso(keepSingle)}</b> on a single Mini ({peso(price)} − {peso(cost)} to make − {peso(reserve)} for its videos; the customer pays the shipping)
        and <b>{peso(keepPackage)}</b> on each Mini in a package.
      </p>
      {saved && <p className="text-xs text-success mt-2 font-semibold">✓ Saved — Megy Mini is {on ? `on sale at ${peso(price)} + ${peso(feeNum ?? 0)} shipping` : 'off'}.</p>}
      {err && <p className="text-xs text-rust-deep mt-2">Couldn't save: {err}</p>}
    </div>
  );
}
