-- ═══════════════════════════════════════════════════════════════════════════
--  MEGY PRINTS — 0055_order_quoted_total.sql  (idempotent; safe to re-run)
--
--  WHY (owner, 2026-10-26): "have the database work out the total each
--  customer was asked to pay (album, extra pages, extra QR, memory years, HD),
--  save it with the order, show it on the admin Orders page". The Pay screen
--  shows that total, but no order kept it: amount is NULL on every order (the
--  insert policy pins it NULL and nothing else sets it), so a GoTyme deposit
--  had nothing on the order to be matched against.
--
--  WHAT:
--   1. album_qr_count(pages): the QR memories on an album, counted the way the
--      checkout counts them (pricing.ts countQrMemories): every entry of each
--      page's qrFills and textSlotQr that JavaScript reads as true.
--   2. order_quote(size, cover, pages, qr, years, hd[, schedule]): the
--      checkout's priceBreakdown() in SQL, on the same public_price_schedule(),
--      with the same rounding (JavaScript's Math.round on doubles), so the two
--      can't disagree on a peso. Returns the total and its parts.
--   3. orders.quoted_amount + orders.quote: worked out by the database as the
--      order is placed, from the order's own size, cover and page count (after
--      orders_pin_album_size), the album's QR memories, and the memory years
--      and HD it was placed with. A client can't set them and nobody can
--      change them after: they are what the customer was asked to pay.
--   4. operator_orders() returns them, owner only (like amount).
--
--  Orders placed before this have no quote: prices may have changed since.
--  Run AFTER 0052. (0053 and 0054 belong to other open changes and touch
--  none of this; whichever is pushed after this one needs --include-all.)
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.orders add column if not exists quoted_amount integer;
alter table public.orders add column if not exists quote jsonb;

-- ══════ 1. QR memories on an album ══════
create or replace function public.album_qr_count(p_pages jsonb)
returns integer
language sql
immutable
set search_path = ''
as $$
  select coalesce(sum(
           case jsonb_typeof(f)
             when 'null'    then 0
             when 'boolean' then case when f = 'true'::jsonb then 1 else 0 end
             when 'number'  then case when (f #>> '{}')::numeric <> 0 then 1 else 0 end
             when 'string'  then case when (f #>> '{}') <> '' then 1 else 0 end
             else 1
           end), 0)::integer
    from jsonb_array_elements(case when jsonb_typeof(p_pages) = 'array' then p_pages else '[]'::jsonb end) p,
         jsonb_array_elements(
           (case when jsonb_typeof(p -> 'qrFills') = 'array' then p -> 'qrFills' else '[]'::jsonb end)
           || (case when jsonb_typeof(p -> 'textSlotQr') = 'array' then p -> 'textSlotQr' else '[]'::jsonb end)) f;
$$;
revoke all on function public.album_qr_count(jsonb) from public, anon, authenticated;

-- ══════ 2. The checkout's total, in SQL ══════
-- Every rounding is JavaScript's Math.round on a double: floor(x + 0.5) in
-- float8, so a rate like 66.25 lands on the same peso as on the phone.
create or replace function public.order_quote(
  p_size text, p_cover text, p_pages integer, p_qr integer, p_years integer, p_hd boolean,
  p_schedule jsonb default null)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  s         jsonb := coalesce(p_schedule, public.public_price_schedule());
  z         jsonb;
  min_p     integer;
  pps       integer;
  cover     float8;
  sheet     float8;
  reserve   integer := 0;
  pages     integer := greatest(coalesce(p_pages, 0), 0);
  qr        integer := greatest(coalesce(p_qr, 0), 0);
  album_min integer;
  album     integer;
  qr_fee    integer;
  term      integer := 0;
  years     integer := null;
  hd        integer := 0;
  n         float8;
begin
  if s is null or p_size is null then return null; end if;
  z := s -> 'sizes' -> p_size;
  if z is null or jsonb_typeof(z) <> 'object' then return null; end if;
  min_p := (s ->> 'min_pages')::integer;
  pps   := (z ->> 'pps')::integer;
  sheet := (s ->> 'sheet_rate')::float8;
  -- pricing.ts: binding = cover === 'softcover' ? 'soft' : 'hard'
  cover := case when p_cover = 'softcover' then (z ->> 'soft_rate')::float8 else (z ->> 'hard_rate')::float8 end;
  if min_p is null or pps is null or pps < 1 or sheet is null or cover is null then return null; end if;
  n := (s ->> 'hosting_reserve')::float8;
  if n > 0 then reserve := floor(n + 0.5)::integer; end if;

  -- priceOf(): Math.round(sheets × sheet_rate + cover rate) + the reserve;
  -- sheets = ceil(max(min pages, pages) / pages a sheet).
  album_min := floor(ceil(min_p::numeric / pps)::integer * sheet + cover + 0.5)::integer + reserve;
  album     := floor(ceil(greatest(min_p, pages)::numeric / pps)::integer * sheet + cover + 0.5)::integer + reserve;

  -- qrMemoryCharge(): 7 included, ₱20 each past that (FREE_QR_MEMORIES, EXTRA_QR_RATE).
  qr_fee := greatest(0, qr - 7) * 20;

  -- hostingTermCharge(): the chosen term's tier price. The checkout only sets a
  -- term when the album carries QR memories (effectiveYears).
  if qr > 0 and p_years is not null and jsonb_typeof(s -> 'hosting_tiers') = 'array' then
    years := p_years;
    select greatest(0, floor((t ->> 'price')::float8 + 0.5))::integer into term
      from jsonb_array_elements(s -> 'hosting_tiers') with ordinality x(t, i)
     where jsonb_typeof(t) = 'object'
       and (t ->> 'years') ~ '^\s*-?[0-9]+(\.[0-9]+)?\s*$'
       and (t ->> 'price') ~ '^\s*-?[0-9]+(\.[0-9]+)?\s*$'
       and floor((t ->> 'years')::float8 + 0.5) >= 1
       and floor((t ->> 'years')::float8 + 0.5) = p_years
     order by floor((t ->> 'years')::float8 + 0.5), i
     limit 1;
    term := coalesce(term, 0);
  end if;

  -- hdMemoriesCharge(): only when the album carries memories.
  if coalesce(p_hd, false) and qr > 0 then
    n := (s ->> 'hd_memories_price')::float8;
    if n > 0 then hd := floor(n + 0.5)::integer; end if;
  end if;

  return jsonb_build_object(
    'total',           album + qr_fee + term + hd,
    'album',           album_min,
    'extra_pages',     greatest(0, pages - min_p),
    'extra_pages_fee', album - album_min,
    'qr',              qr,
    'extra_qr',        greatest(0, qr - 7),
    'qr_fee',          qr_fee,
    'years',           years,
    'term_fee',        term,
    'hd_fee',          hd
  );
end
$$;
revoke all on function public.order_quote(text, text, integer, integer, integer, boolean, jsonb) from public, anon, authenticated;

-- ══════ 3. Saved with every new order, never changed after ══════
-- SECURITY DEFINER to read the ordering customer's own album (as
-- orders_pin_album_size does). Named so it runs after orders_pin_album_size_trg
-- and orders_press_fit_trg (BEFORE triggers fire in name order), on the
-- size and page count the database settled on.
create or replace function public.orders_quote()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pages jsonb;
  q       jsonb;
begin
  if tg_op = 'UPDATE' then
    new.quoted_amount := old.quoted_amount;
    new.quote         := old.quote;
    return new;
  end if;
  begin
    select al.pages into v_pages
      from public.albums al
     where al.id = new.album_id and al.user_id = new.user_id;
    if v_pages is null then v_pages := new.album_snapshot -> 'pages'; end if;
    q := public.order_quote(new.album_size, new.cover, new.page_count,
                            public.album_qr_count(v_pages), new.hosting_years, coalesce(new.hd_memories, false));
  exception when others then
    -- A record, not a gate: a price that can't be worked out never stops an order.
    q := null;
  end;
  new.quote         := q;
  new.quoted_amount := (q ->> 'total')::integer;
  return new;
end;
$$;
revoke all on function public.orders_quote() from public, anon, authenticated;

drop trigger if exists orders_quote_trg on public.orders;
create trigger orders_quote_trg
  before insert or update on public.orders
  for each row execute function public.orders_quote();

-- ══════ 4. The console reads it (owner only, like amount) ══════
-- 0045's operator_orders plus quoted_amount and quote.
drop function if exists public.operator_orders(integer, integer);
create function public.operator_orders(p_limit integer default 100, p_offset integer default 0)
returns table (
  id uuid, order_number text, status text, payment_status text, amount numeric,
  currency text, album_size text, material text, cover text, page_count integer,
  hosting_years integer, hd_memories boolean,
  ship_name text, ship_phone text, ship_address text, tracking text,
  payment_reference text, payment_proof_path text, payment_submitted_at timestamptz,
  created_at timestamptz, updated_at timestamptz,
  copy_of_order_id uuid, copy_of_order_number text, event_booking_number text,
  quoted_amount integer, quote jsonb
)
language plpgsql stable security definer set search_path = public as $$
declare r text;
begin
  r := public.operator_role();
  if r is null then return; end if;
  return query
    select o.id, o.order_number, o.status::text, o.payment_status,
           case when r = 'owner' then o.amount else null end,
           o.currency, o.album_size, o.material, o.cover, o.page_count,
           o.hosting_years, o.hd_memories,
           o.ship_name, o.ship_phone, o.ship_address, o.tracking,
           o.payment_reference, o.payment_proof_path, o.payment_submitted_at,
           o.created_at, o.updated_at,
           o.copy_of_order_id, src.order_number, eb.booking_number,
           case when r = 'owner' then o.quoted_amount else null end,
           case when r = 'owner' then o.quote else null end
    from public.orders o
    left join public.orders src on src.id = o.copy_of_order_id
    left join public.event_bookings eb on eb.id = o.event_booking_id
    order by o.created_at desc
    limit greatest(1, least(coalesce(p_limit, 100), 500))
    offset greatest(0, coalesce(p_offset, 0));
end;
$$;
revoke all on function public.operator_orders(integer, integer) from public;
revoke execute on function public.operator_orders(integer, integer) from anon;
grant execute on function public.operator_orders(integer, integer) to authenticated;

-- ══════ Verify ══════
select 'orders carry quoted_amount + quote, set by orders_quote_trg' as check,
  ((select count(*) from information_schema.columns
     where table_schema = 'public' and table_name = 'orders' and column_name in ('quoted_amount', 'quote')) = 2
   and exists (select 1 from pg_trigger where tgname = 'orders_quote_trg' and not tgisinternal))::text as result
union all
select 'quote functions not callable by anon/authenticated',
  (not has_function_privilege('anon', 'public.order_quote(text, text, integer, integer, integer, boolean, jsonb)', 'EXECUTE')
   and not has_function_privilege('authenticated', 'public.order_quote(text, text, integer, integer, integer, boolean, jsonb)', 'EXECUTE')
   and not has_function_privilege('authenticated', 'public.album_qr_count(jsonb)', 'EXECUTE'))::text
union all
select 'operator_orders: authenticated yes, anon no',
  (has_function_privilege('authenticated', 'public.operator_orders(integer, integer)', 'EXECUTE')
   and not has_function_privilege('anon', 'public.operator_orders(integer, integer)', 'EXECUTE'))::text;
