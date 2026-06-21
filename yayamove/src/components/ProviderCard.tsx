import { Link } from "react-router-dom";
import { Star, MapPin, BadgeCheck, Briefcase, Navigation } from "lucide-react";
import { Card } from "./ui/card";
import { Badge } from "./ui/badge";
import { VerifiedBadge } from "./VerifiedBadge";
import { CATEGORY_BY_SLUG } from "@/lib/categories";
import type { ProviderListItem } from "@/lib/sampleData";
import { formatPHP, formatDistance, initials } from "@/lib/utils";

export function ProviderCard({
  provider,
  distanceKm,
}: {
  provider: ProviderListItem;
  distanceKm?: number;
}) {
  const cat = CATEGORY_BY_SLUG[provider.primary_category];
  const Icon = cat.icon;

  return (
    <Link to={`/provider/${provider.id}`} className="group ring-focus rounded-2xl">
      <Card className="h-full overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-glow">
        <div className={`h-1.5 w-full bg-gradient-to-r ${cat.gradient}`} />
        <div className="p-5">
          <div className="flex items-start gap-3.5">
            <div
              className={`flex size-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${cat.gradient} font-display text-lg font-bold text-white shadow-soft`}
            >
              {initials(provider.name)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <h3 className="truncate text-base font-bold">{provider.name}</h3>
                {provider.verified && (
                  <BadgeCheck className="size-4 shrink-0 text-brand-600" />
                )}
              </div>
              <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                <Icon className="size-3.5" /> {cat.name}
              </p>
            </div>
          </div>

          <p className="mt-3 line-clamp-2 text-sm text-foreground/80">
            {provider.headline}
          </p>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {provider.skills.slice(0, 3).map((s) => (
              <Badge key={s} variant="outline" className="font-medium">
                {s}
              </Badge>
            ))}
          </div>

          <div className="mt-4 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1 font-semibold text-amber-600">
              <Star className="size-3.5 fill-amber-400 text-amber-400" />
              {provider.rating_avg.toFixed(1)}
            </span>
            <span>({provider.rating_count})</span>
            <span className="flex items-center gap-1">
              <Briefcase className="size-3.5" /> {provider.jobs_completed} jobs
            </span>
          </div>

          <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              {distanceKm !== undefined ? (
                <><Navigation className="size-3.5 text-brand-500" /> {formatDistance(distanceKm)}</>
              ) : (
                <><MapPin className="size-3.5" /> {provider.city}</>
              )}
            </span>
            <div className="text-right">
              <span className="text-sm font-extrabold text-brand-700">
                {formatPHP(provider.hourly_rate)}
              </span>
              <span className="text-xs text-muted-foreground">/hr</span>
            </div>
          </div>

          <div className="mt-3">
            <VerifiedBadge verified={provider.verified} />
          </div>
        </div>
      </Card>
    </Link>
  );
}
