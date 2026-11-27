-- 0077 — Video memories: ₱50 each, and a named sale with a pack price
-- (was 0073 in PR #327; renumbered and rebuilt on 0076_mini_a4 by the bug
-- hunt, 2026-11-27, F-00 / F-01: 0073's order_quote was 0067's, so applied
-- after 0075 / 0076 it dropped the 24-page Mini price (a 24-page Mini charged
-- at the 16-page price) and knew only the A5 Mini (every A4 Mini order
-- refused, MP022). This order_quote is 0076_mini_a4's, line for line, with
-- only 0073's video-fee lines and 'qr_singles' changed.)
--
-- Run AFTER 0076_mini_a4 (the guard below refuses otherwise).
--
-- (owner, 2026-11-24: "the price of each video is 50 regular but its 3 for
-- 100", "Christmas sale is urgency so end at December 31", "Yes, build it")
--
-- BEFORE (0066): 2 videos free on every album (a Megy Mini: its own free_qr),
-- then packs of 3 for ₱100 only — no single videos.
--
-- NOW: an extra video is ₱50 (pricing_model.video_price). While a sale runs
-- (video_sale_name + video_sale_until), any video_pack_size of them cost
-- video_pack_price — 3 for ₱100, 33% off the ₱150 they cost one by one. The
-- checkout always takes the cheapest way: whole packs first, the rest one by
-- one, unless the rest would cost as much as a pack (then one more pack: same
-- price, more room). So in the Christmas sale 1 extra = ₱50, 2 or 3 = ₱100,
-- 4 = ₱150; after it ends (the day after video_sale_until, Manila) ₱50 each.
--
-- HONESTY. "33% off" and "for a limited time" are true only because the ₱50
-- single is really sold and the sale really ends: the table refuses a pack
-- that isn't cheaper than its videos one by one, set_video_sale() refuses an
-- end date more than 183 days out, and public_video_offer() stops sending
-- the pack after the end date. Between sale themes the ₱50 price should run
-- for real (the owner was told: back-to-back sales make ₱150 a price nobody
-- pays).
--
-- HOW. public_video_offer() (anon) = { single, pack | null }. The clients read
-- it beside public_price_schedule() (not redefined here: the drafts for 0070
-- and 0071 each redefine it). order_quote() takes the offer from its
-- p_schedule's video_offer when a caller passes one, else from
-- public_video_offer(), and charges video_memory_fee(): src/lib/pricing.ts
-- videoFee(), line for line. Only the two video-fee lines of 0067's
-- order_quote() change (plus 'qr_singles' in the quote).
--
-- ── Order guard (bug hunt F-00, 2026-11-27) ─────────────────────────────────
-- The price functions are redefined whole by each change, so the last one
-- applied wins. This file carries 0076_mini_a4's text; run before 0076 it would
-- be overwritten by 0076, so it refuses.
do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'pricing_model'
                    and column_name = 'mini_size') then
    raise exception '0077 needs 0076_mini_a4 first (pricing_model.mini_size is missing)';
  end if;
end
$$;

-- OLDER APPS (2.1.6 and before) don't know single videos: they still show
-- "3 more for ₱100" until updated. The quote saved with each order is this
-- price list's (orders_quote, 0055), never stopped by it.

alter table public.pricing_model add column if not exists video_price integer not null default 50;
alter table public.pricing_model add column if not exists video_pack_size integer not null default 3;
alter table public.pricing_model add column if not exists video_pack_price integer not null default 100;
alter table public.pricing_model add column if not exists video_sale_name text;
alter table public.pricing_model add column if not exists video_sale_until date;
alter table public.pricing_model drop constraint if exists pricing_model_video_chk;
alter table public.pricing_model
  add constraint pricing_model_video_chk check (
    video_price between 1 and 1000
    and video_pack_size between 2 and 20
    and video_pack_price >= 1
    and video_pack_price < video_pack_size * video_price
    and ((video_sale_name is null and video_sale_until is null)
         or (char_length(btrim(video_sale_name)) between 1 and 30 and video_sale_until is not null))
  );

-- ── Customer-facing (anon): how extra videos are sold today ─────────────────
create or replace function public.public_video_offer()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'single', m.video_price,
    'pack', case
      when m.video_sale_name is not null
       and m.video_sale_until is not null
       and m.video_sale_until >= (now() at time zone 'Asia/Manila')::date
      then jsonb_build_object('size', m.video_pack_size, 'price', m.video_pack_price,
                              'name', btrim(m.video_sale_name), 'until', to_char(m.video_sale_until, 'YYYY-MM-DD'))
      else null
    end)
  from public.pricing_model m
  where m.id = 1
$$;

revoke all on function public.public_video_offer() from public;
grant execute on function public.public_video_offer() to anon, authenticated;

-- ── The fee: src/lib/pricing.ts videoFee(), line for line ───────────────────
create or replace function public.video_memory_fee(p_extra integer, p_offer jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  e       integer := greatest(coalesce(p_extra, 0), 0);
  single  integer;
  psize   integer;
  pprice  integer;
  packs   integer;
  singles integer;
begin
  if (p_offer ->> 'single') ~ '^\s*[0-9]+\s*$' then single := (p_offer ->> 'single')::integer; end if;
  if jsonb_typeof(p_offer -> 'pack') = 'object'
     and (p_offer -> 'pack' ->> 'size') ~ '^\s*[0-9]+\s*$'
     and (p_offer -> 'pack' ->> 'price') ~ '^\s*[0-9]+\s*$' then
    psize  := (p_offer -> 'pack' ->> 'size')::integer;
    pprice := (p_offer -> 'pack' ->> 'price')::integer;
  end if;

  -- No single price (a list from before 0073): the 0066 packs, always.
  if single is null or single < 1 then
    packs := ceil(e::numeric / coalesce(nullif(psize, 0), 3))::integer;
    return jsonb_build_object('fee', packs * coalesce(pprice, 100), 'packs', packs, 'singles', 0);
  end if;

  -- No sale running, or a pack that isn't an honest one: one by one.
  if psize is null or psize < 2 or pprice is null or pprice < 1 or pprice >= psize * single
     or coalesce(btrim(p_offer -> 'pack' ->> 'name'), '') = ''
     or coalesce(p_offer -> 'pack' ->> 'until', '') !~ '^\d{4}-\d{2}-\d{2}$' then
    return jsonb_build_object('fee', e * single, 'packs', 0, 'singles', e);
  end if;

  packs   := e / psize;
  singles := e % psize;
  if singles > 0 and singles * single >= pprice then
    packs   := packs + 1;
    singles := 0;
  end if;
  return jsonb_build_object('fee', packs * pprice + singles * single, 'packs', packs, 'singles', singles);
end
$$;

revoke all on function public.video_memory_fee(integer, jsonb) from public, anon, authenticated;

-- ── Owner: start, change or end a sale (Admin → Pricing → Video memory sale) ─
create or replace function public.set_video_sale(p_name text, p_until date)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  today date := (now() at time zone 'Asia/Manila')::date;
  nm    text := btrim(coalesce(p_name, ''));
begin
  if not public.is_owner() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if p_name is null and p_until is null then
    update public.pricing_model
       set video_sale_name = null, video_sale_until = null, updated_at = now()
     where id = 1;
    return jsonb_build_object('video_sale_name', null, 'video_sale_until', null);
  end if;

  if nm = '' or p_until is null then
    raise exception 'Give the sale a name and an end date, or end it' using errcode = '22023';
  end if;
  if char_length(nm) > 30 then
    raise exception 'The sale''s name can be at most 30 letters' using errcode = '22023';
  end if;
  if p_until < today or p_until > today + 183 then
    raise exception 'The end date must be between today and % (6 months)', today + 183 using errcode = '22023';
  end if;

  update public.pricing_model
     set video_sale_name = nm, video_sale_until = p_until, updated_at = now()
   where id = 1;
  return jsonb_build_object('video_sale_name', nm, 'video_sale_until', to_char(p_until, 'YYYY-MM-DD'));
end
$$;

revoke all on function public.set_video_sale(text, date) from public;
revoke execute on function public.set_video_sale(text, date) from anon;
grant execute on function public.set_video_sale(text, date) to authenticated;

-- ── order_quote(): 0067's, with the video fee from the offer ────────────────
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
  vo        jsonb := coalesce(s -> 'video_offer', public.public_video_offer());
  vf        jsonb;
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
    vf     := public.video_memory_fee(greatest(0, qr - free_qr), vo);
    packs  := (vf ->> 'packs')::integer;
    qr_fee := (vf ->> 'fee')::integer;
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
      'qr_singles',      (vf ->> 'singles')::integer,
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
  vf     := public.video_memory_fee(greatest(0, qr - 2), vo);
  packs  := (vf ->> 'packs')::integer;
  qr_fee := (vf ->> 'fee')::integer;

  return jsonb_build_object(
    'total',           album + qr_fee + term + hd + long_fee,
    'album',           album_min,
    'extra_pages',     greatest(0, pages - min_p),
    'extra_pages_fee', album - album_min,
    'qr',              qr,
    'free_qr',         2,
    'extra_qr',        greatest(0, qr - 2),
    'qr_packs',        packs,
    'qr_singles',      (vf ->> 'singles')::integer,
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

-- ── The owner's 2026-11-24 decision: the Christmas sale, to December 31 ────
-- Only filled while no sale is set, so a re-run never overwrites what the
-- owner later changes in the Pricing panel.
update public.pricing_model
   set video_sale_name = 'Christmas sale', video_sale_until = date '2026-12-31', updated_at = now()
 where id = 1 and video_sale_name is null and video_sale_until is null
   and date '2026-12-31' >= (now() at time zone 'Asia/Manila')::date;

-- ── Verify ──────────────────────────────────────────────────────────────────
select 'the Christmas sale runs: ₱50 each, 3 for ₱100 to 2026-12-31' as check,
       public.public_video_offer() = '{"single": 50, "pack": {"name": "Christmas sale", "size": 3, "price": 100, "until": "2026-12-31"}}'::jsonb as ok
union all
select 'fees: 0 → 0, 1 → 50, 2 → 100, 3 → 100, 4 → 150, 6 → 200',
       (select array_agg((public.video_memory_fee(e, public.public_video_offer()) ->> 'fee')::integer order by e)
          from unnest(array[0, 1, 2, 3, 4, 6]) e) = array[0, 50, 100, 100, 150, 200]
union all
select 'an 8x8 soft album with 5 videos (3 extra): the fee is ₱100',
       (public.order_quote('8x8', 'softcover', 40, 5, null, false) ->> 'qr_fee')::integer = 100
union all
select 'anon reads the offer, can''t set a sale or call the fee',
       has_function_privilege('anon', 'public.public_video_offer()', 'execute')
       and not has_function_privilege('anon', 'public.set_video_sale(text, date)', 'execute')
       and not has_function_privilege('anon', 'public.video_memory_fee(integer, jsonb)', 'execute')
union all
select 'the A4 Mini is still priced (16 pages, 3 videos) while it is the size on sale',
       (select mini_size from public.pricing_model where id = 1) <> '8.3x11.7'
       or (public.public_price_schedule() -> 'mini') is null
       or (public.order_quote('8.3x11.7', 'staple', 16, 3, null, false, null, null) ->> 'total') is not null
union all
select 'the 24-page Mini keeps its own price',
       (public.order_quote((select mini_size from public.pricing_model where id = 1), 'staple', 24, 2, null, false, null, null) ->> 'album')::integer
       is not distinct from (select mini24_price from public.pricing_model where id = 1)
       or (public.public_price_schedule() -> 'mini') is null;
