-- ══════════════════════════════════════════════════════════════════════════
-- Megy Prints — 0011_shipping_hardening.sql
-- Close the data-integrity gaps a red-team of the checkout surface found:
--   • ship_region had NO constraint (the one unprotected structured field).
--   • ship_street passed the length check with pure punctuation ("...", emoji).
--   • give the composed ship_address more length headroom (was 500; realistic
--     max is ~226 but keep margin so a valid selection never fails the CHECK).
-- All NOT VALID: enforced on new writes, pre-existing rows grandfathered.
-- Run AFTER 0009 and 0010.
-- ══════════════════════════════════════════════════════════════════════════

-- ── ship_region backstop (Finding 2) ──
alter table public.orders drop constraint if exists orders_ship_region_chk;
alter table public.orders
  add constraint orders_ship_region_chk
    check (char_length(btrim(coalesce(ship_region, ''))) between 1 and 120) not valid;

-- ── street must contain a letter or digit, not just punctuation (Finding 3) ──
alter table public.orders drop constraint if exists orders_ship_structured_chk;
alter table public.orders
  add constraint orders_ship_structured_chk
    check (
      char_length(btrim(coalesce(ship_province, ''))) between 1 and 120
      and char_length(btrim(coalesce(ship_city, '')))     between 1 and 120
      and char_length(btrim(coalesce(ship_barangay, ''))) between 1 and 120
      and char_length(btrim(coalesce(ship_street, '')))   between 3 and 120
      and ship_street ~ '[[:alnum:]]'
    ) not valid;

-- ── more headroom on the composed single-line address (Finding 7) ──
alter table public.orders drop constraint if exists orders_ship_address_chk;
alter table public.orders
  add constraint orders_ship_address_chk
    check (ship_address is not null and char_length(btrim(ship_address)) between 10 and 600) not valid;
