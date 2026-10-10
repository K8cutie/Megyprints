import { Check, Clock, BadgeCheck, Printer, Package, Truck, Loader2 } from 'lucide-react';
import type { OrderTrack } from '../lib/orderTracker';

const ICONS = [Clock, BadgeCheck, Printer, Package, Truck, Check];

/** The order's journey, step by step (orderTracker.trackOf). Steps reached are
 *  ticked, the one in progress spins, the rest wait in grey. */
export default function OrderTracker({ track, compact = false }: { track: OrderTrack; compact?: boolean }) {
  const dot = compact ? 'w-7 h-7' : 'w-9 h-9';
  const icon = compact ? 14 : 18;
  return (
    <ol className="space-y-1" data-testid="order-tracker">
      {track.labels.map((label, i) => {
        const done = i < track.stage || (track.finished && i === track.stage);
        const active = i === track.stage && !track.finished;
        const reached = i <= track.stage;
        const Icon = ICONS[i] ?? Check;
        return (
          <li key={label} className={`flex items-center gap-3 ${compact ? 'py-1' : 'py-2'}`} data-reached={reached ? 'true' : 'false'}>
            <div className={`${dot} rounded-full flex items-center justify-center shrink-0 transition-colors ${reached ? 'bg-soft-sage text-success' : 'bg-line-soft text-[#C4C4C4]'}`}>
              {active ? <Loader2 size={icon} className="animate-spin text-[#C98A5E]" /> : done ? <Check size={icon} /> : <Icon size={icon} />}
            </div>
            <span className={`${compact ? 'text-[13px]' : 'text-sm'} font-medium ${reached ? 'text-dark' : 'text-light'}`}>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}
