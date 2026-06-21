import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Search, SlidersHorizontal } from "lucide-react";
import { CATEGORIES, type CategorySlug } from "@/lib/categories";
import { SAMPLE_PROVIDERS } from "@/lib/sampleData";
import { ProviderCard } from "@/components/ProviderCard";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type SortKey = "rating" | "price-asc" | "price-desc" | "experience";

export default function Browse() {
  const [params, setParams] = useSearchParams();
  const activeCategory = params.get("category") as CategorySlug | null;
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("rating");
  const [verifiedOnly, setVerifiedOnly] = useState(false);

  const results = useMemo(() => {
    let list = [...SAMPLE_PROVIDERS];
    if (activeCategory) list = list.filter((p) => p.primary_category === activeCategory);
    if (verifiedOnly) list = list.filter((p) => p.verified);
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.headline.toLowerCase().includes(q) ||
          p.skills.some((s) => s.toLowerCase().includes(q)) ||
          p.city.toLowerCase().includes(q),
      );
    }
    switch (sort) {
      case "price-asc":
        list.sort((a, b) => a.hourly_rate - b.hourly_rate);
        break;
      case "price-desc":
        list.sort((a, b) => b.hourly_rate - a.hourly_rate);
        break;
      case "experience":
        list.sort((a, b) => b.years_experience - a.years_experience);
        break;
      default:
        list.sort((a, b) => b.rating_avg - a.rating_avg);
    }
    return list;
  }, [activeCategory, query, sort, verifiedOnly]);

  const setCategory = (slug: CategorySlug | null) => {
    const next = new URLSearchParams(params);
    if (slug) next.set("category", slug);
    else next.delete("category");
    setParams(next);
  };

  return (
    <div className="container py-8">
      <header className="mb-6">
        <h1 className="text-3xl font-extrabold">Browse pros</h1>
        <p className="mt-1 text-muted-foreground">
          {results.length} verified-ready {results.length === 1 ? "pro" : "pros"} available
          {activeCategory ? ` in ${CATEGORIES.find((c) => c.slug === activeCategory)?.name}` : ""}.
        </p>
      </header>

      {/* search */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="flex flex-1 items-center gap-2 rounded-xl border border-input bg-white px-4 shadow-soft">
          <Search className="size-5 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, skill, or city…"
            className="h-11 flex-1 bg-transparent text-sm outline-none"
          />
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-input bg-white px-3 shadow-soft">
          <SlidersHorizontal className="size-4 text-muted-foreground" />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="h-11 bg-transparent text-sm font-medium outline-none"
          >
            <option value="rating">Top rated</option>
            <option value="price-asc">Price: low to high</option>
            <option value="price-desc">Price: high to low</option>
            <option value="experience">Most experienced</option>
          </select>
        </div>
      </div>

      {/* category pills */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          onClick={() => setCategory(null)}
          className={cn(
            "rounded-full px-4 py-2 text-sm font-semibold transition-colors",
            !activeCategory ? "bg-brand-600 text-white shadow-soft" : "bg-muted text-foreground/70 hover:bg-brand-100",
          )}
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
              className={cn(
                "flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition-colors",
                active ? "bg-brand-600 text-white shadow-soft" : "bg-muted text-foreground/70 hover:bg-brand-100",
              )}
            >
              <Icon className="size-4" /> {c.name}
            </button>
          );
        })}
        <label className="ml-auto flex cursor-pointer items-center gap-2 rounded-full border border-input bg-white px-4 py-2 text-sm font-semibold">
          <input
            type="checkbox"
            checked={verifiedOnly}
            onChange={(e) => setVerifiedOnly(e.target.checked)}
            className="size-4 accent-brand-600"
          />
          NBI-verified only
        </label>
      </div>

      {/* results */}
      {results.length > 0 ? (
        <div className="mt-7 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((p) => (
            <ProviderCard key={p.id} provider={p} />
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
              setQuery("");
              setVerifiedOnly(false);
              setCategory(null);
            }}
          >
            Clear filters
          </Button>
        </div>
      )}
    </div>
  );
}
