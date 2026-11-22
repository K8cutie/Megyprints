-- ════════════════════════════════════════════════════════════════════════════
--  MEGY PRINTS — 0070_long_videos_switch.sql  (idempotent; safe to re-run)
--
--  WHY (owner, 2026-11-23): "disable the longer videos first and put an on off
--  switch for those features in the admin panel". The live project is on
--  Supabase's free plan: 1 GB of storage in all and 50 MB a file. A 3- or
--  5-minute video is squeezed to about 46 MB to fit, so a dozen of them fill
--  the storage, and a full storage stops orders halfway. They come back on
--  after the move to the Pro plan, with the same switch.
--
--  What changes:
--    1. store_settings.long_videos_on, OFF;
--    2. public_price_schedule() gives long_video_prices only while it is on,
--       null otherwise. Every app and website version already reads null as
--       "videos up to 2 minutes, no longer-video price" (pricing.ts
--       longVideoPricesOf / maxVideoSecondsOf), so 2.1.5 goes back to 2
--       minutes with no update; order_quote() charges no longer-video fee
--       then (it prices from the same list);
--    3. owner_pricing_model() says whether it is on; set_long_videos_on()
--       switches it (owner only). The 3- and 5-minute prices are kept.
--
--  Run AFTER 0069.
-- ════════════════════════════════════════════════════════════════════════════

-- ══════ 1. The switch ══════
alter table public.store_settings add column if not exists long_videos_on boolean not null default false;

-- ══════ 2. The price list (0067's, longer videos only while on) ══════
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
      'free_qr',       m.mini_free_qr
    );
  end if;

  return jsonb_build_object(
    'min_pages',           m.min_pages,
    'sheet_rate',          m.sheet_cost * mult,
    'hosting_reserve',     m.hosting_reserve,
    'hosting_tiers',       m.hosting_tiers,
    'hd_memories_price',   m.hd_memories_price,
    -- 0070: only while the owner has them on; null = videos up to 2 minutes
    'long_video_prices',   case when coalesce((srow ->> 'long_videos_on')::boolean, false)
                                then jsonb_build_object('3', m.video_3min_price, '5', m.video_5min_price) end,
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

-- ══════ 3. The owner's view, and the switch ══════
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
    'long_videos_on',       coalesce((srow ->> 'long_videos_on')::boolean, false),
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

create or replace function public.set_long_videos_on(p_on boolean)
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
  if p_on is null then
    raise exception 'Say on or off' using errcode = '22023';
  end if;
  update public.store_settings set long_videos_on = p_on where id = 1;
  return public.owner_pricing_model();
end
$$;
revoke all on function public.set_long_videos_on(boolean) from public;
revoke execute on function public.set_long_videos_on(boolean) from anon;
grant execute on function public.set_long_videos_on(boolean) to authenticated;

-- ══════ Verify ══════
-- Off: no longer-video prices in the list, and a 5-minute order pays no fee.
select public.public_price_schedule() -> 'long_video_prices' as long_video_prices,
       (public.order_quote('8x8', 'softcover', 40, 3, null, false, null, 5) ->> 'long_fee') as five_min_fee;
