-- ════════════════════════════════════════════════════════════════════════════
--  MEGY PRINTS — 0070_mini_24_pages.sql  (idempotent; safe to re-run)
--
--  WHY (owner, 2026-11-23): a second stapled booklet, "an additional a second
--  staple offering": the Megy Mini at 24 pages, ₱449 (₱399 in a package), next
--  to the 16-page one at ₱350 (₱299). One product, two page counts: same A5,
--  staples, 2 free videos, add-ons and shipping. 24 pages = 6 folded sheets =
--  3 press sheets (₱26.50 each), so it costs about ₱83 to make (16 pages: ₱56).
--
--  What changes:
--    1. pricing_model.mini24_price (449), mini24_package_price (399),
--       mini24_cost (83, owner's view only);
--    2. public_price_schedule(): "mini" gains "options", one per page count
--       ({pages, price, package_price}). Its top-level pages/price stay the
--       16-page Mini, so app 2.1.5 and the website keep selling that one;
--    3. order_quote(): a Mini is priced by its page_count from "options"
--       (null for any other count, so it can't be ordered); the quote says
--       its pages;
--    4. orders_quote(): a Mini has 16 or 24 pages (MP021; was 16 only);
--    5. owner_pricing_model() shows the 24-page numbers; set_megy_mini_24()
--       sets them (owner only).
--
--  ADDITIVE for the live clients: none of them sends a 24-page Mini, and every
--  16-page price and rule is unchanged. Run AFTER 0069.
-- ════════════════════════════════════════════════════════════════════════════

-- ══════ 1. The 24-page numbers ══════
alter table public.pricing_model add column if not exists mini24_price         integer not null default 449;
alter table public.pricing_model add column if not exists mini24_package_price integer not null default 399;
alter table public.pricing_model add column if not exists mini24_cost          integer not null default 83;

alter table public.pricing_model drop constraint if exists pricing_model_mini24_chk;
alter table public.pricing_model add constraint pricing_model_mini24_chk check (
  mini24_price between 1 and 100000
  and mini24_package_price between 1 and 100000
  and mini24_cost between 0 and 100000);

-- ══════ 2. The price list (0067's, plus mini.options) ══════
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
  show_cmp := m.compare_multiple is not null and m.compare_until is not null
              and m.compare_multiple > mult
              and m.compare_until >= (now() at time zone 'Asia/Manila')::date;

  for k, v in select * from jsonb_each(m.sizes) loop
    out_sizes := out_sizes || jsonb_build_object(k, jsonb_build_object(
      'pps',       (v ->> 'pps')::int,
      -- shipping rides inside the rate: flat, never multiplied
      'soft_rate', (m.soft_cover_cost + m.soft_bind_cost) * mult + (v ->> 'surcharge')::numeric + ship,
      'hard_rate', (v ->> 'hb')::numeric * mult + (v ->> 'surcharge')::numeric + ship
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
      'size',          '5.8x8.3',
      'cover',         'staple',
      'pages',         16,
      'price',         m.mini_price,
      'package_price', m.mini_package_price,
      'shipping_fee',  m.mini_shipping_fee,
      'free_qr',       m.mini_free_qr,
      -- 0070: every page count on sale. The top-level pages/price above stay
      -- the 16-page Mini, for app versions that read only those.
      'options',       jsonb_build_array(
        jsonb_build_object('pages', 16, 'price', m.mini_price,    'package_price', m.mini_package_price),
        jsonb_build_object('pages', 24, 'price', m.mini24_price, 'package_price', m.mini24_package_price))
    );
  end if;

  return jsonb_build_object(
    'min_pages',           m.min_pages,
    'sheet_rate',          m.sheet_cost * mult,
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
    'mini24_cost',          m.mini24_cost
  );
end
$$;
revoke all on function public.owner_pricing_model() from public;
revoke execute on function public.owner_pricing_model() from anon;
grant execute on function public.owner_pricing_model() to authenticated;

-- ══════ 3. The checkout's total, in SQL (0067's, priced by page count) ══════
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
  if p_size = '5.8x8.3' then
    z := s -> 'mini';
    if z is null or jsonb_typeof(z) <> 'object' or p_cover is distinct from 'staple' then
      return null;
    end if;
    -- 0070: the price for the order's page count (16 or 24); a list
    -- without options (before 0070) sells 16 pages only.
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

-- ══════ 4. A Mini order has 16 or 24 pages ══════
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

  -- A Megy Mini has one shape and one price, so it IS a gate.
  v_mini := new.album_size = '5.8x8.3' or new.cover = 'staple';
  if v_mini then
    if new.album_size is distinct from '5.8x8.3' or new.cover is distinct from 'staple' then
      raise exception 'A Megy Mini is A5 with staples.' using errcode = 'MP020';
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

-- ══════ 5. The owner sets the 24-page prices ══════
create or replace function public.set_megy_mini_24(p_price integer, p_package_price integer)
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
  if p_price is null or p_price < 1 or p_price > 100000
     or p_package_price is null or p_package_price < 1 or p_package_price > 100000 then
    raise exception 'Prices must be between 1 and 100000' using errcode = '22023';
  end if;
  update public.pricing_model
     set mini24_price = p_price, mini24_package_price = p_package_price, updated_at = now()
   where id = 1;
  return public.owner_pricing_model();
end
$$;
revoke all on function public.set_megy_mini_24(integer, integer) from public;
revoke execute on function public.set_megy_mini_24(integer, integer) from anon;
grant execute on function public.set_megy_mini_24(integer, integer) to authenticated;

-- ══════ Verify ══════
-- A 16-page Mini, a 24-page Mini and a 20-page one (null: not sold), each
-- with 3 videos (one pack past the 2 free). While Megy Mini is off, all null.
select p as pages,
       (public.order_quote('5.8x8.3', 'staple', p, 3, null, false, null, null) ->> 'total') as total
  from unnest(array[16, 24, 20]) p;
