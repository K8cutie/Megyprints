-- ═══════════════════════════════════════════════════════════════════════════
--  MEGY PRINTS — 0062_megy_mini.sql  (idempotent; safe to re-run)
--
--  WHY (owner, 2026-11-16): "Megy Mini along side the regular albums". A
--  16-page A5 booklet with staples (the print shop calls the format a
--  "catalogue"): 180gsm glossy inside, 260gsm cover. Sold on its own for
--  ₱350 plus shipping ("as an item not part of a package 350+shipping"),
--  ₱299 inside a package (packages come later, through affiliates), with
--  2 QR video memories free.
--
--  WHAT:
--   1. pricing_model: mini_price (350), mini_package_price (299),
--      mini_shipping_fee (NULL until the owner sets it), mini_free_qr (2),
--      mini_cost (56, owner's view only) and mini_hosting_reserve (15, owner's
--      view only: it is inside the ₱350, not added to it).
--      store_settings.mini_on: OFF until the owner turns it on.
--   2. public_price_schedule(): everything it returned before, plus "mini":
--      {size '5.8x8.3', cover 'staple', pages 16, price, package_price,
--      shipping_fee, free_qr} while Megy Mini is on and has a shipping fee,
--      otherwise null. The app shows Megy Mini only when "mini" is there.
--   3. order_quote(): an '5.8x8.3' order is priced as a Megy Mini: price +
--      shipping + ₱20 for each QR memory past the free ones + the memory term
--      + HD, the same add-ons as an album.
--   4. orders_quote(): a Megy Mini order (size 5.8x8.3 or cover 'staple') must be
--      A5 with staples (MP020), exactly 16 pages (MP021) and on sale (MP022).
--      Albums are unchanged: their price is still a record, not a gate.
--   5. owner_pricing_model() returns the Mini fields; set_megy_mini() saves
--      them (owner only). Turning it on needs a shipping fee.
--
--  '5.8x8.3' is never in pricing_model.sizes, so it never shows as an album size.
--  0056 (video packages, not applied) also replaces order_quote() and
--  public_price_schedule(): whichever lands second must carry both.
--  Run AFTER 0060. (0061 affiliates touches none of this.)
-- ═══════════════════════════════════════════════════════════════════════════

-- ══════ 1. The Mini's numbers ══════
alter table public.pricing_model add column if not exists mini_price           integer not null default 350;
alter table public.pricing_model add column if not exists mini_package_price   integer not null default 299;
alter table public.pricing_model add column if not exists mini_shipping_fee    integer;
alter table public.pricing_model add column if not exists mini_free_qr         integer not null default 2;
alter table public.pricing_model add column if not exists mini_cost            integer not null default 56;
alter table public.pricing_model add column if not exists mini_hosting_reserve integer not null default 15;

alter table public.pricing_model drop constraint if exists pricing_model_mini_chk;
alter table public.pricing_model add constraint pricing_model_mini_chk check (
  mini_price between 1 and 100000
  and mini_package_price between 1 and 100000
  and (mini_shipping_fee is null or mini_shipping_fee between 0 and 10000)
  and mini_free_qr between 0 and 50
  and mini_cost between 0 and 100000
  and mini_hosting_reserve between 0 and 10000);

alter table public.store_settings add column if not exists mini_on boolean not null default false;

-- ══════ 2. The customer's price list ══════
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

  -- Megy Mini: only while it is on and has a shipping fee (shipping is on
  -- top of its price, never inside it).
  if coalesce((srow ->> 'mini_on')::boolean, false) and m.mini_shipping_fee is not null then
    mini := jsonb_build_object(
      'size',          '5.8x8.3',
      'cover',         'staple',
      'pages',         16,
      'price',         m.mini_price,
      'package_price', m.mini_package_price,
      'shipping_fee',  m.mini_shipping_fee,
      'free_qr',       m.mini_free_qr
    );
  end if;

  return jsonb_build_object(
    'min_pages',           m.min_pages,
    'sheet_rate',          m.sheet_cost * mult,
    'hosting_reserve',     m.hosting_reserve,
    'hosting_tiers',       m.hosting_tiers,
    'hd_memories_price',   m.hd_memories_price,
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

-- ══════ 3. The checkout's total, in SQL ══════
-- 0055's order_quote() with a Megy Mini branch. Every rounding is still
-- JavaScript's Math.round on a double: floor(x + 0.5) in float8.
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
  free_qr   integer;
  price     integer;
  ship      integer;
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

  -- ── Megy Mini: a set price, shipping on top, its own free QR count ──
  if p_size = '5.8x8.3' then
    z := s -> 'mini';
    if z is null or jsonb_typeof(z) <> 'object' or p_cover is distinct from 'staple' then
      return null;
    end if;
    price   := (z ->> 'price')::integer;
    ship    := (z ->> 'shipping_fee')::integer;
    free_qr := greatest(coalesce((z ->> 'free_qr')::integer, 0), 0);
    if price is null or ship is null then return null; end if;
    qr_fee := greatest(0, qr - free_qr) * 20;
    return jsonb_build_object(
      'product',         'mini',
      'total',           price + ship + qr_fee + term + hd,
      'album',           price,
      'shipping',        ship,
      'extra_pages',     0,
      'extra_pages_fee', 0,
      'qr',              qr,
      'free_qr',         free_qr,
      'extra_qr',        greatest(0, qr - free_qr),
      'qr_fee',          qr_fee,
      'years',           years,
      'term_fee',        term,
      'hd_fee',          hd
    );
  end if;

  -- ── Albums (0055, unchanged) ──
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

-- ══════ 4. Saved with every new order; a Megy Mini must be a real one ══════
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
                            public.album_qr_count(v_pages), new.hosting_years, coalesce(new.hd_memories, false));
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
    if coalesce(new.page_count, 0) <> 16 then
      raise exception 'A Megy Mini has 16 pages.' using errcode = 'MP021';
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

-- ══════ 5. The owner's view and switch ══════
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
    'mini_hosting_reserve', m.mini_hosting_reserve
  );
end
$$;
revoke all on function public.owner_pricing_model() from public;
revoke execute on function public.owner_pricing_model() from anon;
grant execute on function public.owner_pricing_model() to authenticated;

create or replace function public.set_megy_mini(
  p_on boolean, p_price integer, p_package_price integer, p_shipping_fee integer, p_free_qr integer)
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
  if p_shipping_fee is not null and (p_shipping_fee < 0 or p_shipping_fee > 10000) then
    raise exception 'Shipping must be between 0 and 10000' using errcode = '22023';
  end if;
  if p_free_qr is null or p_free_qr < 0 or p_free_qr > 50 then
    raise exception 'Free videos must be between 0 and 50' using errcode = '22023';
  end if;
  if coalesce(p_on, false) and p_shipping_fee is null then
    raise exception 'Set the shipping fee before turning Megy Mini on' using errcode = '22023';
  end if;
  update public.pricing_model
     set mini_price = p_price, mini_package_price = p_package_price,
         mini_shipping_fee = p_shipping_fee, mini_free_qr = p_free_qr, updated_at = now()
   where id = 1;
  update public.store_settings set mini_on = coalesce(p_on, false) where id = 1;
  return public.owner_pricing_model();
end
$$;
revoke all on function public.set_megy_mini(boolean, integer, integer, integer, integer) from public;
revoke execute on function public.set_megy_mini(boolean, integer, integer, integer, integer) from anon;
grant execute on function public.set_megy_mini(boolean, integer, integer, integer, integer) to authenticated;
