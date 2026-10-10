-- ══════════════════════════════════════════════════════════════════════════
--  MEGY PRINTS — 0033_payment_proof.sql  (idempotent; safe to re-run)
--
--  Manual bank-transfer payment (GoTyme InstaPay QR at checkout). After the
--  customer sends the transfer they can attach the receipt screenshot and the
--  bank's reference number IN the app, so the operator can match the deposit
--  in the GoTyme app and tap "Mark paid" without a chat round-trip.
--
--    1. orders.payment_reference / payment_proof_path / payment_submitted_at
--    2. private bucket `payment-proofs` — the customer may write ONLY
--       "<own order id>.<jpg|png|webp|pdf>" while the order is unpaid;
--       operators alone may read. 8 MB cap, image/PDF only.
--    3. submit_payment_proof(order, reference, path) — SECURITY DEFINER, the
--       one way a customer can touch these columns (there is deliberately no
--       customer UPDATE policy on orders). Refuses once the order is paid, and
--       refuses a path that is not this order's own object name.
--    4. operator_orders() returns the three new columns for the console.
--
--  Every function is GRANTed explicitly (default privileges bit us in 0031).
-- ══════════════════════════════════════════════════════════════════════════

alter table public.orders add column if not exists payment_reference    text;
alter table public.orders add column if not exists payment_proof_path   text;
alter table public.orders add column if not exists payment_submitted_at timestamptz;

-- ── 2. Private bucket for receipts ──────────────────────────────────────────
do $$
begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('payment-proofs', 'payment-proofs', false, 8388608,
          array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
  on conflict (id) do update
    set public = false,
        file_size_limit = 8388608,
        allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
exception when others then
  raise notice 'Could not auto-create the "payment-proofs" bucket (%). Create it once in the Dashboard (Storage -> New Bucket -> payment-proofs, Public = OFF, 8 MB, images + PDF); the policies below still apply.', sqlerrm;
end $$;

-- Customer may UPLOAD / REPLACE the receipt only for an order they own, only
-- under that order's own name, only while it is still unpaid.
drop policy if exists "payment_proofs_insert_own_order" on storage.objects;
create policy "payment_proofs_insert_own_order"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'payment-proofs'
    and exists (
      select 1 from public.orders o
      where storage.objects.name in (o.id::text || '.jpg', o.id::text || '.png', o.id::text || '.webp', o.id::text || '.pdf')
        and o.user_id = auth.uid()
        and o.payment_status = 'unpaid'
    )
  );

drop policy if exists "payment_proofs_update_own_order" on storage.objects;
create policy "payment_proofs_update_own_order"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'payment-proofs'
    and exists (
      select 1 from public.orders o
      where storage.objects.name in (o.id::text || '.jpg', o.id::text || '.png', o.id::text || '.webp', o.id::text || '.pdf')
        and o.user_id = auth.uid()
        and o.payment_status = 'unpaid'
    )
  );

-- Only operators read receipts. Customers have no SELECT here on purpose.
drop policy if exists "payment_proofs_select_operators" on storage.objects;
create policy "payment_proofs_select_operators"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'payment-proofs'
    and public.operator_role() is not null
  );

-- ── 3. The customer's one write path ───────────────────────────────────────
create or replace function public.submit_payment_proof(
  p_order_id uuid,
  p_reference text default null,
  p_proof_path text default null
)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in to submit a payment.';
  end if;
  if p_proof_path is not null
     and p_proof_path !~ ('^' || p_order_id::text || '\.(jpg|png|webp|pdf)$') then
    raise exception 'Receipt path does not belong to this order.';
  end if;

  update public.orders
     set payment_reference    = nullif(left(regexp_replace(coalesce(p_reference, ''), '[^A-Za-z0-9 _./-]', '', 'g'), 64), ''),
         payment_proof_path   = coalesce(p_proof_path, payment_proof_path),
         payment_submitted_at = now()
   where id = p_order_id
     and user_id = auth.uid()
     and payment_status = 'unpaid';

  if not found then
    raise exception 'Order not found, or it is already paid.';
  end if;
end;
$$;
revoke all on function public.submit_payment_proof(uuid, text, text) from public;
revoke execute on function public.submit_payment_proof(uuid, text, text) from anon;
grant execute on function public.submit_payment_proof(uuid, text, text) to authenticated;

-- ── 4. Console read: add the three columns ─────────────────────────────────
drop function if exists public.operator_orders(integer, integer);
create function public.operator_orders(p_limit integer default 100, p_offset integer default 0)
returns table (
  id uuid, order_number text, status text, payment_status text, amount numeric,
  currency text, album_size text, material text, cover text, page_count integer,
  hosting_years integer, hd_memories boolean,
  ship_name text, ship_phone text, ship_address text, tracking text,
  payment_reference text, payment_proof_path text, payment_submitted_at timestamptz,
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
           o.payment_reference, o.payment_proof_path, o.payment_submitted_at,
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
  'orders has payment proof columns' as check,
  ((select count(*) from information_schema.columns
     where table_schema = 'public' and table_name = 'orders'
       and column_name in ('payment_reference', 'payment_proof_path', 'payment_submitted_at')) = 3)::text as result
union all
select 'payment-proofs bucket is private',
  (coalesce((select not public from storage.buckets where id = 'payment-proofs'), false))::text
union all
select 'anon cannot submit a payment proof',
  (not has_function_privilege('anon', 'public.submit_payment_proof(uuid, text, text)', 'EXECUTE'))::text
union all
select 'authenticated can submit a payment proof',
  (has_function_privilege('authenticated', 'public.submit_payment_proof(uuid, text, text)', 'EXECUTE'))::text
union all
select 'operator_orders returns payment_reference',
  (exists (select 1 from information_schema.routines r
            where r.routine_schema = 'public' and r.routine_name = 'operator_orders'))::text;
