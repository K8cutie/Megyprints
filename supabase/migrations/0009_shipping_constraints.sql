-- ══════════════════════════════════════════════════════════════════════════
-- Megy Prints — 0009_shipping_constraints.sql
-- Harden shipping details at the DATABASE level so a bypassing or buggy client
-- can't store junk. Mirrors src/lib/contact.ts (the app already sends canonical
-- values; these are the final backstop):
--   • ship_phone  → PH mobile in E.164:  +639XXXXXXXXX
--   • ship_name   → 2–80 chars, contains at least one letter
--   • ship_address→ 10–500 chars
-- Run AFTER 0002_orders.sql.
-- ══════════════════════════════════════════════════════════════════════════

-- ══════ 1. Best-effort normalize EXISTING rows ══════
-- Collapse name whitespace, trim address, and canonicalize the common PH phone
-- formats (0917…, +63 917…, 63917…, 9171234567 → +639XXXXXXXXX). Rows that
-- can't be canonicalized are left as-is and grandfathered by the NOT VALID
-- constraints below.
update public.orders
   set ship_name = btrim(regexp_replace(ship_name, '\s+', ' ', 'g'))
 where ship_name is not null
   and ship_name is distinct from btrim(regexp_replace(ship_name, '\s+', ' ', 'g'));

update public.orders
   set ship_address = btrim(ship_address)
 where ship_address is not null
   and ship_address is distinct from btrim(ship_address);

update public.orders
   set ship_phone = '+63' || right(regexp_replace(ship_phone, '\D', '', 'g'), 10)
 where ship_phone is not null
   and regexp_replace(ship_phone, '\D', '', 'g') ~ '^(0|63)?9\d{9}$'
   and ship_phone is distinct from '+63' || right(regexp_replace(ship_phone, '\D', '', 'g'), 10);

-- ══════ 2. Format constraints (NOT VALID: enforced on every new insert/update;
--            any legacy row that couldn't be normalized is grandfathered) ══════
alter table public.orders drop constraint if exists orders_ship_name_chk;
alter table public.orders drop constraint if exists orders_ship_phone_chk;
alter table public.orders drop constraint if exists orders_ship_address_chk;

alter table public.orders
  add constraint orders_ship_name_chk
    check (
      ship_name is not null
      and char_length(btrim(ship_name)) between 2 and 80
      and ship_name ~ '[[:alpha:]]'
    ) not valid;

alter table public.orders
  add constraint orders_ship_phone_chk
    check (ship_phone is not null and ship_phone ~ '^\+639\d{9}$') not valid;

alter table public.orders
  add constraint orders_ship_address_chk
    check (
      ship_address is not null
      and char_length(btrim(ship_address)) between 10 and 500
    ) not valid;

-- ══════ 3. Verify / go-live cleanup ══════
-- Legacy rows that would FAIL the new rules (should be EMPTY for a clean launch).
-- Review + fix these before marking the constraints VALID:
--   select id, order_number, ship_name, ship_phone, ship_address
--     from public.orders
--    where ship_phone is null or ship_phone !~ '^\+639\d{9}$'
--       or char_length(btrim(coalesce(ship_name,'')))    not between 2 and 80
--       or ship_name !~ '[[:alpha:]]'
--       or char_length(btrim(coalesce(ship_address,''))) not between 10 and 500;
--
-- Once the query above returns no rows, promote the constraints to fully VALID:
--   alter table public.orders validate constraint orders_ship_name_chk;
--   alter table public.orders validate constraint orders_ship_phone_chk;
--   alter table public.orders validate constraint orders_ship_address_chk;
