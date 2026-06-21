import { useEffect, useState } from "react";
import { listProviders, getProvider, type ProviderFilter } from "@/lib/api";
import type { ProviderListItem } from "@/lib/sampleData";

export function useProviders(filter: ProviderFilter = {}) {
  const [data, setData] = useState<ProviderListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Depend on primitive filter values so we don't loop on object identity.
  const { category, city, verifiedOnly } = filter;

  useEffect(() => {
    let active = true;
    setLoading(true);
    listProviders({ category, city, verifiedOnly })
      .then((d) => active && (setData(d), setError(null)))
      .catch((e) => active && setError(e.message ?? "Failed to load"))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [category, city, verifiedOnly]);

  return { providers: data, loading, error };
}

export function useProvider(id: string | undefined) {
  const [data, setData] = useState<ProviderListItem | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    let active = true;
    setLoading(true);
    getProvider(id)
      .then((d) => active && setData(d))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [id]);

  return { provider: data, loading };
}
