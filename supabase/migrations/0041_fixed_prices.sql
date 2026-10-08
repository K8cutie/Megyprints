-- 0041 — Fixed prices: the owner sets the 40-page price per size and cover
-- (owner, 2026-10-08)
--
-- WHY. Every price was cost × one store multiple (4×). Photobook PH — the
-- competitor customers compare against — runs a standing 50% code
-- ("PERFECTSAVING", valid to 2027-01-01), so what their customers actually pay
-- was about HALF of ours: 8×8 hardcover 40 pages ₱1,500 there, ₱2,510 here.
-- One multiple can't fix that: the same 4× marks up the pages AND the cover,
-- and ten 8×8 sheets alone already come to ₱1,060. The owner's call: match their
-- sale price on 8×6, 6×8, 8×8 and 9×9, and hold 6×4 / 6×6 at a floor.
--
-- Their 40-page LIST prices, read from their own price API on 2026-10-08
-- (api.photobookworldwide.com … pbx_product_configs; the 50% applies on top):
--     8×6  soft ₱1,400  hard ₱2,750     → ours ₱700 / ₱1,375
--     8×8  soft ₱1,600  hard ₱3,000     → ours ₱800 / ₱1,500
--     8×11 soft ₱1,800  hard ₱3,250     → ours 9×9 ₱900 / ₱1,625 (no 9×9 there)
--     6×8 = same paper as 8×6           → ₱700 / ₱1,375 (no 6×8 there)
--     6×6  soft ₱900    hard ₱1,000     → NOT matched (₱450/₱500 leaves ~₱64)
-- Floor for 6×4 and 6×6: 2 × production cost + the ₱50 hosting reserve,
-- rounded up to the next ₱50 → 6×4 ₱550 / ₱750, 6×6 ₱600 / ₱850.
-- 11.5×8 and 8.5×11 (switched off in the size picker) keep the formula.
--
-- HOW. pricing_model.fixed_prices = { "<size>": { "soft": ₱, "hard": ₱ } }: the
-- customer price for the INCLUDED pages (min_pages), hosting reserve absorbed.
-- Pages past them still add sheets at the marked-up sheet rate, unchanged.
--
-- SAFE AGAINST EVERY LIVE CLIENT. public_price_schedule() keeps its exact
-- shape — no new field. A fixed price is folded into that size's cover rate:
--     rate = fixed − hosting_reserve − (included sheets × sheet_rate)
-- so the client's own priceOf() — round(sheets × sheet_rate + rate) + reserve —
-- lands on the fixed price at the included pages, and the web app, the Android
-- shell and any cached tab all charge it with no deploy. The rate can be
-- NEGATIVE (₱800 for 40 pages is less than ten sheets at ₱106); priceOf() only
-- ever adds it to the sheets, never shows it. The schedule still carries no
-- cost, multiple or fixed-price field. src/lib/pricing.ts scheduleFrom() mirrors
-- this arithmetic and pricing.spec.ts proves the two agree.
--
-- Idempotent: the seed only fills an EMPTY fixed_prices, so a re-run never
-- overwrites prices the owner has since changed in the Pricing panel.

alter table public.pricing_model
  add column if not exists fixed_prices jsonb not null default '{}'::jsonb;
alter table public.pricing_model drop constraint if exists pricing_model_fixed_prices_obj;
alter table public.pricing_model
  add constraint pricing_model_fixed_prices_obj check (jsonb_typeof(fixed_prices) = 'object');

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
  k          text;
  v          jsonb;
  fx         jsonb;
  sheet_rate numeric;
  reserve    numeric;
  included   numeric;
  soft_rate  numeric;
  hard_rate  numeric;
begin
  select * into m from public.pricing_model where id = 1;
  if not found then
    return null;
  end if;

  select to_jsonb(s) into srow from public.store_settings s where s.id = 1;
  mult       := coalesce((srow ->> 'price_multiple')::numeric, 3);
  disabled   := coalesce(srow -> 'disabled_sizes', '[]'::jsonb);
  sheet_rate := m.sheet_cost * mult;
  reserve    := greatest(coalesce(m.hosting_reserve, 0), 0);

  for k, v in select * from jsonb_each(m.sizes) loop
    soft_rate := (m.soft_cover_cost + m.soft_bind_cost) * mult + (v ->> 'surcharge')::numeric;
    hard_rate := (v ->> 'hb')::numeric * mult + (v ->> 'surcharge')::numeric;

    -- A fixed price replaces the formula for that cover (see the header).
    -- Anything but a positive number is ignored, so a bad save can never quote ₱0.
    fx       := m.fixed_prices -> k;
    included := ceil(m.min_pages::numeric / (v ->> 'pps')::numeric) * sheet_rate;
    if jsonb_typeof(fx -> 'soft') = 'number' and (fx ->> 'soft')::numeric > 0 then
      soft_rate := round((fx ->> 'soft')::numeric) - reserve - included;
    end if;
    if jsonb_typeof(fx -> 'hard') = 'number' and (fx ->> 'hard')::numeric > 0 then
      hard_rate := round((fx ->> 'hard')::numeric) - reserve - included;
    end if;

    out_sizes := out_sizes || jsonb_build_object(k, jsonb_build_object(
      'pps',       (v ->> 'pps')::int,
      'soft_rate', soft_rate,
      'hard_rate', hard_rate
    ));
  end loop;

  return jsonb_build_object(
    'min_pages',         m.min_pages,
    'sheet_rate',        sheet_rate,
    'hosting_reserve',   m.hosting_reserve,
    'hosting_tiers',     m.hosting_tiers,
    'hd_memories_price', m.hd_memories_price,
    'disabled_sizes',    disabled,
    'sizes',             out_sizes
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
    'sheet_cost',        m.sheet_cost,
    'soft_cover_cost',   m.soft_cover_cost,
    'soft_bind_cost',    m.soft_bind_cost,
    'min_pages',         m.min_pages,
    'hosting_reserve',   m.hosting_reserve,
    'hosting_tiers',     m.hosting_tiers,
    'hd_memories_price', m.hd_memories_price,
    'sizes',             m.sizes,
    'fixed_prices',      m.fixed_prices,
    'price_multiple',    coalesce((srow ->> 'price_multiple')::numeric, 3)
  );
end
$$;

revoke all on function public.owner_pricing_model() from public;
revoke execute on function public.owner_pricing_model() from anon;   -- see 0031
grant execute on function public.owner_pricing_model() to authenticated;

-- ── Owner write ─────────────────────────────────────────────────────────────
-- Replaces the whole map (the Pricing panel sends every size). A null price
-- clears that cover back to the formula. Refuses anything that would sell an
-- album below its production cost + the hosting reserve — a mistyped ₱150 for
-- ₱1,500 must fail loudly, not go live on the money path.
create or replace function public.set_fixed_prices(p_prices jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  m        public.pricing_model%rowtype;
  k        text;
  v        jsonb;
  b        text;
  p        jsonb;
  price    numeric;
  cost     numeric;
  reserve  integer;
  entry    jsonb;
  clean    jsonb := '{}'::jsonb;
begin
  if coalesce(auth.jwt() ->> 'email', '')
     not in ('archgarcia@gmail.com', 'megyprints@gmail.com') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_prices is null or jsonb_typeof(p_prices) <> 'object' then
    raise exception 'fixed prices must be an object of sizes' using errcode = '22023';
  end if;

  select * into m from public.pricing_model where id = 1 for update;
  if not found then
    raise exception 'pricing model missing' using errcode = 'P0002';
  end if;
  reserve := greatest(coalesce(m.hosting_reserve, 0), 0);

  for k, v in select * from jsonb_each(p_prices) loop
    if not (m.sizes ? k) then
      raise exception 'unknown album size %', k using errcode = '22023';
    end if;
    if jsonb_typeof(v) <> 'object' then
      raise exception 'prices for % must be {soft, hard}', k using errcode = '22023';
    end if;
    entry := '{}'::jsonb;
    for b, p in select * from jsonb_each(v) loop
      if b not in ('soft', 'hard') then
        raise exception 'cover must be soft or hard, got %', b using errcode = '22023';
      end if;
      continue when jsonb_typeof(p) = 'null';
      if jsonb_typeof(p) <> 'number' then
        raise exception '% % price must be a number', k, b using errcode = '22023';
      end if;
      price := (p #>> '{}')::numeric;
      if price <> round(price) or price < 1 or price > 100000 then
        raise exception '% % price must be whole pesos, 1–100000', k, b using errcode = '22023';
      end if;
      cost := ceil(m.min_pages::numeric / (m.sizes -> k ->> 'pps')::numeric) * m.sheet_cost
            + case when b = 'hard' then (m.sizes -> k ->> 'hb')::numeric
                   else m.soft_cover_cost + m.soft_bind_cost end;
      if price < cost + reserve then
        raise exception '% % at ₱% is below its cost (₱%) plus the ₱% hosting reserve',
          k, b, price, ceil(cost), reserve using errcode = '22023';
      end if;
      entry := entry || jsonb_build_object(b, price::int);
    end loop;
    if entry ? 'soft' and entry ? 'hard' and (entry ->> 'hard')::int < (entry ->> 'soft')::int then
      raise exception '% hardbound (₱%) must not be cheaper than softcover (₱%)',
        k, entry ->> 'hard', entry ->> 'soft' using errcode = '22023';
    end if;
    if entry <> '{}'::jsonb then
      clean := clean || jsonb_build_object(k, entry);
    end if;
  end loop;

  update public.pricing_model
     set fixed_prices = clean, updated_at = now()
   where id = 1;
  return clean;
end
$$;

revoke all on function public.set_fixed_prices(jsonb) from public;
revoke execute on function public.set_fixed_prices(jsonb) from anon;
grant execute on function public.set_fixed_prices(jsonb) to authenticated;

-- ── The owner's 2026-10-08 price list (see the header) ──────────────────────
update public.pricing_model
   set fixed_prices = '{
     "6x4": {"soft": 550, "hard": 750},
     "6x6": {"soft": 600, "hard": 850},
     "8x6": {"soft": 700, "hard": 1375},
     "6x8": {"soft": 700, "hard": 1375},
     "8x8": {"soft": 800, "hard": 1500},
     "9x9": {"soft": 900, "hard": 1625}
   }'::jsonb,
       updated_at = now()
 where id = 1
   and fixed_prices = '{}'::jsonb;

-- ── Verify ──────────────────────────────────────────────────────────────────
with s as (select public.public_price_schedule() as j),
     f as (
       select fp.size, b.binding, (b.price #>> '{}')::numeric as price,
              (s.j -> 'sizes' -> fp.size ->> 'pps')::numeric as pps,
              (s.j -> 'sizes' -> fp.size ->> (b.binding || '_rate'))::numeric as rate,
              (s.j ->> 'sheet_rate')::numeric as sheet_rate,
              m.min_pages, m.hosting_reserve, m.sheet_cost, m.soft_cover_cost, m.soft_bind_cost,
              (m.sizes -> fp.size ->> 'hb')::numeric as hb
         from public.pricing_model m
         cross join s
         cross join lateral jsonb_each(m.fixed_prices) fp(size, prices)
         cross join lateral jsonb_each(fp.prices) b(binding, price)
        where m.id = 1
     )
select 'customer pays exactly the fixed price for 40 pages' as check,
       (not exists (select 1 from f
          where round(ceil(min_pages / pps) * sheet_rate + rate) + hosting_reserve <> price))::text as result
union all
select 'every fixed price covers cost + hosting reserve',
       (not exists (select 1 from f
          where price < ceil(min_pages / pps) * sheet_cost
                      + case when binding = 'hard' then hb else soft_cover_cost + soft_bind_cost end
                      + hosting_reserve))::text
union all
select 'schedule still leaks no cost/multiple/fixed field',
       (not (public.public_price_schedule() ?| array['price_multiple','sheet_cost','hb','surcharge','fixed_prices']))::text
union all
select 'anon cannot set fixed prices or read the raw model',
       (not has_function_privilege('anon', 'public.set_fixed_prices(jsonb)', 'EXECUTE')
        and not has_function_privilege('anon', 'public.owner_pricing_model()', 'EXECUTE'))::text;
