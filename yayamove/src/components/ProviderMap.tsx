import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Star, Navigation } from "lucide-react";
import { CATEGORY_BY_SLUG } from "@/lib/categories";
import { NCR_CENTER } from "@/lib/locations";
import type { ProviderListItem } from "@/lib/sampleData";
import { cn, formatPHP } from "@/lib/utils";

interface Props {
  providers: ProviderListItem[];
  userLoc?: { lat: number; lng: number } | null;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
}

/**
 * A self-contained, zero-dependency map: provider coordinates are projected
 * onto a styled panel (no external tile server → no API key, no runtime egress,
 * no cost). Good enough to show "who's near me"; swap for Leaflet/Mapbox later
 * if you need real streets.
 */
export function ProviderMap({ providers, userLoc, selectedId, onSelect }: Props) {
  const points = useMemo(() => {
    const coords = [
      ...providers.map((p) => ({ lat: p.lat, lng: p.lng })),
      userLoc ?? NCR_CENTER,
    ];
    const lats = coords.map((c) => c.lat);
    const lngs = coords.map((c) => c.lng);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const padLat = (maxLat - minLat) * 0.18 || 0.02;
    const padLng = (maxLng - minLng) * 0.18 || 0.02;

    const project = (lat: number, lng: number) => ({
      x: ((lng - (minLng - padLng)) / (maxLng - minLng + 2 * padLng)) * 100,
      // invert lat so north is up
      y: (1 - (lat - (minLat - padLat)) / (maxLat - minLat + 2 * padLat)) * 100,
    });

    return {
      providers: providers.map((p) => ({ p, ...project(p.lat, p.lng) })),
      user: userLoc ? project(userLoc.lat, userLoc.lng) : null,
    };
  }, [providers, userLoc]);

  return (
    <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl border border-border bg-brand-50 shadow-soft sm:aspect-[16/9]">
      {/* stylized map backdrop */}
      <div
        className="absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            "linear-gradient(#bfdbfe 1px, transparent 1px), linear-gradient(90deg, #bfdbfe 1px, transparent 1px)",
          backgroundSize: "44px 44px",
        }}
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-accent/10 via-transparent to-brand-200/30" />
      {/* faux roads */}
      <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
        <path d="M0,55 Q40,40 100,60" stroke="#93c5fd" strokeWidth="6" fill="none" opacity="0.4" vectorEffect="non-scaling-stroke" />
        <path d="M30,0 Q45,50 35,100" stroke="#93c5fd" strokeWidth="5" fill="none" opacity="0.35" vectorEffect="non-scaling-stroke" />
        <path d="M70,0 L62,100" stroke="#93c5fd" strokeWidth="4" fill="none" opacity="0.3" vectorEffect="non-scaling-stroke" />
      </svg>

      {/* user / centre marker */}
      {points.user && (
        <div
          className="absolute z-10 -translate-x-1/2 -translate-y-1/2"
          style={{ left: `${points.user.x}%`, top: `${points.user.y}%` }}
        >
          <span className="absolute -inset-3 animate-ping rounded-full bg-accent/40" />
          <span className="relative flex size-4 items-center justify-center rounded-full border-2 border-white bg-accent shadow">
            <Navigation className="size-2.5 text-white" />
          </span>
        </div>
      )}

      {/* provider pins */}
      {points.providers.map(({ p, x, y }) => {
        const cat = CATEGORY_BY_SLUG[p.primary_category];
        const Icon = cat.icon;
        const selected = selectedId === p.id;
        return (
          <button
            key={p.id}
            onClick={() => onSelect?.(p.id)}
            className="group absolute z-20 -translate-x-1/2 -translate-y-full"
            style={{ left: `${x}%`, top: `${y}%` }}
            aria-label={p.name}
          >
            <span
              className={cn(
                "flex size-9 items-center justify-center rounded-full rounded-bl-none border-2 border-white bg-gradient-to-br text-white shadow-glow transition-transform group-hover:scale-110",
                cat.gradient,
                selected && "scale-125 ring-2 ring-brand-700 ring-offset-2",
              )}
            >
              <Icon className="size-4" />
            </span>

            {/* hover/selected card */}
            <span
              className={cn(
                "pointer-events-none absolute left-1/2 top-full z-30 mt-1 w-44 -translate-x-1/2 rounded-xl border border-border bg-white p-2.5 text-left shadow-soft transition-opacity",
                selected ? "opacity-100" : "opacity-0 group-hover:opacity-100",
              )}
            >
              <span className="block truncate text-sm font-bold text-foreground">{p.name}</span>
              <span className="mt-0.5 flex items-center justify-between text-xs text-muted-foreground">
                <span className="flex items-center gap-0.5 text-amber-600">
                  <Star className="size-3 fill-amber-400 text-amber-400" /> {p.rating_avg.toFixed(1)}
                </span>
                <span className="font-semibold text-brand-700">{formatPHP(p.hourly_rate)}/hr</span>
              </span>
              <Link
                to={`/provider/${p.id}`}
                className="pointer-events-auto mt-1.5 block rounded-lg bg-brand-600 py-1 text-center text-xs font-semibold text-white hover:bg-brand-700"
              >
                View profile
              </Link>
            </span>
          </button>
        );
      })}

      <div className="absolute bottom-2 right-2 rounded-md bg-white/80 px-2 py-1 text-[10px] font-medium text-muted-foreground backdrop-blur">
        Approximate locations · Metro Manila
      </div>
    </div>
  );
}
