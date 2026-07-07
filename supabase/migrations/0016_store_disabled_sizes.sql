-- ════════════════════════════════════════════════════════════════════════════
--  MEGY PRINTS — 0016_store_disabled_sizes.sql  (idempotent; safe to re-run)
--
--  Owner-controlled album-size availability. Any AlbumSizePreset listed in
--  store_settings.disabled_sizes is HIDDEN from the customer size picker.
--  Existing albums/orders in a hidden size still render + price + fulfill fine —
--  disabling only stops NEW albums being started at that size. Managed live from
--  /admin (Pricing panel), so sizes can be turned on/off with no redeploy.
--
--  Read/write follow the same RLS as the rest of store_settings (public read,
--  owner-only write) — see 0014.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.store_settings
  add column if not exists disabled_sizes text[] not null default '{}';

-- One-time seed: disable 8.5x11 out of the box. Its true-300-DPI print file is
-- larger than the current storage plan comfortably handles, and it's the size
-- whose quality suffers most when downscaled — so it's off until re-enabled.
-- Guarded on emptiness so a re-run never overrides a later /admin change.
update public.store_settings
  set disabled_sizes = array['8.5x11'], updated_at = now()
  where id = 1 and (disabled_sizes is null or disabled_sizes = '{}');

-- ── Verify ──────────────────────────────────────────────────────────────────
select id, price_multiple, disabled_sizes from public.store_settings where id = 1;
