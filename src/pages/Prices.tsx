/* Prices. PayMongo checks that the website shows its prices in pesos before
   it turns payments on (website guidelines: "Pricing in PHP"). Until now the
   only public prices were inside the builder and on the affiliate page.

   Every number comes from the live price list (public_price_schedule, the
   same one checkout charges from), so this page can never show a price the
   checkout doesn't. Nothing here is typed in by hand. */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { getPriceSchedule, isStoreSettingsReady, onStoreSettingsChange, retryStoreSettings } from '../lib/storeSettings';
import { FREE_QR_MEMORIES, SIZE_LABELS, crossedOutPrintOf, launchLine, launchOf, priceOf } from '../lib/pricing';
import type { PriceSchedule } from '../lib/pricing';
import type { AlbumSizePreset } from './builder/types';
import { isMiniSize, miniOfferOf } from '../lib/megyMini';

const peso = (n: number) => `₱${Math.round(n).toLocaleString('en-PH')}`;

/** The album sizes on sale today, cheapest softcover first. */
export function sizesOnSale(schedule: PriceSchedule): AlbumSizePreset[] {
  const off = new Set(schedule.disabled_sizes ?? []);
  const soft = (s: AlbumSizePreset) => priceOf(schedule, s, 'soft', schedule.min_pages);
  return (Object.keys(SIZE_LABELS) as AlbumSizePreset[])
    .filter((s) => !isMiniSize(s) && !off.has(s) && !!schedule.sizes?.[s])
    .sort((a, b) => soft(a) - soft(b));
}

function Price({ schedule, size, binding }: { schedule: PriceSchedule; size: AlbumSizePreset; binding: 'soft' | 'hard' }) {
  const now = priceOf(schedule, size, binding, schedule.min_pages);
  const was = crossedOutPrintOf(schedule, size, binding, schedule.min_pages);
  return (
    <span data-testid={`price-${size}-${binding}`}>
      {was != null && was > now && <s className="block text-xs text-light sm:mr-1.5 sm:inline" data-testid={`price-was-${size}-${binding}`}>{peso(was)}</s>}
      <span className="font-semibold text-dark">{peso(now)}</span>
    </span>
  );
}

export default function Prices() {
  const navigate = useNavigate();
  const [, setTick] = useState(0);
  useEffect(() => onStoreSettingsChange(() => setTick((n) => n + 1)), []);

  const schedule = getPriceSchedule();
  const sizes = schedule ? sizesOnSale(schedule) : [];
  const launch = schedule ? launchOf(schedule) : null;
  const mini = schedule ? miniOfferOf(schedule) : null;

  return (
    <div className="min-h-screen bg-cream pt-24 pb-12">
      <div className="mx-auto max-w-[720px] px-6">
        <h1 className="font-display text-4xl font-bold text-dark text-center">Prices</h1>
        <p className="mt-3 text-center text-medium">
          All prices are in Philippine pesos (₱). Shipping in the Philippines is included in every album price.
        </p>

        {!schedule && (
          <div className="mt-10 rounded-2xl bg-white p-6 text-center shadow-sm" data-testid="prices-loading">
            {isStoreSettingsReady() ? (
              <>
                <p className="text-medium">We couldn't load today's prices.</p>
                <button type="button" onClick={() => { void retryStoreSettings(); }}
                  className="mt-3 rounded-xl border border-peach px-5 py-2 text-sm font-semibold text-cocoa">Try again</button>
              </>
            ) : (
              <p className="text-medium">Loading today's prices…</p>
            )}
          </div>
        )}

        {schedule && sizes.length > 0 && (
          <section className="mt-10 rounded-2xl bg-white p-6 shadow-sm" data-testid="prices-albums">
            <h2 className="font-display text-2xl font-bold text-dark">Photo albums</h2>
            <p className="mt-1 text-sm text-medium">
              {schedule.min_pages} pages and {FREE_QR_MEMORIES} video memories included. Add more pages as you build; the price updates as you go.
            </p>
            {launch && <p className="mt-2 text-sm font-semibold text-cocoa" data-testid="prices-launch">{launchLine(launch)}</p>}
            <table className="mt-4 w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line-soft text-medium">
                  <th className="py-2 font-semibold">Size</th>
                  <th className="py-2 font-semibold">Softcover</th>
                  <th className="py-2 font-semibold">Hardcover</th>
                </tr>
              </thead>
              <tbody>
                {sizes.map((s) => (
                  <tr key={s} className="border-b border-line-soft last:border-0" data-testid="prices-row">
                    <td className="py-2.5 text-dark">{SIZE_LABELS[s]} in</td>
                    <td className="py-2.5"><Price schedule={schedule} size={s} binding="soft" /></td>
                    <td className="py-2.5"><Price schedule={schedule} size={s} binding="hard" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-xs text-light">Extra video memories and HD video are priced at checkout, before you pay.</p>
          </section>
        )}

        {mini && (
          <section className="mt-6 rounded-2xl bg-white p-6 shadow-sm" data-testid="prices-mini">
            <h2 className="font-display text-2xl font-bold text-dark">Megy Mini</h2>
            <p className="mt-1 text-sm text-medium">
              A small {mini.pages}-page booklet with {mini.free_qr} video memories, made in the Megyprints app.
            </p>
            <p className="mt-3 text-sm text-dark" data-testid="prices-mini-price">
              From <span className="font-semibold">{peso(mini.price)}</span> + {peso(mini.shipping_fee)} shipping
            </p>
          </section>
        )}

        <div className="mt-10 text-center">
          <button type="button" onClick={() => navigate('/builder')}
            className="inline-flex items-center gap-2 rounded-xl bg-peach px-8 py-3 font-semibold text-white transition-all hover:brightness-105">
            Start your album <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
