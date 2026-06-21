-- ════════════════════════════════════════════════════════════════════════════
--  YAYAMOVE — SEED  (optional demo data; run last)
--
--  Categories are an enum in the schema, so there's no category table to seed.
--  Provider rows are tied to real auth.users, so we don't seed fake providers
--  here — the frontend ships sample providers for demo mode instead
--  (src/lib/sampleData.ts). Add your own seed inserts below as the team grows.
-- ════════════════════════════════════════════════════════════════════════════

-- Example (uncomment once you have a real auth user id to attach):
-- insert into public.provider_profiles (user_id, headline, primary_category, hourly_rate, service_area, years_experience)
-- values ('00000000-0000-0000-0000-000000000000', 'Reliable kasambahay', 'maid', 180, 'Quezon City', 8);

select 'Yayamove seed ran. Categories are enums — nothing to insert.' as note;
