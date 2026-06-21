import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Search, SlidersHorizontal, MapPin, Navigation, Map as MapIcon, List } from "lucide-react";
import { toast } from "sonner";
import { CATEGORIES, type CategorySlug } from "@/lib/categories";
import { NCR_CITIES, CITY_BY_NAME, NCR_CENTER } from "@/lib/locations";
import { useProviders } from "@/hooks/useProviders";
import { ProviderCard } from "@/components/ProviderCard";
import { ProviderMap } from "@/components/ProviderMap";
import { Button } from "@/components/ui/button";
import { cn, haversineKm } from "@/lib/utils";

type SortKey = "rating" | "price-asc" | "price-desc" | "experience" | "distance";

export default function Browse() {
  const [params, setParams] = useSearchParams();
  const activeCategory = params.get("category") as CategorySlug | null;
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("rating");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [city, setCity] = useState<string>("");
  const [userLoc, setUserLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [view, setView] = useState<"list" | "map">("list");
  const [selected, setSelected] = useState<string | null>(null);

  const { providers, loading } = useProviders();

  // Reference point for distance: the user's GPS, else the chosen city centroid.
  const origin = userLoc ?? (city ? CITY_BY_NAME[city] : null);

  const results = useMemo(() => {
    let list = providers.map((p) => ({
      ...p,
      distanceKm: origin ? haversineKm(origin, { lat: p.lat, lng: p.lng }) : undefined,
    }));
    if (activeCategory) list = list.filter((p) => p.primary_category === activeCategory);
    if (verifiedOnly) list = list.filter((p) => p.verified);
    if (city) list = list.filter((p) => p.city === city);
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.headline.toLowerCase().includes(q) ||
          p.skills.some((s) => s.toLowerCase().includes(q)) ||
          p.city.toLowerCase().includes(q) ||
          p.barangay.toLowerCase().includes(q),
      );
    }
    switch (sort) {
      case "price-asc": list.sort((a, b) => a.hourly_rate - b.hourly_rate); break;
      case "price-desc": list.sort((a, b) => b.hourly_rate - a.hourly_rate); break;
      case "experience": list.sort((a, b) => b.years_experience - a.years_experience); break;
      case "distance":
        list.sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
        break;
      default: list.sort((a, b) => b.rating_avg - a.rating_avg);
    }
    return list;
  }, [providers, origin, activeCategory, verifiedOnly, city, query, sort]);

  const setCategory = (slug: CategorySlug | null) => {
    const next = new URLSearchParams(params);
    if (slug) next.set("category", slug);
    else next.delete("category");
    setParams(next);
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      toast.error("Location isn't available on this device.");
      return;
    }
    toast.loading("Getting your location…", { id: "geo" });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setSort("distance");
        toast.success("Sorted by distance from you.", { id: "geo" });
      },
      () => {
        // Fallback to Metro Manila centre so the feature still demos.
        setUserLoc(NCR_CENTER);
        setSort("distance");
        toast.info("Using Metro Manila as your location.", { id: "geo" });
      },
      { timeout: 8000 },
    );
  };

  return (
    <div className="container py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold">Browse pros</h1>
          <p className="mt-1 text-muted-foreground">
            {loading ? "Loading pros…" : `${results.length} ${results.length === 1 ? "pro" : "pros"} available`}
            {activeCategory ? ` in ${CATEGORIES.find((c) => c.slug === activeCategory)?.name}` : ""}
            {city ? ` · ${city}` : ""}.
          </p>
        </div>
        {/* view toggle */}
        <div className="flex items-center gap-1 rounded-xl border border-input bg-white p-1 shadow-soft">
          <button
            onClick={() => setView("list")}
            className={cn("flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold", view === "list" ? "bg-brand-600 text-white" : "text-muted-foreground")}
          >
            <List className="size-4" /> List
          </button>
          <button
            onClick={() => setView("map")}
            className={cn("flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold", view === "map" ? "bg-brand-600 text-white" : "text-muted-foreground")}
          >
            <MapIcon className="size-4" /> Map
          </button>
        </div>
      </header>

      {/* search + sort */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="flex flex-1 items-center gap-2 rounded-xl border border-input bg-white px-4 shadow-soft">
          <Search className="size-5 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, skill, or area…"
            className="h-11 flex-1 bg-transparent text-sm outline-none"
          />
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-input bg-white px-3 shadow-soft">
          <MapPin className="size-4 text-muted-foreground" />
          <select value={city} onChange={(e) => setCity(e.target.value)} className="h-11 bg-transparent text-sm font-medium outline-none">
            <option value="">All cities</option>
            {NCR_CITIES.map((c) => (
              <option key={c.name} value={c.name}>{c.name}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-input bg-white px-3 shadow-soft">
          <SlidersHorizontal className="size-4 text-muted-foreground" />
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="h-11 bg-transparent text-sm font-medium outline-none">
            <option value="rating">Top rated</option>
            <option value="distance" disabled={!origin}>Nearest</option>
            <option value="price-asc">Price: low to high</option>
            <option value="price-desc">Price: high to low</option>
            <option value="experience">Most experienced</option>
          </select>
        </div>
        <Button variant={userLoc ? "default" : "outline"} onClick={useMyLocation} className="shrink-0">
          <Navigation /> Near me
        </Button>
      </div>

      {/* category pills */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          onClick={() => setCategory(null)}
          className={cn("rounded-full px-4 py-2 text-sm font-semibold transition-colors", !activeCategory ? "bg-brand-600 text-white shadow-soft" : "bg-muted text-foreground/70 hover:bg-brand-100")}
        >
          All
        </button>
        {CATEGORIES.map((c) => {
          const Icon = c.icon;
          const active = activeCategory === c.slug;
          return (
            <button
              key={c.slug}
              onClick={() => setCategory(c.slug)}
              className={cn("flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition-colors", active ? "bg-brand-600 text-white shadow-soft" : "bg-muted text-foreground/70 hover:bg-brand-100")}
            >
              <Icon className="size-4" /> {c.name}
            </button>
          );
        })}
        <label className="ml-auto flex cursor-pointer items-center gap-2 rounded-full border border-input bg-white px-4 py-2 text-sm font-semibold">
          <input type="checkbox" checked={verifiedOnly} onChange={(e) => setVerifiedOnly(e.target.checked)} className="size-4 accent-brand-600" />
          NBI-verified only
        </label>
      </div>

      {/* body */}
      {loading ? (
        <div className="mt-7 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-64 animate-pulse rounded-2xl border border-border bg-muted/40" />
          ))}
        </div>
      ) : view === "map" ? (
        <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_360px]">
          <ProviderMap providers={results} userLoc={origin} selectedId={selected} onSelect={setSelected} />
          <div className="max-h-[70vh] space-y-3 overflow-y-auto pr-1">
            {results.map((p) => (
              <div key={p.id} onMouseEnter={() => setSelected(p.id)}>
                <ProviderCard provider={p} distanceKm={p.distanceKm} />
              </div>
            ))}
          </div>
        </div>
      ) : results.length > 0 ? (
        <div className="mt-7 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((p) => (
            <ProviderCard key={p.id} provider={p} distanceKm={p.distanceKm} />
          ))}
        </div>
      ) : (
        <div className="mt-16 text-center">
          <p className="text-lg font-bold">No pros match your search.</p>
          <p className="mt-1 text-muted-foreground">Try clearing filters or posting a job instead.</p>
          <Button
            variant="gradient"
            className="mt-5"
            onClick={() => {
              setQuery(""); setVerifiedOnly(false); setCategory(null); setCity("");
            }}
          >
            Clear filters
          </Button>
        </div>
      )}
    </div>
  );
}
