-- ════════════════════════════════════════════════════════════════════════════
--  MEGY PRINTS — 0007_operator_roles.sql  (idempotent; safe to re-run)
--
--  Role-based operator access. Two roles:
--    • owner       — full access (the hardcoded emails below). Manages the team.
--    • fulfillment — advance order status only. NO peso amounts, NO revenue, NO
--                    templates/overview. Assigned via the operator_roles table.
--
--  Security is enforced in the DB, not just the UI:
--    • operator_orders()    returns orders but NULLs the amount for non-owners.
--    • set_order_status()   is the ONLY write path for fulfillment (status only).
--    • Fulfillment has NO direct orders table access — only via these functions.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Roles table ─────────────────────────────────────────────────────────────
create table if not exists public.operator_roles (
  email      text primary key,
  role       text not null check (role in ('owner', 'fulfillment')),
  created_at timestamptz not null default now()
);
alter table public.operator_roles enable row level security;

-- A user may read their OWN role row; owners read all.
drop policy if exists "read own role or owner reads all" on public.operator_roles;
create policy "read own role or owner reads all" on public.operator_roles for select
  using (
    email = (auth.jwt() ->> 'email')
    or (auth.jwt() ->> 'email') in ('archgarcia@gmail.com', 'megyprints@gmail.com')
  );

-- Only owners add/remove team members.
drop policy if exists "owners manage roles" on public.operator_roles;
create policy "owners manage roles" on public.operator_roles for all
  using      ((auth.jwt() ->> 'email') in ('archgarcia@gmail.com', 'megyprints@gmail.com'))
  with check ((auth.jwt() ->> 'email') in ('archgarcia@gmail.com', 'megyprints@gmail.com'));

-- ── Role resolver ───────────────────────────────────────────────────────────
create or replace function public.operator_role() returns text
language sql stable security definer set search_path = public as $$
  select case
    when (auth.jwt() ->> 'email') in ('archgarcia@gmail.com', 'megyprints@gmail.com') then 'owner'
    else (select role from public.operator_roles where email = (auth.jwt() ->> 'email'))
  end;
$$;

-- ── Role-aware order read (amount hidden from non-owners) ────────────────────
create or replace function public.operator_orders()
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
    order by o.created_at desc;
end;
$$;

-- ── Status-only write (the fulfillment write path) ──────────────────────────
create or replace function public.set_order_status(p_id uuid, p_status text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.operator_role() is null then
    raise exception 'not authorized';
  end if;
  update public.orders
    set status = p_status::public.order_status,
        status_history = coalesce(status_history, '[]'::jsonb)
                         || jsonb_build_object('status', p_status, 'at', now())
    where id = p_id;
end;
$$;

grant execute on function public.operator_role()                to authenticated;
grant execute on function public.operator_orders()              to authenticated;
grant execute on function public.set_order_status(uuid, text)   to authenticated;
