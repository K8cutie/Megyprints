-- ════════════════════════════════════════════════════════════════════════════
--  MEGY PRINTS — 0076_mini_a4.sql  (idempotent; safe to re-run)
--
--  WHY (owner, 2026-11-27): "lets make megy mini as an a4 and price it at 450
--  and 550 respectively. Plus shipping." The Megy Mini becomes an A4 booklet
--  ('8.3x11.7', 210 x 297 mm), 16 pages ₱450 or 24 pages ₱550, shipping on
--  top. It was A5 ('5.8x8.3').
--
--  THE SWITCH: pricing_model.mini_size says which Mini is on sale. It starts
--  at A5, so applying this changes nothing anyone sees. The price list names
--  that size (mini.size), and an app offers the Mini only when the size is its
--  own (lib/megyMini miniOfferOf): apps before 2.1.8 make A5, 2.1.8 makes A4.
--  So the day the A4 app is live, ONE update moves the size and the prices
--  together (see the end of this file); from then the older apps stop offering
--  the Mini instead of selling A5 at A4's price, and an A5 Mini a customer
--  already started opens as A4 in the new app (same shape, same layouts).
--
--  What changes:
--    1. pricing_model.mini_size ('5.8x8.3' or '8.3x11.7'; '5.8x8.3' now);
--    2. public_price_schedule(): mini.size is mini_size (was always A5);
--    3. owner_pricing_model() shows mini_size;
--    4. order_quote(): a Mini at either size is priced only when it is the
--       size on sale (null otherwise, so it can't be ordered);
--    5. orders_quote(): a Mini order is A4 or A5 with staples (MP020); one at
--       the size not on sale is refused as not on sale (MP022). Orders placed
--       before keep their quote (an UPDATE never re-quotes), and A5 orders
--       still print as A5;
--    6. set_megy_mini_size() (owner only) moves the size.
--
--  Every other price and rule is unchanged (0075's text, == live 2026-11-27,
--  with only the size lines changed).
--
--  ⚠ Open drafts that redefine these functions must carry the mini_size lines
--  too: 0070 (#317: public_price_schedule, owner_pricing_model) and 0073
--  (#327: order_quote).
-- ════════════════════════════════════════════════════════════════════════════

-- ══════ 1. Which Mini is on sale ══════
alter table public.pricing_model add column if not exists mini_size text not null default '5.8x8.3';

alter table public.pricing_model drop constraint if exists pricing_model_mini_size_chk;
alter table public.pricing_model add constraint pricing_model_mini_size_chk check (
  mini_size in ('5.8x8.3', '8.3x11.7'));

-- ══════ 2. The price list (0075's, the Mini's size from mini_size) ══════
create or replace function public.public_price_schedule()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  m          public.pricing_model%rowtype;
  srow       jsonb;
  mult       numeric;
  disabled   jsonb;
  out_sizes  jsonb := '{}'::jsonb;
  cmp_sizes  jsonb := '{}'::jsonb;
  compare    jsonb := null;
  mini       jsonb := null;
  show_cmp   boolean;
  ship       numeric;
  reserve    numeric;
  sheet_rate numeric;
  base       numeric;
  k          text;
  v          jsonb;
begin
  select * into m from public.pricing_model where id = 1;
  if not found then
    return null;
  end if;

  select to_jsonb(s) into srow from public.store_settings s where s.id = 1;
  mult     := coalesce((srow ->> 'price_multiple')::numeric, 3);
  disabled := coalesce(srow -> 'disabled_sizes', '[]'::jsonb);
  ship     := greatest(coalesce(m.shipping_allowance, 0), 0);
  reserve  := greatest(coalesce(m.hosting_reserve, 0), 0);
  sheet_rate := m.sheet_cost * mult;
  show_cmp := m.compare_multiple is not null and m.compare_until is not null
              and m.compare_multiple > mult
              and m.compare_until >= (now() at time zone 'Asia/Manila')::date;

  for k, v in select * from jsonb_each(m.sizes) loop
    -- The sheets in the smallest album, which a set price already pays for.
    base := ceil(m.min_pages::numeric / (v ->> 'pps')::int) * sheet_rate + reserve;
    out_sizes := out_sizes || jsonb_build_object(k, jsonb_build_object(
      'pps',       (v ->> 'pps')::int,
      -- A set price (0074) wins; otherwise the multiple. Shipping rides inside
      -- the rate: flat, never multiplied.
      'soft_rate', case when jsonb_typeof(v -> 'price_soft') = 'number'
                        then (v ->> 'price_soft')::numeric - base
                        else (m.soft_cover_cost + m.soft_bind_cost) * mult + (v ->> 'surcharge')::numeric + ship end,
      'hard_rate', case when jsonb_typeof(v -> 'price_hard') = 'number'
                        then (v ->> 'price_hard')::numeric - base
                        else (v ->> 'hb')::numeric * mult + (v ->> 'surcharge')::numeric + ship end
    ));
    if show_cmp then
      cmp_sizes := cmp_sizes || jsonb_build_object(k, jsonb_build_object(
        'soft_rate', (m.soft_cover_cost + m.soft_bind_cost) * m.compare_multiple + (v ->> 'surcharge')::numeric + reserve,
        'hard_rate', (v ->> 'hb')::numeric * m.compare_multiple + (v ->> 'surcharge')::numeric + reserve
      ));
    end if;
  end loop;

  if show_cmp then
    compare := jsonb_build_object(
      'until',      to_char(m.compare_until, 'YYYY-MM-DD'),
      'sheet_rate', m.sheet_cost * m.compare_multiple,
      'sizes',      cmp_sizes
    );
  end if;

  if coalesce((srow ->> 'mini_on')::boolean, false) and m.mini_shipping_fee is not null then
    mini := jsonb_build_object(
      -- 0076: the Mini on sale, A5 or A4; an app offers only its own size.
      'size',          m.mini_size,
      'cover',         'staple',
      'pages',         16,
      'price',         m.mini_price,
      'package_price', m.mini_package_price,
      'shipping_fee',  m.mini_shipping_fee,
      'free_qr',       m.mini_free_qr,
      -- 0075: every page count on sale. The top-level pages/price above stay
      -- the 16-page Mini, for app versions that read only those.
      'options',       jsonb_build_array(
        jsonb_build_object('pages', 16, 'price', m.mini_price,    'package_price', m.mini_package_price),
        jsonb_build_object('pages', 24, 'price', m.mini24_price, 'package_price', m.mini24_package_price))
    );
  end if;

  return jsonb_build_object(
    'min_pages',           m.min_pages,
    'sheet_rate',          sheet_rate,
    'hosting_reserve',     m.hosting_reserve,
    'hosting_tiers',       m.hosting_tiers,
    'hd_memories_price',   m.hd_memories_price,
    'long_video_prices',   jsonb_build_object('3', m.video_3min_price, '5', m.video_5min_price),
    'free_shipping_value', ship,
    'compare_at',          compare,
    'disabled_sizes',      disabled,
    'sizes',               out_sizes,
    'mini',                mini
  );
end
$$;
revoke all on function public.public_price_schedule() from public;
grant execute on function public.public_price_schedule() to anon, authenticated;

-- ══════ 3. The owner's view shows it ══════
create or replace function public.owner_pricing_model()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  m    public.pricing_model%rowtype;
  srow jsonb;
begin
  if not public.is_owner() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select * into m from public.pricing_model where id = 1;
  if not found then return null; end if;
  select to_jsonb(s) into srow from public.store_settings s where s.id = 1;

  return jsonb_build_object(
    'sheet_cost',           m.sheet_cost,
    'soft_cover_cost',      m.soft_cover_cost,
    'soft_bind_cost',       m.soft_bind_cost,
    'min_pages',            m.min_pages,
    'hosting_reserve',      m.hosting_reserve,
    'hosting_tiers',        m.hosting_tiers,
    'hd_memories_price',    m.hd_memories_price,
    'video_3min_price',     m.video_3min_price,
    'video_5min_price',     m.video_5min_price,
    'shipping_allowance',   m.shipping_allowance,
    'compare_multiple',     m.compare_multiple,
    'compare_until',        to_char(m.compare_until, 'YYYY-MM-DD'),
    'sizes',                m.sizes,
    'price_multiple',       coalesce((srow ->> 'price_multiple')::numeric, 3),
    'mini_on',              coalesce((srow ->> 'mini_on')::boolean, false),
    'mini_price',           m.mini_price,
    'mini_package_price',   m.mini_package_price,
    'mini_shipping_fee',    m.mini_shipping_fee,
    'mini_free_qr',         m.mini_free_qr,
    'mini_cost',            m.mini_cost,
    'mini_hosting_reserve', m.mini_hosting_reserve,
    'mini24_price',         m.mini24_price,
    'mini24_package_price', m.mini24_package_price,
    'mini24_cost',          m.mini24_cost,
    'mini_size',            m.mini_size
  );
end
$$;
revoke all on function public.owner_pricing_model() from public;
revoke execute on function public.owner_pricing_model() from anon;
grant execute on function public.owner_pricing_model() to authenticated;

-- ══════ 4. The checkout's total (0075's; a Mini only at the size on sale) ══════
create or replace function public.order_quote(
  p_size text, p_cover text, p_pages integer, p_qr integer, p_years integer, p_hd boolean,
  p_schedule jsonb default null, p_minutes integer default null)
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
  long_fee  integer := 0;
  minutes   integer := 2;
  n         float8;
  free_qr   integer;
  price     integer;
  ship      integer;
  packs     integer := 0;
begin
  if s is null or p_size is null then return null; end if;

  -- hostingTermCharge(): the chosen term's tier price. The checkout only sets a
  -- term when the book carries QR memories (effectiveYears).
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

  -- hdMemoriesCharge(): only when the book carries memories.
  if coalesce(p_hd, false) and qr > 0 then
    n := (s ->> 'hd_memories_price')::float8;
    if n > 0 then hd := floor(n + 0.5)::integer; end if;
  end if;

  -- longVideoCharge(): the album's longest-video tier, only when the book
  -- carries memories and the price list sells it.
  if qr > 0 and p_minutes in (3, 5) and jsonb_typeof(s -> 'long_video_prices') = 'object' then
    n := (s -> 'long_video_prices' ->> p_minutes::text)::float8;
    if n > 0 then
      long_fee := floor(n + 0.5)::integer;
      minutes  := p_minutes;
    end if;
  end if;

  -- ── Megy Mini: a set price, shipping on top, its own free QR count ──
  -- 0076: A4 or A5, priced only when it is the size on sale (mini.size).
  if p_size in ('5.8x8.3', '8.3x11.7') then
    z := s -> 'mini';
    if z is null or jsonb_typeof(z) <> 'object' or p_cover is distinct from 'staple'
       or (z ->> 'size') is distinct from p_size then
      return null;
    end if;
    -- 0075: the price for the order's page count (16 or 24); a list
    -- without options (before 0075) sells 16 pages only.
    if jsonb_typeof(z -> 'options') = 'array' then
      select (o ->> 'price')::integer into price
        from jsonb_array_elements(z -> 'options') o
       where (o ->> 'pages') ~ '^[0-9]+$' and (o ->> 'pages')::integer = pages
       limit 1;
    elsif pages = 16 then
      price := (z ->> 'price')::integer;
    end if;
    ship    := (z ->> 'shipping_fee')::integer;
    free_qr := greatest(coalesce((z ->> 'free_qr')::integer, 0), 0);
    if price is null or ship is null then return null; end if;
    packs  := ceil(greatest(0, qr - free_qr)::numeric / 3)::integer;
    qr_fee := packs * 100;
    return jsonb_build_object(
      'product',         'mini',
      'pages',           pages,
      'total',           price + ship + qr_fee + term + hd + long_fee,
      'album',           price,
      'shipping',        ship,
      'extra_pages',     0,
      'extra_pages_fee', 0,
      'qr',              qr,
      'free_qr',         free_qr,
      'extra_qr',        greatest(0, qr - free_qr),
      'qr_packs',        packs,
      'qr_fee',          qr_fee,
      'years',           years,
      'term_fee',        term,
      'hd_fee',          hd,
      'video_minutes',   minutes,
      'long_fee',        long_fee
    );
  end if;

  -- ── Albums (0066, unchanged) ──
  z := s -> 'sizes' -> p_size;
  if z is null or jsonb_typeof(z) <> 'object' then return null; end if;
  min_p := (s ->> 'min_pages')::integer;
  pps   := (z ->> 'pps')::integer;
  sheet := (s ->> 'sheet_rate')::float8;
  cover := case when p_cover = 'softcover' then (z ->> 'soft_rate')::float8 else (z ->> 'hard_rate')::float8 end;
  if min_p is null or pps is null or pps < 1 or sheet is null or cover is null then return null; end if;
  n := (s ->> 'hosting_reserve')::float8;
  if n > 0 then reserve := floor(n + 0.5)::integer; end if;

  album_min := floor(ceil(min_p::numeric / pps)::integer * sheet + cover + 0.5)::integer + reserve;
  album     := floor(ceil(greatest(min_p, pages)::numeric / pps)::integer * sheet + cover + 0.5)::integer + reserve;
  packs  := ceil(greatest(0, qr - 2)::numeric / 3)::integer;
  qr_fee := packs * 100;

  return jsonb_build_object(
    'total',           album + qr_fee + term + hd + long_fee,
    'album',           album_min,
    'extra_pages',     greatest(0, pages - min_p),
    'extra_pages_fee', album - album_min,
    'qr',              qr,
    'free_qr',         2,
    'extra_qr',        greatest(0, qr - 2),
    'qr_packs',        packs,
    'qr_fee',          qr_fee,
    'years',           years,
    'term_fee',        term,
    'hd_fee',          hd,
    'video_minutes',   minutes,
    'long_fee',        long_fee
  );
end
$$;
revoke all on function public.order_quote(text, text, integer, integer, integer, boolean, jsonb, integer) from public, anon, authenticated;

-- ══════ 5. A Mini order is A4 or A5 with staples ══════
create or replace function public.orders_quote()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pages jsonb;
  q       jsonb;
  v_mini  boolean;
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
                            public.album_qr_count(v_pages), new.hosting_years, coalesce(new.hd_memories, false),
                            null, new.video_minutes);
  exception when others then
    -- A record, not a gate: a price that can't be worked out never stops an album order.
    q := null;
  end;

  -- A Megy Mini has one shape and one price, so it IS a gate. 0076: A4, or
  -- A5 from before; one at the size not on sale gets no quote (MP022 below).
  v_mini := new.album_size in ('5.8x8.3', '8.3x11.7') or new.cover = 'staple';
  if v_mini then
    if new.album_size is null or new.album_size not in ('5.8x8.3', '8.3x11.7')
       or new.cover is distinct from 'staple' then
      raise exception 'A Megy Mini is A4 with staples.' using errcode = 'MP020';
    end if;
    if coalesce(new.page_count, 0) not in (16, 24) then
      raise exception 'A Megy Mini has 16 or 24 pages.' using errcode = 'MP021';
    end if;
    if q is null then
      raise exception 'Megy Mini isn''t on sale right now.' using errcode = 'MP022';
    end if;
  end if;

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

-- ══════ 6. The owner moves the Mini on sale ══════
create or replace function public.set_megy_mini_size(p_size text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if not public.is_owner() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_size is null or p_size not in ('5.8x8.3', '8.3x11.7') then
    raise exception 'The Megy Mini is A4 (8.3x11.7) or A5 (5.8x8.3)' using errcode = '22023';
  end if;
  update public.pricing_model set mini_size = p_size, updated_at = now() where id = 1;
  return public.owner_pricing_model();
end
$$;
revoke all on function public.set_megy_mini_size(text) from public;
revoke execute on function public.set_megy_mini_size(text) from anon;
grant execute on function public.set_megy_mini_size(text) to authenticated;

-- ══════ Verify ══════
-- Nothing anyone sees changes: the Mini on sale is still A5 at its prices; an
-- A4 one has no price until the size moves. (All null while Megy Mini is off.)
select size, p as pages,
       (public.order_quote(size, 'staple', p, 3, null, false, null, null) ->> 'total') as total
  from unnest(array['5.8x8.3', '8.3x11.7']) size, unnest(array[16, 24]) p;

select 'mini size on sale' as check, (select mini_size from public.pricing_model where id = 1) as value
union all
select 'album prices by size kept (8x8 hard 40 pp)',
       (round(10 * (public.public_price_schedule() ->> 'sheet_rate')::numeric
             + (public.public_price_schedule() -> 'sizes' -> '8x8' ->> 'hard_rate')::numeric)
       + (public.public_price_schedule() ->> 'hosting_reserve')::numeric)::text;

-- ══════ THE DAY THE A4 APP IS LIVE (not run by this file) ══════
-- The size and the prices move together (owner, 2026-11-27: A4 at ₱450 and
-- ₱550 plus shipping; package prices ₱50 under, as before; costs are
-- estimates until the print shop quotes A4):
--
--   update public.pricing_model
--      set mini_size = '8.3x11.7',
--          mini_price = 450,   mini_package_price = 399,   mini_cost = 75,
--          mini24_price = 550, mini24_package_price = 499, mini24_cost = 110,
--          updated_at = now()
--    where id = 1;
