-- ══════════════════════════════════════════════════════════════════════════
-- Megy Prints — 0010_shipping_structured.sql
-- Structured PH delivery address on orders, captured via cascading PSGC pickers
-- (region → province → city/municipality → barangay + street + ZIP). The
-- composed single-line `ship_address` already exists and is length-checked
-- (0009); these columns store the routable, queryable parts + a strict ZIP.
-- Run AFTER 0002_orders.sql and 0009_shipping_constraints.sql.
-- ══════════════════════════════════════════════════════════════════════════

-- ══════ 1. Structured columns ══════
alter table public.orders add column if not exists ship_region   text;
alter table public.orders add column if not exists ship_province text;
alter table public.orders add column if not exists ship_city     text;
alter table public.orders add column if not exists ship_barangay text;
alter table public.orders add column if not exists ship_street   text;
alter table public.orders add column if not exists ship_zip      text;

-- ══════ 2. Constraints (NOT VALID: enforced on every new insert/update; any
--            pre-existing row is grandfathered) ══════
alter table public.orders drop constraint if exists orders_ship_zip_chk;
alter table public.orders drop constraint if exists orders_ship_structured_chk;

-- 4-digit PH ZIP, required on new orders.
alter table public.orders
  add constraint orders_ship_zip_chk
    check (ship_zip is not null and ship_zip ~ '^\d{4}$') not valid;

-- The delivery-critical parts must be present (region is derivable from province,
-- so it's stored but not required here).
alter table public.orders
  add constraint orders_ship_structured_chk
    check (
      char_length(btrim(coalesce(ship_province, ''))) between 1 and 120
      and char_length(btrim(coalesce(ship_city, '')))     between 1 and 120
      and char_length(btrim(coalesce(ship_barangay, ''))) between 1 and 120
      and char_length(btrim(coalesce(ship_street, '')))   between 3 and 120
    ) not valid;

-- ══════ 3. Verify / go-live ══════
-- Legacy rows that would fail (should be empty pre-launch):
--   select id, order_number, ship_province, ship_city, ship_barangay, ship_street, ship_zip
--     from public.orders
--    where ship_zip is null or ship_zip !~ '^\d{4}$'
--       or char_length(btrim(coalesce(ship_province,''))) < 1
--       or char_length(btrim(coalesce(ship_city,'')))     < 1
--       or char_length(btrim(coalesce(ship_barangay,''))) < 1
--       or char_length(btrim(coalesce(ship_street,'')))   < 3;
-- Then promote to fully VALID:
--   alter table public.orders validate constraint orders_ship_zip_chk;
--   alter table public.orders validate constraint orders_ship_structured_chk;
