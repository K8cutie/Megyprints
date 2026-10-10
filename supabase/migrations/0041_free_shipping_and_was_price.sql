-- 0041 — Free shipping built into the price + a real crossed-out "was" price
-- (owner, 2026-10-08)
--
-- CONTEXT. The owner lowered the store multiple 4 → 2.5 on 2026-10-08 to sit at
-- Photobook PH's everyday 50% sale price. Megyprints always shipped free and
-- absorbed the courier (~₱170 an album), so he asked for the shipping to be
-- built INTO every album price and for checkout to say "Free shipping" — the
-- same thing Photobook does above ₱1,500. He chose ₱200 an album.
--
-- He also wanted the "good deal" feeling of Photobook's crossed-out prices.
-- Their list price is an anchor nobody pays; that is a deceptive price claim
-- under the Consumer Act (RA 7394), so we do the honest version: the "was"
-- price is the price we REALLY charged (4×, 25 Jul – 8 Oct 2026, shipping free
-- then too), and it stops by itself on an end date. set_price_compare() refuses
-- an end date more than 183 days out, so it can never become a permanent sale.
--
-- HOW.
--   pricing_model.shipping_allowance  flat ₱ per album, added inside the cover
--                                     rates (never multiplied).
--   pricing_model.compare_multiple    the multiple we charged before.
--   pricing_model.compare_until       last day (Asia/Manila) it shows.
-- public_price_schedule() keeps every existing field and meaning, so clients
-- that predate this (open tabs, the Android shell) charge the new price right
-- away; they just don't show the new labels. New fields:
--   free_shipping_value  the allowance, for "Free shipping (₱200 value)"
--   compare_at           { until, sheet_rate, sizes: {soft_rate, hard_rate} },
--                        the old prices pre-multiplied with the hosting reserve
--                        folded in; null once compare_until has passed or when
--                        it would not be higher than today's multiple.
-- src/lib/pricing.ts scheduleFrom() mirrors this; pricing.spec.ts proves it.
--
-- KNOWN TRADE-OFF. Two price points per size (was + now) let anyone solve the
-- cover cost per size. That was already true the moment the multiple changed
-- (the 4× schedule was public until today), so this adds no new exposure.

alter table public.pricing_model
  add column if not exists shipping_allowance integer not null default 0;
alter table public.pricing_model drop constraint if exists pricing_model_shipping_allowance_chk;
alter table public.pricing_model
  add constraint pricing_model_shipping_allowance_chk check (shipping_allowance >= 0 and shipping_allowance <= 10000);

alter table public.pricing_model add column if not exists compare_multiple numeric;
alter table public.pricing_model add column if not exists compare_until date;
alter table public.pricing_model drop constraint if exists pricing_model_compare_chk;
alter table public.pricing_model
  add constraint pricing_model_compare_chk check (
    (compare_multiple is null and compare_until is null)
    or (compare_multiple between 1 and 10 and compare_until is not null)
  );

-- ── Customer-facing schedule (anon) ─────────────────────────────────────────
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
    'free_shipping_value', ship,
    'compare_at',          compare,
    'disabled_sizes',      disabled,
    'sizes',               out_sizes
  );
end
$$;

revoke all on function public.public_price_schedule() from public;
grant execute on function public.public_price_schedule() to anon, authenticated;

-- ── Owner-facing raw model (admin Pricing panel) ────────────────────────────
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
    'shipping_allowance', m.shipping_allowance,
    'compare_multiple',   m.compare_multiple,
    'compare_until',      to_char(m.compare_until, 'YYYY-MM-DD'),
    'sizes',              m.sizes,
    'price_multiple',     coalesce((srow ->> 'price_multiple')::numeric, 3)
  );
end
$$;

revoke all on function public.owner_pricing_model() from public;
revoke execute on function public.owner_pricing_model() from anon;   -- see 0031
grant execute on function public.owner_pricing_model() to authenticated;

-- ── Owner writes ────────────────────────────────────────────────────────────
create or replace function public.set_shipping_allowance(p_amount integer)
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if coalesce(auth.jwt() ->> 'email', '')
     not in ('archgarcia@gmail.com', 'megyprints@gmail.com') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_amount is null or p_amount < 0 or p_amount > 10000 then
    raise exception 'Shipping must be between 0 and 10000' using errcode = '22023';
  end if;
  update public.pricing_model
     set shipping_allowance = p_amount, updated_at = now()
   where id = 1;
  return p_amount;
end
$$;

revoke all on function public.set_shipping_allowance(integer) from public;
revoke execute on function public.set_shipping_allowance(integer) from anon;
grant execute on function public.set_shipping_allowance(integer) to authenticated;

-- Both null clears the was price. Otherwise: a quarter-step multiple above
-- today's (a "was" lower than "now" is not a deal), and an end date from today
-- to at most 183 days out — a was price that runs forever stops being true.
create or replace function public.set_price_compare(p_multiple numeric, p_until date)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  mult  numeric;
  today date := (now() at time zone 'Asia/Manila')::date;
begin
  if coalesce(auth.jwt() ->> 'email', '')
     not in ('archgarcia@gmail.com', 'megyprints@gmail.com') then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if p_multiple is null and p_until is null then
    update public.pricing_model
       set compare_multiple = null, compare_until = null, updated_at = now()
     where id = 1;
    return jsonb_build_object('compare_multiple', null, 'compare_until', null);
  end if;

  select coalesce(price_multiple, 3) into mult from public.store_settings where id = 1;
  if p_multiple is null or p_until is null then
    raise exception 'Set both the old multiple and the end date, or clear both' using errcode = '22023';
  end if;
  if p_multiple <= coalesce(mult, 3) or p_multiple > 10 or p_multiple * 4 <> round(p_multiple * 4) then
    raise exception 'The old multiple must be a quarter step above today''s (%), up to 10', mult using errcode = '22023';
  end if;
  if p_until < today or p_until > today + 183 then
    raise exception 'The end date must be between today and % (6 months)', today + 183 using errcode = '22023';
  end if;

  update public.pricing_model
     set compare_multiple = p_multiple, compare_until = p_until, updated_at = now()
   where id = 1;
  return jsonb_build_object('compare_multiple', p_multiple, 'compare_until', to_char(p_until, 'YYYY-MM-DD'));
end
$$;

revoke all on function public.set_price_compare(numeric, date) from public;
revoke execute on function public.set_price_compare(numeric, date) from anon;
grant execute on function public.set_price_compare(numeric, date) to authenticated;

-- ── The owner's 2026-10-08 settings ─────────────────────────────────────────
-- ₱200 shipping built in; was price = the 4× we charged until today, shown to
-- 2026-12-31. Only filled where still unset, so a re-run never overwrites what
-- the owner later changes in the Pricing panel.
update public.pricing_model
   set shipping_allowance = 200, updated_at = now()
 where id = 1 and shipping_allowance = 0;

update public.pricing_model
   set compare_multiple = 4, compare_until = date '2026-12-31', updated_at = now()
 where id = 1 and compare_multiple is null and compare_until is null;

-- ── Verify ──────────────────────────────────────────────────────────────────
with s as (select public.public_price_schedule() as j)
select 'schedule carries free_shipping_value' as check,
       ((s.j ->> 'free_shipping_value')::numeric >= 0)::text as result
  from s
union all
select 'schedule still leaks no cost/multiple field',
       (not (s.j ?| array['price_multiple','sheet_cost','hb','surcharge','shipping_allowance','compare_multiple']))::text
  from s
union all
select '8x8 hardbound 40 pages = round(sheets*sheet_rate + hard_rate) + reserve',
       (round(ceil(40.0 / (s.j -> 'sizes' -> '8x8' ->> 'pps')::numeric) * (s.j ->> 'sheet_rate')::numeric
              + (s.j -> 'sizes' -> '8x8' ->> 'hard_rate')::numeric) + (s.j ->> 'hosting_reserve')::numeric)::text
  from s
union all
select '8x8 hardbound 40 pages WAS (null once ended)',
       coalesce((round(ceil(40.0 / (s.j -> 'sizes' -> '8x8' ->> 'pps')::numeric) * (s.j -> 'compare_at' ->> 'sheet_rate')::numeric
              + (s.j -> 'compare_at' -> 'sizes' -> '8x8' ->> 'hard_rate')::numeric))::text, 'none')
  from s
union all
select 'anon cannot set shipping or the was price',
       (not has_function_privilege('anon', 'public.set_shipping_allowance(integer)', 'EXECUTE')
        and not has_function_privilege('anon', 'public.set_price_compare(numeric, date)', 'EXECUTE'))::text;
