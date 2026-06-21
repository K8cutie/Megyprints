-- ════════════════════════════════════════════════════════════════════════════
--  YAYAMOVE — PUBLIC PROVIDER DIRECTORY FIELDS  (0006)
--  Run after 0005. Idempotent.
--
--  The provider listing is PUBLIC, but a provider's name/city live on the
--  private `profiles` table (owner-only RLS). Rather than expose `profiles`,
--  we denormalize the few public-safe fields onto `provider_profiles` (which is
--  already publicly readable). This keeps the directory a single, index-friendly,
--  no-join query — cheaper and with a smaller privacy surface.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.provider_profiles
  add column if not exists display_name text not null default '',
  add column if not exists city         text,
  add column if not exists barangay     text,
  add column if not exists lat          double precision,
  add column if not exists lng          double precision;

-- Helps "browse by city" and map-bounds queries.
create index if not exists idx_provider_city on public.provider_profiles(city);
create index if not exists idx_provider_geo  on public.provider_profiles(lat, lng);
