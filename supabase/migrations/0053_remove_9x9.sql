-- ════════════════════════════════════════════════════════════════════════════
--  MEGY PRINTS — 0053_remove_9x9.sql  (idempotent; safe to re-run)
--
--  WHY: the owner removed the 9x9 album (2026-10-24). The app no longer offers
--  it, and an album saved at 9x9 opens as 8x8: the same square page, with the
--  same layouts and photos (src/pages/builder/retiredSizes.ts). This is the
--  database's side:
--
--  1. store_settings.disabled_sizes gets 9x9, so an app copy loaded before
--     this release (a tab left open) stops offering it too.
--  2. pricing_model drops its 9x9 row. Nothing is priced at 9x9 any more.
--  3. Albums saved at 9x9 now say 8x8. An order takes its size from its album
--     (orders_pin_album_size), so an old 9x9 album orders as the 8x8 the app
--     shows. Their pages keep their layout ids; the app reads a 9x9 layout id
--     as its 8x8 twin. (updated_at moves, as on any album write.)
--  4. A new order for a 9x9 album is refused (MP006). albums.album_size is
--     free text a customer can PATCH, so the app's word isn't enough. Orders
--     already placed are untouched.
--  5. An event deal can't be quoted at 9x9 (the size check loses it).
--
--  Run AFTER the code that removes 9x9 is deployed: before it, the app would
--  still offer 9x9 with no price to charge for it.
-- ════════════════════════════════════════════════════════════════════════════

-- Sizes we no longer make. albums.album_size is free text, so compare a
-- normalised size: '9X9', ' 9x9 ', '9×9' and '9x9"' are all 9x9 (as 0046).
create or replace function public.retired_album_size(p_size text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(lower(translate(coalesce(p_size, ''), '×', 'x')), '[^0-9.x]', '', 'g') in ('9x9');
$$;
revoke all on function public.retired_album_size(text) from public, anon, authenticated;

-- ── 1. Hidden in app copies from before this release ───────────────────────
update public.store_settings
   set disabled_sizes = array_append(disabled_sizes, '9x9'), updated_at = now()
 where id = 1 and not ('9x9' = any (disabled_sizes));

-- ── 2. No price ────────────────────────────────────────────────────────────
update public.pricing_model
   set sizes = sizes - '9x9', updated_at = now()
 where id = 1 and sizes -> '9x9' is not null;

-- ── 3. Saved 9x9 albums are 8x8 ────────────────────────────────────────────
update public.albums
   set album_size = '8x8'
 where public.retired_album_size(album_size);

-- ── 4. No new 9x9 order ────────────────────────────────────────────────────
-- Checked on INSERT only, after orders_pin_album_size_trg has set the size
-- from the album (triggers run in name order: "pin" < "press" < "size").
create or replace function public.orders_size_retired()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.retired_album_size(new.album_size) then
    raise exception 'We no longer make 9x9 albums. Open your album again: it is now 8x8.'
      using errcode = 'MP006';
  end if;
  return new;
end;
$$;
revoke all on function public.orders_size_retired() from public, anon, authenticated;

drop trigger if exists orders_size_retired_trg on public.orders;
create trigger orders_size_retired_trg
  before insert on public.orders
  for each row execute function public.orders_size_retired();

-- ── 5. No 9x9 event deal ───────────────────────────────────────────────────
alter table public.event_bookings drop constraint if exists event_bookings_size_chk;
alter table public.event_bookings add constraint event_bookings_size_chk
  check (deal_album_size is null or deal_album_size in ('6x6', '8x8', '6x4', '8x6', '6x8', '11.5x8', '8.5x11'));

-- ── Verify (read-only) ─────────────────────────────────────────────────────
-- select disabled_sizes from public.store_settings where id = 1;            -- has 9x9
-- select sizes -> '9x9' from public.pricing_model where id = 1;             -- null
-- select count(*) from public.albums where public.retired_album_size(album_size); -- 0
-- Full proof (rolled back): supabase/security/remove-9x9-proof.sql
