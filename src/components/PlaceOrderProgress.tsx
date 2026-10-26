import type { PlaceProgress } from '../lib/placeProgress';

/* The bar under Place order while the order is placed (placeProgress). The
   step itself ("Making page 23 of 70…") is on the button
   above it. */
export default function PlaceOrderProgress({ progress }: { progress: PlaceProgress }) {
  const pct = Math.round(Math.min(1, Math.max(0, progress.at)) * 100);
  return (
    <div className="mt-3" data-testid="order-progress">
      <div role="progressbar" aria-label="Placing your order" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}
        className="relative h-2.5 rounded-full bg-[#F1E4DA] overflow-hidden">
        <div className="h-full rounded-full bg-peach transition-[width] duration-500 ease-out" style={{ width: `${pct}%` }} data-testid="order-progress-fill" />
        {/* Sending can't be measured: a band moves along instead of a number. */}
        {progress.sending && <div className="megy-progress-band" data-testid="order-progress-sending" />}
      </div>
      <p className="mt-2 text-xs text-medium text-center" data-testid="order-progress-note">Keep this screen open. This can take a few minutes.</p>
    </div>
  );
}
