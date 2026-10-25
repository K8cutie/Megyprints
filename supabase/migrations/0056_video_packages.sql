-- ═══════════════════════════════════════════════════════════════════════════
--  MEGY PRINTS — 0056_video_packages.sql  (idempotent; safe to re-run)
--
--  WHY (owner, 2026-10-26): past the 7 free video memories, sell more videos
--  in packages instead of ₱20 each: +2 videos ₱100, +5 ₱200, +12 ₱300. When
--  the free ones run out, the builder's gold button shows "You ran out of free
--  videos … choose the best package" (+12 pre-selected, "₱600, now ₱300 ·
--  Save 50%"). The owner sets the packages in the Pricing tab.
--
--  WHAT:
--   1. pricing_model.qr_packages [{videos, price}] (default the three above),
--      set_qr_packages() (owner only), and both price functions carry it.
--      The "Save" price compares with the highest per-video price ON SALE
--      (the +2's ₱50), so it is a real price, never a made-up one (0041).
--   2. orders.video_packages: the packages the customer chose (sent with the
--      order; the choice lives on their phone with the album).
--   3. video_package_fee(): what the videos past the free 7 cost. The chosen
--      packages when they hold every extra video; otherwise (none, too few,
--      or a size not on sale) the cheapest mix that does. A price list with
--      no packages keeps ₱20 per extra QR. src/lib/pricing.ts videoMemoryFee
--      is the same arithmetic, step for step.
--   4. order_quote() gains the packages (replacing 0055's version), and the
--      saved total uses them. orders_quote keeps video_packages as placed.
--
--  ORDER: deploy the app first (it works on the old price list: no packages
--  there, so no pop-up and ₱20 each), THEN push this. An order only names
--  video_packages when the price list has packages, i.e. after this.
--  Run AFTER 0055. (0053/0054 are other open changes; whichever is pushed
--  after this one needs --include-all.)
-- ═══════════════════════════════════════════════════════════════════════════

-- ══════ 1. The packages on sale ══════
alter table public.pricing_model
  add column if not exists qr_packages jsonb not null
  default '[{"videos": 2, "price": 100}, {"videos": 5, "price": 200}, {"videos": 12, "price": 300}]'::jsonb;
alter table public.pricing_model drop constraint if exists pricing_model_qr_packages_chk;
alter table public.pricing_model
  add constraint pricing_model_qr_packages_chk
  check (jsonb_typeof(qr_packages) = 'array' and jsonb_array_length(qr_packages) between 1 and 6);

create or replace function public.set_qr_packages(p_packages jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  t      jsonb;
  n      integer := 0;
  sizes  integer[] := '{}';
  clean  jsonb;
begin
  if coalesce(auth.jwt() ->> 'email', '')
     not in ('archgarcia@gmail.com', 'megyprints@gmail.com') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_packages is null or jsonb_typeof(p_packages) <> 'array'
     or jsonb_array_length(p_packages) < 1 or jsonb_array_length(p_packages) > 6 then
    raise exception 'Keep 1 to 6 packages' using errcode = '22023';
  end if;
  for t in select * from jsonb_array_elements(p_packages) loop
    n := n + 1;
    if jsonb_typeof(t) <> 'object' or jsonb_typeof(t -> 'videos') <> 'number' or jsonb_typeof(t -> 'price') <> 'number'
       or (t ->> 'videos')::numeric <> floor((t ->> 'videos')::numeric)
       or (t ->> 'videos')::numeric < 1 or (t ->> 'videos')::numeric > 100
       or (t ->> 'price')::numeric <> floor((t ->> 'price')::numeric)
       or (t ->> 'price')::numeric < 0 or (t ->> 'price')::numeric > 100000 then
      raise exception 'Package % must be a whole number of videos (1–100) and a whole price (₱0–100000)', n using errcode = '22023';
    end if;
    if (t ->> 'videos')::integer = any(sizes) then
      raise exception 'Two packages have % videos', (t ->> 'videos')::integer using errcode = '22023';
    end if;
    sizes := sizes || (t ->> 'videos')::integer;
  end loop;
  select jsonb_agg(jsonb_build_object('videos', (x ->> 'videos')::integer, 'price', (x ->> 'price')::integer)
                   order by (x ->> 'videos')::integer)
    into clean from jsonb_array_elements(p_packages) x;
  update public.pricing_model set qr_packages = clean, updated_at = now() where id = 1;
  return clean;
end
$$;
revoke all on function public.set_qr_packages(jsonb) from public;
revoke execute on function public.set_qr_packages(jsonb) from anon;
grant execute on function public.set_qr_packages(jsonb) to authenticated;

-- 0041's public_price_schedule(), plus qr_packages.
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

  return jsonb_build_object(
    'min_pages',           m.min_pages,
    'sheet_rate',          m.sheet_cost * mult,
    'hosting_reserve',     m.hosting_reserve,
    'hosting_tiers',       m.hosting_tiers,
    'hd_memories_price',   m.hd_memories_price,
    'qr_packages',         m.qr_packages,
    'free_shipping_value', ship,
    'compare_at',          compare,
    'disabled_sizes',      disabled,
    'sizes',               out_sizes
  );
end
$$;
revoke all on function public.public_price_schedule() from public;
grant execute on function public.public_price_schedule() to anon, authenticated;

-- 0041's owner_pricing_model(), plus qr_packages.
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
  if coalesce(auth.jwt() ->> 'email', '')
     not in ('archgarcia@gmail.com', 'megyprints@gmail.com') then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select * into m from public.pricing_model where id = 1;
  if not found then return null; end if;
  select to_jsonb(s) into srow from public.store_settings s where s.id = 1;

  return jsonb_build_object(
    'sheet_cost',         m.sheet_cost,
    'soft_cover_cost',    m.soft_cover_cost,
    'soft_bind_cost',     m.soft_bind_cost,
    'min_pages',          m.min_pages,
    'hosting_reserve',    m.hosting_reserve,
    'hosting_tiers',      m.hosting_tiers,
    'hd_memories_price',  m.hd_memories_price,
    'qr_packages',        m.qr_packages,
    'shipping_allowance', m.shipping_allowance,
    'compare_multiple',   m.compare_multiple,
    'compare_until',      to_char(m.compare_until, 'YYYY-MM-DD'),
    'sizes',              m.sizes,
    'price_multiple',     coalesce((srow ->> 'price_multiple')::numeric, 3)
  );
end
$$;
revoke all on function public.owner_pricing_model() from public;
revoke execute on function public.owner_pricing_model() from anon;
grant execute on function public.owner_pricing_model() to authenticated;

-- ══════ 2. The customer's choice, with the order ══════
alter table public.orders add column if not exists video_packages integer[];
alter table public.orders drop constraint if exists orders_video_packages_chk;
alter table public.orders
  add constraint orders_video_packages_chk
  check (video_packages is null or cardinality(video_packages) <= 20);

-- ══════ 3. The fee (pricing.ts qrPackagesOf / cheapestPackageMix / videoMemoryFee) ══════
-- The packages on sale, smallest first: number fields only, 1–100 videos, the
-- first entry for a size kept, prices rounded (floor(x + 0.5)) and never < 0.
create or replace function public.video_package_list(p_schedule jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('videos', v, 'price', pr) order by v), '[]'::jsonb)
    from (
      select distinct on (v) v, pr
        from (
          select floor((t ->> 'videos')::float8 + 0.5)::integer as v,
                 greatest(0, floor((t ->> 'price')::float8 + 0.5))::bigint as pr,
                 i
            from jsonb_array_elements(
                   case when jsonb_typeof(p_schedule -> 'qr_packages') = 'array' then p_schedule -> 'qr_packages' else '[]'::jsonb end
                 ) with ordinality x(t, i)
           where jsonb_typeof(t) = 'object'
             and jsonb_typeof(t -> 'videos') = 'number'
             and jsonb_typeof(t -> 'price') = 'number'
             and floor((t ->> 'videos')::float8 + 0.5) between 1 and 100
        ) a
       order by v, i
    ) b;
$$;
revoke all on function public.video_package_list(jsonb) from public, anon, authenticated;

-- The cheapest mix holding at least p_need videos. Ties go to more videos,
-- then fewer packages, then the larger package first. Past 2000 videos, the
-- best-value package (lowest price per video, ties to more videos) repeated.
create or replace function public.video_package_cheapest(p_list jsonb, p_need integer)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  n     integer := greatest(0, coalesce(p_need, 0));
  vs    integer[];
  ps    bigint[];
  pr    bigint[];
  sl    integer[];
  ct    integer[];
  ch    integer[];
  k     integer;
  j     integer;
  r     integer;
  bp    bigint;
  bs    integer;
  bc    integer;
  bv    integer;
  cp    bigint;
  cs    integer;
  cc    integer;
  best  integer;
  reps  integer;
  mix   integer[] := '{}';
begin
  select array_agg((t ->> 'videos')::integer order by (t ->> 'videos')::integer desc),
         array_agg((t ->> 'price')::bigint order by (t ->> 'videos')::integer desc)
    into vs, ps
    from jsonb_array_elements(coalesce(p_list, '[]'::jsonb)) t;
  if vs is null or n = 0 then
    return jsonb_build_object('price', 0, 'slots', 0, 'mix', '[]'::jsonb);
  end if;
  if n > 2000 then
    best := 1;
    for j in 1 .. array_length(vs, 1) loop
      if ps[j] * vs[best] < ps[best] * vs[j] then best := j; end if;
    end loop;
    reps := ceil(n::numeric / vs[best])::integer;
    return jsonb_build_object('price', reps * ps[best], 'slots', reps * vs[best], 'mix', to_jsonb(array_fill(vs[best], array[reps])));
  end if;
  -- Element k + 1 holds "at least k videos".
  pr := array_fill(0::bigint, array[n + 1]);
  sl := array_fill(0, array[n + 1]);
  ct := array_fill(0, array[n + 1]);
  ch := array_fill(0, array[n + 1]);
  for k in 1 .. n loop
    bp := null;
    for j in 1 .. array_length(vs, 1) loop
      r  := greatest(0, k - vs[j]);
      cp := ps[j] + pr[r + 1];
      cs := vs[j] + sl[r + 1];
      cc := 1 + ct[r + 1];
      if bp is null or cp < bp or (cp = bp and (cs > bs or (cs = bs and cc < bc))) then
        bp := cp; bs := cs; bc := cc; bv := vs[j];
      end if;
    end loop;
    pr[k + 1] := bp; sl[k + 1] := bs; ct[k + 1] := bc; ch[k + 1] := bv;
  end loop;
  k := n;
  while k > 0 loop
    mix := mix || ch[k + 1];
    k := greatest(0, k - ch[k + 1]);
  end loop;
  return jsonb_build_object('price', pr[n + 1], 'slots', sl[n + 1],
                            'mix', (select to_jsonb(array_agg(x order by x desc)) from unnest(mix) x));
end
$$;
revoke all on function public.video_package_cheapest(jsonb, integer) from public, anon, authenticated;

-- What the videos past the free 7 cost: ₱0 when none; the chosen packages
-- when they hold every extra video; otherwise (none chosen, too few, more
-- than 20, or a size not on sale) the cheapest mix that does. No packages on
-- sale: ₱20 per extra QR, as before 0056.
create or replace function public.video_package_fee(p_schedule jsonb, p_qr integer, p_chosen integer[])
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  lst     jsonb := public.video_package_list(p_schedule);
  extra   integer := greatest(0, coalesce(p_qr, 0) - 7);
  c_price bigint := 0;
  c_slots integer := 0;
  v       integer;
  pp      bigint;
  ok      boolean := true;
  c       jsonb;
begin
  if jsonb_array_length(lst) = 0 then
    return jsonb_build_object('mode', 'legacy', 'fee', extra * 20, 'mix', '[]'::jsonb, 'slots', 0, 'chosen', false);
  end if;
  if extra = 0 then
    return jsonb_build_object('mode', 'packages', 'fee', 0, 'mix', '[]'::jsonb, 'slots', 0, 'chosen', false);
  end if;
  if p_chosen is not null and cardinality(p_chosen) between 1 and 20 then
    foreach v in array p_chosen loop
      select (t ->> 'price')::bigint into pp from jsonb_array_elements(lst) t where (t ->> 'videos')::integer = v;
      if v is null or pp is null then ok := false; exit; end if;
      c_price := c_price + pp;
      c_slots := c_slots + v;
    end loop;
    if ok and c_slots >= extra then
      return jsonb_build_object('mode', 'packages', 'fee', c_price, 'slots', c_slots, 'chosen', true,
                                'mix', (select to_jsonb(array_agg(x order by x desc)) from unnest(p_chosen) x));
    end if;
  end if;
  c := public.video_package_cheapest(lst, extra);
  return jsonb_build_object('mode', 'packages', 'fee', c -> 'price', 'mix', c -> 'mix', 'slots', c -> 'slots', 'chosen', false);
end
$$;
revoke all on function public.video_package_fee(jsonb, integer, integer[]) from public, anon, authenticated;

-- ══════ 4. The saved total uses them ══════
-- 0055's order_quote() with the packages: the videos past the free 7 cost
-- video_package_fee() instead of ₱20 each.
create or replace function public.order_quote(
  p_size text, p_cover text, p_pages integer, p_qr integer, p_years integer, p_hd boolean,
  p_packages integer[] default null, p_schedule jsonb default null)
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
  vf        jsonb;
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

  -- videoMemoryFee(): the packages past the free 7 (₱20 each with none on sale).
  vf     := public.video_package_fee(s, qr, p_packages);
  qr_fee := (vf ->> 'fee')::integer;

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
    'qr_mode',         vf ->> 'mode',
    'packages',        vf -> 'mix',
    'qr_slots',        (vf ->> 'slots')::integer,
    'years',           years,
    'term_fee',        term,
    'hd_fee',          hd
  );
end
$$;
revoke all on function public.order_quote(text, text, integer, integer, integer, boolean, integer[], jsonb) from public, anon, authenticated;

-- 0055's orders_quote(), passing the packages, and keeping them as placed.
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
    new.quoted_amount  := old.quoted_amount;
    new.quote          := old.quote;
    new.video_packages := old.video_packages;
    return new;
  end if;
  begin
    select al.pages into v_pages
      from public.albums al
     where al.id = new.album_id and al.user_id = new.user_id;
    if v_pages is null then v_pages := new.album_snapshot -> 'pages'; end if;
    q := public.order_quote(new.album_size, new.cover, new.page_count,
                            public.album_qr_count(v_pages), new.hosting_years, coalesce(new.hd_memories, false),
                            new.video_packages);
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

-- 0055's version, now unused (and ambiguous next to the new one).
drop function if exists public.order_quote(text, text, integer, integer, integer, boolean, jsonb);

-- ══════ Verify ══════
select 'price list carries the packages (+2 ₱100, +5 ₱200, +12 ₱300 by default)' as check,
  (jsonb_array_length(public.public_price_schedule() -> 'qr_packages') between 1 and 6)::text as result
union all
select 'orders.video_packages exists, at most 20',
  (exists (select 1 from information_schema.columns
            where table_schema = 'public' and table_name = 'orders' and column_name = 'video_packages')
   and exists (select 1 from pg_constraint where conname = 'orders_video_packages_chk'))::text
union all
select 'one order_quote, with the packages',
  ((select count(*) from pg_proc p join pg_namespace s on s.oid = p.pronamespace
     where s.nspname = 'public' and p.proname = 'order_quote') = 1
   and to_regprocedure('public.order_quote(text, text, integer, integer, integer, boolean, integer[], jsonb)') is not null)::text
union all
select 'fee functions closed to anon/authenticated; set_qr_packages owner path only',
  (not has_function_privilege('authenticated', 'public.video_package_fee(jsonb, integer, integer[])', 'EXECUTE')
   and not has_function_privilege('authenticated', 'public.order_quote(text, text, integer, integer, integer, boolean, integer[], jsonb)', 'EXECUTE')
   and has_function_privilege('authenticated', 'public.set_qr_packages(jsonb)', 'EXECUTE')
   and not has_function_privilege('anon', 'public.set_qr_packages(jsonb)', 'EXECUTE'))::text
union all
select 'the owner''s packages: 9 videos (2 extra) = ₱100, chose +12 = ₱300, 19 videos with none chosen = ₱300',
  (((public.video_package_fee(jsonb_build_object('qr_packages', '[{"videos":2,"price":100},{"videos":5,"price":200},{"videos":12,"price":300}]'::jsonb), 9, null)) ->> 'fee') = '100'
   and ((public.video_package_fee(jsonb_build_object('qr_packages', '[{"videos":2,"price":100},{"videos":5,"price":200},{"videos":12,"price":300}]'::jsonb), 9, array[12])) ->> 'fee') = '300'
   and ((public.video_package_fee(jsonb_build_object('qr_packages', '[{"videos":2,"price":100},{"videos":5,"price":200},{"videos":12,"price":300}]'::jsonb), 19, null)) ->> 'fee') = '300')::text;
