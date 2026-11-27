-- ════════════════════════════════════════════════════════════════════════════
--  0063 — WHICH POST AN ORDER CAME FROM
--
--  A link in a post can carry a short tag: megyprints…/?p=xmas-01. The app
--  keeps the tag on the visitor's device for 30 days (src/lib/orderSource.ts)
--  and sends it with the order. This migration gives the order somewhere to
--  keep it, so the owner can see which posts bring orders.
--
--  It is a note for the owner and nothing else:
--    • it never touches a price, a quote, a status or a payment;
--    • a tag that is missing or malformed makes the order's source NULL. It
--      never refuses the order. A tracking tag must not cost a sale.
--
--  The customer's own insert writes the column (orders are inserted by the
--  customer under RLS, 0002/0003), so the value is whatever the browser sent.
--  The trigger below is what keeps it to a short, harmless tag: lower-case
--  letters, digits and hyphens, at most 40 characters. Treat it as a hint about
--  where an order came from, not as proof.
--
--  The app only names the column when it has a tag, and sends the order again
--  without it if the database has no such column yet, so the app and this
--  migration can be released in either order.
--
--  Idempotent: safe to run again.
-- ════════════════════════════════════════════════════════════════════════════

-- ══════ 1. The tag on an order ══════
alter table public.orders add column if not exists source text;

create or replace function public.orders_source()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.source := lower(btrim(coalesce(new.source, '')));
  -- Keep in step with SOURCE_PATTERN in src/lib/orderSource.ts.
  if new.source !~ '^[a-z0-9][a-z0-9-]{0,39}$' then
    new.source := null;
  end if;
  return new;
end;
$$;
-- A trigger function is nobody's to call.
revoke all on function public.orders_source() from public, anon, authenticated;

drop trigger if exists orders_source_trg on public.orders;
create trigger orders_source_trg
  before insert on public.orders
  for each row execute function public.orders_source();

-- ══════ 2. The owner's summary: orders per tag ══════
-- One row per tag, plus one row with source NULL for orders that carried none.
-- "Paid" means the order got as far as paid (or beyond) and was not a tester's
-- free order (0057). Money is the owner's to see, so this is owner-only, like
-- owner_pricing_model() (0058).
create or replace function public.owner_order_sources()
returns table (
  source         text,
  orders         bigint,
  paid_orders    bigint,
  paid_total     numeric,
  first_order_at timestamptz,
  last_order_at  timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_owner() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  return query
    select o.source,
           count(*)::bigint,
           count(*) filter (
             where o.status in ('paid', 'in_production', 'printed', 'shipped', 'delivered')
               and o.tester_code is null)::bigint,
           coalesce(sum(o.amount) filter (
             where o.status in ('paid', 'in_production', 'printed', 'shipped', 'delivered')
               and o.tester_code is null), 0)::numeric,
           min(o.created_at),
           max(o.created_at)
    from public.orders o
    group by o.source
    order by max(o.created_at) desc;
end;
$$;
revoke all on function public.owner_order_sources() from public, anon;
grant execute on function public.owner_order_sources() to authenticated;
