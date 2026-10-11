-- ════════════════════════════════════════════════════════════════════════════
--  MEGY PRINTS — 0046_press_sheet.sql  (idempotent; safe to re-run)
--
--  WHY: the shop prints on ONE sheet size — 12.5 × 19 in, both sides in one
--  pass, nothing printed in the outer 0.25 in — and cuts the pages into single
--  leaves glued at the spine (owner, 2026-10-11). The geometry lives in
--  src/pages/builder/printSheet.ts; printSheet.spec.ts holds this file to it.
--
--  1. PAGES PER SHEET. Every page keeps its 0.125 in trim edge; pages that
--     face each other may sit 1/8 in apart (1/16 in edge each) when that fits
--     one more row (owner chose layout "B"). What really fits:
--        6x4 16 → 12   6x6 12 → 6   8x6 4 → 6   6x8 4 → 6   (others stay 4)
--     The old 6x4/6x6 counts assumed pages with no trim edge running into the
--     printer's white edge, so those albums were billed for paper they don't
--     get. Prices follow automatically (sheets × sheet rate).
--
--  2. COVERS THAT CAN'T PRINT. The flat cover (back + spine + front + edges)
--     must fit the paper. These never fit at any page count, so an order or
--     an event deal for them is refused:
--        9x9 hardbound (≈20.2 in)  8.5x11 hardbound (≈19.2 in)
--        11.5x8 softcover (≈23.4 in) and hardbound (≈25.2 in)
--     The owner turned off 9x9 hardbound (2026-10-11); 8.5x11 and 11.5x8 are
--     already off in the store, this keeps their impossible covers off if a
--     size comes back. Checkout hides these covers (coverFitsSheet); this is
--     the database's own check.
--
--  Run AFTER 0045.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Pages per sheet ─────────────────────────────────────────────────────
update public.pricing_model
   set sizes = jsonb_set(jsonb_set(jsonb_set(jsonb_set(sizes,
         '{6x4,pps}', '12'),
         '{6x6,pps}', '6'),
         '{8x6,pps}', '6'),
         '{6x8,pps}', '6'),
       updated_at = now()
 where id = 1;

-- ── 2. Covers that can't print ─────────────────────────────────────────────
-- p_binding: 'soft' | 'hard' (an order's cover: softcover = soft, else hard).
create or replace function public.press_cover_never_fits(p_size text, p_binding text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select (p_size, p_binding) in (
    ('9x9', 'hard'),
    ('8.5x11', 'hard'),
    ('11.5x8', 'soft'),
    ('11.5x8', 'hard')
  );
$$;
revoke all on function public.press_cover_never_fits(text, text) from public, anon, authenticated;

-- Orders: checked on INSERT only, after orders_pin_album_size_trg has set the
-- size from the album (triggers run in name order: "pin" < "press"). Orders
-- already placed are untouched.
create or replace function public.orders_press_fit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.press_cover_never_fits(new.album_size,
       case when new.cover = 'softcover' then 'soft' else 'hard' end) then
    raise exception 'A % album can''t be made with this cover: the cover is too big for our printer. Choose softcover.',
      new.album_size
      using errcode = 'MP005';
  end if;
  return new;
end;
$$;
revoke all on function public.orders_press_fit() from public, anon, authenticated;

drop trigger if exists orders_press_fit_trg on public.orders;
create trigger orders_press_fit_trg
  before insert on public.orders
  for each row execute function public.orders_press_fit();

-- Event deals: the owner can't quote a cover the press can't make. Only a
-- CHANGE to the deal's size or cover is checked, so a booking quoted before
-- this migration can still move through its other steps.
create or replace function public.event_bookings_press_fit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.deal_album_size is not null and new.deal_cover is not null
     and (tg_op = 'INSERT'
          or new.deal_album_size is distinct from old.deal_album_size
          or new.deal_cover is distinct from old.deal_cover)
     and public.press_cover_never_fits(new.deal_album_size, new.deal_cover) then
    raise exception 'A % album can''t be made with a % cover: the cover is too big for the printer''s paper.',
      new.deal_album_size, new.deal_cover
      using errcode = 'MP005';
  end if;
  return new;
end;
$$;
revoke all on function public.event_bookings_press_fit() from public, anon, authenticated;

drop trigger if exists event_bookings_press_fit_trg on public.event_bookings;
create trigger event_bookings_press_fit_trg
  before insert or update on public.event_bookings
  for each row execute function public.event_bookings_press_fit();

-- ── Verify (read-only) ─────────────────────────────────────────────────────
-- select key, value->'pps' from public.pricing_model, jsonb_each(sizes) where id = 1 order by key;
-- select public.press_cover_never_fits('9x9','hard'), public.press_cover_never_fits('9x9','soft');
