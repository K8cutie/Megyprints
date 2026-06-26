-- ════════════════════════════════════════════════════════════════════════════
--  MEGY PRINTS — 0006_admin_emails.sql  (idempotent; safe to re-run)
--
--  Expands the operator allow-list to MULTIPLE emails. Re-creates the admin-write
--  policy on template_settings and the admin read/update policies on orders so
--  ANY email in the list is treated as the operator. Keep this list in sync with
--  ADMIN_EMAILS in src/lib/templateSettings.ts.
--
--  NOTE: an operator email must also have a real Supabase auth account (sign up
--  with it) before it can log in and pass these checks.
-- ════════════════════════════════════════════════════════════════════════════

-- ── template_settings: admin write ──────────────────────────────────────────
drop policy if exists "Admin can write template settings" on public.template_settings;
create policy "Admin can write template settings"
  on public.template_settings for all
  using      ((auth.jwt() ->> 'email') in ('archgarcia@gmail.com', 'megyprints@gmail.com'))
  with check ((auth.jwt() ->> 'email') in ('archgarcia@gmail.com', 'megyprints@gmail.com'));

-- ── orders: admin read + update ─────────────────────────────────────────────
do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema = 'public' and table_name = 'orders') then

    execute 'drop policy if exists "Admin can view all orders" on public.orders';
    execute 'create policy "Admin can view all orders" on public.orders
               for select using ((auth.jwt() ->> ''email'') in (''archgarcia@gmail.com'', ''megyprints@gmail.com''))';

    execute 'drop policy if exists "Admin can update orders" on public.orders';
    execute 'create policy "Admin can update orders" on public.orders
               for update using      ((auth.jwt() ->> ''email'') in (''archgarcia@gmail.com'', ''megyprints@gmail.com''))
                          with check ((auth.jwt() ->> ''email'') in (''archgarcia@gmail.com'', ''megyprints@gmail.com''))';
  end if;
end $$;
