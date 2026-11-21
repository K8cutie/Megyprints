-- ════════════════════════════════════════════════════════════════════════════
--  MEGY PRINTS — 0064_delivered_print_files_cleanup.sql  (idempotent; safe to re-run)
--
--  WHY: every order's print file (<id>.pdf) and cover file (<id>-cover.pdf)
--  hold the customer's photos, often of children. 0042 removes them for
--  orders that closed unpaid, but a DELIVERED order kept them forever: about
--  30 MB an order, growing every month, for files nobody opens once the album
--  has arrived (and a privacy risk the longer they stay).
--
--  What this adds:
--    1. delivered_files_keep_days() (90): how long a delivered order keeps its
--       print and cover files, so a damaged album can still be reprinted.
--    2. The nightly job (api/expire-orders.mjs) removes both files of every
--       delivered order past that, claiming each order first
--       (claim_delivered_order_file_purge) and recording it after
--       (finish_delivered_order_file_purge). SQL cannot delete Storage files,
--       see api/delete-account.mjs.
--    3. Once that has started, the order can't be moved back to Paid, In
--       production, Printed or Shipped (MP011): there would be nothing to
--       print. The customer orders the album again from their phone instead:
--       the album stays in their account and the photos stay on their phone.
--
--  Kept, always: the order row, the receipt (payment-proofs), the album, the
--  memory videos (a printed QR must keep playing for its whole term) and
--  everything on the customer's phone.
--
--  Never touched here, because something else still prints from the files:
--    • an event's album (event_booking_id): guests' copies print from it;
--    • an order that other orders are copies of (copy_of_order_id points at
--      it), and a copy order itself (it has no files of its own).
--
--  All of the cleanup functions are service_role only.
--  Run AFTER 0042 and 0045.
-- ════════════════════════════════════════════════════════════════════════════

-- ══════ 1. The number, in one place ══════
-- The Privacy Policy and the admin words mirror it (src/lib/orderExpiry.ts);
-- orderExpiry.spec reads this file and fails if they drift.
create or replace function public.delivered_files_keep_days()
returns integer language sql immutable set search_path = '' as $$ select 90 $$;
revoke all on function public.delivered_files_keep_days() from public;
grant execute on function public.delivered_files_keep_days() to anon, authenticated, service_role;

-- ══════ 2. When an order was delivered ══════
-- The last "delivered" entry set_order_status wrote into status_history.
-- An order with no such entry falls back to updated_at, which is never
-- earlier than the delivery, so a missing entry can only KEEP files longer.
create or replace function public.order_delivered_at(o public.orders)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (select (h ->> 'at')::timestamptz
       from jsonb_array_elements(case when jsonb_typeof(o.status_history) = 'array'
                                      then o.status_history else '[]'::jsonb end) with ordinality e(h, i)
      where h ->> 'status' = 'delivered'
        and (h ->> 'at') ~ '^\d{4}-\d{2}-\d{2}'
      order by i desc
      limit 1),
    o.updated_at,
    o.created_at);
$$;
revoke all on function public.order_delivered_at(public.orders) from public, anon, authenticated;
grant execute on function public.order_delivered_at(public.orders) to service_role;

-- ══════ 3. Which delivered orders' files may go ══════
create or replace function public.delivered_order_files_due(o public.orders)
returns boolean
language sql
stable
set search_path = ''
as $$
  select o.status = 'delivered'
     and o.files_purged_at is null
     and o.event_booking_id is null
     and o.copy_of_order_id is null
     and not exists (select 1 from public.orders c where c.copy_of_order_id = o.id)
     and (o.purge_started_at is not null
          or public.order_delivered_at(o)
             <= now() - make_interval(days => public.delivered_files_keep_days()));
$$;
revoke all on function public.delivered_order_files_due(public.orders) from public, anon, authenticated;
grant execute on function public.delivered_order_files_due(public.orders) to service_role;

create or replace function public.orders_due_for_delivered_file_purge(p_limit integer default 50)
returns table (order_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select o.id
    from public.orders o
   where o.status = 'delivered'
     and o.files_purged_at is null
     and public.delivered_order_files_due(o)
   order by public.order_delivered_at(o)
   limit greatest(1, least(coalesce(p_limit, 50), 500));
$$;
revoke all on function public.orders_due_for_delivered_file_purge(integer) from public, anon, authenticated;
grant execute on function public.orders_due_for_delivered_file_purge(integer) to service_role;

-- ══════ 4. Claim before removing, record after ══════
-- Claimed = purge_started_at set (orders_lifecycle_guard keeps it once set),
-- so an order the owner moved off Delivered since the list was read is
-- skipped, and once claimed it can't go back to printing (section 5).
create or replace function public.claim_delivered_order_file_purge(p_order_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update public.orders o
     set purge_started_at = coalesce(o.purge_started_at, now())
   where o.id = p_order_id
     and public.delivered_order_files_due(o);
  return found;
end;
$$;
revoke all on function public.claim_delivered_order_file_purge(uuid) from public, anon, authenticated;
grant execute on function public.claim_delivered_order_file_purge(uuid) to service_role;

create or replace function public.finish_delivered_order_file_purge(p_order_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update public.orders o
     set files_purged_at = now()
   where o.id = p_order_id
     and o.status = 'delivered'
     and o.purge_started_at is not null
     and o.files_purged_at is null;
  return found;
end;
$$;
revoke all on function public.finish_delivered_order_file_purge(uuid) from public, anon, authenticated;
grant execute on function public.finish_delivered_order_file_purge(uuid) to service_role;

-- ══════ 5. No going back to printing once the files are going ══════
create or replace function public.orders_delivered_files_gone_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'delivered'
     and (old.purge_started_at is not null or old.files_purged_at is not null)
     and new.status in ('pending_payment', 'paid', 'in_production', 'printed', 'shipped') then
    raise exception 'This album''s print files were removed % days after it was delivered, so it can''t go back to printing. Ask the customer to order the album again from their phone: the album and its photos are still there.',
      public.delivered_files_keep_days()
      using errcode = 'MP011';
  end if;
  return new;
end;
$$;
revoke all on function public.orders_delivered_files_gone_guard() from public, anon, authenticated;

drop trigger if exists orders_delivered_files_gone_guard_trg on public.orders;
create trigger orders_delivered_files_gone_guard_trg
  before update of status on public.orders
  for each row execute function public.orders_delivered_files_gone_guard();

-- ══════ Verify ══════
select 'delivered_files_keep_days() is 90' as check,
  (public.delivered_files_keep_days() = 90)::text as result
union all
select 'orders_delivered_files_gone_guard_trg in place',
  exists (select 1 from pg_trigger where tgname = 'orders_delivered_files_gone_guard_trg' and not tgisinternal)::text
union all
select 'cleanup functions are service_role only',
  (not has_function_privilege('authenticated', 'public.orders_due_for_delivered_file_purge(integer)', 'execute')
   and not has_function_privilege('authenticated', 'public.claim_delivered_order_file_purge(uuid)', 'execute')
   and not has_function_privilege('authenticated', 'public.finish_delivered_order_file_purge(uuid)', 'execute')
   and not has_function_privilege('anon', 'public.claim_delivered_order_file_purge(uuid)', 'execute'))::text
union all
select 'delivered orders already past 90 days (removed on the next nightly run)',
  (select count(*)::text from public.orders o where public.delivered_order_files_due(o));
