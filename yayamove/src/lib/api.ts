/**
 * Data layer — the single place the app talks to the backend.
 *
 * When Supabase is configured, every function runs a real query against the
 * schema in `supabase/migrations/`. When it isn't, the same functions return
 * sample data so the app is fully demoable. Pages never branch on this — they
 * just `await` these helpers, so going live is a config change, not a rewrite.
 */
import { supabase } from "./supabase";
import { SAMPLE_PROVIDERS, type ProviderListItem } from "./sampleData";
import type { CategorySlug, Database } from "@/types/database";

type JobInsert = Database["public"]["Tables"]["jobs"]["Insert"];
type BookingInsert = Database["public"]["Tables"]["bookings"]["Insert"];

/** Default page size for growing lists (cost: bounded reads, see COST.md). */
export const PAGE_SIZE = 24;

export interface ProviderFilter {
  category?: CategorySlug | null;
  city?: string | null;
  verifiedOnly?: boolean;
  /** zero-based page for pagination */
  page?: number;
}

// Small artificial delay so demo-mode loading states are visible/realistic.
const tick = () => new Promise((r) => setTimeout(r, 250));

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapRow(row: any): ProviderListItem {
  return {
    id: row.id,
    name: row.display_name ?? "",
    headline: row.headline ?? "",
    primary_category: row.primary_category,
    city: row.city ?? "",
    barangay: row.barangay ?? "",
    lat: row.lat ?? 0,
    lng: row.lng ?? 0,
    service_area: row.service_area ?? "",
    hourly_rate: Number(row.hourly_rate ?? 0),
    years_experience: row.years_experience ?? 0,
    rating_avg: Number(row.rating_avg ?? 0),
    rating_count: row.rating_count ?? 0,
    jobs_completed: row.jobs_completed ?? 0,
    verified: row.verification_status === "verified",
    skills: (row.provider_skills ?? []).map((s: any) => s.skill),
    bio: row.bio ?? "",
  };
}

const SELECT =
  "id, display_name, headline, bio, primary_category, hourly_rate, service_area, city, barangay, lat, lng, years_experience, verification_status, rating_avg, rating_count, jobs_completed, provider_skills(skill)";

export async function listProviders(filter: ProviderFilter = {}): Promise<ProviderListItem[]> {
  if (!supabase) {
    await tick();
    return SAMPLE_PROVIDERS.filter(
      (p) =>
        (!filter.category || p.primary_category === filter.category) &&
        (!filter.city || p.city === filter.city) &&
        (!filter.verifiedOnly || p.verified),
    );
  }

  const page = filter.page ?? 0;
  let q = supabase.from("provider_profiles").select(SELECT);
  if (filter.category) q = q.eq("primary_category", filter.category);
  if (filter.city) q = q.eq("city", filter.city);
  if (filter.verifiedOnly) q = q.eq("verification_status", "verified");
  // Bounded read: never pull the whole table, and never silently hit the 1000-row cap.
  const { data, error } = await q
    .order("rating_avg", { ascending: false })
    .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
  if (error) throw error;
  return (data ?? []).map(mapRow);
}

export async function getProvider(id: string): Promise<ProviderListItem | null> {
  if (!supabase) {
    await tick();
    return SAMPLE_PROVIDERS.find((p) => p.id === id) ?? null;
  }
  const { data, error } = await supabase
    .from("provider_profiles")
    .select(SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? mapRow(data) : null;
}

/* ── Jobs & bookings (writes) ──────────────────────────────────────────────
   In demo mode these resolve successfully without persisting, so the flows are
   clickable; live mode inserts under RLS (seeker_id / provider scoping). */

export interface NewJob {
  category: CategorySlug;
  title: string;
  description: string;
  city?: string;
  budget_min?: number;
  budget_max?: number;
}

export async function createJob(job: NewJob): Promise<{ ok: boolean }> {
  if (!supabase) {
    await tick();
    return { ok: true };
  }
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error("You must be signed in to post a job.");
  // `row` is validated against the table's Insert shape (catches column typos);
  // `as never` only sidesteps the hand-written Database type's builder friction.
  const row: JobInsert = { ...job, seeker_id: uid };
  const { error } = await supabase.from("jobs").insert(row as never);
  if (error) throw error;
  return { ok: true };
}

export interface NewBooking {
  provider_id: string;
  category: CategorySlug;
  scheduled_for?: string;
  address?: string;
  notes?: string;
  amount?: number;
}

export async function createBooking(booking: NewBooking): Promise<{ ok: boolean }> {
  if (!supabase) {
    await tick();
    return { ok: true };
  }
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error("You must be signed in to book.");
  const row: BookingInsert = { ...booking, seeker_id: uid };
  const { error } = await supabase.from("bookings").insert(row as never);
  if (error) throw error;
  return { ok: true };
}
