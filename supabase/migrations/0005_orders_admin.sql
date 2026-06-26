-- ════════════════════════════════════════════════════════════════════════════
--  MEGY PRINTS — 0005_orders_admin.sql  (idempotent; safe to re-run)
--
--  Lets the OPERATOR account (gated by email in the JWT) read and update every
--  order, so the in-app fulfillment console (/admin → Orders) works client-side.
--  Customers keep their own-row policies from 0002/0003 — Postgres OR's multiple
--  SELECT policies, so customers still see only their own orders while the
--  operator sees all. The operator may also UPDATE (advance status, set price).
-- ════════════════════════════════════════════════════════════════════════════

do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema = 'public' and table_name = 'orders') then

    execute 'drop policy if exists "Admin can view all orders" on public.orders';
    execute 'create policy "Admin can view all orders" on public.orders
               for select using ((auth.jwt() ->> ''email'') = ''archgarcia@gmail.com'')';

    execute 'drop policy if exists "Admin can update orders" on public.orders';
    execute 'create policy "Admin can update orders" on public.orders
               for update using      ((auth.jwt() ->> ''email'') = ''archgarcia@gmail.com'')
                          with check ((auth.jwt() ->> ''email'') = ''archgarcia@gmail.com'')';
  end if;
end $$;
