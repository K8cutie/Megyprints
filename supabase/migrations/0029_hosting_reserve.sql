-- 0029 — Hosting reserve: a flat per-album amount buffered into every price to
-- fund 10 years of living-memory video hosting (owner decision, 2026-09-09).
--
-- WHY A FLAT FIELD, NOT THE MULTIPLE: hosting is a per-album cost (7 included
-- QR memories × ~10 years ≈ ₱29 on R2 today; ₱50 buffers drift + egress). The
-- multiple scales with sheets, so a 200-page album would over-buffer and a
-- 40-page one under-buffer. The size premium already has the right shape —
-- integer, added AFTER the rounded markup — so this rides the same path,
-- album-wide instead of per-size.
--
-- ADDITIVE ONLY, safe against the live client: the CURRENT client ignores an
-- unknown `hosting_reserve` key in the schedule (prices as before); the NEW
-- client adds it. `owner_pricing_model()` gains the same field for the panel,
-- and `set_hosting_reserve()` lets the owner retune it without a deploy.

alter table public.pricing_model
  add column if not exists hosting_reserve integer not null default 50
  check (hosting_reserve >= 0);

-- ── Customer-facing schedule (anon) — now carries the flat reserve ──────────
create or replace function public.public_price_schedule()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  m         public.pricing_model%rowtype;
  srow      jsonb;
  mult      numeric;
  disabled  jsonb;
  out_sizes jsonb := '{}'::jsonb;
  k         text;
  v         jsonb;
begin
  select * into m from public.pricing_model where id = 1;
  if not found then
    return null;                     -- client falls back to its safe defaults
  end if;

  select to_jsonb(s) into srow from public.store_settings s where s.id = 1;
  mult     := coalesce((srow ->> 'price_multiple')::numeric, 3);
  disabled := coalesce(srow -> 'disabled_sizes', '[]'::jsonb);

  for k, v in select * from jsonb_each(m.sizes) loop
    out_sizes := out_sizes || jsonb_build_object(k, jsonb_build_object(
      'pps',       (v ->> 'pps')::int,
      'soft_rate', (m.soft_cover_cost + m.soft_bind_cost) * mult + (v ->> 'surcharge')::numeric,
      'hard_rate', (v ->> 'hb')::numeric * mult + (v ->> 'surcharge')::numeric
    ));
  end loop;

  return jsonb_build_object(
    'min_pages',       m.min_pages,
    'sheet_rate',      m.sheet_cost * mult,
    'hosting_reserve', m.hosting_reserve,   -- flat, NOT multiplied (see header)
    'disabled_sizes',  disabled,
    'sizes',           out_sizes
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
    'sheet_cost',      m.sheet_cost,
    'soft_cover_cost', m.soft_cover_cost,
    'soft_bind_cost',  m.soft_bind_cost,
    'min_pages',       m.min_pages,
    'hosting_reserve', m.hosting_reserve,
    'sizes',           m.sizes,
    'price_multiple',  coalesce((srow ->> 'price_multiple')::numeric, 3)
  );
end
$$;

revoke all on function public.owner_pricing_model() from public;
grant execute on function public.owner_pricing_model() to authenticated;

-- ── Owner write: retune the reserve from the Pricing panel ──────────────────
-- pricing_model has NO table grants by design (0026: RPC-only), so the panel
-- needs a definer RPC to write it. Same owner gate as owner_pricing_model().
create or replace function public.set_hosting_reserve(p_amount integer)
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
    raise exception 'hosting reserve must be between 0 and 10000' using errcode = '22023';
  end if;
  update public.pricing_model
     set hosting_reserve = p_amount, updated_at = now()
   where id = 1;
  return p_amount;
end
$$;

revoke all on function public.set_hosting_reserve(integer) from public;
grant execute on function public.set_hosting_reserve(integer) to authenticated;

-- ── Verify ──────────────────────────────────────────────────────────────────
select
  'schedule carries hosting_reserve' as check,
  ((public.public_price_schedule() ->> 'hosting_reserve')::int >= 0)::text as result
union all
select
  'schedule still leaks no cost/multiple',
  (not (public.public_price_schedule() ?| array['price_multiple','sheet_cost','hb','surcharge']))::text
union all
select
  'anon cannot set the reserve',
  (not has_function_privilege('anon', 'public.set_hosting_reserve(integer)', 'EXECUTE'))::text;
