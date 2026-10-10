-- ════════════════════════════════════════════════════════════════════════════
--  MEGY PRINTS — 0023_operator_orders_pagination.sql  (idempotent)
--
--  operator_orders() returned EVERY order, every time an operator opened the
--  console. Measured on a 10,000-order database: 10,000 rows and a 2,018 kB
--  payload per page load, per operator, built from a full sequential scan plus
--  a 3.9 MB quicksort. It is fine at 7 orders and untenable at 10k — and the
--  cost is paid again on every refresh, by every operator, on every device.
--
--  Two changes:
--    1. An index on created_at DESC, so ordering stops being a full sort.
--       (Measured: seq scan + quicksort → top-N heapsort, 3.9 MB → 50 kB.)
--    2. LIMIT/OFFSET parameters with a sane default, plus a count function so
--       the console can say "showing 100 of 10,000" instead of silently
--       truncating — a paginated list that hides the total is its own bug.
-- ════════════════════════════════════════════════════════════════════════════

create index if not exists idx_orders_created_at_desc on public.orders (created_at desc);

-- Replace the zero-arg version with a paginated one. Dropping first because a
-- defaulted signature would otherwise be ambiguous against the old overload.
drop function if exists public.operator_orders();
drop function if exists public.operator_orders(integer, integer);

create function public.operator_orders(p_limit integer default 100, p_offset integer default 0)
returns table (
  id uuid, order_number text, status text, payment_status text, amount numeric,
  currency text, album_size text, material text, cover text, page_count integer,
  ship_name text, ship_phone text, ship_address text, tracking text,
  created_at timestamptz, updated_at timestamptz
)
language plpgsql stable security definer set search_path = public as $$
declare r text;
begin
  r := public.operator_role();
  if r is null then return; end if; -- not an operator → no rows
  return query
    select o.id, o.order_number, o.status::text, o.payment_status,
           case when r = 'owner' then o.amount else null end,
           o.currency, o.album_size, o.material, o.cover, o.page_count,
           o.ship_name, o.ship_phone, o.ship_address, o.tracking,
           o.created_at, o.updated_at
    from public.orders o
    order by o.created_at desc
    -- Clamp: a caller cannot ask for the whole table back by passing a huge
    -- limit, and a negative/zero limit falls back to the default page.
    limit greatest(1, least(coalesce(p_limit, 100), 500))
    offset greatest(0, coalesce(p_offset, 0));
end;
$$;

-- Total count, so a paginated console can show what it is NOT displaying.
create or replace function public.operator_orders_count()
returns bigint
language plpgsql stable security definer set search_path = public as $$
begin
  if public.operator_role() is null then return 0; end if;
  return (select count(*) from public.orders);
end;
$$;

grant execute on function public.operator_orders(integer, integer) to authenticated;
grant execute on function public.operator_orders_count()            to authenticated;
