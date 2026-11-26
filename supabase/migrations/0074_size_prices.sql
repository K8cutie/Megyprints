-- 0074 — Album prices set per size (owner, 2026-11-26)
--
-- CONTEXT. Until now every album price came from ONE store multiple: Bridgemedia
-- cost × multiple, plus shipping and the hosting reserve. The owner, 2026-11-26:
-- "i want this pricing standardized since we have a pricing calculator in the
-- admin panel. We can customize the pricing calculator based on album size
-- instead not XX percent across the board." Then: "Yes, build it".
--
-- WHAT CHANGES.
--   * Each size in pricing_model.sizes may carry `price_soft` and `price_hard`:
--     the price of the smallest album (min_pages, 40 today) with that cover,
--     shipping and the hosting reserve included — the number the customer sees.
--   * public_price_schedule() turns a set price back into the cover rate the
--     clients already use:  rate = price − sheets(min_pages) × sheet_rate − reserve.
--     So priceOf() at min_pages gives exactly the set price, and each extra
--     sheet still costs the one sheet_rate. THE SCHEDULE'S SHAPE DOES NOT
--     CHANGE: the website, every app version already on phones, and
--     order_quote() (which reads this function) charge the new prices with no
--     release.
--   * A size without a set price keeps the multiple formula, as before. The
--     store multiple now sets the extra-page rate, and the price of any size
--     without its own price.
--   * set_size_prices(jsonb): owner only. Refuses a price under the floor
--     (Bridgemedia cost + shipping + hosting reserve, the promo rule
--     "never below the floor"), a non-whole number, an unknown size, and
--     anything over ₱50,000. null clears a price (back to the multiple).
--
-- THE OWNER'S PRICES. Filled in at the end, as they are live today: every album
-- +₱300 since 2026-11-26 (owner: "add it as early as now"; "It is better to
-- price high and give discounts then to price low and explain why were
-- increasing the price"). The ₱300 pays for the ₱200 rebate card and the
-- affiliate's ₱100 client discount. On the live database it was first set as a
-- ₱300 surcharge per size (direct SQL, 2026-11-26); the surcharges are written
-- here too so a database built from migrations matches the live one.
--
-- ⚠ public_price_schedule() is also redefined by the open drafts 0070
-- (longer-videos switch, PR #317) and 0071 (24-page Mini, PR #316), both from
-- 0067's version. Whichever lands after this one must keep the two
-- `price_soft` / `price_hard` lines below, or the set prices silently fall back
-- to the multiple.

-- ── Customer-facing (anon): the price list ─────────────────────────────────
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

-- ── Owner: set or clear prices by size (Admin → Pricing → Album prices) ────
-- p_prices: {"8x8": {"soft": 1505, "hard": 1965}, "6x6": {"hard": null}, …}
-- A key left out is left alone; null clears that price.
create or replace function public.set_size_prices(p_prices jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  m       public.pricing_model%rowtype;
  v_sizes jsonb;
  k       text;
  v       jsonb;
  cover   text;
  price   jsonb;
  amount  numeric;
  floor_  numeric;
  sheets  numeric;
  ship    numeric;
  reserve numeric;
begin
  if not public.is_owner() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_prices is null or jsonb_typeof(p_prices) <> 'object' then
    raise exception 'Send the prices as {"8x8": {"soft": 1505, "hard": 1965}}' using errcode = '22023';
  end if;

  select * into m from public.pricing_model where id = 1 for update;
  v_sizes   := m.sizes;
  ship    := greatest(coalesce(m.shipping_allowance, 0), 0);
  reserve := greatest(coalesce(m.hosting_reserve, 0), 0);

  for k, v in select * from jsonb_each(p_prices) loop
    if not (v_sizes ? k) then
      raise exception 'There is no album size %', k using errcode = '22023';
    end if;
    if jsonb_typeof(v) <> 'object' then
      raise exception 'Size %: send {"soft": …, "hard": …}', k using errcode = '22023';
    end if;
    sheets := ceil(m.min_pages::numeric / (v_sizes -> k ->> 'pps')::int);
    foreach cover in array array['soft', 'hard'] loop
      if not (v ? cover) then
        continue;
      end if;
      price := v -> cover;
      if jsonb_typeof(price) = 'null' then
        v_sizes := jsonb_set(v_sizes, array[k], (v_sizes -> k) - ('price_' || cover));
        continue;
      end if;
      if jsonb_typeof(price) <> 'number' then
        raise exception 'Size % %: the price must be a number', k, cover using errcode = '22023';
      end if;
      amount := (price #>> '{}')::numeric;
      if amount <> trunc(amount) then
        raise exception 'Size % %: the price must be whole pesos', k, cover using errcode = '22023';
      end if;
      -- The floor: what Bridgemedia charges for the smallest album, plus the
      -- shipping and hosting reserve built into every price.
      floor_ := sheets * m.sheet_cost
                + case when cover = 'hard' then (v_sizes -> k ->> 'hb')::numeric
                       else m.soft_cover_cost + m.soft_bind_cost end
                + ship + reserve;
      if amount < ceil(floor_) then
        raise exception 'Size % %: ₱% is under the floor of ₱% (Bridgemedia cost + shipping + hosting)',
          k, cover, amount, ceil(floor_) using errcode = '22023';
      end if;
      if amount > 50000 then
        raise exception 'Size % %: ₱% is over ₱50,000', k, cover, amount using errcode = '22023';
      end if;
      v_sizes := jsonb_set(v_sizes, array[k, 'price_' || cover], to_jsonb(amount::integer));
    end loop;
  end loop;

  update public.pricing_model set sizes = v_sizes, updated_at = now() where id = 1;
  return v_sizes;
end
$$;

revoke all on function public.set_size_prices(jsonb) from public;
revoke execute on function public.set_size_prices(jsonb) from anon;
grant execute on function public.set_size_prices(jsonb) to authenticated;

-- ── The owner's prices as they are live on 2026-11-26 ───────────────────────
-- The +₱300 surcharges, as set live; then each size on sale gets its price.
-- Only filled where no price is set yet, so a re-run never overwrites what the
-- owner later changes in the Pricing panel.
update public.pricing_model
   set sizes = (
     select jsonb_object_agg(k, v || jsonb_build_object('surcharge',
              case when k in ('11.5x8', '8.5x11') then 600 else 300 end))
       from jsonb_each(sizes) e(k, v)
   ), updated_at = now()
 where id = 1
   and not exists (select 1 from jsonb_each(sizes) e(k, v) where v ? 'price_soft' or v ? 'price_hard');

update public.pricing_model
   set sizes = (
     select jsonb_object_agg(k, case
              when k = '6x4' then v || '{"price_soft": 1078, "price_hard": 1308}'::jsonb
              when k = '6x6' then v || '{"price_soft": 1139, "price_hard": 1438}'::jsonb
              when k in ('8x6', '6x8') then v || '{"price_soft": 1200, "price_hard": 1660}'::jsonb
              when k = '8x8' then v || '{"price_soft": 1505, "price_hard": 1965}'::jsonb
              else v end)
       from jsonb_each(sizes) e(k, v)
   ), updated_at = now()
 where id = 1
   and not exists (select 1 from jsonb_each(sizes) e(k, v) where v ? 'price_soft' or v ? 'price_hard');

-- ── Verify ──────────────────────────────────────────────────────────────────
with s as (select public.public_price_schedule() j),
     p as (
       select k, c,
              round(ceil((s.j ->> 'min_pages')::numeric / (v ->> 'pps')::int) * (s.j ->> 'sheet_rate')::numeric
                    + (v ->> (c || '_rate'))::numeric) + (s.j ->> 'hosting_reserve')::numeric as price
         from s, jsonb_each(s.j -> 'sizes') e(k, v), unnest(array['soft', 'hard']) c
     )
select 'the 40-page prices are the owner''s' as check,
       (select bool_and(price = case
          when k = '6x4' and c = 'soft' then 1078 when k = '6x4' then 1308
          when k = '6x6' and c = 'soft' then 1139 when k = '6x6' then 1438
          when k in ('8x6', '6x8') and c = 'soft' then 1200 when k in ('8x6', '6x8') then 1660
          when k = '8x8' and c = 'soft' then 1505 when k = '8x8' then 1965
          else price end) from p) as ok
union all
select 'anon reads the price list, can''t set prices',
       has_function_privilege('anon', 'public.public_price_schedule()', 'execute')
       and not has_function_privilege('anon', 'public.set_size_prices(jsonb)', 'execute');
