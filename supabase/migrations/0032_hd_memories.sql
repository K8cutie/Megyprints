-- 0032 — HD memories: a one-time paid quality upgrade (owner, 2026-09-10)
--
-- Memory clips are re-encoded in the browser before upload. STANDARD (720p) is
-- included with every album; HD (1080p) is a one-time add-on covering that
-- album's memories for its whole hosting term. The extra hosting cost is small
-- (~₱12-16 over ten years for seven clips) — the add-on is a value tier, not a
-- cost recovery, so it is priced as a flat owner-set amount like the size
-- premium and the hosting reserve: added AFTER the rounded markup, never
-- multiplied.
--
-- Default ₱49 (owner: "less than a can of Coke"). With a couple of extra QRs a
-- customer's add-ons land near ₱100 — nothing against twenty years of value.
-- Owner-tunable from the Pricing panel without a deploy.
--
-- ADDITIVE and safe against the live client: a client that predates this
-- ignores `hd_memories_price` in the schedule and never sets `hd_memories`,
-- so it keeps pricing and ordering exactly as before.

alter table public.pricing_model
  add column if not exists hd_memories_price integer not null default 49
  check (hd_memories_price >= 0 and hd_memories_price <= 100000);

-- ── Customer-facing schedule (anon) ─────────────────────────────────────────
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
    return null;
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
    'min_pages',         m.min_pages,
    'sheet_rate',        m.sheet_cost * mult,
    'hosting_reserve',   m.hosting_reserve,
    'hosting_tiers',     m.hosting_tiers,
    'hd_memories_price', m.hd_memories_price,   -- flat add-on, NOT multiplied
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
    'price_multiple',    coalesce((srow ->> 'price_multiple')::numeric, 3)
  );
end
$$;

revoke all on function public.owner_pricing_model() from public;
revoke execute on function public.owner_pricing_model() from anon;   -- see 0031
grant execute on function public.owner_pricing_model() to authenticated;

-- ── Owner write ─────────────────────────────────────────────────────────────
create or replace function public.set_hd_memories_price(p_amount integer)
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
  if p_amount is null or p_amount < 0 or p_amount > 100000 then
    raise exception 'HD price must be between 0 and 100000' using errcode = '22023';
  end if;
  update public.pricing_model
     set hd_memories_price = p_amount, updated_at = now()
   where id = 1;
  return p_amount;
end
$$;

revoke all on function public.set_hd_memories_price(integer) from public;
revoke execute on function public.set_hd_memories_price(integer) from anon;
grant execute on function public.set_hd_memories_price(integer) to authenticated;

-- ── The choice on the order ─────────────────────────────────────────────────
alter table public.orders add column if not exists hd_memories boolean not null default false;

drop function if exists public.operator_orders(integer, integer);
create function public.operator_orders(p_limit integer default 100, p_offset integer default 0)
returns table (
  id uuid, order_number text, status text, payment_status text, amount numeric,
  currency text, album_size text, material text, cover text, page_count integer,
  hosting_years integer, hd_memories boolean,
  ship_name text, ship_phone text, ship_address text, tracking text,
  created_at timestamptz, updated_at timestamptz
)
language plpgsql stable security definer set search_path = public as $$
declare r text;
begin
  r := public.operator_role();
  if r is null then return; end if;
  return query
    select o.id, o.order_number, o.status::text, o.payment_status,
           case when r = 'owner' then o.amount else null end,
           o.currency, o.album_size, o.material, o.cover, o.page_count,
           o.hosting_years, o.hd_memories,
           o.ship_name, o.ship_phone, o.ship_address, o.tracking,
           o.created_at, o.updated_at
    from public.orders o
    order by o.created_at desc
    limit greatest(1, least(coalesce(p_limit, 100), 500))
    offset greatest(0, coalesce(p_offset, 0));
end;
$$;
revoke all on function public.operator_orders(integer, integer) from public;
revoke execute on function public.operator_orders(integer, integer) from anon;
grant execute on function public.operator_orders(integer, integer) to authenticated;

-- ── Verify ──────────────────────────────────────────────────────────────────
select
  'schedule carries hd_memories_price' as check,
  ((public.public_price_schedule() ->> 'hd_memories_price')::int >= 0)::text as result
union all
select 'schedule still leaks no cost/multiple',
  (not (public.public_price_schedule() ?| array['price_multiple','sheet_cost','hb','surcharge']))::text
union all
select 'orders.hd_memories exists',
  (exists (select 1 from information_schema.columns
            where table_schema = 'public' and table_name = 'orders' and column_name = 'hd_memories'))::text
union all
select 'anon cannot set the HD price or read the raw model',
  (not has_function_privilege('anon', 'public.set_hd_memories_price(integer)', 'EXECUTE')
   and not has_function_privilege('anon', 'public.owner_pricing_model()', 'EXECUTE'))::text;
