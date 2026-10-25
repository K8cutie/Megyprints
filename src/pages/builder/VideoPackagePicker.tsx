import { useMemo, useState } from 'react';
import { FREE_QR_MEMORIES, packageOptions, packageLabel, type VideoPackage } from '../../lib/pricing';

/* ══════════════════════════════════════════════════════════════════════════
   "You ran out of free videos" (owner, 2026-10-26). The gold button's
   add-video pop-up shows this first once the album's free videos are used
   (or its package is full): the packages, most videos first, the best value
   picked ("₱600, now ₱300 · Save 50%"), ONE button to add it and "Not now".
   Nothing is paid here: the package goes on the album and is paid with it at
   checkout. The "Save" compares with the highest per-video price on sale
   (pricing.ts packageSaving), a real price, never a made-up one.
   ══════════════════════════════════════════════════════════════════════════ */

export default function VideoPackagePicker({ packages, current, used, onChoose, onNotNow }: {
  packages: VideoPackage[];
  /** The album's packages now; [] when it has none. */
  current: number[];
  /** Video memories on the album now. */
  used: number;
  onChoose: (mix: number[]) => void;
  onNotNow: () => void;
}) {
  const options = useMemo(() => packageOptions(packages, current), [packages, current]);
  const [pick, setPick] = useState(() => Math.max(0, options.findIndex((o) => o.best)));
  const sel = options[pick] ?? options[0];
  const full = current.length > 0;
  const peso = (n: number) => `₱${n.toLocaleString('en-PH')}`;

  return (
    <>
      <div className="p-5 space-y-3 overflow-y-auto" data-testid="video-packages">
        <div>
          <p className="text-base font-bold text-dark">{full ? 'Your video package is full' : 'You ran out of free videos'}</p>
          <p className="text-xs text-medium mt-1 leading-snug">
            {full
              ? `You used all ${used} videos in this album. Choose a bigger package.`
              : `You used all ${FREE_QR_MEMORIES} free videos in this album. We have a special offer: choose the best package.`}
          </p>
        </div>
        <div role="radiogroup" aria-label="Video packages" className="space-y-2">
          {options.map((o, i) => {
            const active = i === pick;
            return (
              <button key={o.mix.join('+')} type="button" role="radio" aria-checked={active} onClick={() => setPick(i)}
                data-testid={`video-package-${o.slots}`}
                className={`w-full rounded-xl px-3 py-2.5 flex items-center gap-3 text-left transition ${active ? 'border-2 border-peach bg-white' : 'border border-line bg-white hover:border-peach/60'}`}>
                <span aria-hidden className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${active ? 'border-peach' : 'border-line'}`}>
                  {active && <span className="w-2 h-2 rounded-full bg-peach" />}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold text-dark">
                    {o.slots} more videos
                    {o.save && (
                      <span className="ml-1.5 align-middle text-[11px] font-semibold rounded-md px-1.5 py-0.5 bg-blush text-blush-pink" data-testid={`video-package-save-${o.slots}`}>
                        Save {o.save.pct}%
                      </span>
                    )}
                  </span>
                  <span className="block text-[11px] text-medium">
                    {peso(Math.round(o.price / o.slots))} each
                    {o.mix.length > 1 ? ` · ${packageLabel(o.mix)}` : ''}
                    {o.best ? ' · best value' : ''}
                    {full ? ` · ${peso(o.more)} more than now` : ''}
                  </span>
                </span>
                <span className="text-right shrink-0">
                  {o.save && <s className="block text-[11px] text-light" data-testid={`video-package-was-${o.slots}`}>{peso(o.save.was)}</s>}
                  <span className="block text-sm font-bold text-dark">{peso(o.price)}</span>
                </span>
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-medium">You pay with your album at checkout.</p>
      </div>
      <div className="px-5 py-3 border-t border-line shrink-0 space-y-1.5">
        {sel && (
          <button type="button" onClick={() => onChoose(sel.mix)} data-testid="video-package-add" data-autofocus
            className="w-full px-5 py-2.5 rounded-lg bg-peach text-white text-sm font-semibold hover:brightness-105">
            {full ? 'Switch to' : 'Add'} {sel.slots} more videos · {peso(sel.price)}
          </button>
        )}
        <button type="button" onClick={onNotNow} data-testid="video-package-not-now" className="w-full text-xs text-medium py-1.5">
          Not now
        </button>
      </div>
    </>
  );
}
